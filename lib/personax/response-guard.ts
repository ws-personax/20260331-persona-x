export type QuestionType =
  | 'continue_or_stop'
  | 'buy_or_wait'
  | 'compare'
  | 'list'
  | 'general';

export type DirectAnswerPersonaKey = 'lucia' | 'jack' | 'ray' | 'echo';

const SAFE_INVESTMENT_FALLBACK =
  '현재가는 별도 확인이 필요합니다. 확인된 시장 데이터 없이 구체적 가격, 지지선, 손절선, 진입 구간을 단정할 수 없습니다. 판단 기준은 실적, 업황, 투자 기간, 감당 가능한 손실 범위입니다.';

const INVESTMENT_QUESTION_PATTERN =
  /사야|매수|팔아야|매도|보유|관망|투자해도|진입|손절|물타|비중|주식|코인|비트코인|삼성전자|종목|현재가|지지선|저항선|수익률|PER|PBR/i;

const UNSAFE_INVESTMENT_ANSWER_PATTERN =
  /(?:\d+(?:[.,]\d+)?\s*(?:원|만원|억원|조원|달러|%|퍼센트|배))|지지선|저항선|손절선|진입|매수|매도|관망입니다|보류입니다|분할 접근입니다|쳐다보지도 마라|지금 들어가라|지금 들어가지 마라/i;

export function detectQuestionType(question: string): QuestionType {
  if (/계속\s*만나|계속할|헤어|그만해야|그만\s*만나|끊어야|손절해야|이혼/.test(question)) {
    return 'continue_or_stop';
  }

  if (INVESTMENT_QUESTION_PATTERN.test(question)) {
    return 'buy_or_wait';
  }

  if (/vs|VS|비교|중\s*뭐|둘\s*중|어느\s*쪽|A\s*\/\s*B|A와\s*B/.test(question)) {
    return 'compare';
  }

  if (/3가지|\d+\s*가지|목록|리스트|추천|정리|답변/.test(question)) {
    return 'list';
  }

  return 'general';
}

export function sanitizeInvestmentAnswer(answer: string, question: string): string {
  if (!INVESTMENT_QUESTION_PATTERN.test(question)) {
    return answer;
  }

  if (!UNSAFE_INVESTMENT_ANSWER_PATTERN.test(answer)) {
    return answer;
  }

  return SAFE_INVESTMENT_FALLBACK;
}

export function hasDirectAnswer(
  answer: string,
  questionType: QuestionType,
): boolean {
  switch (questionType) {
    case 'continue_or_stop':
      return /마음의 안전감|반복 패턴|계속할 조건|멈춰야 할 신호|반복 행동|관계를 재평가|상황을 재평가/.test(answer);
    case 'buy_or_wait':
      return (
        /현재가는 별도 확인이 필요합니다|확인된 시장 데이터 없이는 구체적 가격 판단을 할 수 없습니다|판단 기준은 실적, 업황, 투자 기간, 감당 가능한 손실 범위입니다/.test(answer) &&
        !UNSAFE_INVESTMENT_ANSWER_PATTERN.test(answer)
      );
    case 'compare':
      return /비교|우선|선택|기준|조건/.test(answer);
    case 'list':
      return /(?:^|\n)\s*(?:\d+\.|- )|첫째|둘째|셋째/.test(answer);
    case 'general':
      return true;
  }
}

const DIRECT_ANSWER_FALLBACKS: Record<
  Exclude<QuestionType, 'general'>,
  Record<DirectAnswerPersonaKey, string>
> = {
  continue_or_stop: {
    lucia: '지금은 마음의 안전감을 먼저 확인해야 합니다. 이 관계가 편안함을 주는지, 반복해서 작아지게 만드는지부터 봐야 합니다.',
    jack: '말보다 반복 행동을 기준으로 보셔야 합니다. 상대의 상황보다 대응 태도를 봐야 합니다.',
    ray: '관계 지속 여부는 반복 패턴으로 봐야 합니다. 약속 이행, 갈등 후 회복, 존중의 일관성이 판단 기준입니다.',
    echo: '계속할 조건과 멈춰야 할 신호를 분리해야 합니다. 감정이 아니라 반복되는 구조를 봐야 합니다.',
  },
  buy_or_wait: {
    lucia: SAFE_INVESTMENT_FALLBACK,
    jack: SAFE_INVESTMENT_FALLBACK,
    ray: SAFE_INVESTMENT_FALLBACK,
    echo: SAFE_INVESTMENT_FALLBACK,
  },
  compare: {
    lucia: '조건부 비교입니다. 마음이 오래 버틸 수 있는 선택지와 현실 비용이 작은 선택지를 나눠 봐야 합니다.',
    jack: '먼저 기준을 하나로 잡아야 합니다. 지금 당장 실행 가능한 쪽과 리스크가 작은 쪽을 분리해서 보셔야 합니다.',
    ray: '조건부 비교입니다. 비용, 기간, 실패 확률, 회복 가능성을 같은 기준으로 놓고 봐야 합니다.',
    echo: '조건부 선택입니다. 기준만 나열하지 말고 우선순위를 정해야 합니다.',
  },
  list: {
    lucia: '1. 마음의 부담\n2. 관계의 변화\n3. 현실 비용',
    jack: '1. 돈 문제\n2. 시간 문제\n3. 실행 문제',
    ray: '1. 현재 조건\n2. 리스크\n3. 다음 행동',
    echo: '1. 핵심 쟁점\n2. 판단 기준\n3. 오늘 할 일',
  },
};

export function buildDirectAnswerFallback(
  questionType: QuestionType,
  persona?: DirectAnswerPersonaKey,
): string {
  if (questionType === 'general' || !persona) {
    return '';
  }

  return DIRECT_ANSWER_FALLBACKS[questionType][persona] ?? '';
}
