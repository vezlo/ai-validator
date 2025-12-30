import { AIValidatorConfig, ValidationInput, ValidationResult } from './types';
import { QueryClassifier } from './QueryClassifier';
import { AccuracyChecker } from './AccuracyChecker';
import { HallucinationDetector } from './HallucinationDetector';
import { ConfidenceScorer } from './ConfidenceScorer';
import { ContextValidator } from './ContextValidator';

export class AIValidator {
  private config: AIValidatorConfig;
  private queryClassifier: QueryClassifier;
  private accuracyChecker: AccuracyChecker;
  private hallucinationDetector: HallucinationDetector;
  private confidenceScorer: ConfidenceScorer;
  private contextValidator: ContextValidator;

  constructor(config: AIValidatorConfig) {
    // Set defaults for optional config
    this.config = {
      confidenceThreshold: 0.7,
      enableQueryClassification: true,
      enableAccuracyCheck: false,
      enableHallucinationDetection: false,
      enableContextValidation: true,
      useLLMJudge: false,
      developerMode: false,
      openaiModel: 'gpt-4o-mini',
      claudeModel: 'claude-3-haiku-20240307',
      ...config
    };

    // Validate required configuration
    this.validateConfig();

    // Initialize components
    this.queryClassifier = new QueryClassifier();
    this.accuracyChecker = new AccuracyChecker(this.config.openaiApiKey, this.config.claudeApiKey);
    this.hallucinationDetector = new HallucinationDetector(this.config.openaiApiKey, this.config.claudeApiKey);
    this.confidenceScorer = new ConfidenceScorer();
    this.contextValidator = new ContextValidator(
      this.config.openaiApiKey,
      this.config.claudeApiKey,
      this.config.useLLMJudge,
      this.config.developerMode || false
    );
  }

  async validate(input: ValidationInput): Promise<ValidationResult> {
    try {
      // Step 1: Query Classification
      if (this.config.enableQueryClassification) {
        const classification = await this.queryClassifier.classifyQuery(input.query);
        
        if (classification.skip_validation) {
          return {
            confidence: 1.0,
            valid: true,
            accuracy: { verified: true, verification_rate: 1.0 },
            context: { source_relevance: 1.0, source_usage_rate: 1.0, valid: true },
            hallucination: { detected: false, risk: 0 },
            warnings: [],
            query_type: classification.type,
            skip_validation: true
          };
        }
      }

      // Step 2: Run validations in parallel
      const [accuracyResult, contextResult, hallucinationResult] = await Promise.all([
        this.config.enableAccuracyCheck ? 
          this.accuracyChecker.checkAccuracy(input.response, input.sources, this.config.llmProvider, this.getModel()) :
          Promise.resolve({ verified: true, verification_rate: 1.0 }),
        
        this.config.enableContextValidation ?
          this.contextValidator.validateContext(input.query, input.response, input.sources) :
          Promise.resolve({ source_relevance: 1.0, source_usage_rate: 1.0, valid: true }),
        
        this.config.enableHallucinationDetection ?
          this.hallucinationDetector.detectHallucination(input.response, input.sources, this.config.llmProvider, this.getModel()) :
          Promise.resolve({ detected: false, risk: 0 })
      ]);

      // Step 3: Calculate confidence
      const confidenceResult = this.confidenceScorer.calculateConfidence(
        accuracyResult,
        contextResult,
        hallucinationResult,
        input.sources,
        {
          accuracy: this.config.enableAccuracyCheck || false,
          hallucination: this.config.enableHallucinationDetection || false
        }
      );

      // Step 4: Generate warnings
      const warnings = this.generateWarnings(accuracyResult, contextResult, hallucinationResult, input.sources);

      // Step 5: Determine if valid
      const valid = confidenceResult.confidence_score >= (this.config.confidenceThreshold || 0.7);

      return {
        confidence: confidenceResult.confidence_score,
        valid,
        accuracy: accuracyResult,
        context: contextResult,
        hallucination: hallucinationResult,
        warnings
      };

    } catch (error) {
      return {
        confidence: 0,
        valid: false,
        accuracy: { verified: false, verification_rate: 0, reason: 'validation_error' },
        context: { source_relevance: 0, source_usage_rate: 0, valid: false },
        hallucination: { detected: true, risk: 1.0 },
        warnings: [`Validation failed: ${error instanceof Error ? error.message : 'unknown error'}`]
      };
    }
  }

  private validateConfig(): void {
    // API keys are optional - validators will use fallback methods if not provided
    if (this.config.useLLMJudge && !this.config.openaiApiKey && !this.config.claudeApiKey) {
      console.warn('LLM Judge enabled but no API key provided. Falling back to rule-based validation.');
      this.config.useLLMJudge = false;
    }

    if (this.config.enableAccuracyCheck && !this.config.openaiApiKey && !this.config.claudeApiKey) {
      console.warn('Accuracy check enabled but no API key provided. Disabling accuracy check.');
      this.config.enableAccuracyCheck = false;
    }

    if (this.config.enableHallucinationDetection && !this.config.openaiApiKey && !this.config.claudeApiKey) {
      console.warn('Hallucination detection enabled but no API key provided. Disabling hallucination detection.');
      this.config.enableHallucinationDetection = false;
    }
  }


  private getModel(): string {
    if (this.config.llmProvider === 'openai') {
      return this.config.openaiModel || 'gpt-4o';
    } else {
      return this.config.claudeModel || 'claude-sonnet-4-5-20250929';
    }
  }

  private generateWarnings(accuracyResult: any, contextResult: any, hallucinationResult: any, sources: any[]): string[] {
    const warnings: string[] = [];

    if (sources.length === 0) {
      warnings.push('No sources provided - high hallucination risk');
    }

    if (accuracyResult.verification_rate < 0.5) {
      warnings.push('Low accuracy verification rate');
    }

    if (contextResult.source_relevance < 0.3) {
      warnings.push('Low context relevance');
    }

    if (hallucinationResult.risk > 0.5) {
      warnings.push('High hallucination risk detected');
    }

    if (hallucinationResult.detected) {
      warnings.push('Hallucination detected in response');
    }

    return warnings;
  }
}
