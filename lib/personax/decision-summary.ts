import { inferDecisionType } from '@/lib/personax/decision-type-map';

export type DecisionSummary = {
  verdict: string;
  reasons: string[];
  counterView: string;
  nextAction: string;
  importance?: number;
  summaryType?: string;
};

const normalizeQuestion = (question: string): string => question.replace(/\s+/g, ' ').trim();

type DecisionImportanceParams = {
  question?: string;
  title?: string;
  decisionType?: string | null;
  category?: string | null;
  verdict?: string | null;
  reasons?: unknown;
  nextAction?: string | null;
};

const compactImportanceText = (value: unknown): string => {
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim();
  if (Array.isArray(value)) {
    return value.map((item) => compactImportanceText(item)).filter(Boolean).join(' ');
  }
  return '';
};

const buildImportanceText = (params: DecisionImportanceParams): string => [
  params.question,
  params.title,
  params.decisionType,
  params.category,
  params.verdict,
  params.nextAction,
  compactImportanceText(params.reasons),
]
  .map((value) => compactImportanceText(value))
  .filter(Boolean)
  .join(' ')
  .toLowerCase();

export function calculateDecisionImportance(params: DecisionImportanceParams): number {
  const text = buildImportanceText(params);
  const decisionType = compactImportanceText(params.decisionType).toLowerCase();
  const category = compactImportanceText(params.category).toLowerCase();
  const typeText = `${decisionType} ${category}`.trim();

  const fivePointPatterns = [
    /창업|재취업|이직|은퇴|결혼|이혼|부모|자녀|육아|가족|요양|간병|직장 그만둘까|삶의 방향|인생 방향/,
  ];
  const fourPointPatterns = [
    /퇴직금|부동산|아파트|집|주택|대출|전세|월세|사업자?|1억|2억|3억|억\b|목돈|노후|장기투자|생활비|생계|장기자금|보증금/,
  ];
  const twoPointPatterns = [
    /투자할까|사야할까|사야 할까|팔아야할까|팔아야 할까|갈아탈까|들어갈까|홀딩할까|보유할까|고를까|정할까|할까 말까|어느 쪽이 나을까/,
  ];
  const onePointPatterns = [
    /시세|주가|가격|몇 원|얼마|뉴스|어때|전망|지금 사|매수|매도|코인|xrp|비트코인|테슬라|삼성전자/,
  ];

  if (fivePointPatterns.some((pattern) => pattern.test(text)) || /startup_vs_job|career|relationship|family/.test(typeText)) {
    return 5;
  }
  if (fourPointPatterns.some((pattern) => pattern.test(text))) {
    return 4;
  }
  if (twoPointPatterns.some((pattern) => pattern.test(text))) {
    return 2;
  }
  if (onePointPatterns.some((pattern) => pattern.test(text))) {
    return 1;
  }

  return 3;
}

const LUMP_SUM_PURPOSE_PATTERN =
  /퇴직금|목돈|상속금|노후\s*자금|노후자금|은퇴\s*자금|은퇴자금/;

const LUMP_SUM_INVESTMENT_EXECUTION_PATTERN =
  /투자|주식|ETF|채권|펀드|매수|사야|살까|비중|자산\s*배분|자산배분|포트폴리오|IRP|연금저축|예금|적금|XRP|xrp|리플|이더리움|ETH|eth|솔라나|SOL|sol/;

const isLumpSumPurposeQuestion = (question: string): boolean => {
  const q = normalizeQuestion(question);
  return LUMP_SUM_PURPOSE_PATTERN.test(q) && !LUMP_SUM_INVESTMENT_EXECUTION_PATTERN.test(q);
};

type RelationshipSummarySubtype =
  | 'decision'
  | 'conflict'
  | 'boundary'
  | 'default';

const inferRelationshipSummarySubtype = (question: string): RelationshipSummarySubtype => {
  const q = normalizeQuestion(question);

  if (/계속\s*만나|헤어|그만\s*만나|관계\s*유지|재회|이혼|손절해야|이 사람/.test(q)) {
    return 'decision';
  }
  if (/시기|질투|무시|비난|견제|뒷담|험담|왕따|따돌림|갈등|트러블|눈치/.test(q)) {
    return 'conflict';
  }
  if (/거리두기|경계|선\s*긋기|상처|미워|싫어|대인관계/.test(q)) {
    return 'boundary';
  }

  return 'default';
};

