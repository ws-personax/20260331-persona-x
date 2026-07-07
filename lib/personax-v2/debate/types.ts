// Design-only types for the future Debate Layer.
// See lib/personax-v2/docs/tikitaka-level.md §7 for the confirmed contract.
//
// Not wired into any runtime path yet:
// - no extraction logic (PersonaResult.text -> StanceCard) exists
// - no strong-level branch calls this from decision-engine.ts or entrypoint.ts
// - adding these types changes no Runtime v2 behavior

import type { PersonaId } from '../types';

// A persona's independent answer distilled into structured fields.
// Never carries the persona's raw response text — see docs §1 for why
// raw-text sharing between personas is prohibited.
export interface StanceCard {
  personaId: PersonaId;
  stance: string;
  reason: string;
  concern: string;
  suggestion: string;
}

export interface DebateLayerInput {
  userQuestion: string;
  tikitakaLevel: 'strong';
  stanceCards: StanceCard[];
}

export interface DebateLayerDisagreement {
  point: string;
  positions: Array<{ personaId: PersonaId; stance: string }>;
}

export interface DebateLayerFinalDecisionFrame {
  conclusion: string;
  keyTension: string;
  conditionToResolve: string;
  confidence: 'low' | 'medium' | 'high';
}

export interface DebateLayerOutput {
  agreement: string[];
  disagreement: DebateLayerDisagreement[];
  finalDecisionFrame: DebateLayerFinalDecisionFrame;
}
