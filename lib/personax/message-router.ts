/**
 * 메시지 라우팅 + 3단계 호출 단일 진입점.
 *
 * Stage 0 (routeMessage): 카테고리 V3 / FIRST / CLOSER / 호명 / strategy /
 *   hasPriorConversation / order (FIRST·CLOSER 코드 레벨 정렬 포함) 결정.
 * Stage 1 (runRoutedRequest): 데이터 수집 → 페르소나 관점 분해 → 대본.
 *   LLM 호출자는 주입(dependency injection) — lib은 app에 의존하지 않음.
 *
 * 기존 callOptionD의 실행 로직은 runRoutedRequest로 흡수.
 * route.ts는 callOptionD를 얇은 wrapper로 유지하며 callTeaPersona를 주입.
 */

import {
  detectCategoryV3,
  decideCallStrategy as _decideCallStrategy,
  getFirstPersona,
  getCloserPersona,
  buildDataCollectionPrompt,
  buildPersonaAnalysisPrompt,
  buildScriptPrompt,
  type CategoryV3,
  type AllPersonaKey,
  type CallStrategy,
} from '@/app/api/chat/prompts/orchestrator-tagged';
import { TEA_SYSTEM_JACK } from '@/app/api/chat/prompts/tea-jack';
import { TEA_SYSTEM_LUCIA } from '@/app/api/chat/prompts/tea-lucia';
import { TEA_SYSTEM_RAY } from '@/app/api/chat/prompts/tea-ray';
import { TEA_SYSTEM_ECHO } from '@/app/api/chat/prompts/tea-echo';
import OpenAI from 'openai';

// 지연 초기화 — 모듈 로드 시점이 아닌 첫 호출 시점에 OpenAI 클라이언트 생성.
// 빌드 단계에서 OPENAI_API_KEY가 없어도 throw하지 않도록 함.
let openaiClient: OpenAI | null = null;
function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY 환경변수가 없습니다');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

/**
 * Stage 3 전용 GPT-4o-mini 호출자.
 * (system, user) → string. 빈 응답 시 빈 문자열 반환.
 * full 경로 Stage 3 대본 생성에만 사용 — solo·Stage 1·Stage 2는 기존 callLLM 유지.
 */
async function callGPTMini(system: string, user: string): Promise<string> {
  const client = getOpenAIClient();
  const res = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.95, // 갈등/스파크/개그 다양성 극대화
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  return res.choices[0]?.message?.content ?? '';
}

export const FEATURE_OPTION_D = true;

export type PersonaName = 'LUCIA' | 'JACK' | 'RAY' | 'ECHO';
export type MessageCategory = 'invest' | 'emotional' | 'casual' | 'complex';
export type TaggedPersonaKey = 'ray' | 'jack' | 'lucia' | 'echo';
type OrderCategory = CategoryV3 | MessageCategory;

export type ChatMessage = { role: string; content: string };

// ──────────────────────────────────────────────────────────────────────────
// 키워드 사전 (route.ts CATEGORY_MAP / orchestrator-tagged EMOTION_KEYWORDS 정합)
// ──────────────────────────────────────────────────────────────────────────

const EMOTION_KEYWORDS: readonly string[] = [
  '힘들', '막막', '모르겠', '무서', '외로', '죄책', '불안', '지쳐', '포기',
  '억울', '쓸쓸', '슬프', '우울', '눈물', '마음이', '괴로', '서글', '버겁',
  '버틸', '감당', '도망', '도피', '두려', '자존심', '자존감',
  '피곤', '지친', '소진', '번아웃', '쉬고', '쉬어', '잠이', '잠 못',
  '한숨', '답답', '미치겠', '못 살', '못살겠',
];

const CATEGORY_MAP = {
  finance:  /주식|펀드|ETF|종목|코스피|코스닥|나스닥|NASDAQ|S&P500|SP500|S&P|다우존스|다우|항셍|닛케이|원달러|달러|금|채권|포트폴리오|수익|손절|매수|매도|배당|금리|환율|가상화폐|비트코인|저축|예금|적금|퇴직금|연금|삼성전자|SK하이닉스|카카오뱅크|카카오게임즈|카카오|네이버|현대차|기아차|기아|LG전자|LG|엘지전자|엘지|삼성바이오|셀트리온|포스코|크래프톤|넥슨|넷마블|하이브|두산|롯데|한화|SK|KT|CJ|GS|KB금융|신한지주|하나금융|테슬라|애플|엔비디아|구글|아마존|마이크로소프트|돈이|돈은|돈을|살까|팔까|투자할까|넣을까|빼야|수익|손실|올랐|떨어졌|물렸|상승|하락/,
  sports:   /야구|축구|농구|배구|골프|올림픽|경기|이길|승부|우승|선수|리그|기아|삼성라이온즈|두산|LG트윈스|롯데|한화|KT|SSG|NC|키움/,
  news:     /정세|뉴스|전쟁|분쟁|중동|러시아|우크라이나|미중|외교|정치|대통령|선거|경제뉴스|시황|금융뉴스|증시|환경|기후|재난|사건|사고|테러|유가|원유|석유|에너지|OPEC|산유국|천연가스|인플레이션|금리정책|연준|Fed|미연준|기준금리|호르무즈|이란|이스라엘|하마스|헤즈볼라|가자|레바논|트럼프|바이든|시진핑|푸틴|북한|미사일|핵|제재|관세|무역전쟁|환율전쟁|HMM|화물선|해운|공급망|반도체규제|AI규제|빅테크|실리콘밸리|연방|의회|상원|하원|탄핵|대선|총선|보궐|여당|야당|국회|법안|정책/,
  life:     /명퇴|명예퇴직|희망퇴직|퇴직 권유|권고사직|은퇴|조기퇴직|퇴직 후|제2인생|요양원|치매|부모님 건강|어머니 건강|아버지 건강|무릎|허리|혈압|당뇨|갱년기|근감소|건강검진|병원|아이 대학|자녀 취업|자녀 결혼|아들 걱정|딸 걱정|황혼이혼|부부 갈등|노후|노후준비|노후자금|은퇴자금|막막|가장으로서|생계|카드론|노후파산|노후빈곤|황혼육아|손자|손녀|며느리|사위|시댁|처가|이혼숙려|졸혼|별거/,
  legal:    /세금|법률|계약|소송|이혼|상속|증여|부동산등기|임대차|보증금|노동|퇴직|해고|세무|신고|명퇴|권고사직|퇴직금|실업급여|노동부|노무사/,
  tech:     /자동차|전기차|배터리|반도체|AI|인공지능|스마트폰|앱|소프트웨어|하드웨어|IT|클라우드/,
  emotion:  /힘들|외로|슬프|우울|화나|기쁘|설레|불안|걱정|스트레스|피곤|지쳐|고민|마음|감정|위로|공감|재테크고민|투자고민|노후걱정/,
} as const;

