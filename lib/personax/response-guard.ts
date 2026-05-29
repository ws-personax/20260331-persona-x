export type QuestionType =
  | 'continue_or_stop'
  | 'buy_or_wait'
  | 'compare'
  | 'list'
  | 'general';

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

export function buildDirectAnswerFallback(questionType: QuestionType): string {
  switch (questionType) {
    case 'continue_or_stop':
      return '지금은 바로 결론내리기보다, 계속 만날 조건과 멈춰야 할 신호를 나눠서 판단해야 합니다.';
    case 'buy_or_wait':
      return '지금은 무조건 매수보다 보류 또는 분할 접근이 더 안전합니다.';
    case 'compare':
      return '둘 중 하나를 고르기보다, 현재 자원과 리스크 기준으로 우선순위를 정해야 합니다.';
    case 'list':
      return '핵심을 먼저 정리하면 다음 항목들로 나눌 수 있습니다.';
    case 'general':
      return '';
  }
}
