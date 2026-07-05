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
  decideCallStrategy as _decideCallStrategy,
  getFirstPersona,
  getCloserPersona,
  buildCategoryVocabBlockRule,
  type AllPersonaKey,
  type CallStrategy,
} from '@/app/api/chat/prompts/orchestrator-tagged';
import {
  detectCategoryV3,
  detectEmotionalSubtypeHee,
  type CategoryV3,
} from './classifier';
import {
  buildDecisionSummary as buildPersonaXDecisionSummary,
  formatDecisionSummary,
  type DecisionSummary,
} from '@/lib/personax/decision-summary';
import {
  buildDecisionContext,
  type DecisionContext,
} from '@/lib/personax/context/decision-context';
import { inferDecisionType } from '@/lib/personax/decision-type-map';
import {
  resolveMarketDataPromptContext,
  collectStageOneData,
} from '@/lib/personax/runtime/stage1-data-collection';
import { wrapResearchLayerOutput } from '@/lib/personax/research-layer';
import { analyzePersonaViews } from '@/lib/personax/runtime/stage2-persona-analysis';
import {
  runSoloScriptGeneration,
  runStage3ScriptGeneration,
} from '@/lib/personax/runtime/stage3-script-generation';

// 기존 import 경로 유지 — postProcessPersonaOutput은 Stage 3(대본 생성) 후처리 필터로
// lib/personax/runtime/stage3-script-generation.ts로 이동. 외부 소비자 없음(현재 시점) 확인됨.
export { postProcessPersonaOutput } from '@/lib/personax/runtime/stage3-script-generation';

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
  finance:  /주식|펀드|ETF|종목|코스피|코스닥|나스닥|NASDAQ|S&P500|SP500|S&P|다우존스|다우|항셍|닛케이|원달러|달러|금|채권|포트폴리오|수익|손절|매수|매도|배당|금리|환율|가상화폐|비트코인|XRP|xrp|리플|이더리움|ETH|eth|솔라나|SOL|sol|저축|예금|적금|퇴직금|연금|삼성전자|SK하이닉스|카카오뱅크|카카오게임즈|카카오|네이버|현대차|기아차|기아|LG전자|LG|엘지전자|엘지|삼성바이오|셀트리온|포스코|크래프톤|넥슨|넷마블|하이브|두산|롯데|한화|SK|KT|CJ|GS|KB금융|신한지주|하나금융|테슬라|애플|엔비디아|구글|아마존|마이크로소프트|살까|팔까|투자할까|넣을까|빼야|수익|손실|올랐|떨어졌|물렸|상승|하락/,
  sports:   /야구|축구|농구|배구|골프|올림픽|경기|이길|승부|우승|선수|리그|기아|삼성라이온즈|두산|LG트윈스|롯데|한화|KT|SSG|NC|키움/,
  news:     /정세|뉴스|전쟁|분쟁|중동|러시아|우크라이나|미중|외교|정치|대통령|선거|경제뉴스|시황|금융뉴스|증시|환경|기후|재난|사건|사고|테러|유가|원유|석유|에너지|OPEC|산유국|천연가스|인플레이션|금리정책|연준|Fed|미연준|기준금리|호르무즈|이란|이스라엘|하마스|헤즈볼라|가자|레바논|트럼프|바이든|시진핑|푸틴|북한|미사일|핵|제재|관세|무역전쟁|환율전쟁|HMM|화물선|해운|공급망|반도체규제|AI규제|빅테크|실리콘밸리|연방|의회|상원|하원|탄핵|대선|총선|보궐|여당|야당|국회|법안|정책|홍명보|감독|축구협회|월드컵|국가대표|청와대|메가\s*프로젝트|정부\s*프로젝트|장기\s*침체|저성장|일본화|거시경제/,
  life:     /명퇴|명예퇴직|희망퇴직|퇴직 권유|권고사직|은퇴|조기퇴직|퇴직 후|제2인생|요양원|치매|부모님 건강|어머니 건강|아버지 건강|무릎|허리|혈압|당뇨|갱년기|근감소|건강검진|병원|아이 대학|자녀 취업|자녀 결혼|아들 걱정|딸 걱정|황혼이혼|부부 갈등|노후|노후준비|노후자금|은퇴자금|막막|가장으로서|생계|카드론|노후파산|노후빈곤|황혼육아|손자|손녀|며느리|사위|시댁|처가|이혼숙려|졸혼|별거/,
  legal:    /세금|법률|계약|소송|이혼|상속|증여|부동산등기|임대차|보증금|노동|퇴직|해고|세무|신고|명퇴|권고사직|퇴직금|실업급여|노동부|노무사/,
  tech:     /자동차|전기차|배터리|반도체|AI|인공지능|스마트폰|앱|소프트웨어|하드웨어|IT|클라우드/,
  emotion:  /힘들|외로|슬프|우울|화나|기쁘|설레|불안|걱정|스트레스|피곤|지쳐|고민|마음|감정|위로|공감|재테크고민|투자고민|노후걱정/,
} as const;

