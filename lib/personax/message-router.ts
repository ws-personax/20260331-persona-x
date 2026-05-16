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
 * 매칭 조건: 페르소나 이름 앞·뒤 모두 letter 비-인접 (단어 경계).
 *  예) "JACK 너는 어때?" / "RAY 의견 줘" / "ECHO," / "LUCIA 님" — 모두 매칭
 *  반례) "JACKET" / "RAYBAN" 같은 영어 단어 일부는 미매칭
 *  한글 인접은 매칭 허용 ("JACK팀장", "JACK야" 등 — 호명 의도 자연스러움)
 */
const PERSONA_CALL_PATTERNS: ReadonlyArray<{ persona: PersonaName; re: RegExp }> = [
  // 긴 이름 우선 (LUCIA가 LUC* / RAY를 우선 매칭하지 않도록)
  { persona: 'LUCIA', re: /(?:^|[^a-zA-Z])LUCIA(?![a-zA-Z])/i },
  { persona: 'ECHO',  re: /(?:^|[^a-zA-Z])ECHO(?![a-zA-Z])/i },
  { persona: 'JACK',  re: /(?:^|[^a-zA-Z])JACK(?![a-zA-Z])/i },
  { persona: 'RAY',   re: /(?:^|[^a-zA-Z])RAY(?![a-zA-Z])/i },
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
  'PersonaX 3단계 오케스트레이터입니다. 요청한 태그 블록만 출력하고, 코드펜스와 설명 문장은 금지합니다.';

const extractTag = (text: string | null, tag: string): string => {
  if (!text) return '';
  const re = new RegExp(
    `\\[${tag}\\][^\\S\\n]*\\n?([\\s\\S]*?)(?=\\n\\s*\\[(?:DATA_PACK|LUCIA_VIEW|JACK_VIEW|RAY_VIEW|ECHO_VIEW|FIRST|SECOND|THIRD|CLOSER|LUCIA_CLOSE|ECHO_QUESTION)\\]|$)`,
    'i',
  );
  const m = text.match(re);
  return (m?.[1] || '').trim();
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
- ✅ "제가 보기엔..." / "저는 이렇게 봐요" / 호칭 없이 바로 본론`;
      // callLLM의 persona 인자도 effectiveSoloPersona로 — 모델·로깅 일관성.
      const soloRaw = await callLLM(effectiveSoloPersona, soloSystem, [
        { role: 'user', content: soloPrompt },
      ]);
      let soloText = extractTag(soloRaw, 'FIRST');
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
    const dataPrompt = buildDataCollectionPrompt(
      messages,
      legacyCategory,
      lastMessage,
      router.categoryV3,
    );
    const dataRaw = await callLLM('echo', OPTION_D_SYSTEM, [
      { role: 'user', content: dataPrompt },
    ]);
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
    const scriptRaw = await callLLM('echo', OPTION_D_SYSTEM, [
      { role: 'user', content: scriptPrompt },
    ]);
    const first = extractTag(scriptRaw, 'FIRST') || '';
    const second = extractTag(scriptRaw, 'SECOND') || '';
    const third = extractTag(scriptRaw, 'THIRD') || '';
    const closer = extractTag(scriptRaw, 'CLOSER') || '';
    const luciaClose = extractTag(scriptRaw, 'LUCIA_CLOSE') || '';
    const echoQuestion = extractTag(scriptRaw, 'ECHO_QUESTION') || '';

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
