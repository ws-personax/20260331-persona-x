export type CategoryV3 = 'invest' | 'action' | 'emotional' | 'principle' | 'knowledge';

export type LegacyCategory =
  | 'finance'
  | 'sports'
  | 'news'
  | 'legal'
  | 'tech'
  | 'life'
  | 'emotion'
  | 'general';

export const LEGACY_CATEGORY_MAP = {
  finance:  /주식|펀드|ETF|종목|코스피|코스닥|나스닥|NASDAQ|S&P500|SP500|S&P|다우존스|다우|항셍|닛케이|원달러|달러|금|채권|포트폴리오|수익|손절|매수|매도|배당|금리|환율|가상화폐|비트코인|XRP|xrp|리플|이더리움|ETH|eth|솔라나|SOL|sol|저축|예금|적금|퇴직금|연금|삼성전자|SK하이닉스|카카오뱅크|카카오게임즈|카카오|네이버|현대차|기아차|기아|LG전자|LG|엘지전자|엘지|삼성바이오|셀트리온|포스코|크래프톤|넥슨|넷마블|하이브|두산|롯데|한화|SK|KT|CJ|GS|KB금융|신한지주|하나금융|테슬라|애플|엔비디아|구글|아마존|마이크로소프트|돈이|돈은|돈을|살까|팔까|투자할까|넣을까|빼야|수익|손실|올랐|떨어졌|물렸|상승|하락/,
  sports:   /야구|축구|농구|배구|골프|올림픽|경기|이길|승부|우승|선수|리그|기아|삼성라이온즈|두산|LG트윈스|롯데|한화|KT|SSG|NC|키움/,
  news:     /정세|뉴스|전쟁|분쟁|중동|러시아|우크라이나|미중|외교|정치|대통령|선거|경제뉴스|시황|금융뉴스|증시|환경|기후|재난|사건|사고|테러|유가|원유|석유|에너지|OPEC|산유국|천연가스|인플레이션|금리정책|연준|Fed|미연준|기준금리|호르무즈|이란|이스라엘|하마스|헤즈볼라|가자|레바논|트럼프|바이든|시진핑|푸틴|북한|미사일|핵|제재|관세|무역전쟁|환율전쟁|HMM|화물선|해운|공급망|반도체규제|AI규제|빅테크|실리콘밸리|연방|의회|상원|하원|탄핵|대선|총선|보궐|여당|야당|국회|법안|정책/,
  life:     /명퇴|명예퇴직|희망퇴직|퇴직 권유|권고사직|은퇴|조기퇴직|퇴직 후|제2인생|요양원|치매|부모님 건강|어머니 건강|아버지 건강|무릎|허리|혈압|당뇨|갱년기|근감소|건강검진|병원|아이 대학|자녀 취업|자녀 결혼|아들 걱정|딸 걱정|황혼이혼|부부 갈등|노후|노후준비|노후자금|은퇴자금|막막|가장으로서|생계|카드론|노후파산|노후빈곤|황혼육아|손자|손녀|며느리|사위|시댁|처가|이혼숙려|졸혼|별거|회사 다니|직장 다니|회사 그만|직장 그만|일이 힘들|일 너무 힘들|업무가 힘들|업무 너무|아들 합격|딸 합격|자녀 합격|손주 합격|손녀 합격|손자 합격|아들 졸업|딸 졸업|자녀 졸업|아들 취업|딸 취업|아들 결혼|딸 결혼|아들이 대학|딸이 대학|어떻게 사|어떻게 살|잘 사는|잘 살아|사는 게|사는 거|사는 길|살아가|인생의 의미|삶의 의미|인생 정답|삶의 정답|뭐가 정답/,
  legal:    /세금|법률|계약|소송|이혼|상속|증여|부동산등기|임대차|보증금|노동|퇴직|해고|세무|신고|명퇴|권고사직|퇴직금|실업급여|노동부|노무사/,
  tech:     /자동차|전기차|배터리|반도체|AI|인공지능|스마트폰|앱|소프트웨어|하드웨어|IT|클라우드/,
  emotion:  /힘들|외로|슬프|우울|화나|기쁘|설레|불안|걱정|스트레스|피곤|지쳐|고민|마음|감정|위로|공감|재테크고민|투자고민|노후걱정/,
} as const;

