import { detectCategoryV3, type CategoryV3 } from '@/lib/personax/classifier';

export type { CategoryV3 } from '@/lib/personax/classifier';


// 단일 호출 태그 기반 오케스트레이터 — 1라운드 / 2라운드 분리.
// 1라운드: [FIRST] [SECOND] [THIRD] [ECHO_QUESTION]
// 2라운드: [FIRST_2] [SECOND_2] [THIRD_2] [ECHO_FINAL]

export type TaggedPersonaKey = 'lucia' | 'jack' | 'ray';

// 1차 분석 단계 (D-1 신규) — 각 페르소나 독립 분석 결과
export type Stage1PersonaAnalysis = {
  insight: string;
  numbers: string;
  key_point: string;
};

export type Stage1Data = {
  lucia: Stage1PersonaAnalysis;
  jack: Stage1PersonaAnalysis;
  ray: Stage1PersonaAnalysis;
};

// 1차 분석 폴백 — LLM 호출 실패 시 사용
export const STAGE1_FALLBACK: Stage1PersonaAnalysis = {
  insight: '',
  numbers: '',
  key_point: '',
};

const EMOTION_KEYWORDS = [
  '힘들', '막막', '모르겠', '무서', '외로', '죄책', '불안', '지쳐', '포기',
  '억울', '쓸쓸', '슬프', '우울', '눈물', '마음이', '괴로', '서글', '버겁',
  '버틸', '감당', '도망', '도피', '두려', '자존심', '자존감',
  // V2 추가 (2026.05.13) — 일상 피로/소진 키워드
  '피곤', '지친', '소진', '번아웃', '쉬고', '쉬어', '잠이', '잠 못',
  '한숨', '답답', '미치겠', '못 살', '못살겠',
  // V3 추가 (2026.05.17) — 수면/불면 키워드
  '수면', '불면', '못 자',
];

export const detectPersonaOrderHybrid = (
  msg: string,
  category: string,
): TaggedPersonaKey[] => {
  const text = (msg || '');
  const hasEmotion = EMOTION_KEYWORDS.some(k => text.includes(k));
  if (hasEmotion) return ['lucia', 'jack', 'ray'];

  const cat = (category || '').toLowerCase();
  if (['finance', 'stock', 'crypto', 'economy'].includes(cat)) {
    return ['ray', 'jack', 'lucia'];
  }
  if (cat === 'news') return ['ray', 'lucia', 'jack'];
  if (cat === 'sports') return ['jack', 'ray', 'lucia'];
  return ['lucia', 'jack', 'ray'];
};

// ──────────────────────────────────────────────────────────────────────────
// PR1 Runtime Skeleton 분리 — Rules / Output 재수출.
// 실제 규칙·구현은 lib/personax/prompts/{rules,output,conflict}.ts에 위치.
// 기존 외부 소비처(message-router.ts / route.ts / finance-round2-context.ts)의
// import 경로("@/app/api/chat/prompts/orchestrator-tagged")를 그대로 유지하기 위한 재수출.
// ──────────────────────────────────────────────────────────────────────────
export {
  buildFirstPersonaRuleSection,
  buildCloserPersonaRuleSection,
  buildCategoryVocabBlockRule,
} from '@/lib/personax/prompts/rules';

export {
  buildTaggedRound1SystemPrompt,
  buildTaggedRound2SystemPrompt,
  buildTaggedRound1UserPrompt,
  buildTaggedRound2UserPrompt,
  buildDataCollectionPrompt,
  buildPersonaAnalysisPrompt,
  buildScriptPrompt,
  parseTaggedRound1,
  parseTaggedRound2,
} from '@/lib/personax/prompts/output';
export type { TaggedRound1Result, TaggedRound2Result } from '@/lib/personax/prompts/output';

// ──────────────────────────────────────────────────────────────────────────
// 카테고리 V3 (4분류) + Router 패턴 + 호명 인식
// 마스터 명세: 카테고리 강화 / Router / 호명 / Feature Flag 단계로 사용
// ──────────────────────────────────────────────────────────────────────────

export type AllPersonaKey = 'lucia' | 'jack' | 'ray' | 'echo';

/** Router 호출 전략 */
export type CallStrategy = 'solo' | 'light' | 'standard' | 'full';

export type RouterDecision = {
  strategy: CallStrategy;
  category: CategoryV3;
  invokedPersona: AllPersonaKey | null;
  reason: string;
};

/**
 * 호명 패턴 빌더 — 경계 조건 통일.
 * 매치 성공 조건:
 *  - 앞: 줄 시작 OR 한글/영문 비-인접 (단어 내 부분매치 차단)
 *  - 뒤: 줄 끝 OR 비-한글/영문(공백·구두점) OR 한국어 조사(은/는/이/가/을/를/의/야/아/도/만/씨/님/과/와/로/께)
 * 효과:
 *  ✅ "에코는 어떻게?" / "잭이 봤어요" / "루시아의 의견" / "RAY," — 매칭
 *  ✅ "에코 어떻게?" / "JACK 너는?" — 매칭 (공백·구두점)
 *  ⛔ "에코백/루시퍼/레이저/잭슨/JACKET" — 차단 (compound 명사/영어 부분매치)
 */
const buildInvocationPattern = (alternation: string): RegExp =>
  new RegExp(
    `(?:^|[^가-힣a-zA-Z])(?:${alternation})(?:$|[^가-힣a-zA-Z]|(?=[은는이가을를의야아도만씨님과와로께]))`,
    'i',
  );

