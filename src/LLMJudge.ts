import { Source, ContextResult } from './types';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

export class LLMJudge {
  private openai?: OpenAI;
  private anthropic?: Anthropic;
  private provider: 'openai' | 'claude';
  private developerMode: boolean;
  private openaiModel: string;
  private claudeModel: string;

  constructor(
    openaiApiKey?: string, 
    claudeApiKey?: string, 
    developerMode: boolean = false,
    openaiModel: string = 'gpt-4o-mini',
    claudeModel: string = 'claude-3-haiku-20240307'
  ) {
    if (openaiApiKey) {
      this.openai = new OpenAI({ apiKey: openaiApiKey });
      this.provider = 'openai';
    } else if (claudeApiKey) {
      this.anthropic = new Anthropic({ apiKey: claudeApiKey });
      this.provider = 'claude';
    } else {
      throw new Error('At least one API key (OpenAI or Claude) must be provided for LLM Judge');
    }
    this.developerMode = developerMode;
    this.openaiModel = openaiModel;
    this.claudeModel = claudeModel;
  }

  async validateContext(query: string, response: string, sources: Source[]): Promise<ContextResult> {
    const prompt = this.buildValidationPrompt(query, response, sources);
    
    let result: string;
    if (this.provider === 'openai' && this.openai) {
      result = await this.callOpenAI(prompt);
    } else if (this.provider === 'claude' && this.anthropic) {
      result = await this.callClaude(prompt);
    } else {
      throw new Error('No LLM provider available');
    }

    return this.parseValidationResult(result);
  }

  private buildValidationPrompt(query: string, response: string, sources: Source[]): string {
    const sourcesText = sources.map((s, i) => 
      `Source ${i + 1} (${s.title || s.id || 'untitled'}):\n${s.content.substring(0, 3000)}`
    ).join('\n\n');

    const validationRules = this.developerMode
      ? `TASK (Developer Mode - STRICT CODE GROUNDING):
1. Does the response reference SPECIFIC code elements (functions, classes, files) from sources?
2. Is the response explaining actual code implementation, not generic advice?
3. Did the AI cite filenames, function names, or code patterns from the sources?
4. Score LOW if response is generic "how to" advice instead of code analysis.
5. Score HIGH only if response directly explains code from sources.

Scoring Guidelines for Developer Mode:
- valid: true ONLY if response cites specific code elements from sources
- confidence: HIGH (80-100) if response references actual code/functions/files
- confidence: MEDIUM (50-79) if response mentions code but is partly generic
- confidence: LOW (0-49) if response is generic advice not grounded in code
- source_relevance: How much the response references actual code from sources
- source_usage_rate: How many code elements/files from sources were mentioned`
      : `TASK (User Mode - Helpful Response):
1. Is the response accurate and helpful based on the sources?
2. Did the AI hallucinate or invent information not in the sources?
3. Is the response properly grounded in the provided code/text?

Scoring Guidelines for User Mode:
- valid: true if response is accurate and grounded
- confidence: 0-100 (how confident you are in this assessment)
- source_relevance: 0.0-1.0 (how relevant sources are to response)
- source_usage_rate: 0.0-1.0 (how much of sources were used)`;

    return `You are a validation system. Given a user query, code/text sources, and an AI-generated response, determine if the response is accurate and grounded in the provided sources.

USER QUERY:
${query}

PROVIDED SOURCES:
${sourcesText}

AI RESPONSE:
${response}

${validationRules}

Return ONLY a JSON object with this exact format:
{
  "valid": true/false,
  "confidence": 0-100,
  "source_relevance": 0.0-1.0,
  "source_usage_rate": 0.0-1.0,
  "reason": "brief explanation"
}

Respond with ONLY the JSON, no other text.`;
  }

  private async callOpenAI(prompt: string): Promise<string> {
    if (!this.openai) throw new Error('OpenAI not initialized');

    const response = await this.openai.chat.completions.create({
      model: this.openaiModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 200
    });

    return response.choices[0]?.message?.content || '{}';
  }

  private async callClaude(prompt: string): Promise<string> {
    if (!this.anthropic) throw new Error('Claude not initialized');

    const response = await this.anthropic.messages.create({
      model: this.claudeModel,
      max_tokens: 200,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    return content.type === 'text' ? content.text : '{}';
  }

  private parseValidationResult(result: string): ContextResult {
    try {
      // Extract JSON from response (handle cases where LLM adds text before/after)
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        valid: parsed.valid === true,
        source_relevance: Math.max(0, Math.min(1, Number(parsed.source_relevance) || 0)),
        source_usage_rate: Math.max(0, Math.min(1, Number(parsed.source_usage_rate) || 0))
      };
    } catch (error) {
      console.error('Failed to parse LLM judge result:', error);
      // Return conservative defaults on parse error
      return {
        valid: false,
        source_relevance: 0.5,
        source_usage_rate: 0.5
      };
    }
  }
}

