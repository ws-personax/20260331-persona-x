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

/** 페르소나 직접 호출 — 긴 패턴 우선 (JACK팀장 등) */
const PERSONA_CALL_RULES: ReadonlyArray<{ persona: PersonaName; patterns: RegExp[] }> = [
  {
    persona: 'ECHO',
    patterns: [
      /(?:^|[\s,，])ECHO\s*[,，]/i,
      /(?:^|[\s,，])ECHO\s*야\b/i,
      /(?:^|[\s,，])ECHO\s*(?:어떻게|생각|의견|봐|말)/i,
    ],
  },
  {
    persona: 'LUCIA',
    patterns: [
      /(?:^|[\s,，])LUCIA\s*님/i,
      /(?:^|[\s,，])LUCIA\s*[,，]/i,
      /(?:^|[\s,，])LUCIA\s*야\b/i,
      /(?:^|[\s,，])LUCIA\s*(?:어떻게|생각|의견|봐|말)/i,
    ],
  },
  {
    persona: 'RAY',
    patterns: [
      /(?:^|[\s,，])RAY\s*[,，]/i,
      /(?:^|[\s,，])RAY\s*야\b/i,
      /(?:^|[\s,，])RAY\s*(?:어떻게|봐|의견|생각|말)/i,
    ],
  },
  {
    persona: 'JACK',
    patterns: [
      /(?:^|[\s,，])JACK\s*팀장/i,
      /(?:^|[\s,，])JACK\s*[,，]/i,
      /(?:^|[\s,，])JACK\s*야\b/i,
      /(?:^|[\s,，])JACK\s*(?:어떻게|봐|의견|생각|말)/i,
    ],
  },
];

export const detectExplicitPersonaCall = (message: string): PersonaName | null => {
  const t = (message || '').trim();
  if (!t) return null;
  for (const { persona, patterns } of PERSONA_CALL_RULES) {
    if (patterns.some((re) => re.test(t))) return persona;
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
  const arr = [...baseOrder, ...all].filter(
    (key, index, self): key is TaggedPersonaKey =>
      all.includes(key as TaggedPersonaKey) && self.indexOf(key) === index,
  );
  return arr;
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
  if (categoryV3 === 'invest' || categoryV3 === 'emotional' || categoryV3 === 'principle') {
    if (categoryV3 !== 'emotional' || closerPersona === 'jack') {
      arr = [...arr.filter((k) => k !== 'echo' && k !== 'jack'), 'echo', 'jack'];
    }
  }
  if (categoryV3 === 'action') {
    arr = [...arr.filter((k) => k !== 'echo'), 'echo'];
  }
  if (categoryV3 === 'emotional' && closerPersona === 'echo') {
    arr = [...arr.filter((k) => k !== 'echo'), 'echo'];
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
  /** [CLOSER] + [LUCIA_CLOSE] 연결 — 기존 echoQuestion 슬롯에 대응 */
  echoQuestion: string;
};

const OPTION_D_SYSTEM =
  'PersonaX 3단계 오케스트레이터입니다. 요청한 태그 블록만 출력하고, 코드펜스와 설명 문장은 금지합니다.';

const extractTag = (text: string | null, tag: string): string => {
  if (!text) return '';
  const re = new RegExp(
    `\\[${tag}\\][^\\S\\n]*\\n?([\\s\\S]*?)(?=\\n\\s*\\[(?:DATA_PACK|LUCIA_VIEW|JACK_VIEW|RAY_VIEW|ECHO_VIEW|FIRST|SECOND|THIRD|CLOSER|LUCIA_CLOSE)\\]|$)`,
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
  },
): Promise<RoutedRequestResult | null> {
  try {
    const messages = params.messages;
    const lastMessage = params.lastMessage;
    const router =
      params.router ||
      routeMessage(messages, lastMessage, '');
    const legacyCategory = router.legacyCategory || '';

    console.log(
      '[runRoutedRequest] start — personaCall:', router.personaCall,
      'categoryV3:', router.categoryV3,
      'first:', router.firstPersona,
      'closer:', router.closerPersona,
      'order:', router.order,
    );

    // Stage 1: 데이터 수집
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

    // Stage 2: 페르소나 관점 분해
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

    // Stage 3 — solo (페르소나 호명 시)
    if (router.personaCall) {
      const soloPrompt = `${buildScriptPrompt(
        messages,
        personaViews,
        legacyCategory,
        router.firstPersona,
        router.categoryV3,
        router.hasPriorConversation,
        router.closerPersona,
      )}

## 🚨 단독 응답 모드 (최우선 — 다른 모든 규칙보다 우선)
유저가 ${router.personaCall}을(를) 직접 호명했습니다. 이번 답변은 ${router.personaCall} 한 명만 답합니다.
- [FIRST] 블록 하나에만 ${router.personaCall}의 답을 작성하십시오.
- [SECOND], [THIRD], [CLOSER], [LUCIA_CLOSE] 블록은 출력하지 마십시오.
- ${router.personaCall}의 PERSONA_VIEW를 충실히 반영해 자연스럽게 답합니다.`;
      const soloRaw = await callLLM('echo', OPTION_D_SYSTEM, [
        { role: 'user', content: soloPrompt },
      ]);
      let soloText = extractTag(soloRaw, 'FIRST');
      if (!soloText) soloText = `${router.personaCall} 답변을 생성하지 못했습니다`;
      const calledKey = router.personaCall.toLowerCase() as TaggedPersonaKey;
      const slotIndex = router.order.indexOf(calledKey);
      const slots: [string, string, string, string] = ['', '', '', ''];
      slots[slotIndex >= 0 && slotIndex < 4 ? slotIndex : 0] = soloText;
      return {
        first: slots[0],
        second: slots[1],
        third: slots[2],
        echoQuestion: slots[3],
      };
    }

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

    console.log('[runRoutedRequest] Stage 3 완료 — first:', first?.slice(0, 20));

    return {
      first,
      second,
      third,
      echoQuestion: [closer, luciaClose].filter(Boolean).join('\n\n'),
    };
  } catch (e) {
    console.warn('[runRoutedRequest] 실행 실패', e);
    return null;
  }
}

// 호환용 wrapper — 기존 import 경로 유지
export type MessageRouterResult = RouterDecision;
