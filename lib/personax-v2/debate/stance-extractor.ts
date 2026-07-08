// Pure text parser: PersonaResult.text (already generated) -> StanceCard.
// No LLM calls. Not wired into entrypoint.ts / decision-engine.ts / speaker-router.ts.
// See docs/tikitaka-level.md §7 — this only prepares data for a future Debate Layer.

import type { PersonaId } from '../types';
import type { StanceCard } from './types';

type StanceField = 'stance' | 'reason' | 'concern' | 'suggestion';

interface PersonaFieldLabelMap {
  stance: string;
  reason: string;
  concern: string;
  suggestion: string;
}

// Output Contract label -> StanceCard field, per persona.
// RAY/JACK reuse one label for both stance and reason; LUCIA reuses one label
// for both reason and suggestion; ECHO reuses one label for both stance and concern.
const PERSONA_FIELD_LABELS: Record<PersonaId, PersonaFieldLabelMap> = {
  ray: {
    stance: '확인된 사실',
    reason: '확인된 사실',
    concern: '불확실한 점',
    suggestion: '추가로 필요한 정보',
  },
  jack: {
    stance: '선택의 대가',
    reason: '선택의 대가',
    concern: '가장 큰 리스크',
    suggestion: '실행 기준',
  },
  lucia: {
    stance: '감정 인식',
    reason: '감정과 판단 분리',
    concern: '심리적 함정',
    suggestion: '감정과 판단 분리',
  },
  echo: {
    stance: '반복 패턴',
    reason: '왜 반복되는가',
    concern: '반복 패턴',
    suggestion: '끊는 방법',
  },
};

const FALLBACK_REASON = '라벨 누락으로 구조화 근거를 추출하지 못했습니다.';
const FALLBACK_CONCERN = '라벨 누락으로 구조화 근거를 추출하지 못했습니다.';
const FALLBACK_SUGGESTION = '추가 확인 필요';
const FALLBACK_STANCE_EMPTY = '응답 텍스트가 비어 있어 입장을 추출하지 못했습니다.';

export interface StanceExtractionMeta {
  personaId: PersonaId;
  usedFallbackFields: StanceField[];
  missingLabels: string[];
}

export interface StanceExtractionResult {
  stanceCard: StanceCard;
  meta: StanceExtractionMeta;
}

// Main entry point: always returns a valid StanceCard, never throws.
export function extractStanceCard(personaId: PersonaId, responseText: string): StanceCard {
  return extractStanceCardWithMeta(personaId, responseText).stanceCard;
}

// Same extraction, plus bookkeeping on which fields fell back — useful for
// diagnostics without changing the StanceCard contract itself.
export function extractStanceCardWithMeta(personaId: PersonaId, responseText: string): StanceExtractionResult {
  const fieldLabels = PERSONA_FIELD_LABELS[personaId];
  const sections = extractLabeledSections(responseText, Object.values(fieldLabels));

  const missingLabels: string[] = [];
  const usedFallbackFields: StanceField[] = [];

  const readField = (field: StanceField, fallback: string): string => {
    const label = fieldLabels[field];
    const content = sections.get(label);
    if (content) return content;

    usedFallbackFields.push(field);
    if (!missingLabels.includes(label)) missingLabels.push(label);
    return fallback;
  };

  const stanceCard: StanceCard = {
    personaId,
    stance: readField('stance', summarizeFallbackStance(responseText)),
    reason: readField('reason', FALLBACK_REASON),
    concern: readField('concern', FALLBACK_CONCERN),
    suggestion: readField('suggestion', FALLBACK_SUGGESTION),
  };

  return {
    stanceCard,
    meta: { personaId, usedFallbackFields, missingLabels },
  };
}

// Finds "<label>: <content>" sections and captures each label's content up
// to the next known label (or end of text). Labels not present are simply
// absent from the returned map — callers decide the fallback.
function extractLabeledSections(text: string, labels: string[]): Map<string, string> {
  const sections = new Map<string, string>();
  const uniqueLabels = Array.from(new Set(labels));
  if (uniqueLabels.length === 0 || !text) return sections;

  const labelAlternation = uniqueLabels.map(escapeRegExp).join('|');
  const sectionPattern = new RegExp(
    `(?:^|\\n)\\s*(${labelAlternation})\\s*[:：]\\s*([\\s\\S]*?)(?=(?:\\n\\s*(?:${labelAlternation})\\s*[:：])|$)`,
    'g',
  );

  let match: RegExpExecArray | null;
  while ((match = sectionPattern.exec(text)) !== null) {
    const [, label, rawContent] = match;
    const content = rawContent.trim();
    if (content && !sections.has(label)) {
      sections.set(label, content);
    }
  }

  return sections;
}

// Fallback for `stance` only: the first sentence, or a truncated lead-in,
// of the raw response — used when its own label is missing entirely.
function summarizeFallbackStance(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return FALLBACK_STANCE_EMPTY;

  const firstSentenceMatch = trimmed.match(/^[\s\S]*?[.!?다요](?:\s|$)/);
  const summary = (firstSentenceMatch ? firstSentenceMatch[0] : trimmed).trim();

  return summary.length > 120 ? `${summary.slice(0, 120)}…` : summary;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Mock-text verification, no LLM calls. Mirrors the pattern used by
// output-contract/label-normalizer.ts's runLabelNormalizerMockCases.
export function runStanceExtractorMockCases(): StanceExtractionResult[] {
  const rayText = [
    '확인된 사실: 최근 3개월간 거래량이 꾸준히 증가했습니다.',
    '불확실한 점: 이 증가가 일시적인지 추세적인지 확인되지 않았습니다.',
    '추가로 필요한 정보: 동일 기간 경쟁 자산과의 비교 데이터가 필요합니다.',
  ].join('\n');

  const jackText = [
    '선택의 대가: 지금 결정을 미루면 다음 분기 예산 배정에서 밀려납니다.',
    '가장 큰 리스크: 준비 없이 실행하면 초기 비용을 과소 추정할 수 있습니다.',
    '실행 기준: 3개월 내 회수 가능한 규모로만 우선 집행합니다.',
  ].join('\n');

  const luciaText = [
    '감정 인식: 이 질문에는 결정을 빨리 끝내고 싶은 압박감이 깔려 있습니다.',
    '감정과 판단 분리: 압박감은 인정하되 판단은 기준과 조건으로 따로 세워야 합니다.',
    '심리적 함정: 빨리 결론을 내려야 한다는 마음 때문에 기준 없는 선택으로 밀려갈 수 있습니다.',
  ].join('\n');

  const echoText = [
    '반복 패턴: 이 질문은 반복되는 판단 기준의 부재를 보여줍니다.',
    '왜 반복되는가: 기준 없이 상황마다 판단하려는 경향이 반복되기 때문입니다.',
    '끊는 방법: 상황보다 먼저 판단 기준을 정해두는 습관을 만듭니다.',
  ].join('\n');

  const missingLabelText = '이번 상황은 조금 복잡하지만, 결론적으로 지금은 관망하는 편이 낫다고 생각합니다.';

  return [
    extractStanceCardWithMeta('ray', rayText),
    extractStanceCardWithMeta('jack', jackText),
    extractStanceCardWithMeta('lucia', luciaText),
    extractStanceCardWithMeta('echo', echoText),
    extractStanceCardWithMeta('ray', missingLabelText),
  ];
}