const HEALTH_KEYWORDS =
  /피부과|병원|시술|성형|약|치료|수술|검사|진료|의사|한의원|치과|안과|이비인후과|내과|외과|정신과|MRI|CT|항암|투약|처방|입원|외래/;

const LUMP_SUM_LIFE_KEYWORDS =
  /퇴직금|노후\s*자금|노후자금|목돈|자산\s*배분|자산배분|상속금/;

const INVESTMENT_EXECUTION_PATTERN =
  /투자|주식|ETF|S&P500|SP500|S&P|배당주|채권|펀드|매수|사야|살까|비중|자산\s*배분|자산배분|포트폴리오|IRP|연금저축|예금|적금|넣어야|넣을까|어디에\s*넣/;

const MONEY_FRUSTRATION_PATTERN =
  /돈[이가은을]?\s*(?:전혀\s*)?(?:못\s*모으|안\s*모|새(?:어나)?|관리\s*(?:안|못|.*안\s*(?:되|돼)))|저축[이가은을]?\s*(?:안\s*(?:되|돼)|못\s*하)|월급[이가은을]?.*새어나|생활비[가은을]?\s*(?:감당(?:이)?\s*안|.*감당이?\s*안\s*(?:되|돼))|카드값[이가은을]?\s*감당(?:이)?\s*안|고정비[가은을]?\s*부담|지출[이가은을]?\s*(?:너무\s*많|관리\s*(?:안|못))|빚[이가은을]?\s*버거|대출[이가은을]?\s*(?:버거|감당(?:이)?\s*안)/;

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
  if (
    LUMP_SUM_LIFE_KEYWORDS.test(text) &&
    !INVESTMENT_EXECUTION_PATTERN.test(text)
  ) {
    return 'life';
  }
  if (
    MONEY_FRUSTRATION_PATTERN.test(text) &&
    !INVESTMENT_EXECUTION_PATTERN.test(text)
  ) {
    return 'emotion';
  }
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
  decisionContext: DecisionContext;
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
 *  - ECHO인 경우에도 principle처럼 FIRST=ECHO가 명시된 카테고리는 order에 반영
 *  - invest는 ECHO를 order에서 제외하고 [ray, jack, lucia] 3원소로 반환
 *    (ECHO_QUESTION 하드코딩 슬롯과 중복/누락 방지)
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
  if (categoryV3 === 'invest') {
    // ECHO는 [ECHO_QUESTION] 하드코딩 슬롯에 별도로 등장 → order에서 제외.
    // order에 포함하면 tagged 경로에서 THIRD/ECHO_QUESTION 중복 + JACK 누락 버그 발생.
    const remaining = arr.filter((k) => k !== 'jack' && k !== 'echo' && k !== 'ray');
    arr = ['ray', 'jack', ...remaining];
  }
  if (categoryV3 === 'knowledge') {
    return ['ray', 'lucia', 'jack', 'echo'];
  }
  if (categoryV3 === 'principle') {
    const middle = arr.filter((k) => k !== 'jack' && k !== 'echo');
    arr = ['echo', ...middle, 'jack'];
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
  // 희(喜) 모드 — emotional 서브타입. CLOSER=ECHO + order=[lucia,jack,ray,echo] 강제.
  // 기쁜 소식은 본질 짚기(ECHO 마무리)가 위로(LUCIA)·결단(JACK)보다 자연스러움.
  const isHeeMode = categoryV3 === 'emotional' && detectEmotionalSubtypeHee(text);
  const closerPersona: AllPersonaKey = isHeeMode
    ? 'echo'
    : getCloserPersona(categoryV3, firstPersona);
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
  const order: TaggedPersonaKey[] = isHeeMode
    ? ['lucia', 'jack', 'ray', 'echo']
    : enforceOrder(baseOrder, firstPersona, closerPersona, orderCategory);
  const decisionContext = buildDecisionContext(text);
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
    decisionContext,
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
  /** [CLOSER] 전용 — 감정/복합 카테고리에서도 LUCIA_CLOSE와 합치지 않음 */
  closerContent?: string;
  /** [CLOSER] 담당 페르소나 */
  closerKey?: TaggedPersonaKey;
  /** [LUCIA_CLOSE] — 감정/복합 카테고리 액자 구조 닫기 (별도 LUCIA 버블) */
  luciaClose?: string;
  /** solo 호출 시 단일 응답 본문 */
  soloContent?: string;
  /** solo 호출 시 단일 응답 페르소나 */
  soloKey?: TaggedPersonaKey;
  decisionSummary?: DecisionSummary;
  decisionType?: string;
  /**
   * Stage 1(데이터 수집)+Stage 2(페르소나 관점) 결과 캐시 — full 경로만 채워짐.
   * 호출자가 Stage 3 결과가 품질 가드(JACK ~요 종결 / ECHO 자기 3인칭 등) 위반을 감지하면
   * 이 캐시를 `precomputedStages`로 다시 넣어 Stage 3만 재호출 가능 (Stage 1+2 LLM 호출 절감).
   * solo 경로는 Stages 1+2가 없으므로 undefined.
   */
  _stage12Cache?: {
    dataPack: string;
    personaViews: string;
  };
};

