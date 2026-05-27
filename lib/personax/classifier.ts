export type CategoryV3 = 'invest' | 'action' | 'emotional' | 'principle' | 'knowledge';

/** 카테고리 V3 키워드 사전 */
const CATEGORY_V3_KEYWORDS: Record<CategoryV3, RegExp> = {
  invest: /주식|투자|돈|종목|ETF|펀드|부동산|코인|비트코인|매수|매도|배당|환율|금리|수익|손실|포트폴리오|매도|매수|상승|하락|올랐|떨어|물렸|삼성전자|SK하이닉스|테슬라|애플|엔비디아|코스피|코스닥|나스닥|S&P|퇴직금|연금|적금|예금|넣어야|넣을까|어디에 넣|노후 자금|노후자금|은퇴 자금|은퇴자금|자금이 부족|자금 부족/,
  action: /퇴사|이직|창업|재취업|취업|부업|사업|결단|결정|도전|스포츠|야구|축구|농구|골프|경기|승부|선수|이길|우승|시작할|그만둘|바꿀|옮길|뛰어들|승부|뛸까|명퇴|명예퇴직|희망퇴직|권고사직|퇴직 권유/,
  emotional: /감정|관계|일상|걱정|가족|경사|좋은소식|기쁜|슬프|우울|불안|외로|힘들|지쳐|피곤|마음|위로|공감|가족|부모|자녀|남편|아내|친구|동료|선배|후배|시댁|처가|결혼|이혼|아이|손주|손자|손녀|기뻐|기쁘|설레|행복|축하|경사|반가|잠이|잠 못|잠을 못|못 자|수면|불면|속상|속상해|속상하|아파|아프|강아지|반려동물|반려견|반려묘|고양이|반려|쓰러|쓰러졌|쓰러지|사기 당|사기를 당|당했어요|피해|취업을 못|취업 못/,
  principle: /인생|원칙|철학|판단|방향|의미|가치|본질|삶|살아간|어떻게 살|어떻게 사|왜 사|왜 살|잘 사|잘 살아|사는 게|사는 거|사는 길|살아가|살아간|어떤 사람|어떤 길|선택의 기준|기준이 뭐|무엇이 옳|옳은가|맞는가|진리|진정|정답이 뭐|인생 정답|삶의 정답|AI 때문|직업 없어|직업이 없어|일자리 없어|일 없어질|일 사라질|직업 사라|일자리 사라/,
  knowledge: /AI|수능|정치|뉴스|과학|역사|경제|사회/,
};

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

/**
 * 카테고리 감지 V3 — invest / action / emotional / principle 4분류.
 * 규칙:
 *  - 2개 이상 카테고리 동시 매치 → 복합 질문으로 보고 emotional 처리
 *  - 매치 0개 → 모호한 질문으로 보고 emotional 기본값
 *  - 단일 매치 → 해당 카테고리
 */
export const detectCategoryV3 = (msg: string): CategoryV3 => {
  const text = (msg || '').trim();
  if (!text) return 'emotional';
  // 희(喜) 우선 단락 — 수익/성과 + 성취 표현("났/벌었/받았")은 invest 키워드보다 우선해 emotional로.
  // 이유: hee 서브타입은 emotional 하위에서만 활성화되므로 invest로 빠지면 축하 모드가 꺼진다.
  if (detectEmotionalSubtypeHee(text)) return 'emotional';
  const counts = countCategoryMatches(text);
  const matched = (Object.keys(counts) as CategoryV3[]).filter((k) => counts[k] > 0);
  if (matched.length === 0) return 'emotional';
  if (matched.length >= 2) return 'emotional';
  return matched[0];
};