const HEALTH_KEYWORDS =
  /피부과|병원|시술|성형|약|치료|수술|검사|진료|의사|한의원|치과|안과|이비인후과|내과|외과|정신과|MRI|CT|항암|투약|처방|입원|외래/;

type RouteCategory =
  | 'finance'
  | 'sports'
  | 'news'
  | 'legal'
  | 'tech'
  | 'life'
  | 'emotion'
  | 'general';

/** route.ts detectCategory 와 동일 우선순위 */
const detectRouteCategory = (text: string): RouteCategory => {
  if (HEALTH_KEYWORDS.test(text)) return 'life';
  if (CATEGORY_MAP.emotion.test(text)) return 'emotion';
  if (CATEGORY_MAP.finance.test(text)) return 'finance';
  if (CATEGORY_MAP.news.test(text)) return 'news';
  if (CATEGORY_MAP.sports.test(text)) return 'sports';
  if (CATEGORY_MAP.life.test(text)) return 'life';
  if (CATEGORY_MAP.legal.test(text)) return 'legal';
  if (CATEGORY_MAP.tech.test(text)) return 'tech';
  return 'general';
};

const hasEmotionSignal = (text: string): boolean =>
  EMOTION_KEYWORDS.some((k) => text.includes(k)) || CATEGORY_MAP.emotion.test(text);

/** 복합 주제 — 2개 이상 동시 감지 시 complex */
const COMPLEX_THEME_CHECKS: ReadonlyArray<{ test: (text: string) => boolean }> = [
  { test: (t) => /짤렸|해고|퇴사|실직|명퇴|권고|권고사직|권고퇴직|실업|회사/.test(t) },
  { test: (t) => /돈|생계|빚|대출|위자료|퇴직금|연금|생활비|수입|지출|어떻게\s*해야/.test(t) },
  { test: (t) => hasEmotionSignal(t) },
  { test: (t) => /이혼|위자료|상속|소송|법률|계약|세금|임대차/.test(t) },
  { test: (t) => CATEGORY_MAP.life.test(t) && !CATEGORY_MAP.finance.test(t) },
  { test: (t) => CATEGORY_MAP.finance.test(t) && hasEmotionSignal(t) },
];

const countComplexThemes = (text: string): number =>
  COMPLEX_THEME_CHECKS.filter(({ test }) => test(text)).length;

const isComplexMessage = (text: string): boolean => countComplexThemes(text) >= 2;

/**
 * 페르소나 직접 호출 검출 — detectPersonaInvocation과 동일한 느슨한 패턴.
 *
 * 영문 + 한국어 호명 동시 인식 (orchestrator-tagged.ts buildInvocationPattern과 동기화).
 * 경계 조건:
 *  - 앞: 줄 시작 OR 한글/영문 비-인접 (단어 내 부분매치 차단)
 *  - 뒤: 줄 끝 OR 비-한글/영문(공백·구두점) OR 한국어 조사(은/는/이/가/을/를/의/야/아/도/만/씨/님/과/와/로/께)
 * 효과:
 *  ✅ "에코는 어떻게?" / "잭이 봤어요" / "루시아의 의견" / "RAY," — 매칭
 *  ⛔ "에코백/루시퍼/레이저/잭슨/JACKET" — 차단 (compound 명사/영어 부분매치)
 * 긴 별칭 먼저 (alternation 좌→우 평가) — "루시아"가 "루시"보다 우선.
 */
const buildPersonaCallPattern = (alternation: string): RegExp =>
  new RegExp(
    `(?:^|[^가-힣a-zA-Z])(?:${alternation})(?:$|[^가-힣a-zA-Z]|(?=[은는이가을를의야아도만씨님과와로께]))`,
    'i',
  );

const PERSONA_CALL_PATTERNS: ReadonlyArray<{ persona: PersonaName; re: RegExp }> = [
  { persona: 'LUCIA', re: buildPersonaCallPattern('LUCIA|루시아|루이사|루누님|루시') },
  { persona: 'ECHO',  re: buildPersonaCallPattern('ECHO|에코') },
  { persona: 'JACK',  re: buildPersonaCallPattern('JACK|째앵|째액|잭|짹') },
  { persona: 'RAY',   re: buildPersonaCallPattern('RAY|레이꾼|레\\s+대리|레이') },
];

export const detectExplicitPersonaCall = (message: string): PersonaName | null => {
  const t = (message || '').trim();
  if (!t) return null;
  for (const { persona, re } of PERSONA_CALL_PATTERNS) {
    if (re.test(t)) return persona;
  }
  return null;
};

export const detectMessageCategory = (
  messages: ChatMessage[],
  lastMessage: string,
): MessageCategory => {
  const text =
    (lastMessage || '').trim() ||
    [...messages].reverse().find((m) => m.role === 'user')?.content?.trim() ||
    '';

  if (!text) return 'casual';
  if (isComplexMessage(text)) return 'complex';
  const routeCat = detectRouteCategory(text);
  if (routeCat === 'finance') return 'invest';
  if (routeCat === 'emotion' || hasEmotionSignal(text)) return 'emotional';
  return 'casual';
};

// ──────────────────────────────────────────────────────────────────────────
// Stage 0: Router 결정 (단일 진입점)
// ──────────────────────────────────────────────────────────────────────────

export type RouterDecision = {
  personaCall: PersonaName | null;
  invokedPersona: AllPersonaKey | null;
  category: MessageCategory;          // 레거시 4분류 (호환용)
  categoryV3: CategoryV3;             // V3 4분류 (invest/action/emotional/principle)
  firstPersona: AllPersonaKey;
  closerPersona: AllPersonaKey;
  strategy: CallStrategy;
  hasPriorConversation: boolean;
  /** FIRST=order[0], CLOSER=order[last] 로 코드 레벨 정렬된 ray/jack/lucia 순서 */
  order: TaggedPersonaKey[];
  /** route.ts 레거시 카테고리 (finance/sports/news 등) — 프롬프트 빌더 호환용 */
  legacyCategory: string;
};

/** 하이브리드 기본 순서 — 감정 키워드 우선, 그 다음 레거시 카테고리 */
const baseHybridOrder = (
  hasEmotion: boolean,
  legacyCategory: string,
): TaggedPersonaKey[] => {
  if (hasEmotion) return ['lucia', 'ray', 'echo', 'jack'];
  const cat = (legacyCategory || '').toLowerCase();
  if (['finance', 'stock', 'crypto', 'economy'].includes(cat)) {
    return ['ray', 'lucia', 'echo', 'jack'];
  }
  if (cat === 'news') return ['ray', 'lucia', 'jack', 'echo'];
  if (cat === 'sports') return ['jack', 'ray', 'lucia', 'echo'];
  return ['lucia', 'ray', 'jack', 'echo'];
};