const inferDecisionSummaryType = (
  question: string,
  router: RouterDecision,
): string => inferDecisionType(question, router.categoryV3);

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
    /**
     * Stage 1+2 결과 사전 주입 — 제공 시 데이터 수집·관점 분해 LLM 호출 스킵하고
     * Stage 3(대본 생성)만 실행. 호출자(route.ts)가 품질 가드 위반 감지 후 Stage 3만
     * 재호출하는 데 사용. solo 경로에는 영향 없음(원래 Stages 1+2 없음).
     */
    precomputedStages?: {
      dataPack: string;
      personaViews: string;
    };
    marketDataPromptContext?: string;
    memoryContext?: string;
  },
): Promise<RoutedRequestResult | null> {
  // ✅ 관측성 전용 — 예외 발생 시 catch 블록에서 "어느 Stage까지 완료됐는지" 보고하기 위한
  //   기록용 변수. 로직/제어 흐름에는 관여하지 않음(읽기 전용 로그 컨텍스트).
  let _lastCompletedStage:
    | 'entry' | 'router-resolved' | 'solo' | 'stage1' | 'stage2' | 'stage3'
    = 'entry';
  let _categoryV3ForLog: string | undefined;
  try {
    const messages = params.messages;
    const lastMessage = params.lastMessage;
    const router =
      params.router ||
      routeMessage(messages, lastMessage, '');
    _categoryV3ForLog = router.categoryV3;
    _lastCompletedStage = 'router-resolved';
    const legacyCategory = router.legacyCategory || '';
    const marketDataPromptContext = await resolveMarketDataPromptContext(
      lastMessage,
      params.marketDataPromptContext,
    );
    const memoryContext = params.memoryContext?.trim() || '';
    const decisionType = inferDecisionSummaryType(lastMessage, router);

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
      const soloResult = await runSoloScriptGeneration({
        callLLM,
        messages,
        lastMessage,
        legacyCategory,
        effectiveSoloPersona,
        firstPersona: router.firstPersona,
        categoryV3: router.categoryV3,
        hasPriorConversation: router.hasPriorConversation,
        closerPersona: router.closerPersona,
        decisionType,
        marketDataPromptContext,
      });
      _lastCompletedStage = 'solo';
      return {
        first: '',
        second: '',
        third: '',
        echoQuestion: '',
        soloContent: soloResult.soloContent,
        soloKey: soloResult.soloKey,
      };
    }

    // Stage 1+2 — precomputedStages 제공 시 LLM 호출 스킵하고 그대로 사용.
    //   품질 가드 위반 후 Stage 3만 재호출하는 경로에서 사용. solo 경로는 이 블록 자체에 도달하지 않음.
    let dataPack: string;
    let personaViews: string;
    if (params.precomputedStages) {
      dataPack = params.precomputedStages.dataPack;
      personaViews = params.precomputedStages.personaViews;
      _lastCompletedStage = 'stage2';
    } else {
      dataPack = await collectStageOneData({
        callLLM,
        messages,
        legacyCategory,
        lastMessage,
        categoryV3: router.categoryV3,
      });
      _lastCompletedStage = 'stage1';
      const stage2ResearchLayerOutput = wrapResearchLayerOutput({
        marketDataPromptContext,
        dataPack,
      });
      personaViews = await analyzePersonaViews({
        callLLM,
        messages,
        dataPack: stage2ResearchLayerOutput.rawFacts.dataPack,
        legacyCategory,
        categoryV3: router.categoryV3,
        lastMessage,
        marketDataPromptContext: stage2ResearchLayerOutput.rawFacts.marketDataPromptContext,
        memoryContext,
      });
      _lastCompletedStage = 'stage2';
    }

    const researchLayerOutput = wrapResearchLayerOutput({
      marketDataPromptContext,
      dataPack,
    });

    // Stage 3 — 일반 (4명 대본, TikiTaka 순차 호출)
    const stage3Result = await runStage3ScriptGeneration({
      messages,
      lastMessage,
      legacyCategory,
      personaViews,
      dataPack: researchLayerOutput.rawFacts.dataPack,
      decisionType,
      marketDataPromptContext: researchLayerOutput.rawFacts.marketDataPromptContext,
      researchLayerOutput,
      router,
    });
    _lastCompletedStage = 'stage3';
    const {
      first,
      second,
      third,
      closer,
      closerKey,
      luciaClose,
      echoQuestion,
      firstKey,
      secondKey,
      thirdKey,
    } = stage3Result;

    const decisionSummary = buildPersonaXDecisionSummary({
      question: lastMessage,
      questionType: decisionType,
      [firstKey]: first,
      [secondKey]: second,
      [thirdKey]: third,
      echo: echoQuestion || closer,
    });
    const decisionSummaryText = formatDecisionSummary(decisionSummary);
    const appendSummary = (value: string): string =>
      value ? `${value}\n\n${decisionSummaryText}` : decisionSummaryText;
    let firstWithSummary = first;
    let secondWithSummary = second;
    let thirdWithSummary = third;
    let closerWithSummary = closer;
    let echoQuestionWithSummary = echoQuestion;
    if (decisionSummaryText) {
      const lastOutputKey = router.order[router.order.length - 1] || 'echo';
      if (lastOutputKey === router.closerPersona && closer) {
        closerWithSummary = appendSummary(closer);
      } else if (lastOutputKey === firstKey) {
        firstWithSummary = appendSummary(first);
      } else if (lastOutputKey === secondKey) {
        secondWithSummary = appendSummary(second);
      } else if (lastOutputKey === thirdKey) {
        thirdWithSummary = appendSummary(third);
      } else {
        echoQuestionWithSummary = appendSummary(echoQuestion);
      }
    }

    return {
      first: firstWithSummary,
      second: secondWithSummary,
      third: thirdWithSummary,
      echoQuestion: echoQuestionWithSummary,
      closerContent: closerWithSummary,
      closerKey,
      luciaClose,
      // 품질 가드 위반 시 Stage 3만 재호출하도록 Stage 1+2 결과 노출.
      decisionSummary,
      decisionType,
      _stage12Cache: { dataPack, personaViews },
    };
  } catch (e) {
    console.warn(
      '[runRoutedRequest] 실행 실패',
      JSON.stringify({
        lastCompletedStage: _lastCompletedStage,
        failedAt: _lastCompletedStage === 'stage3'
          ? 'post-stage3(decision-summary/return 구간)'
          : `${_lastCompletedStage} 다음 단계`,
        categoryV3: _categoryV3ForLog,
      }),
      e,
    );
    return null;
  }
}

// 호환용 wrapper — 기존 import 경로 유지
export type MessageRouterResult = RouterDecision;
