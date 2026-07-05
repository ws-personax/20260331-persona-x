import type {
  DecisionResult,
  PersonaId,
  PersonaOutputMap,
  SpeakerPayload,
} from '@/lib/personax/runtime/runtime-types';

/**
 * Speaker Router v1 contract adapter.
 *
 * This module is intentionally not wired into the existing Runtime yet. The
 * current production path still uses legacy position/slot mapping
 * (first/second/third/closer).
 *
 * TODO(v1-3): replace legacy mapOrderedRound1/mapStage3PersonaText usage with
 * this personaId-based Speaker Router.
 */

const LEGACY_DISPLAY_ORDER: PersonaId[] = [
  'ray',
  'jack',
  'lucia',
  'echo',
];

/**
 * Return the current legacy display order.
 *
 * This is still the legacy order used by the current Runtime presentation
 * layer. A later Router policy can replace this without changing the
 * persona-id-based contract.
 */
export const getDisplayOrder = (): PersonaId[] => [...LEGACY_DISPLAY_ORDER];

/**
 * Build a SpeakerPayload from persona outputs.
 *
 * DecisionResult is accepted here because Speaker is the presentation boundary
 * for the full Runtime result. The current v1-2 adapter keeps existing behavior
 * unchanged and only maps persona summaries into display messages.
 */
export const buildSpeakerPayload = (
  personaOutputs: PersonaOutputMap,
  _decision: DecisionResult,
  displayOrder: PersonaId[] = getDisplayOrder(),
): SpeakerPayload => ({
  displayOrder: [...displayOrder],
  messages: displayOrder.map((personaId) => ({
    personaId,
    content: personaOutputs[personaId].summary,
  })),
});