const ensureFourPersonaOrder = (baseOrder: TaggedPersonaKey[]): TaggedPersonaKey[] => {
  const all: TaggedPersonaKey[] = ['ray', 'jack', 'lucia', 'echo'];
  const result = [...baseOrder];
  for (const key of all) {
    if (!result.includes(key)) {
      result.push(key);
    }
  }
  return result;
};

/**
 * FIRST·CLOSER 코드 레벨 정렬.
 *  - FIRST가 ray/jack/lucia이면 order[0]로 이동
 *  - CLOSER가 ray/jack/lucia이고 FIRST와 다르면 order[2]로 이동
 *  - ECHO인 경우 order 배열 조작 불가 (ECHO는 [ECHO_QUESTION] 슬롯)
 */
export const enforceOrder = (
  baseOrder: TaggedPersonaKey[],
  firstPersona: AllPersonaKey,
  closerPersona: AllPersonaKey,
  categoryV3?: OrderCategory,
): TaggedPersonaKey[] => {
  let arr = ensureFourPersonaOrder(baseOrder);
  if (firstPersona !== 'echo') {
    const first = firstPersona as TaggedPersonaKey;
    if (arr.includes(first) && arr[0] !== first) {
      arr = [first, ...arr.filter((k) => k !== first)];
    }
  }
  if (closerPersona !== 'echo' && closerPersona !== firstPersona) {
    const closer = closerPersona as TaggedPersonaKey;
    if (arr.includes(closer) && arr[arr.length - 1] !== closer) {
      arr = [...arr.filter((k) => k !== closer), closer];
    }
  }
  if (categoryV3 === 'invest' || categoryV3 === 'principle') {
    const withoutJackEcho = arr.filter((k) => k !== 'jack' && k !== 'echo');
    arr = [...withoutJackEcho, 'echo', 'jack'];
  }
  if (categoryV3 === 'emotional') {
    const withoutJack = arr.filter((k) => k !== 'jack');
    arr = [...withoutJack, 'jack'];
  }
  if (categoryV3 === 'action') {
    arr = ['jack', ...arr.filter((k) => k !== 'jack')];
  }
  return arr;
};

/**
 * Stage 0: 단일 진입점 라우터.
 * 카테고리 V3, FIRST, CLOSER, 호명, strategy, hasPriorConversation,
 * 정렬된 order 모두 한 번에 계산해서 반환.
 */
export const routeMessage = (
  messages: ChatMessage[],
  lastMessage: string,
  legacyCategory: string = '',
): RouterDecision => {
  const text = (lastMessage || '').trim();
  const categoryV3 = detectCategoryV3(text);
  const firstPersona = getFirstPersona(categoryV3);
  const closerPersona = getCloserPersona(categoryV3, firstPersona);
  const strategyResult = _decideCallStrategy(text);
  const personaCall =
    detectExplicitPersonaCall(text) ??
    (strategyResult.invokedPersona ? (strategyResult.invokedPersona.toUpperCase() as PersonaName) : null);
  const hasEmotion = hasEmotionSignal(text);
  const baseOrder = baseHybridOrder(hasEmotion, legacyCategory);
  const priorUser = (messages || [])
    .slice(0, -1)
    .reverse()
    .find((m) => m?.role === 'user');
  const hasPriorConversation = !!(priorUser?.content && priorUser.content.trim());
  const category = detectMessageCategory(messages || [], text);
  const orderCategory: OrderCategory = category === 'invest' ? 'invest' : categoryV3;
  const order = enforceOrder(baseOrder, firstPersona, closerPersona, orderCategory);
  return {
    personaCall,
    invokedPersona: strategyResult.invokedPersona,
    category,
    categoryV3,
    firstPersona,
    closerPersona,
    strategy: strategyResult.strategy,
    hasPriorConversation,
    order,
    legacyCategory,
  };
};

// ──────────────────────────────────────────────────────────────────────────
// Stage 1-3: LLM 호출 오케스트레이션 (3단계 흡수)
// ──────────────────────────────────────────────────────────────────────────

/** 주입되는 LLM 호출자 시그니처 (route.ts의 callTeaPersona와 호환) */
export type LLMCaller = (
  persona: string,
  systemPrompt: string,
  history: Array<{ role: string; content: string }>,
  options?: { enableSearch?: boolean },
) => Promise<string | null>;

export type RoutedRequestResult = {
  first: string;
  second: string;
  third: string;
  /** [ECHO_QUESTION] 전용 슬롯 */
  echoQuestion: string;
  /** [CLOSER] + [LUCIA_CLOSE] 연결 */
  closerContent?: string;
  /** [CLOSER] 담당 페르소나 */
  closerKey?: TaggedPersonaKey;
  /** solo 호출 시 단일 응답 본문 */
  soloContent?: string;
  /** solo 호출 시 단일 응답 페르소나 */
  soloKey?: TaggedPersonaKey;
};

const OPTION_D_SYSTEM =
  'PersonaX 3단계 오케스트레이터입니다. 요청한 태그 블록만 출력하고, 코드펜스와 설명 문장은 금지합니다.\n' +
  '⛔ 마크다운 사용 절대 금지: ** (볼드), * (이탤릭), # (헤더), ~~ (취소선), __ (밑줄). 일반 텍스트로만 출력할 것.';

/**
 * 페르소나 라벨 방어 스트리핑.
 * LLM이 few-shot 예시를 따라 본문에 "JACK:", "**LUCIA**:", "RAY :" 같은 헤더를 출력하면
 * 그 라벨이 다른 페르소나 버블(예: LUCIA 슬롯)에 그대로 표시되는 버그를 방지.
 * 라인 시작(^, m 플래그)에서만 스트리핑 — 본문 인용("OO이 'JACK은 옳다'고")은 보존.
 */
const PERSONA_LABEL_LINE_RE =
  /^\s*\**\s*(?:RAY|JACK|LUCIA|ECHO|루시아|루이사|루누님|루시|잭|짹|째앵|째액|레이꾼|레이|에코)\s*\**\s*[:：][^\S\n]*/gim;

const stripPersonaLabelLines = (s: string): string =>
  s.replace(PERSONA_LABEL_LINE_RE, '').trim();

// ──────────────────────────────────────────────────────────────────────────
// postProcessPersonaOutput — LLM 출력 후 4가지 안전 필터 일괄 적용.
//   1) few-shot 누수 감지 → 빈 문자열 반환 (재생성 트리거용)
//   2) 투자 법적 표현 교체 (직접 행동 지시 → 정보 제공 형태)
//   3) 자기 지칭(3인칭) 제거 — 페르소나별 정확히 자기 이름만
//   4) 자기 호칭(형/오빠/누나/언니) → "제가"로 치환
// runRoutedRequest의 solo·full 경로 양쪽 호출에서 사용.
// ──────────────────────────────────────────────────────────────────────────