// 건강/의료 키워드 — finance보다 먼저 체크해야 "돈이 들어가는 시술/병원" 류 질문이 재테크로 오분류되지 않는다.
// 별도 health 카테고리가 없으므로 life로 라우팅한다.
export const HEALTH_KEYWORDS = /피부과|병원|시술|성형|약|치료|수술|검사|진료|의사|한의원|치과|안과|이비인후과|내과|외과|정신과|MRI|CT|항암|투약|처방|입원|외래/;

export const detectLegacyCategory = (text: string): LegacyCategory => {
  if (HEALTH_KEYWORDS.test(text))             return 'life';
  if (LEGACY_CATEGORY_MAP.life.test(text))    return 'life';
  if (LEGACY_CATEGORY_MAP.emotion.test(text)) return 'emotion';
  if (LEGACY_CATEGORY_MAP.finance.test(text)) return 'finance';
  if (LEGACY_CATEGORY_MAP.news.test(text))    return 'news';
  if (LEGACY_CATEGORY_MAP.sports.test(text))  return 'sports';
  if (LEGACY_CATEGORY_MAP.legal.test(text))   return 'legal';
  if (LEGACY_CATEGORY_MAP.tech.test(text))    return 'tech';
  return 'general';
};

/** 카테고리 V3 키워드 사전 */
const CATEGORY_V3_KEYWORDS: Record<CategoryV3, RegExp> = {
  invest: /주식|투자|돈|종목|ETF|펀드|부동산|코인|비트코인|XRP|xrp|리플|이더리움|ETH|eth|솔라나|SOL|sol|매수|매도|배당|환율|금리|수익|손실|포트폴리오|매도|매수|상승|하락|올랐|떨어|물렸|삼성전자|LG전자|엘지전자|SK하이닉스|테슬라|애플|엔비디아|코스피|코스닥|나스닥|S&P|퇴직금|연금|적금|예금|사야|살까|넣어야|넣을까|어디에 넣|노후 자금|노후자금|은퇴 자금|은퇴자금|자금이 부족|자금 부족/,
  action: /퇴사|이직|창업|재취업|취업|부업|사업|커리어|직장|상사|회사|면접|지원|연봉|업무|책임|떠넘겨|버틸까|그만둘까|결단|결정|도전|스포츠|야구|축구|농구|골프|경기|승부|선수|이길|우승|시작할|그만둘|바꿀|옮길|뛰어들|승부|뛸까|명퇴|명예퇴직|희망퇴직|권고사직|퇴직 권유/,
  emotional: /감정|관계|일상|걱정|가족|경사|좋은소식|기쁜|슬프|우울|불안|외로|힘들|지쳐|피곤|마음|위로|공감|가족|부모|자녀|남편|아내|친구|동료|선배|후배|시댁|처가|결혼|이혼|아이|손주|손자|손녀|기뻐|기쁘|설레|행복|축하|경사|반가|잠이|잠 못|잠을 못|못 자|수면|불면|속상|속상해|속상하|아파|아프|강아지|반려동물|반려견|반려묘|고양이|반려|쓰러|쓰러졌|쓰러지|사기 당|사기를 당|당했어요|피해|취업을 못|취업 못/,
  principle: /인생|원칙|철학|판단|방향|의미|가치|본질|삶|살아간|어떻게 살|어떻게 사|왜 사|왜 살|잘 사|잘 살아|사는 게|사는 거|사는 길|살아가|살아간|어떤 사람|어떤 길|선택의 기준|기준이 뭐|무엇이 옳|옳은가|맞는가|진리|진정|정답이 뭐|인생 정답|삶의 정답|AI 때문|직업 없어|직업이 없어|일자리 없어|일 없어질|일 사라질|직업 사라|일자리 사라/,
  knowledge: /AI|수능|정치|뉴스|과학|역사|경제|사회/,
};

const LUMP_SUM_UNDECIDED_PATTERN =
  /퇴직금|목돈|상속금|노후\s*자금|노후자금|은퇴\s*자금|은퇴자금/;

const INVESTMENT_EXECUTION_PATTERN =
  /투자|주식|ETF|S&P500|SP500|S&P|배당주|채권|펀드|매수|사야|살까|비중|자산\s*배분|자산배분|포트폴리오|IRP|연금저축|예금|적금|넣어야|넣을까|어디에\s*넣/;