const PERSONA_INVOCATION_PATTERNS: ReadonlyArray<{ key: AllPersonaKey; re: RegExp }> = [
  // 긴 별칭 먼저 (alternation 좌→우 평가) — "루시아"가 "루시"보다 우선
  { key: 'lucia', re: buildInvocationPattern('LUCIA|루시아|루이사|루누님|루시') },
  { key: 'echo',  re: buildInvocationPattern('ECHO|에코') },
  { key: 'jack',  re: buildInvocationPattern('JACK|째앵|째액|잭|짹') },
  { key: 'ray',   re: buildInvocationPattern('RAY|레이꾼|레\\s+대리|레이') },
];

/** 유저 메시지에서 페르소나 호명 감지 — 첫 번째 매치 1명 반환, 없으면 null */
export const detectPersonaInvocation = (msg: string): AllPersonaKey | null => {
  const t = (msg || '').trim();
  if (!t) return null;
  for (const { key, re } of PERSONA_INVOCATION_PATTERNS) {
    if (re.test(t)) return key;
  }
  return null;
};

/** 짧은 단일 질문 여부 — 50자 이내, 물음표 0~1개, 줄바꿈 0~1줄 */
const isLightQuestion = (msg: string): boolean => {
  const t = (msg || '').trim();
  if (!t) return false;
  if (t.length > 50) return false;
  const qMarks = (t.match(/[?？]/g) || []).length;
  if (qMarks > 1) return false;
  const lines = t.split(/\n/).filter((l) => l.trim()).length;
  if (lines > 1) return false;
  return true;
};

/**
 * 카테고리별 FIRST 페르소나 고정 매트릭스.
 *  - invest → RAY (데이터로 토론 열기)
 *  - action → JACK (직설로 시작)
 *  - emotional → LUCIA (마음 먼저 열기)
 *  - principle → ECHO (본질 짚기로 시작)
 * 복합/모호 질문은 detectCategoryV3가 emotional로 폴백하므로 LUCIA로 귀결.
 */
const FIRST_PERSONA_BY_CATEGORY: Record<CategoryV3, AllPersonaKey> = {
  invest: 'ray',
  action: 'jack',
  emotional: 'lucia',
  principle: 'echo',
  knowledge: 'ray',
};

export const getFirstPersona = (category: CategoryV3): AllPersonaKey =>
  FIRST_PERSONA_BY_CATEGORY[category] ?? 'lucia';

/**
 * 카테고리별 CLOSER 페르소나 폴백 체인.
 *  - invest    → JACK (결단 마무리) → ECHO → LUCIA
 *  - action    → ECHO (본질 짚기 마무리) → LUCIA → JACK
 *  - emotional → JACK 또는 ECHO (LLM 선택; 외부/시스템 문제면 JACK, 본질 짚기면 ECHO) → LUCIA
 *  - principle → JACK (결단 마무리) → LUCIA → ECHO
 *  - knowledge → ECHO (최신 사실/핵심 정리) → JACK → LUCIA
 * FIRST 페르소나와 CLOSER 후보가 같으면 자동으로 다음 후보로 교체.
 */
const CLOSER_FALLBACK_CHAIN: Record<CategoryV3, AllPersonaKey[]> = {
  invest:    ['jack', 'echo', 'lucia'],
  action:    ['echo', 'lucia', 'jack'],
  emotional: ['jack', 'echo', 'lucia'],
  principle: ['jack', 'lucia', 'echo'],
  knowledge: ['echo', 'jack', 'lucia'],
};

export const getCloserPersona = (
  categoryV3: CategoryV3,
  firstPersona: AllPersonaKey,
): AllPersonaKey => {
  const chain = CLOSER_FALLBACK_CHAIN[categoryV3] ?? CLOSER_FALLBACK_CHAIN.emotional;
  for (const candidate of chain) {
    if (candidate !== firstPersona) return candidate;
  }
  // 폴백이 모두 firstPersona와 겹치는 비정상 케이스 — 마지막 후보 반환
  return chain[chain.length - 1];
};

/**
 * Router 결정 — 호명 우선, 카테고리 + 메시지 형태로 호출 전략 결정.
 *  - 호명 감지 → solo (단독 답변, 4명 자동 출동 금지)
 *  - 가벼운 단일 질문 → light (1~2명)
 *  - 명확한 카테고리 (invest/action/principle 중 1개만) → standard (3명 협업)
 *  - 복합/모호 (emotional 기본값) → full (4명 3단계)
 */
export const decideCallStrategy = (msg: string): RouterDecision => {
  const invokedPersona = detectPersonaInvocation(msg);
  if (invokedPersona) {
    return {
      strategy: 'solo',
      category: detectCategoryV3(msg),
      invokedPersona,
      reason: `페르소나 호명 감지: ${invokedPersona.toUpperCase()}`,
    };
  }
  const category = detectCategoryV3(msg);
  if (isLightQuestion(msg)) {
    return {
      strategy: 'light',
      category,
      invokedPersona: null,
      reason: '가벼운 단일 질문 → 1~2명 호출',
    };
  }
  if (category === 'emotional') {
    return {
      strategy: 'full',
      category,
      invokedPersona: null,
      reason: '복합/모호 질문 → 4명 3단계 호출',
    };
  }
  return {
    strategy: 'standard',
    category,
    invokedPersona: null,
    reason: `명확한 카테고리(${category}) → 3명 협업`,
  };
};

