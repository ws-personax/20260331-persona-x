import type {
  DecisionResult,
  PersonaOutputMap,
} from '@/lib/personax/runtime/runtime-types';

/**
 * TODO(v1-4): Move the existing decision-summary.ts behavior into this
 * Decision Engine.
 *
 * TODO(v1-5): Call Decision QA, Review Card, and Memory Save from this layer.
 */

const getFirstPersonaSummary = (personaOutputs: PersonaOutputMap): string => {
  const firstOpinion = Object.values(personaOutputs)[0];
  return firstOpinion?.summary ?? '';
};

export const buildDecisionResult = (
  personaOutputs: PersonaOutputMap,
): DecisionResult => ({
  summary: getFirstPersonaSummary(personaOutputs),
  nextAction: '',
  reasons: [],
  confidence: 0,
});