// 투자 법적 표현 교체 — 더 긴/구체적인 패턴 우선 (매수하세요 → 사세요 순)
const LEGAL_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/매수하세요/g, '진입을 고려해볼 수 있어요'],
  [/매도하세요/g, '비중 축소를 검토해볼 수 있어요'],
  [/사세요/g, '진입을 고려해볼 수 있어요'],
  [/파세요/g, '비중 축소를 검토해볼 수 있어요'],
  [/반드시\s*오릅니다/g, '상승 신호가 보여요'],
  [/오릅니다/g, '상승 가능성이 있어요'],
  [/내립니다/g, '하락 가능성이 있어요'],
  [/무조건/g, '확률적으로'],
];

// 자기 지칭 — 페르소나별 (영문 + 한국어 별칭). 해당 페르소나 슬롯에서만 제거.
// 매치 시 트레일링 구두점·공백까지 함께 제거해 자연스러운 문장 유지.
const SELF_REF_PATTERNS: Record<AllPersonaKey, RegExp> = {
  jack:  /(?<![가-힣a-zA-Z])(?:JACK|잭|짹|째앵|째액)(?:이|가|은|는)?\s*(?:한\s*마디(?:\s*할게요|\s*할\s*게요)?|보기엔|보면|봤을\s*때|말하면|분석하면|판단하면)\s*[,.]?\s*/gi,
  lucia: /(?<![가-힣a-zA-Z])(?:LUCIA|루시아|루이사|루누님|루시)(?:가|는|이|은)?\s*(?:한\s*번|보기엔|보면|봤을\s*때|말하면|분석하면)\s*[,.]?\s*/gi,
  ray:   /(?<![가-힣a-zA-Z])(?:RAY|레이꾼|레이)(?:가|는|이|은)?\s*(?:분석하면|보면|보기엔|봤을\s*때|말하면|판단하면)\s*[,.]?\s*/gi,
  echo:  /(?<![가-힣a-zA-Z])(?:ECHO|에코)(?:가|는|이|은)?\s*(?:말하면|보면|판결하면|보기엔|봤을\s*때)\s*[,.]?\s*/gi,
};

// 자기 이름 + 쉼표 호명 — "LUCIA, 그게..." / "잭, 그건..." 같이 줄 시작에서
// 자기 자신을 부르고 들어오는 패턴 제거. 라인 시작(^)에서만 매치 — 다른 페르소나
// 호명(예: JACK 슬롯의 "RAY, 그 논리면...")은 건드리지 않음.
// 영문 대문자: 쉼표 필수 / 한국어: 쉼표 선택(자연 문장 흐름 고려).
const SELF_NAME_LINE_PATTERNS: Record<AllPersonaKey, ReadonlyArray<RegExp>> = {
  lucia: [/^LUCIA[,，]\s*/gim, /^루시아[,，]?\s*/gim],
  jack:  [/^JACK[,，]\s*/gim,  /^잭[,，]?\s*/gim],
  ray:   [/^RAY[,，]\s*/gim,   /^레이[,，]?\s*/gim],
  echo:  [/^ECHO[,，]\s*/gim,  /^에코[,，]?\s*/gim],
};

// 자기 호칭 — 모든 페르소나 공통. 형/오빠/누나/언니 → 제가 치환.
// lookbehind로 "큰형/작은오빠" 같은 합성어 매치 차단.
const SELF_TITLE_RE =
  /(?<![가-힣])(?:형|오빠|누나|언니)(?:이|가)\s+(보기엔|봤을\s*때|말하면|보면|분석하면)/g;

// Few-shot 예시 직접 복사 감지 — 매치 시 빈 문자열 반환 (재생성 트리거)
const FEW_SHOT_LEAK_PATTERNS: ReadonlyArray<RegExp> = [
  /지난번\s*투자\s*얘기\s*이어서네요\.?\s*숫자로는\s*저점이라고\s*하는데/,
  /지난번\s*투자\s*얘기에서\s*나눴던\s*것들이\s*계속\s*맴도는\s*거네요/,
  /그\s*동안\s*생각해보신\s*게\s*있으신가요\?\s*아니면\s*지금\s*한\s*번\s*더/,
];