const MONEY_FRUSTRATION_PATTERN =
  /돈[이가은을]?\s*(?:전혀\s*)?(?:못\s*모으|안\s*모|새(?:어나)?|관리\s*(?:안|못|.*안\s*(?:되|돼)))|저축[이가은을]?\s*(?:안\s*(?:되|돼)|못\s*하)|월급[이가은을]?.*새어나|생활비[가은을]?\s*(?:감당(?:이)?\s*안|.*감당이?\s*안\s*(?:되|돼))|카드값[이가은을]?\s*감당(?:이)?\s*안|고정비[가은을]?\s*부담|지출[이가은을]?\s*(?:너무\s*많|관리\s*(?:안|못))|빚[이가은을]?\s*버거|대출[이가은을]?\s*(?:버거|감당(?:이)?\s*안)/;

/** 키워드 매치 카운트 */
const countCategoryMatches = (text: string): Record<CategoryV3, number> => {
  const counts: Record<CategoryV3, number> = {
    invest: 0,
    action: 0,
    emotional: 0,
    principle: 0,
    knowledge: 0,
  };
  (Object.keys(CATEGORY_V3_KEYWORDS) as CategoryV3[]).forEach((k) => {
    const re = CATEGORY_V3_KEYWORDS[k];
    const matches = text.match(new RegExp(re.source, re.flags + 'g'));
    counts[k] = matches ? matches.length : 0;
  });
  return counts;
};

/**
 * 희(喜) 서브타입 트리거 키워드 — emotional 카테고리 하위 분기.
 *  - 합격/승진/결혼/출산/임신/취직/입사/당첨/우승/상받기/개업/진학/장학/투자수익 등 좋은 소식
 *  - "축하/경사/기쁜소식/좋은소식" 등 메타 표현 포함
 *  - 매치 시 LUCIA(감정증폭) → JACK(다음스텝) → RAY(의미데이터) → ECHO(본질) 순서 강제
 */
const HEE_KEYWORDS =
  /합격|승진|진급|영전|결혼|약혼|상견례|혼인|출산|임신|돌잔치|돌잡이|취직했|취업했|입사했|등단|당첨|투자수익|수익[이가을\s]*?났|이익[이가을\s]*?났|차익[이가을\s]*?났|첫\s*수익|처음[\s,으로]*?수익|돈\s*벌었|벌었어요|벌었습니|차익|배당받|보너스|성과급|승리|우승|입상|상\s*받|개업|개원|진학|입학|장학금|졸업|기쁜\s*소식|좋은\s*소식|경사\s*났|축하|드디어|꿈을\s*이뤘|해냈/;

export const detectEmotionalSubtypeHee = (msg: string): boolean => {
  const text = (msg || '').trim();
  if (!text) return false;
  return HEE_KEYWORDS.test(text);
};

/** multi-match 우선순위 — emotional은 최하위: 다른 도메인 카테고리가 있으면 emotional 제외. */
const CATEGORY_V3_PRIORITY: readonly CategoryV3[] = ['invest', 'action', 'principle', 'knowledge', 'emotional'];

/**
 * 카테고리 감지 V3 — invest / action / emotional / principle / knowledge 5분류.
 * 규칙:
 *  - 2개 이상 카테고리 동시 매치 → 우선순위(invest>action>principle>knowledge>emotional) 최상위 반환
 *  - 매치 0개 → 모호한 질문으로 보고 emotional 기본값
 *  - 단일 매치 → 해당 카테고리
 */
export const detectCategoryV3 = (msg: string): CategoryV3 => {
  const text = (msg || '').trim();
  if (!text) return 'emotional';
  // 희(喜) 우선 단락 — 수익/성과 + 성취 표현("났/벌었/받았")은 invest 키워드보다 우선해 emotional로.
  // 이유: hee 서브타입은 emotional 하위에서만 활성화되므로 invest로 빠지면 축하 모드가 꺼진다.
  if (detectEmotionalSubtypeHee(text)) return 'emotional';
  if (
    LUMP_SUM_UNDECIDED_PATTERN.test(text) &&
    !INVESTMENT_EXECUTION_PATTERN.test(text)
  ) {
    return 'emotional';
  }
  if (
    MONEY_FRUSTRATION_PATTERN.test(text) &&
    !INVESTMENT_EXECUTION_PATTERN.test(text)
  ) {
    return 'emotional';
  }
  const counts = countCategoryMatches(text);
  const matched = (Object.keys(counts) as CategoryV3[]).filter((k) => counts[k] > 0);
  if (matched.length === 0) return 'emotional';
  for (const cat of CATEGORY_V3_PRIORITY) {
    if (matched.includes(cat)) return cat;
  }
  return 'emotional';
};