const inferQuestionType = (question: string, questionType: string): string => {
  const q = normalizeQuestion(question);

  if (questionType) return questionType;

  const inferred = inferDecisionType(q);
  if (inferred !== 'generic') return inferred;
  if (LUMP_SUM_PURPOSE_PATTERN.test(q) && LUMP_SUM_INVESTMENT_EXECUTION_PATTERN.test(q)) return 'buy_or_wait';
  return 'generic';
};

const firstNonEmpty = (...values: Array<string | undefined>): string => (
  values.find((value) => value?.trim())?.trim() ?? ''
);

const counterFallbackByType = (type: string): string => {
  if (type === 'buy_or_wait') {
    return '단기 가격만 보고 판단하면 리스크를 놓칠 수 있습니다.';
  }
  if (type === 'startup_vs_job') {
    return '반대 선택지도 조건이 맞으면 충분히 검토할 가치가 있습니다.';
  }
  if (type === 'relationship') {
    return '감정만으로 결론내리면 반복되는 행동 신호를 놓칠 수 있습니다.';
  }

  return '다른 선택지도 조건이 맞으면 검토할 가치가 있습니다.';
};

const inferBuyOrWaitVerdict = (...values: Array<string | undefined>): string => {
  const text = values.filter(Boolean).join(' ');

  if (/변동성|리스크|위험|손실|하락|급락|폭락|불안|손절/.test(text)) {
    return '리스크 기준 우선 구간입니다';
  }
  if (/분할|나눠|나누어|적립|DCA/.test(text)) {
    return '분할 접근 검토 구간입니다';
  }
  if (/관망|대기|기다|보류|지켜보|추격/.test(text)) {
    return '관망 우세입니다';
  }
  if (/진입|가격\s*기준|기준가|조건|타이밍|사야|살까|매수/.test(text)) {
    return '진입 조건 점검 단계입니다';
  }
  if (/확인|데이터|정보|근거|체크|검토/.test(text)) {
    return '추가 확인이 먼저입니다';
  }

  return '추가 확인이 먼저입니다';
};

