import type { DecisionResult } from '@/lib/personax/runtime/runtime-types';

/**
 * Minimal shape produced by the current legacy decision-summary.ts builder.
 *
 * This adapter intentionally does not import or replace decision-summary.ts.
 * It only defines the boundary needed for a future migration into the Runtime
 * v1 Decision Engine.
 */
export type LegacyDecisionSummaryLike = {
  verdict: string;
  reasons?: string[];
  nextAction?: string;
  confidence?: number;
};

export function adaptLegacyDecisionSummaryToDecisionResult(
  input: LegacyDecisionSummaryLike,
): DecisionResult {
  return {
    summary: input.verdict,
    nextAction: input.nextAction ?? '',
    reasons: input.reasons ?? [],
    confidence: input.confidence ?? 0,
  };
}
