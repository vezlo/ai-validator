import { Source, ContextResult } from './types';
import { LLMJudge } from './LLMJudge';

export class ContextValidator {
  private llmJudge?: LLMJudge;
  private useLLMJudge: boolean;

  constructor(openaiApiKey?: string, claudeApiKey?: string, useLLMJudge: boolean = false, developerMode: boolean = false) {
    this.useLLMJudge = useLLMJudge && (!!openaiApiKey || !!claudeApiKey);
    
    if (this.useLLMJudge) {
      this.llmJudge = new LLMJudge(openaiApiKey, claudeApiKey, developerMode);
    }
  }

  async validateContext(query: string, response: string, sources: Source[]): Promise<ContextResult> {
    if (sources.length === 0) {
      return {
        source_relevance: 0,
        source_usage_rate: 0,
        valid: false
      };
    }

    // Use LLM-as-Judge if enabled and available
    if (this.useLLMJudge && this.llmJudge) {
      try {
        return await this.llmJudge.validateContext(query, response, sources);
      } catch (error) {
        console.warn('LLM Judge failed, falling back to word matching:', error);
        return this.wordMatchingValidation(query, response, sources);
      }
    }

    // Fallback to basic word matching
    return this.wordMatchingValidation(query, response, sources);
  }

  private wordMatchingValidation(query: string, response: string, sources: Source[]): ContextResult {
    const cleanResponse = response.toLowerCase().replace(/[^\w\s]/g, '');
    const sourceContent = sources.map(s => s.content.toLowerCase().replace(/[^\w\s]/g, '')).join(' ');
    const responseWords = cleanResponse.split(/\s+/).filter(word => word.length > 3);
    const sourceWords = sourceContent.split(/\s+/).filter(word => word.length > 3);
    
    let wordsInSource = 0;
    for (const word of responseWords) {
      if (sourceWords.includes(word)) {
        wordsInSource++;
      }
    }

    const sourceRelevance = responseWords.length > 0 ? wordsInSource / responseWords.length : 0.5;
    
    const cleanQuery = query.toLowerCase().replace(/[^\w\s]/g, '');
    const queryWords = cleanQuery.split(/\s+/).filter(word => word.length > 2);
    let queryWordsInResponse = 0;
    for (const word of queryWords) {
      if (responseWords.includes(word)) {
        queryWordsInResponse++;
      }
    }
    const sourceUsageRate = queryWords.length > 0 ? queryWordsInResponse / queryWords.length : 0.5;

    return {
      source_relevance: Math.min(sourceRelevance, 1.0),
      source_usage_rate: sourceUsageRate,
      valid: sourceRelevance > 0.3
    };
  }
}

