// Deterministic adapter: DebateLayerOutput -> DecisionSummary.
// Bridges the strong-level Debate Layer contract (docs/tikitaka-level.md §7)
// to the existing DecisionSummary shape decision-engine.ts already produces,
// so a future Runtime-connection PR has a ready-made conversion to call.
// No LLM calls. No Persona raw text. Not wired into any runtime path.

import type { DecisionSummary } from '../types';
import type { DebateLayerDisagreement, DebateLayerOutput } from './types';

const FALLBACK_AGREEMENT = '공통 합의가 충분하지 않습니다.';
const FALLBACK_DISAGREEMENT = '뚜렷한 이견은 확인되지 않았습니다.';
const FALLBACK_CONCLUSION = '추가 판단이 필요합니다.';
const FALLBACK_NEXT_STEP = '추가 확인이 필요합니다.';
const FALLBACK_CONFIDENCE: DecisionSummary['confidence'] = 'low';

// Converts a strong-level Debate Layer result into the same DecisionSummary
// shape weak-level DecisionEngine already produces. Never throws — a
// missing or malformed DebateLayerOutput degrades to conservative fallback
// text instead, one fallback per source field (agreement / disagreement /
// finalDecisionFrame) so no single missing field silently blanks the rest.
export function buildDecisionSummaryFromDebate(debateOutput: DebateLayerOutput): DecisionSummary {
  const frame = debateOutput?.finalDecisionFrame;

  return {
    conclusion: nonEmpty(frame?.conclusion) ?? FALLBACK_CONCLUSION,
    keyRisks: [summarizeAgreement(debateOutput?.agreement), summarizeDisagreement(debateOutput?.disagreement)],
    suggestedNextStep: nonEmpty(frame?.conditionToResolve) ?? FALLBACK_NEXT_STEP,
    confidence: frame?.confidence ?? FALLBACK_CONFIDENCE,
  };
}

// Alias for callers that look for the more literal conversion name.
export const convertDebateLayerOutputToDecisionSummary = buildDecisionSummaryFromDebate;

function summarizeAgreement(agreement: DebateLayerOutput['agreement'] | undefined): string {
  if (!Array.isArray(agreement)) return FALLBACK_AGREEMENT;

  const validItems = agreement.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  if (validItems.length === 0) return FALLBACK_AGREEMENT;

  return `공통 합의: ${validItems.join(' / ')}`;
}

function summarizeDisagreement(disagreement: DebateLayerDisagreement[] | undefined): string {
  if (!Array.isArray(disagreement)) return FALLBACK_DISAGREEMENT;

  const points = disagreement
    .filter((entry) => entry && typeof entry.point === 'string' && entry.point.trim().length > 0)
    .map((entry) => entry.point);

  if (points.length === 0) return FALLBACK_DISAGREEMENT;

  return `이견: ${points.join(' / ')}`;
}

function nonEmpty(value: string | undefined | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

// Mock-text verification, no LLM calls. Mirrors debate-layer.ts's
// runDebateLayerMockCases pattern.
export function runDecisionSummaryAdapterMockCases(): DecisionSummary[] {
  const fullOutput: DebateLayerOutput = {
    agreement: ['모든 Persona가 변동성 관련 우려를 공유합니다.'],
    disagreement: [
      {
        point: '지금 실행할지 여부',
        positions: [
          { personaId: 'ray', stance: '데이터가 더 필요합니다.' },
          { personaId: 'jack', stance: '지금은 기회비용이 큽니다.' },
        ],
      },
    ],
    finalDecisionFrame: {
      conclusion: '지금은 조건을 먼저 확인해야 합니다.',
      keyTension: 'RAY: 데이터 부족 / JACK: 기회비용',
      conditionToResolve: '추가 데이터가 확보되면 상충이 좁혀집니다.',
      confidence: 'medium',
    },
  };

  const emptyOutput: DebateLayerOutput = {
    agreement: [],
    disagreement: [],
    finalDecisionFrame: {
      conclusion: '',
      keyTension: '',
      conditionToResolve: '',
      confidence: 'low',
    },
  };

  const malformedOutput = {
    agreement: undefined,
    disagreement: undefined,
    finalDecisionFrame: undefined,
  } as unknown as DebateLayerOutput;

  return [
    buildDecisionSummaryFromDebate(fullOutput),
    buildDecisionSummaryFromDebate(emptyOutput),
    buildDecisionSummaryFromDebate(malformedOutput),
  ];
}
