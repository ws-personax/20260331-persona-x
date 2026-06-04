export type DecisionDomain =
  | 'investment'
  | 'real_estate'
  | 'career'
  | 'relationship'
  | 'health'
  | 'legal'
  | 'life'
  | 'general';

export type DecisionType =
  | 'buy_or_wait'
  | 'continue_or_stop'
  | 'compare'
  | 'list'
  | 'general';

export type DecisionContext = {
  domain: DecisionDomain;
  decisionType: DecisionType;
  forbiddenTerms: string[];
};

const DOMAIN_KEYWORDS: Record<Exclude<DecisionDomain, 'general'>, string[]> = {
  real_estate: [
    '아파트',
    '부동산',
    '전세',
    '월세',
    '청약',
    '재건축',
    '재개발',
    '입지',
    '학군',
    '실거주',
    '갭투자',
    '분양',
    '단지',
    '역세권',
    '교통',
  ],
  investment: [
    '주식',
    '코인',
    '비트코인',
    '투자',
    '매수',
    '매도',
    'ETF',
    '종목',
    '포트폴리오',
    '수익률',
    '손실',
    '삼성전자',
    '엔비디아',
    '테슬라',
  ],
  career: [
    '이직',
    '퇴사',
    '커리어',
    '진로',
    '면접',
    '연봉',
    '회사',
    '직장',
    '창업',
    '재취업',
    '사업',
  ],
  relationship: [
    '연애',
    '결혼',
    '이혼',
    '헤어',
    '만나',
    '관계',
    '친구',
    '동료',
    '상사',
    '갈등',
    '눈치',
    '거리두기',
    '손절',
  ],
  health: [
    '건강',
    '병원',
    '진료',
    '수술',
    '약',
    '처방',
    '치료',
    '검사',
    '의사',
    '통증',
    '우울',
    '불안',
    '상담',
  ],
  legal: [
    '법',
    '법률',
    '계약',
    '소송',
    '고소',
    '고발',
    '상속',
    '증여',
    '세금',
    '노무',
    '해고',
    '권고사직',
  ],
  life: [
    '육아',
    '가족',
    '부모',
    '자녀',
    '노후',
    '은퇴',
    '생활',
    '집안',
    '이사',
    '교육',
    '공부',
  ],
};

const DOMAIN_PRIORITY: Array<Exclude<DecisionDomain, 'general'>> = [
  'real_estate',
  'investment',
  'career',
  'relationship',
  'health',
  'legal',
  'life',
];

const FORBIDDEN_TERMS_BY_DOMAIN: Record<DecisionDomain, string[]> = {
  investment: ['무조건', '확실한 수익', '보장', '몰빵', '대출 풀매수'],
  real_estate: [
    '손절',
    '익절',
    '코인',
    '주식',
    '종목',
    '매도',
    '매수세',
    '수익률',
    '포트폴리오',
  ],
  career: ['무조건 퇴사', '당장 질러', '실패 없음'],
  relationship: ['무조건 헤어져', '참기만 해', '복수해'],
  health: ['진단 확정', '약을 끊어', '병원 가지 마'],
  legal: ['법률 자문 확정', '무조건 승소', '신고하지 마'],
  life: ['정답은 하나', '무조건 따라'],
  general: ['무조건', '100% 확실', '보장'],
};

const includesAnyKeyword = (question: string, keywords: string[]): boolean =>
  keywords.some((keyword) => question.includes(keyword));

const detectDomain = (question: string): DecisionDomain =>
  DOMAIN_PRIORITY.find((domain) => (
    includesAnyKeyword(question, DOMAIN_KEYWORDS[domain])
  )) ?? 'general';

const detectDecisionType = (question: string): DecisionType => {
  if (includesAnyKeyword(question, ['살까', '사야', '매수', '팔까', '매도', '기다릴까', '보류', '관망', '진입'])) {
    return 'buy_or_wait';
  }
  if (includesAnyKeyword(question, ['계속', '그만', '중단', '멈출까', '헤어', '퇴사', '손절', '유지'])) {
    return 'continue_or_stop';
  }
  if (
    question.includes(' vs ') ||
    question.includes('VS') ||
    includesAnyKeyword(question, ['비교', '둘 중', '어느 쪽', '뭐가 더', 'A/B'])
  ) {
    return 'compare';
  }
  if (includesAnyKeyword(question, ['추천', '목록', '리스트', '몇 가지', '3가지', '세 가지', '어디'])) {
    return 'list';
  }
  return 'general';
};

export function buildDecisionContext(question: string): DecisionContext {
  const normalizedQuestion = (question || '').trim();
  const domain = detectDomain(normalizedQuestion);

  return {
    domain,
    decisionType: detectDecisionType(normalizedQuestion),
    forbiddenTerms: FORBIDDEN_TERMS_BY_DOMAIN[domain],
  };
}