export function buildDecisionSummary(params: {
  question: string;
  questionType: string;
  ray?: string;
  jack?: string;
  lucia?: string;
  echo?: string;
}): DecisionSummary {
  const type = inferQuestionType(params.question, params.questionType);
  const anchor = firstNonEmpty(params.echo, params.jack, params.ray, params.lucia);
  const withImportance = (summary: DecisionSummary): DecisionSummary => ({
    ...summary,
    summaryType: type,
    importance: calculateDecisionImportance({
      question: params.question,
      decisionType: type,
      category: type,
      verdict: summary.verdict,
      reasons: summary.reasons,
      nextAction: summary.nextAction,
    }),
  });

  if (type === 'real_estate_recommendation') {
    return withImportance({
      verdict: '지역 추천보다 먼저 실거주 기준과 예산 안전선을 정해야 합니다',
      reasons: [
        '10억 이하 아파트는 입지, 직주근접, 교통, 학군, 공급 물량에 따라 판단이 달라집니다',
        '실거주 목적과 투자 목적이 다르면 추천 지역도 달라집니다',
      ],
      counterView: '다만 이미 직장 위치와 예산이 확정되어 있다면 후보 지역을 바로 좁혀도 됩니다',
      nextAction: '출퇴근 지역, 보유 현금, 대출 가능 금액, 실거주/투자 목적을 먼저 정리하세요',
    });
  }

  if (type === 'buy_or_wait') {
    return withImportance({
      verdict: '투자의 핵심은 수익보다 리스크 기준입니다',
      reasons: ['매수보다 손실 관리 기준을 먼저 정해야 합니다', inferBuyOrWaitVerdict(params.question, params.ray, params.jack, params.lucia, params.echo)],
      counterView: counterFallbackByType(type),
      nextAction: '오늘은 투자 기간, 손실 한도, 추가 확인할 가격 기준을 각각 1줄로 적어보세요',
    });
  }

  if (type === 'startup_vs_job') {
    return withImportance({
      verdict: '창업과 재취업은 선택보다 검증 순서가 먼저입니다',
      reasons: ['실행 시점과 준비 수준을 함께 판단해야 합니다', '지금 필요한 것은 결론보다 현금흐름, 고객 검증, 재취업 조건의 비교입니다'],
      counterView: '다만 창업 준비는 사이드 프로젝트로 병행할 수 있습니다',
      nextAction: '30일 내 지원 기업 10곳과 창업 검증 과제 1개를 함께 정리하세요',
    });
  }

  if (type === 'relationship') {
    const subtype = inferRelationshipSummarySubtype(params.question);

    if (subtype === 'conflict') {
      return withImportance({
        verdict: '관계는 감정보다 반복 행동으로 판단합니다',
        reasons: ['경계선을 확인하는 것이 먼저입니다', '시기와 견제는 설득보다 반복 패턴 확인이 중요합니다'],
        counterView: '다만 실제 피해나 공개적인 공격이 있다면 조용한 거리두기만으로는 부족할 수 있습니다',
        nextAction: '2주 동안 상대의 말과 행동 중 반복되는 침범 패턴 3가지를 기록하고, 노출할 정보와 거리를 줄이세요',
    });
    }

    if (subtype === 'boundary') {
      return withImportance({
        verdict: '관계는 감정보다 반복 행동으로 판단합니다',
        reasons: ['경계선을 확인하는 것이 먼저입니다', '불편함이 반복된다면 감정보다 허용 범위를 정해야 합니다'],
        counterView: '다만 상대가 반복적으로 선을 넘는다면 관계 유지보다 보호가 우선입니다',
        nextAction: '상대에게 허용할 말, 시간, 거리의 기준을 각각 하나씩 정하고 그 기준을 넘으면 대응을 줄이세요',
    });
    }

    return withImportance({
      verdict: '관계는 감정보다 반복 행동으로 판단합니다',
      reasons: ['경계선을 확인하는 것이 먼저입니다', '관계가 나를 계속 작아지게 만드는지 확인해야 합니다'],
      counterView: '다만 일회성 실수라면 대화 후 변화 여부를 볼 여지는 있습니다',
      nextAction: '2주 동안 불편했던 행동 3개와 실제로 바뀐 행동 3개를 기록하세요',
    });
  }

  if (type === 'career') {
    return withImportance({
      verdict: '커리어 결정은 실행 시점과 준비 수준을 함께 판단해야 합니다',
      reasons: ['지금 필요한 것은 선택보다 검증입니다', '바로 움직이기 전 돈, 시간, 회복 가능성의 조건을 확인해야 합니다'],
      counterView: '다만 이미 회복 불가능한 환경이라면 빠른 전환도 선택지입니다',
      nextAction: '이번 주 안에 돈, 시간, 성장 기준을 각각 3줄로 정리하세요',
    });
  }

  if (type === 'philosophy_definition') {
    return withImportance({
      verdict: '정의보다 나만의 기준을 먼저 세우는 것이 중요합니다',
      reasons: [
        'RAY는 측정 가능한 조건으로 분해했습니다',
        'LUCIA는 감정의 신호로 읽었습니다',
        'JACK은 행동 가능한 선택으로 좁혔습니다',
      ],
      counterView: '단, 지금 당장 기준이 없다면 작은 실험부터 시작할 수 있습니다',
      nextAction: '오늘 이 개념이 내 삶에서 어떤 모습인지 한 줄로 적어보세요',
    });
  }

  if (type === 'philosophy_pattern') {
    return withImportance({
      verdict: '패턴을 아는 것보다 다음 상황에서 멈출 기준이 더 중요합니다',
      reasons: [
        'RAY는 반복의 데이터 구조를 봤습니다',
        'LUCIA는 감정의 흐름을 봤습니다',
        'JACK은 멈출 조건을 봤습니다',
      ],
      counterView: '단, 반복의 원인을 지나치게 단순화하면 실제 맥락을 놓칠 수 있습니다',
      nextAction: '다음에 같은 상황이 오면 멈출 조건 하나를 지금 적어두세요',
    });
  }

  if (type === 'knowledge') {
    return withImportance({
      verdict: '개념을 이해하는 것과 실제 적용은 다릅니다',
      reasons: ['정의보다 활용 기준을 기억해야 합니다', '어떤 맥락(소득, 자산, 통계 분류 등)을 기준으로 묻는지에 따라 답이 달라집니다'],
      counterView: '다만 특정 기준(예: 통계청 분류, 법령상 정의)을 이미 정해두고 묻는 거라면 그 기준으로 바로 답할 수 있습니다',
      nextAction: '어떤 기준(소득, 자산, 통계 분류, 법령 등)으로 알고 싶은지 한 가지만 정해서 다시 물어보세요',
    });
  }

  if (isLumpSumPurposeQuestion(params.question)) {
    return withImportance({
      verdict: '먼저 이 돈의 목적을 정해야 합니다',
      reasons: ['퇴직금이나 목돈은 투자 대상보다 사용 목적이 먼저 정해져야 합니다', '노후자금, 생활비, 부채상환, 창업자금, 가족지원은 서로 다른 기준이 필요합니다'],
      counterView: '다만 이미 투자 목적이 명확하다면 상품 비교로 넘어가도 됩니다',
      nextAction: '이 돈을 노후자금, 생활비, 부채상환, 창업자금, 가족지원 중 어디에 쓸지 1순위와 2순위로 나누어 적으세요',
    });
  }

  return withImportance({
    verdict: anchor ? '하나의 정답보다 자신의 기준을 세우는 것이 중요합니다' : '추가 정보보다 먼저 판단 기준을 정해야 합니다',
    reasons: ['각 페르소나의 기준을 비교해 자신의 판단 기준을 정리해야 합니다', '답을 하나로 빨리 정하면 놓치는 기준이 생깁니다'],
    counterView: '다만 상황이 급하면 가장 회복 가능하고 되돌릴 수 있는 기준을 우선할 수 있습니다',
    nextAction: '오늘 안에 RAY식 검증 기준, JACK식 행동 기준, LUCIA식 회복 기준, ECHO식 반복 기준을 각각 1줄로 적으세요',
    });
}

