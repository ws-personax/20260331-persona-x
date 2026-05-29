export type QuestionType =
  | 'continue_or_stop'
  | 'buy_or_wait'
  | 'compare'
  | 'list'
  | 'general';

export type DirectAnswerPersonaKey = 'lucia' | 'jack' | 'ray' | 'echo';

export function detectQuestionType(question: string): QuestionType {
  if (/계속\s*만나|헤어져|만나도\s*될|끊어야|그만해야/.test(question)) {
    return 'continue_or_stop';
  }

  if (/사야|매수|팔아야|보유|관망|투자해도/.test(question)) {
    return 'buy_or_wait';
  }

  if (/vs|VS|비교|둘\s*중|[A-Za-z0-9가-힣]+\s*와\s*[A-Za-z0-9가-힣]+|[A-Za-z0-9가-힣]+\s*랑\s*[A-Za-z0-9가-힣]+|어느\s*쪽/.test(question)) {
    return 'compare';
  }

  if (/3가지|세\s*가지|목록|리스트|추천|정리|핵심/.test(question)) {
    return 'list';
  }

  return 'general';
}

export function hasDirectAnswer(
  answer: string,
  questionType: QuestionType,
): boolean {
  switch (questionType) {
    case 'continue_or_stop':
      return /계속|중단|그만|헤어|조건부|만나도|멈춰/.test(answer);
    case 'buy_or_wait':
      return /매수|보류|관망|사세요|기다리세요|분할|진입|매도/.test(answer);
    case 'compare':
      return /창업|재취업|A|B|더\s*낫|우선|선택/.test(answer);
    case 'list':
      return /(?:^|\n)\s*(?:\d+\.|①|②|③|- )|첫째|둘째|셋째/.test(answer);
    case 'general':
      return true;
  }
}

const DIRECT_ANSWER_FALLBACKS: Record<
  Exclude<QuestionType, 'general'>,
  Record<DirectAnswerPersonaKey, string>
> = {
  continue_or_stop: {
    lucia: '조건부 계속입니다. 마음이 편해지는지, 반복해서 상처받는지만 먼저 나눠 봐야 합니다.',
    jack: '중단 신호부터 보세요. 말만 바뀌고 행동이 그대로면 더 끌고 가면 안 됩니다.',
    ray: '조건부 계속입니다. 약속 이행, 연락 빈도, 갈등 후 회복 여부를 2주 기준으로 봐야 합니다.',
    echo: '조건부 계속입니다. 계속할 조건과 멈춰야 할 신호를 분리해야 합니다.',
  },
  buy_or_wait: {
    lucia: '관망입니다. 불안해서 들어가는 돈인지, 감당 가능한 돈인지 먼저 봐야 합니다.',
    jack: '보류입니다. 기준 없는 진입이면 매수가 아니라 충동입니다.',
    ray: '분할 접근입니다. 확인된 가격과 리스크 기준이 있을 때만 판단할 수 있습니다.',
    echo: '관망입니다. 손절선이나 리스크 기준 없이 방향만 정하면 안 됩니다.',
  },
  compare: {
    lucia: '조건부로 더 마음이 오래 버틸 수 있는 쪽을 우선해야 합니다.',
    jack: '먼저 하나를 고르세요. 지금 당장 실행 가능한 쪽이 우선입니다.',
    ray: '조건부로 기대값이 높은 쪽을 우선해야 합니다. 비용, 기간, 실패 확률을 비교해야 합니다.',
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
