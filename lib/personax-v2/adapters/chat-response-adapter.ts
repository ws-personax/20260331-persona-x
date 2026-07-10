import type { DecisionSummary, PersonaId, RuntimeV2Response } from '../types';

// app/api/chat/route.ts (v1, non-streaming branches) and components/ChatWindow.tsx's
// plain-JSON response.json() path share this shape: { reply, personas: { ray, jack,
// lucia, echo, order, ... } }. runRuntimeV2() returns a differently-shaped
// { personaResults, decisionSummary, order, routed } object that the frontend never
// reads — this adapter is the only place that bridges the two, so route.ts's v2
// branch can keep using runRuntimeV2's native return type unchanged.
export interface ChatResponseAdapterPersonas {
  ray: string;
  jack: string;
  lucia: string;
  echo: string;
  ray2: null;
  jack2: null;
  lucia2: null;
  echo2: null;
  order: PersonaId[];
  verdict: string;
  confidence: number;
  breakdown: string;
  positionSizing: string;
  jackNews: null;
  luciaNews: null;
  rayNews: null;
  echoNews: null;
}

export interface ChatResponseAdapterOutput {
  reply: string;
  personas: ChatResponseAdapterPersonas;
  // Not part of the frontend's chat contract — carried through unrendered so the
  // decision-layer output isn't silently discarded (kept for future UI/consumers).
  decisionSummary: DecisionSummary;
}

const CONFIDENCE_SCORE: Record<DecisionSummary['confidence'], number> = {
  low: 30,
  medium: 60,
  high: 90,
};

export function adaptRuntimeV2ToChatResponse(v2Result: RuntimeV2Response): ChatResponseAdapterOutput {
  const decisionSummary: DecisionSummary = v2Result?.decisionSummary ?? {
    conclusion: '',
    keyRisks: [],
    suggestedNextStep: '',
    confidence: 'low',
  };
  const routedPersonas = v2Result?.routed?.personas ?? {};
  const order: PersonaId[] =
    (v2Result?.routed?.order?.length ? v2Result.routed.order : v2Result?.order) ?? [];

  const personas: ChatResponseAdapterPersonas = {
    ray: routedPersonas.ray ?? '',
    jack: routedPersonas.jack ?? '',
    lucia: routedPersonas.lucia ?? '',
    echo: routedPersonas.echo ?? '',
    ray2: null,
    jack2: null,
    lucia2: null,
    echo2: null,
    order,
    verdict: decisionSummary.conclusion || '관망',
    confidence: CONFIDENCE_SCORE[decisionSummary.confidence] ?? 0,
    breakdown: (decisionSummary.keyRisks ?? []).join(' / '),
    positionSizing: '0%',
    jackNews: null,
    luciaNews: null,
    rayNews: null,
    echoNews: null,
  };

  const reply = order
    .map((personaId) => personas[personaId])
    .filter((text): text is string => !!text && text.trim().length > 0)
    .join('\n\n');

  return { reply, personas, decisionSummary };
}
