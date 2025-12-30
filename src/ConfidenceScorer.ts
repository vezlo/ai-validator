import { ConfidenceResult, AccuracyResult, ContextResult, HallucinationResult, Source } from './types';

export class ConfidenceScorer {
  calculateConfidence(
    accuracyResult: AccuracyResult,
    contextResult: ContextResult,
    hallucinationResult: HallucinationResult,
    sources: Source[],
    enabledChecks?: { accuracy: boolean; hallucination: boolean }
  ): ConfidenceResult {
    // Dynamic weights based on enabled checks
    const accuracyEnabled = enabledChecks?.accuracy ?? true;
    const hallucinationEnabled = enabledChecks?.hallucination ?? true;
    
    let weights;
    if (!accuracyEnabled && !hallucinationEnabled) {
      // Only context and source quality available
      weights = {
        accuracy: 0,
        context: 0.60,
        hallucination: 0,
        sourceQuality: 0.40
      };
    } else if (!accuracyEnabled) {
      // No accuracy check
      weights = {
        accuracy: 0,
        context: 0.35,
        hallucination: 0.45,
        sourceQuality: 0.20
      };
    } else if (!hallucinationEnabled) {
      // No hallucination check
      weights = {
        accuracy: 0.50,
        context: 0.30,
        hallucination: 0,
        sourceQuality: 0.20
      };
    } else {
      // All checks enabled (default)
      weights = {
        accuracy: 0.35,
        context: 0.25,
        hallucination: 0.30,
        sourceQuality: 0.10
      };
    }

    // Calculate individual scores
    const accuracyScore = accuracyResult.verification_rate;
    const contextScore = contextResult.source_relevance;
    const hallucinationScore = 1 - hallucinationResult.risk; // Invert risk to get score
    const sourceQualityScore = this.calculateSourceQuality(sources);

    // Calculate weighted confidence score
    const confidenceScore = 
      (accuracyScore * weights.accuracy) +
      (contextScore * weights.context) +
      (hallucinationScore * weights.hallucination) +
      (sourceQualityScore * weights.sourceQuality);

    // Build log message showing only active metrics
    const activeMetrics: string[] = [];
    if (weights.accuracy > 0) activeMetrics.push(`Accuracy: ${(accuracyScore * 100).toFixed(0)}%`);
    if (weights.context > 0) activeMetrics.push(`Context: ${(contextScore * 100).toFixed(0)}%`);
    if (weights.hallucination > 0) activeMetrics.push(`Grounding: ${(hallucinationScore * 100).toFixed(0)}%`);
    if (weights.sourceQuality > 0) activeMetrics.push(`Source Quality: ${(sourceQualityScore * 100).toFixed(0)}%`);

    console.log('→ Confidence Score:', (confidenceScore * 100).toFixed(1) + '%',
                `(${activeMetrics.join(', ')})\n`);

    // Determine confidence level
    let level: 'high' | 'medium' | 'low';
    if (confidenceScore >= 0.8) {
      level = 'high';
    } else if (confidenceScore >= 0.5) {
      level = 'medium';
    } else {
      level = 'low';
    }

    return {
      confidence_score: Math.round(confidenceScore * 100) / 100, // Round to 2 decimal places
      level,
      breakdown: {
        accuracy_score: Math.round(accuracyScore * 100) / 100,
        context_score: Math.round(contextScore * 100) / 100,
        hallucination_score: Math.round(hallucinationScore * 100) / 100,
        source_quality: Math.round(sourceQualityScore * 100) / 100
      }
    };
  }

  private calculateSourceQuality(sources: Source[]): number {
    if (sources.length === 0) {
      return 0;
    }

    let totalQuality = 0;
    for (const source of sources) {
      let quality = 0.5; // Base quality

      // Length factor (longer content is generally better)
      if (source.content.length > 100) quality += 0.2;
      if (source.content.length > 500) quality += 0.2;

      // Title factor
      if (source.title && source.title.length > 0) quality += 0.1;

      // Cap at 1.0
      quality = Math.min(quality, 1.0);
      totalQuality += quality;
    }

    return totalQuality / sources.length;
  }
}