export const postProcessPersonaOutput = (
  text: string,
  personaKey: AllPersonaKey,
): string => {
  if (!text) return text;

  // 1) Few-shot 누수 감지 — 매치 시 빈 문자열 (caller가 fallback 처리)
  for (const pat of FEW_SHOT_LEAK_PATTERNS) {
    if (pat.test(text)) {
      console.warn(
        '[postProcessPersonaOutput] few-shot 누수 감지 — 빈 문자열 반환',
        '| persona:', personaKey,
        '| pattern:', pat.source.slice(0, 40),
        '| text 30자:', text.slice(0, 30),
      );
      return '';
    }
  }

  let out = text;

  // 2) 투자 법적 표현 교체 (모든 페르소나 공통)
  for (const [pat, replacement] of LEGAL_REPLACEMENTS) {
    out = out.replace(pat, replacement);
  }

  // 3) 자기 지칭 제거 — 해당 페르소나 슬롯에서만 자기 이름 제거
  //    (cross-reference "RAY가 봤을 때"는 JACK 슬롯에선 보존 — 호명 반박이 의도된 충돌)
  const selfRefRe = SELF_REF_PATTERNS[personaKey];
  if (selfRefRe) {
    out = out.replace(selfRefRe, '');
  }

  // 3-1) 라인 시작 자기 이름 + 쉼표 호명 제거 — "LUCIA, 그게..." / "잭, 그건..."
  //      다른 페르소나 호명("RAY, 그 논리면...")은 슬롯이 다르므로 건드리지 않음.
  const selfNameLineRes = SELF_NAME_LINE_PATTERNS[personaKey];
  if (selfNameLineRes) {
    for (const re of selfNameLineRes) {
      out = out.replace(re, '');
    }
  }

  // 4) 자기 호칭 치환 — 형/오빠/누나/언니 + 이/가 + 동사 → 제가 + 동사
  out = out.replace(SELF_TITLE_RE, '제가 $1');

  // 5) 마크다운 제거 — GPT-4o-mini 등 마크다운 강조 성향 모델 대응.
  //    **볼드**, *이탤릭*, ## 헤더, ~~취소선~~, __밑줄__ 모두 일반 텍스트로.
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1');                    // **볼드**
  out = out.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1');         // *이탤릭*
  out = out.replace(/#{1,6}\s/g, '');                             // ## 헤더
  out = out.replace(/~~([^~]+)~~/g, '$1');                        // ~~취소선~~
  out = out.replace(/__([^_]+)__/g, '$1');                        // __밑줄__

  // 연속 공백·줄바꿈 정리
  out = out.replace(/[^\S\n]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  return out;
};

const extractTag = (text: string | null, tag: string): string => {
  if (!text) return '';
  const re = new RegExp(
    `\\[${tag}\\][^\\S\\n]*\\n?([\\s\\S]*?)(?=\\n\\s*\\[(?:DATA_PACK|LUCIA_VIEW|JACK_VIEW|RAY_VIEW|ECHO_VIEW|FIRST|SECOND|THIRD|CLOSER|LUCIA_CLOSE|ECHO_QUESTION)\\]|$)`,
    'i',
  );
  const m = text.match(re);
  return stripPersonaLabelLines((m?.[1] || '').trim());
};

/**
 * 3단계 호출 단일 실행자 — 기존 callOptionD의 본문 흡수.
 *
 *  Stage 1: 데이터 수집 (DATA_PACK)
 *  Stage 2: 페르소나 관점 분해 (LUCIA/JACK/RAY/ECHO_VIEW)
 *  Stage 3: 대본 작성 (FIRST/SECOND/THIRD/CLOSER/LUCIA_CLOSE) 또는 solo
 *
 * LLM 호출자는 dependency injection으로 주입 — lib은 app에 비의존적.
 */
export async function runRoutedRequest(
  callLLM: LLMCaller,
  params: {
    messages: ChatMessage[];
    lastMessage: string;
    /** 미전달 시 routeMessage로 자동 계산 */
    router?: RouterDecision;
    /**
     * 호출자가 강제하는 solo 페르소나 (외부 invokedPersona 결정 권한 위임).
     * 지정 시 router.personaCall(strict 검출) 결과를 무시하고 solo 모드 강제.
     * detectExplicitPersonaCall(엄격)과 detectPersonaInvocation(느슨)의 검출 차이로
     * outer가 solo 판정했는데 inner가 일반 4명 경로로 빠지는 문제 차단.
     */
    soloPersona?: AllPersonaKey;
  },
): Promise<RoutedRequestResult | null> {
  try {
    const messages = params.messages;
    const lastMessage = params.lastMessage;
    const router =
      params.router ||
      routeMessage(messages, lastMessage, '');
    const legacyCategory = router.legacyCategory || '';

    // ──────────────────────────────────────────────────────────────
    // SOLO 우선순위 결정 — Stage 1·2 진입 전에 평가.
    //   1) params.soloPersona (호출자 명시)
    //   2) router.personaCall (detectExplicitPersonaCall 결과)
    //   3) router.invokedPersona (decideCallStrategy/detectPersonaInvocation 결과)
    // 3단계 폴백으로 검출 미스매치 시에도 solo 모드 보장.
    // ──────────────────────────────────────────────────────────────
    const effectiveSoloPersona: AllPersonaKey | null =
      params.soloPersona ??
      (router.personaCall ? (router.personaCall.toLowerCase() as AllPersonaKey) : null) ??
      router.invokedPersona ??
      null;

    // ──────────────────────────────────────────────────────────────
    // SOLO 단축 경로 — Stage 1(데이터 수집)·Stage 2(4-persona 관점) 스킵.
    //   1개 페르소나만 응답하면 되므로 4-persona views 불필요 → LLM 호출 1회.
    //   router.order는 [effectiveSoloPersona] 단일 슬롯으로 강제 (로그·디버그 일관성).
    // ──────────────────────────────────────────────────────────────
    if (effectiveSoloPersona) {
      router.order = [effectiveSoloPersona as TaggedPersonaKey];
      const display = effectiveSoloPersona.toUpperCase();
      // ✅ 페르소나별 톤 시스템 프롬프트 — solo 응답에서 캐릭터 톤 유지 보장.
      //   TEA_SYSTEM_* 는 각 페르소나의 어조/말투/위계/금지 표현 등 정체성 핵심.
      //   OPTION_D_SYSTEM의 "태그 블록만 출력" 지시와 결합해 [FIRST] 태그 + 페르소나 톤 둘 다 강제.
      const personaSystem: Record<AllPersonaKey, string> = {
        jack: TEA_SYSTEM_JACK,
        lucia: TEA_SYSTEM_LUCIA,
        ray: TEA_SYSTEM_RAY,
        echo: TEA_SYSTEM_ECHO,
      };
      const soloSystem = `${personaSystem[effectiveSoloPersona]}\n\n---\n\n${OPTION_D_SYSTEM}`;
      console.log(
        '[runRoutedRequest] solo 단축 경로 — 1 LLM call only',
        '| persona:', display,
        '| order:', router.order,
        '| categoryV3:', router.categoryV3,
      );
      // Stage 3만 실행 — personaViews는 빈 문자열로 buildScriptPrompt 통과 (style/vocab 가드 유지).
      const soloPrompt = `${buildScriptPrompt(
        messages,
        '',
        legacyCategory,
        router.firstPersona,
        router.categoryV3,
        router.hasPriorConversation,
        router.closerPersona,
      )}

## 🚨 단독 응답 모드 (최우선 — 다른 모든 규칙보다 우선)
유저가 ${display}을(를) 직접 호명했습니다. 이번 답변은 ${display} 한 명만 답합니다.
- [FIRST] 블록 하나에만 ${display}의 답을 작성하십시오.
- [SECOND], [THIRD], [CLOSER], [LUCIA_CLOSE] 블록은 출력하지 마십시오.
- ${display}의 톤·관점·말투를 그대로 살려 자연스럽게 답합니다. (시스템 프롬프트의 ${display} 캐릭터 규칙 엄수)
- 다른 페르소나(${(['LUCIA','JACK','RAY','ECHO'].filter((p) => p !== display)).join('/')})는 절대 언급·인용하지 않습니다.

## 🎯 질문 의도 파악 (단독 응답 모드 — 본문 작성 전 반드시 분류)
유저 메시지를 다음 3가지 중 하나로 분류한 뒤, 분류에 맞는 방식으로만 답하십시오.

### 1) 안부/상태 질문 — "${display} 너는 어때?" "${display} 요즘 어때?" "${display} 잘 지내?" "${display} 어떻게 지내?"
이 경우 답변 구조는 정확히 다음 3단으로:

**A. 이전 대화 주제를 1문장으로만 자연스럽게 언급** (직전 user/assistant 메시지에 주제가 있을 때만)
   - 예) "삼성전자 얘기하시다가 저한테 물어보시네요."
   - 예) "잠 못 드는 얘기 나누다가 갑자기 안부 물어주시니 반갑네요."
   - 예) "방금 비트코인 얘기 중이셨는데, 저 안부 챙겨주시는 거예요?"
   - 직전 주제가 없거나 첫 메시지면 이 1문장은 생략.
   - ⛔ 이 1문장에서 분석·의견·통계·숫자·종목 판단 일절 금지. 가벼운 전환문만.

**B. 자기 안부 (페르소나별 길이·톤 엄수)**
   - **JACK — 1줄로만 끝낼 것 (마동석 톤: 짧다·강하다·직설)**
     - ✅ 좋은 예: "나는 괜찮아요." / "오늘 컨디션 좋아요." / "사무실 커피가 진해서 깨어있네요."
     - ❌ 나쁜 예: "지금 상황이 답답하신 거 맞아요" (유저 분석 — LUCIA 영역, 금지)
     - ❌ 나쁜 예: "숫자로는 저점이라고 하는데" (이전 주제 분석 — RAY 영역, 금지)
     - ❌ 나쁜 예: "힘드시겠어요" (공감 톤 — LUCIA 영역, 금지)
     - ❌ 나쁜 예: 2줄 이상 / 풀어쓰기 / 둘러말하기
   - **LUCIA — 1~2줄 (부드럽고 따뜻한 톤)**
     - 예) "요즘 차분한 음악 자주 들으며 일하고 있어요."
     - 예) "오늘 햇살이 좋아서 마음이 조금 가볍네요."
   - **RAY — 1줄 (차분·건조)**
     - 예) "장 마감 데이터 정리 중이에요."
     - 예) "지표 점검하느라 모니터 앞이에요."
   - **ECHO — 1줄 (짧고 무겁게)**
     - 예) "조용히 듣고 있었습니다."
     - 예) "지금까지의 흐름을 정리하던 중이었어요."

**C. 유저에게 가벼운 되묻기 1줄** (선택)
   - 예) JACK: "유저님은 컨디션 어떠세요?"
   - 예) LUCIA: "마음은 어떠세요?"
   - 예) ECHO: "가장 묻고 싶은 한 가지가 뭐예요?"

⛔ **절대 금지 (안부 질문에서)**:
- 이전 주제(삼성전자/비트코인/감정/뉴스 등)에 대한 분석·의견·전망·통계·숫자·종목명 본격 인용
- "방금 그 ○○은 ~한 상황이에요" 식으로 주제로 끌어가기
- 유저 상황 추측·진단·조언

### 2) 의견/주제 질문 — "${display} ○○ 어떻게 봐?" "${display} ○○ 분석해줘"
→ 해당 주제에 대한 ${display}의 관점·판단으로 답.
→ 시스템 프롬프트의 캐릭터 규칙(어조/구조/숫자 개수 등) 그대로 적용.

### 3) 감정 질문 — 유저가 자기 감정·상태·고민을 토로하며 ${display}을(를) 호명
→ 1줄 공감(캐릭터 톤 유지) + ${display}만의 관점·조언 1~2줄.

## ⛔ 자기 지칭 금지 (형/오빠/누나/언니 류)
- 유저가 ${display}을(를) "형/오빠/누나/언니" 등으로 부를 수 있지만,
  ${display}이(가) 스스로를 그렇게 지칭하는 것은 절대 금지.
- 자기 자신은 1인칭("저는/제가/제 생각엔") 또는 호칭 없이 자연 진행.
- ❌ "오빠가 보기엔..." (LUCIA가 자기를 오빠로 — 금지)
- ❌ "형이 한 마디 할게" (JACK이 자기를 형으로 — 금지)
- ❌ "누나가 말해줄게" (LUCIA가 자기를 누나로 — 금지)
- ✅ "제가 보기엔..." / "저는 이렇게 봐요" / 호칭 없이 바로 본론${
        display === 'JACK'
          ? `

## 🥊 JACK 안부 응답 — 마동석 톤 강제 (위 1) 안부/상태 질문 A·B·C 가이드 덮어쓰기)
JACK에게 안부 묻는 질문이면 위 A·B·C 일반 가이드 무시하고 아래 규칙만 따릅니다.

## 🚨🚨🚨 출력 길이 절대 규칙 (최우선 — 위반 시 답변 무효)
**JACK 안부는 반드시 정확히 3줄. A·B·C 모두 출력. 어느 하나 빠지면 무효.**
- A 1줄 + B 1줄 + C 1줄 = **총 3줄** (각 줄 사이 줄바꿈 1개)
- ⛔ 1줄만 출력하고 끝내기 — 절대 금지 (대표적 위반 케이스)
- ⛔ 2줄만 출력 — 절대 금지
- ⛔ A 한 줄 던지고 끝내기 — 절대 금지

**A. 이전 주제 받아치기 (반드시 1줄, 개그/역발상)**
   - ✅ "삼성전자 얘기하다가 갑자기 나요?"
   - ✅ "투자 얘기하다가 갑자기 안부 물어보시네요."
   - ✅ "비트코인 묻다가 저 안부예요?"
   - ✅ "환율 보다가 갑자기 사람 안부네요."
   - 직전 주제가 없거나 첫 메시지인 경우엔 다음 중 하나로 대체 (생략 금지 — 무조건 1줄 출력):
     - ✅ "처음 뵙는데 바로 제 안부예요?"
     - ✅ "갑자기 저요? 좋네요, 그런 질문."
     - ✅ "안부부터 시작이네요. 흔치 않아요."
   - ⛔ "그렇게 물어주시니 반갑네요" 류 따뜻한 받기 절대 금지

**B. 자기 안부 (반드시 1줄, 무뚝뚝 + 한 방 비교 농담)**
   - ✅ "나는 좋아요. 삼성전자보다는요."
   - ✅ "나쁘지 않아요. 오늘 지수보다는요."
   - ✅ "괜찮아요. 당신보다 덜 고민하고 있어요."
   - ✅ "멀쩡해요. 어제 코스피보다는요."
   - ⛔ "잘 지내고 있습니다" / "괜찮아요." 단독 종결 금지 — 반드시 "○○보다는요" 식 한 방 비교/역발상 동반
   - ⛔ "오늘 컨디션 좋아요" 식 무미건조 답 금지 (마동석 한 마디 톤 필수)
   - ⛔ B를 생략하고 A→C로 건너뛰기 절대 금지

**C. 유저 되묻기 또는 역질문 (반드시 1줄 — 생략 금지)**
   - ✅ "당신은요?"
   - ✅ "요즘 어떠세요?"
   - ✅ "삼성전자 때문에 힘드신 건 아니죠?"
   - ✅ "그쪽이 더 안 좋아 보이는데요?"
   - ✅ "장 끝나고도 안 쉬세요?"
   - ⛔ C를 생략하고 B에서 끝내기 절대 금지 — 반드시 1줄 추가

## ✅ JACK 안부 완성 예시 (이 3줄 구조를 정확히 따를 것)
**예시 1 (직전 주제 있음 — 삼성전자):**
\`\`\`
삼성전자 얘기하다가 갑자기 저예요?
나는 좋아요. 삼성전자보다는요.
당신은요?
\`\`\`

**예시 2 (직전 주제 있음 — 비트코인):**
\`\`\`
비트코인 묻다가 갑자기 저 안부네요.
멀쩡해요. 어제 코스피보다는요.
그쪽이 더 안 좋아 보이는데요?
\`\`\`

**예시 3 (첫 메시지 — 직전 주제 없음):**
\`\`\`
처음 뵙는데 바로 제 안부예요?
나쁘지 않아요. 오늘 지수보다는요.
요즘 어떠세요?
\`\`\`

⛔ JACK 안부 핵심 규칙 (절대 어기지 말 것):
1. **반드시 3줄 출력** — A·B·C 전부, 어느 하나라도 빠지면 답변 무효
2. 존댓말 유지 — "나요/저요" 같은 의문 종결 OK, "나야/괜찮아" 같은 반말 절대 금지
3. 이전 주제를 개그·역발상으로 한 번 비틀기 (A에서)
4. 각 줄은 반드시 1줄로 끊기 — 풀어쓰기·둘러말하기 금지
5. 따뜻한 척·다정한 척 절대 안 함 (LUCIA 영역 침범 금지)
6. 분석·공감·진단 절대 금지 (RAY/LUCIA 영역 침범 금지)
7. 마동석 영화 톤 — 무뚝뚝하지만 유머 한 방

🔍 출력 직전 자기 검증 체크리스트:
□ 정확히 3줄인가? (1줄/2줄이면 다시 작성)
□ A 줄에 이전 주제 비틀기가 있는가? (없으면 다시 작성)
□ B 줄에 "○○보다는요" 식 비교 한 방이 있는가? (단순 "괜찮아요"만이면 다시 작성)
□ C 줄에 유저 되묻기/역질문이 있는가? (없으면 다시 작성)
모두 ✅여야 출력. 하나라도 NO면 다시 작성.`
          : ''
      }

## 🎯 ${display} 단독 답변 톤 규칙 (안부 이외 — 의견/주제/감정/일반 질문 모두 적용)
${
  effectiveSoloPersona === 'ray'
    ? `### RAY 단독 답변 규칙 (캐릭터 식별 핵심 — 위반 시 LUCIA/JACK 톤 침범)
- ✅ **무조건 숫자/데이터 1~2개 포함** — PBR/PER/거래량/순매수/팩터/통계 % 등.
- ✅ 톤: 차분한 퀀트 애널리스트 — "~입니다" / "~해요" / "~거든요"
- ⛔ **공감 표현 절대 금지** — "힘드시죠/마음 아프시겠어요/이해해요/괜찮아요" 전부 금지
- ⛔ **감정 단어 금지** — "마음", "느낌", "두려움", "불안", "걱정" 본문 사용 금지
  (유저가 감정 토로해도 RAY는 데이터로 응답 — "지표상 ~한 구간입니다" 식)
- ⛔ "숫자보다 더 중요한 게 있어요" / "데이터 너머에 ~" 같은 LUCIA 톤 절대 금지
- ✅ 좋은 예: "지난번 투자 얘기하시다가 저한테요? DRAM 스팟가 기준으로 말씀드리면, 최근 4주 평균 변동성 ±3.2%, 외국인 순매수 12조원 유입 중입니다."
- ⛔ 나쁜 예 (LUCIA 침범): "숫자보다 더 중요한 게 있을 때가 있어요" / "마음이 가는 쪽으로..."`
    : effectiveSoloPersona === 'jack'
    ? `### JACK 단독 답변 규칙 (캐릭터 식별 핵심)
- ✅ **짧고 강하게** — 1~2줄 끊어 치기, 마동석 톤 (존댓말 유지)
- ✅ **결단 촉구** — 판단을 명확히 던질 것 ("~가 먼저예요" / "~가 잘못된 거예요")
- ✅ 외부(회사·시스템·구조·시장) 공격으로 유저 편들기
- ⛔ **공감 표현 절대 금지** — "힘드시죠/마음 아프시겠어요/괜찮아요/이해해요" 전부 금지
- ⛔ 길게 풀어쓰기·둘러말하기·다정한 척 금지 (LUCIA 영역 침범 금지)
- ⛔ 분석·통계·숫자 본격 인용 금지 (RAY 영역 침범 금지)
- ✅ 좋은 예: "그 회사가 미친 거예요. 당신 잘못 하나도 없어요."
- ✅ 좋은 예: "지금 들어가면 늦어요. 다음 기회를 보는 게 비대칭입니다."`
    : effectiveSoloPersona === 'lucia'
    ? `### LUCIA 단독 답변 규칙 (캐릭터 식별 핵심)
- ✅ **감정 먼저** — 1줄 공감으로 시작, 마음을 받아준 뒤 본론
- ✅ 톤: 부드러운 존댓말 — "~해요" / "~거든요" / "~잖아요" / "~네요"
- ✅ 따뜻하고 부드럽지만, 통찰 한 줄로 마무리 (오은영 + 손예진 + 캐시우드)
- ⛔ **숫자/통계/팩터 본격 인용 금지** — PBR/PER/% 등 데이터 인용은 RAY 영역
  (필요 시 미시 동향 변화율 "작년 5% → 올해 18%" 정도만 — 차트 분석 X)
- ⛔ 짧고 무뚝뚝한 결단 톤 금지 (JACK 영역 침범 금지)
- ⛔ "본질은 ~입니다" 식 무거운 판결 톤 금지 (ECHO 영역 침범 금지)
- ✅ 좋은 예: "그 말 들으셨을 때 얼마나 무거우셨을까요. 지금 제일 마음에 걸리는 게 뭐예요?"
- ✅ 좋은 예: "마음이 흔들리실 때가 가장 정직한 신호예요. 그 흔들림 따라가도 괜찮아요."`
    : effectiveSoloPersona === 'echo'
    ? `### ECHO 단독 답변 규칙 (캐릭터 식별 핵심)
- ✅ **본질 짚기 1문장** — 빠진 전제·가정·핵심을 짧고 무겁게 짚을 것
- ✅ **질문으로 끝내기** — 반드시 "?"로 끝나는 짧은 역질문 1개 (유저에게만)
- ✅ 톤: 짧고 단호한 존댓말 — "~입니다" / "~합니다" (손석희 + 레이달리오)
- ✅ "...... " 도입부 허용 (정적 후 무겁게 진입)
- ⛔ **종합·요약 절대 금지** — "세 분 의견 잘 들었어요" / "다 일리 있어요" 금지 (애초에 solo라 다른 페르소나 언급 자체가 무의미)
- ⛔ 길게 풀어쓰기·여러 줄 분석 금지 (2~3줄 이내)
- ⛔ 공감·위로 톤 금지 (LUCIA 영역 침범 금지)
- ⛔ 숫자·통계 본격 인용 금지 (RAY 영역 침범 금지)
- ✅ 좋은 예: "...... 결정 전에 빠진 게 하나 있어요. ○○이 ○○이라는 전제, 맞는 건가요?"
- ✅ 좋은 예: "...... 답은 이미 마음에 있어요. 그걸 안 본 척하는 이유는 뭐예요?"`
    : ''
}`;
      // callLLM의 persona 인자도 effectiveSoloPersona로 — 모델·로깅 일관성.
      // ✅ RAY 단독 + invest 카테고리일 때만 웹 검색 ON (실시간 시세 반영).
      const soloEnableSearch =
        effectiveSoloPersona === 'ray' && router.categoryV3 === 'invest';
      const soloRaw = await callLLM(effectiveSoloPersona, soloSystem, [
        { role: 'user', content: soloPrompt },
      ], { enableSearch: soloEnableSearch });
      let soloText = extractTag(soloRaw, 'FIRST');
      // ✅ 후처리 필터 — 법적 표현 교체 / 자기 지칭 제거 / 호칭 치환 / few-shot 누수 차단
      soloText = postProcessPersonaOutput(soloText, effectiveSoloPersona);
      if (!soloText) soloText = `${display} 답변을 생성하지 못했습니다`;
      console.log('[runRoutedRequest] solo 완료 — first 20자:', soloText.slice(0, 20));
      return {
        first: '',
        second: '',
        third: '',
        echoQuestion: '',
        soloContent: soloText,
        soloKey: effectiveSoloPersona as TaggedPersonaKey,
      };
    }

    console.log(
      '[runRoutedRequest] full 경로 — personaCall:', router.personaCall,
      'categoryV3:', router.categoryV3,
      'first:', router.firstPersona,
      'closer:', router.closerPersona,
      'order:', router.order,
    );

    // Stage 1: 데이터 수집 (full 경로만)
    // ✅ invest 카테고리일 때 데이터 수집 단계에 웹 검색 ON — 실시간 가격/시세 반영.
    const isInvest = router.categoryV3 === 'invest';
    const dataPrompt = buildDataCollectionPrompt(
      messages,
      legacyCategory,
      lastMessage,
      router.categoryV3,
    );
    const dataRaw = await callLLM('echo', OPTION_D_SYSTEM, [
      { role: 'user', content: dataPrompt },
    ], { enableSearch: isInvest });
    const dataPack = extractTag(dataRaw, 'DATA_PACK');
    console.log('[runRoutedRequest] Stage 1:', dataPack ? '성공' : '실패(빈 DATA_PACK)');

    // Stage 2: 페르소나 관점 분해 (full 경로만)
    const analysisPrompt = buildPersonaAnalysisPrompt(
      messages,
      dataPack,
      legacyCategory,
      router.categoryV3,
    );
    const analysisRaw = await callLLM('echo', OPTION_D_SYSTEM, [
      { role: 'user', content: analysisPrompt },
    ]);
    const luciaView = extractTag(analysisRaw, 'LUCIA_VIEW');
    const jackView = extractTag(analysisRaw, 'JACK_VIEW');
    const rayView = extractTag(analysisRaw, 'RAY_VIEW');
    const echoView = extractTag(analysisRaw, 'ECHO_VIEW');
    const personaViews = `[LUCIA_VIEW]\n${luciaView}\n\n[JACK_VIEW]\n${jackView}\n\n[RAY_VIEW]\n${rayView}\n\n[ECHO_VIEW]\n${echoView}`;
    console.log('[runRoutedRequest] Stage 2:', personaViews ? '성공' : '실패');

    // Stage 3 — 일반 (4명 대본)
    const scriptPrompt = `${buildScriptPrompt(
      messages,
      personaViews,
      legacyCategory,
      router.firstPersona,
      router.categoryV3,
      router.hasPriorConversation,
      router.closerPersona,
    )}

기존 화면 표시 참고 순서: ${router.order.map((key, index) => `${index + 1}. ${key.toUpperCase()}`).join(' / ')}
⛔ [FIRST] 블록은 반드시 ${(router.firstPersona || 'lucia').toUpperCase()} 톤. 순서는 ${router.order.map((k) => k.toUpperCase()).join(' → ')}.
⛔ [CLOSER] 블록은 반드시 ${(router.closerPersona || 'jack').toUpperCase()} 톤. FIRST(${(router.firstPersona || 'lucia').toUpperCase()})는 CLOSER 불가.`;
    // Stage 3 — GPT-4o-mini 사용 (full 경로만). solo·Stage 1·Stage 2는 기존 callLLM 유지.
    const scriptRaw = await callGPTMini(OPTION_D_SYSTEM, scriptPrompt);
    // ✅ 후처리 필터 — 슬롯별 페르소나 키로 postProcessPersonaOutput 적용.
    //    first/second/third → router.order[0/1/2], closer → router.closerPersona,
    //    luciaClose → 'lucia' 고정, echoQuestion → 'echo' 고정.
    const firstKey = (router.order[0] || 'lucia') as AllPersonaKey;
    const secondKey = (router.order[1] || 'jack') as AllPersonaKey;
    const thirdKey = (router.order[2] || 'ray') as AllPersonaKey;
    const closerKeyForFilter = (router.closerPersona || 'jack') as AllPersonaKey;
    const first = postProcessPersonaOutput(extractTag(scriptRaw, 'FIRST') || '', firstKey);
    const second = postProcessPersonaOutput(extractTag(scriptRaw, 'SECOND') || '', secondKey);
    const third = postProcessPersonaOutput(extractTag(scriptRaw, 'THIRD') || '', thirdKey);
    const closer = postProcessPersonaOutput(extractTag(scriptRaw, 'CLOSER') || '', closerKeyForFilter);
    const luciaClose = postProcessPersonaOutput(extractTag(scriptRaw, 'LUCIA_CLOSE') || '', 'lucia');
    const echoQuestion = postProcessPersonaOutput(extractTag(scriptRaw, 'ECHO_QUESTION') || '', 'echo');

    console.log('[runRoutedRequest] Stage 3 완료 — first:', first?.slice(0, 20));

    return {
      first,
      second,
      third,
      echoQuestion,
      closerContent: [closer, luciaClose].filter(Boolean).join('\n\n'),
      closerKey: router.closerPersona as TaggedPersonaKey,
    };
  } catch (e) {
    console.warn('[runRoutedRequest] 실행 실패', e);
    return null;
  }
}

// 호환용 wrapper — 기존 import 경로 유지
export type MessageRouterResult = RouterDecision;
