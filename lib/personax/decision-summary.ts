export type DecisionSummary = {
  verdict: string;
  reasons: string[];
  counterView: string;
  nextAction: string;
};

const normalizeQuestion = (question: string): string => question.replace(/\s+/g, ' ').trim();

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
  if (
    /아파트|부동산|단지|입지|학군|교통|직주근접|실거주|전세|청약|재건축|재개발/.test(q) &&
    /추천|지역|어디|괜찮|좋을까|10억|9억|8억|7억|6억/.test(q)
  ) return 'real_estate_recommendation';
  if (/사야|매수|팔아야|매도|비트코인|XRP|xrp|리플|이더리움|ETH|eth|솔라나|SOL|sol|삼성전자|주식|코인|투자/.test(q)) return 'buy_or_wait';
  if (LUMP_SUM_PURPOSE_PATTERN.test(q) && LUMP_SUM_INVESTMENT_EXECUTION_PATTERN.test(q)) return 'buy_or_wait';
  if (/창업.*재취업|재취업.*창업|창업\s*vs\s*재취업/i.test(q)) return 'startup_vs_job';
  if (/계속\s*만나|헤어|이 사람|관계|연애|이혼|시기|질투|무시|비난|뒷담|견제|상처|거리두기|경계|대인관계|친구|동료|직장동료|상사|부하|갈등|트러블|미워|싫어|눈치|왕따|따돌림|험담/.test(q)) return 'relationship';
  if (/이직|커리어|진로|퇴사|회사|직장/.test(q)) return 'career';
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

  if (type === 'real_estate_recommendation') {
    return {
      verdict: '지역 추천보다 먼저 실거주 기준과 예산 안전선을 정해야 합니다',
      reasons: [
        '10억 이하 아파트는 입지, 직주근접, 교통, 학군, 공급 물량에 따라 판단이 달라집니다',
        '실거주 목적과 투자 목적이 다르면 추천 지역도 달라집니다',
      ],
      counterView: '다만 이미 직장 위치와 예산이 확정되어 있다면 후보 지역을 바로 좁혀도 됩니다',
      nextAction: '출퇴근 지역, 보유 현금, 대출 가능 금액, 실거주/투자 목적을 먼저 정리하세요',
    };
  }

  if (type === 'buy_or_wait') {
    return {
      verdict: inferBuyOrWaitVerdict(params.question, params.ray, params.jack, params.lucia, params.echo),
      reasons: ['현재 가격과 등락률을 먼저 확인해야 합니다', '리스크 기준 없이 행동하면 손실 폭이 커질 수 있습니다'],
      counterView: counterFallbackByType(type),
      nextAction: '오늘은 투자 기간, 손실 한도, 추가 확인할 가격 기준을 각각 1줄로 적어보세요',
    };
  }

  if (type === 'startup_vs_job') {
    return {
      verdict: '현재 조건에서는 재취업 우선입니다',
      reasons: ['현금흐름 확보가 먼저입니다', '창업 리스크를 줄일 준비 시간이 필요합니다'],
      counterView: '다만 창업 준비는 사이드 프로젝트로 병행할 수 있습니다',
      nextAction: '30일 내 지원 기업 10곳과 창업 검증 과제 1개를 함께 정리하세요',
    };
  }

  if (type === 'relationship') {
    const subtype = inferRelationshipSummarySubtype(params.question);

    if (subtype === 'conflict') {
      return {
        verdict: '상대 감정에 반응하기보다 패턴을 보고 선을 정해야 합니다',
        reasons: ['시기와 견제는 설득보다 반복 패턴 확인이 중요합니다', '감정적으로 맞서면 관계의 주도권을 상대에게 넘길 수 있습니다'],
        counterView: '다만 실제 피해나 공개적인 공격이 있다면 조용한 거리두기만으로는 부족할 수 있습니다',
        nextAction: '2주 동안 상대의 말과 행동 중 반복되는 침범 패턴 3가지를 기록하고, 노출할 정보와 거리를 줄이세요',
      };
    }

    if (subtype === 'boundary') {
      return {
        verdict: '관계를 끊을지보다 어디까지 허용할지 먼저 정해야 합니다',
        reasons: ['불편함이 반복된다면 감정보다 경계선 설정이 먼저입니다', '모든 관계를 끝내기보다 접촉 범위를 줄이는 선택지도 있습니다'],
        counterView: '다만 상대가 반복적으로 선을 넘는다면 관계 유지보다 보호가 우선입니다',
        nextAction: '상대에게 허용할 말, 시간, 거리의 기준을 각각 하나씩 정하고 그 기준을 넘으면 대응을 줄이세요',
      };
    }

    return {
      verdict: '계속 여부는 반복 행동을 보고 조건부로 판단해야 합니다',
      reasons: ['감정보다 반복되는 행동 패턴이 더 중요합니다', '관계가 나를 계속 작아지게 만드는지 확인해야 합니다'],
      counterView: '다만 일회성 실수라면 대화 후 변화 여부를 볼 여지는 있습니다',
      nextAction: '2주 동안 불편했던 행동 3개와 실제로 바뀐 행동 3개를 기록하세요',
    };
  }

  if (type === 'career') {
    return {
      verdict: '지금은 선택지를 좁히기보다 조건을 정리할 때입니다',
      reasons: ['커리어 결정은 감정, 돈, 시간 조건이 함께 맞아야 합니다', '바로 움직이기 전 손실 가능한 범위를 알아야 합니다'],
      counterView: '다만 이미 회복 불가능한 환경이라면 빠른 전환도 선택지입니다',
      nextAction: '이번 주 안에 돈, 시간, 성장 기준을 각각 3줄로 정리하세요',
    };
  }

  if (isLumpSumPurposeQuestion(params.question)) {
    return {
      verdict: '먼저 이 돈의 목적을 정해야 합니다',
      reasons: ['퇴직금이나 목돈은 투자 대상보다 사용 목적이 먼저 정해져야 합니다', '노후자금, 생활비, 부채상환, 창업자금, 가족지원은 서로 다른 기준이 필요합니다'],
      counterView: '다만 이미 투자 목적이 명확하다면 상품 비교로 넘어가도 됩니다',
      nextAction: '이 돈을 노후자금, 생활비, 부채상환, 창업자금, 가족지원 중 어디에 쓸지 1순위와 2순위로 나누어 적으세요',
    };
  }

  return {
    verdict: anchor ? '결정 기준을 먼저 세워야 합니다' : '추가 정보 확인 후 결정해야 합니다',
    reasons: ['지금 질문은 기준이 없으면 답이 흔들립니다', '다음 행동을 작게 정해야 재점검할 수 있습니다'],
    counterView: '다만 상황이 급하면 가장 회복 가능한 선택을 우선할 수 있습니다',
    nextAction: '오늘 안에 선택 기준 3개와 바로 할 행동 1개를 적으세요',
  };
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