export function formatDecisionSummary(summary: DecisionSummary): string {
  const separator = '━━━━━━━━━━';
  const cleanLine = (value: string): string =>
    value.trim().replace(/^━━━━━━━━━━\?+$/, separator).replace(/(━━━━━━━━━━)\?+$/g, '$1');
  const cleanLines = (value: string): string[] =>
    value
      .split('\n')
      .map(cleanLine)
      .filter(Boolean);
  const reasons = summary.reasons
    .flatMap(cleanLines)
    .filter((reason) => reason !== separator);
  const counterView = cleanLine(summary.counterView).length >= 8
    ? cleanLine(summary.counterView)
    : counterFallbackByType('generic');
  const verdict = cleanLine(summary.verdict);
  const nextAction = cleanLine(summary.nextAction);

  if (summary.summaryType === 'knowledge') {
    const point3 = cleanLine(summary.counterView).replace(/^다만\s*/, '') || '개념은 맥락에 따라 적용 기준이 달라질 수 있습니다';
    const lines = [
      separator,
      '',
      '한 줄 정의',
      verdict,
      '',
      '왜 중요한가',
      reasons[0] || '개념을 구분하면 실제 상황을 해석하는 기준이 선명해집니다',
      '',
      '핵심 포인트',
      '',
      `1. ${reasons[0] || verdict}`,
      `2. ${reasons[1] || '맥락에 따라 같은 개념도 다르게 설명될 수 있습니다'}`,
      `3. ${point3}`,
      '',
      separator,
    ];

    return lines.join('\n').replace(/(━━━━━━━━━━)\?+$/g, '$1');
  }

  const lines = [
    separator,
    '',
    'PersonaX 결론',
    verdict,
    '',
    '핵심 이유:',
    ...(reasons.length ? reasons : cleanLines(counterFallbackByType('generic'))).map((reason) => `- ${reason}`),
    '',
    '반대 의견:',
    counterView,
    '',
    '다음 행동:',
    nextAction,
    '',
    separator,
  ];

  return lines.join('\n').replace(/(━━━━━━━━━━)\?+$/g, '$1');
}
