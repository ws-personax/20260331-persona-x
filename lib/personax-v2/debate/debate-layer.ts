// Deterministic Debate Layer aggregator: StanceCard[] -> DebateLayerOutput.
// No LLM calls, no semantic understanding — pure text/structure heuristics
// over already-extracted stance cards (see stance-extractor.ts, PR310).
// Not wired into entrypoint.ts / decision-engine.ts / speaker-router.ts.
// See docs/tikitaka-level.md §7 and docs/stance-pipeline.md for the contract.

import type { PersonaId } from '../types';
import type {
  DebateLayerDisagreement,
  DebateLayerFinalDecisionFrame,
  DebateLayerInput,
  DebateLayerOutput,
  StanceCard,
} from './types';

const DISPLAY_NAMES: Record<PersonaId, string> = {
  ray: 'RAY',
  jack: 'JACK',
  lucia: 'LUCIA',
  echo: 'ECHO',
};

const STOPWORDS = new Set([
  '그리고', '하지만', '그러나', '이것', '저것', '합니다', '있습니다',
  '때문에', '위해', '경우', '수도', '있는', '없는', '것은', '것이', '것을',
]);

export function runDebateLayer(input: DebateLayerInput): DebateLayerOutput {
  return {
    agreement: buildAgreement(input.stanceCards),
    disagreement: buildDisagreement(input),
    finalDecisionFrame: buildFinalDecisionFrame(input),
  };
}

// Shared concern vocabulary across stance cards, as a cheap deterministic
// proxy for where personas converge — no re-reading of raw response text.
function buildAgreement(stanceCards: StanceCard[]): string[] {
  const tokenSets = stanceCards.map((card) => tokenize(card.concern));
  const frequency = new Map<string, number>();

  for (const tokens of tokenSets) {
    for (const token of Array.from(tokens)) {
      frequency.set(token, (frequency.get(token) ?? 0) + 1);
    }
  }

  const majorityThreshold = Math.max(2, Math.ceil(stanceCards.length / 2));
  const sharedTokens = Array.from(frequency.entries())
    .filter(([, count]) => count >= majorityThreshold)
    .sort((a, b) => b[1] - a[1])
    .map(([token]) => token);

  if (sharedTokens.length === 0) {
    return ['참여한 Persona 모두 사용자의 질문에 대해 구체적인 입장과 근거를 제시했습니다.'];
  }

  return sharedTokens.map((token) => `여러 Persona가 "${token}" 관련 우려를 공유합니다.`);
}

// MVP aggregation: one disagreement point covering all stance cards.
// Clustering positions into multiple distinct debate points would require
// semantic understanding this deterministic layer intentionally doesn't have.
function buildDisagreement(input: DebateLayerInput): DebateLayerDisagreement[] {
  if (input.stanceCards.length === 0) return [];

  return [
    {
      point: `"${input.userQuestion}"에 대한 Persona별 입장 차이`,
      positions: input.stanceCards.map((card) => ({ personaId: card.personaId, stance: card.stance })),
    },
  ];
}

function buildFinalDecisionFrame(input: DebateLayerInput): DebateLayerFinalDecisionFrame {
  const { stanceCards } = input;

  if (stanceCards.length === 0) {
    return {
      conclusion: '입장 데이터가 없어 최종 결정 프레임을 구성하지 못했습니다.',
      keyTension: '비교할 입장이 없습니다.',
      conditionToResolve: 'Stance Card가 확보된 뒤 다시 판단해야 합니다.',
      confidence: 'low',
    };
  }

  const keyTension = stanceCards
    .map((card) => `${DISPLAY_NAMES[card.personaId]}: ${truncate(card.stance, 40)}`)
    .join(' / ');

  return {
    conclusion: '각 Persona의 입장과 우려를 함께 확인한 뒤, 상충하는 지점에서 사용자가 직접 기준을 정해야 합니다.',
    keyTension,
    conditionToResolve: '각 입장의 근거(reason)가 실제 상황의 구체적 조건과 맞는지 확인되면 상충이 좁혀집니다.',
    confidence: inferConfidence(stanceCards),
  };
}

// Distinct-text proxy for confidence: identical stance/concern text across
// personas usually signals a fallback/degenerate StanceCard, not a real
// independent position, so confidence should not read as high.
function inferConfidence(stanceCards: StanceCard[]): DebateLayerFinalDecisionFrame['confidence'] {
  const distinctStances = new Set(stanceCards.map((card) => card.stance)).size;
  if (distinctStances < stanceCards.length) return 'low';

  const distinctConcerns = new Set(stanceCards.map((card) => card.concern)).size;
  if (distinctConcerns >= Math.ceil(stanceCards.length * 0.75)) return 'high';

  return 'medium';
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

// Splits on non-Hangul/alphanumeric boundaries, keeps tokens of length >= 2,
// drops a small stopword list. This is literal-vocabulary overlap, not real
// Korean morphological analysis (particles attached to a word are not
// stripped, so e.g. "위험" and "위험이" count as different tokens).
function tokenize(text: string): Set<string> {
  const rawTokens = text.split(/[^가-힣a-zA-Z0-9]+/).filter((token) => token.length >= 2);
  return new Set(rawTokens.filter((token) => !STOPWORDS.has(token)));
}

// Mock-text verification, no LLM calls. Mirrors stance-extractor.ts's
// runStanceExtractorMockCases pattern.
export function runDebateLayerMockCases(): DebateLayerOutput[] {
  const convergingConcernCards: StanceCard[] = [
    {
      personaId: 'ray',
      stance: '지금은 데이터가 부족합니다.',
      reason: '3개월치 거래 데이터만 확인됩니다.',
      concern: '단기 변동성 때문에 판단이 왜곡될 위험이 있습니다.',
      suggestion: '추가 데이터 확보 후 재검토하세요.',
    },
    {
      personaId: 'jack',
      stance: '지금 실행하면 기회비용이 큽니다.',
      reason: '대안 대비 손실 범위가 넓습니다.',
      concern: '변동성이 큰 시점에 실행하면 위험이 있습니다.',
      suggestion: '손실 한도를 먼저 정하세요.',
    },
    {
      personaId: 'lucia',
      stance: '조급함이 판단을 흐리고 있습니다.',
      reason: '빨리 결정하고 싶은 압박이 큽니다.',
      concern: '변동성을 보며 조급하게 실행할 위험이 있습니다.',
      suggestion: '감정과 판단을 분리하세요.',
    },
    {
      personaId: 'echo',
      stance: '같은 패턴의 조급한 판단이 반복됩니다.',
      reason: '신호가 나올 때마다 서두르는 습관이 있습니다.',
      concern: '신호에 반응해 조급하게 실행하는 패턴에 위험이 있습니다.',
      suggestion: '신호 이후 일정 기간 대기하는 규칙을 두세요.',
    },
  ];

  const degenerateCards: StanceCard[] = (['ray', 'jack', 'lucia', 'echo'] as const).map((personaId) => ({
    personaId,
    stance: '입장 없음',
    reason: '근거 없음',
    concern: '우려 없음',
    suggestion: '제안 없음',
  }));

  return [
    runDebateLayer({ userQuestion: '지금 실행해도 될까요?', tikitakaLevel: 'strong', stanceCards: convergingConcernCards }),
    runDebateLayer({ userQuestion: '입장 없는 경우 테스트', tikitakaLevel: 'strong', stanceCards: degenerateCards }),
    runDebateLayer({ userQuestion: '빈 입력 테스트', tikitakaLevel: 'strong', stanceCards: [] }),
  ];
}
