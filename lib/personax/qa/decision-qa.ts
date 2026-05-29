export const QA_QUESTIONS = [
  {
    id: 'list',
    question: '50대 대표 고민 3가지',
    check: (answer: string) =>
      /1.|2.|3.|①|②|③/.test(answer) ||
      answer.includes('첫째'),
  },
  {
    id: 'compare',
    question: '창업 vs 재취업 어떻게 해야 할까요?',
    check: (answer: string) =>
      /창업|재취업/.test(answer) &&
      /우선|먼저|권장|추천|낫습니다|유리/.test(answer),
  },
  {
    id: 'buy_or_wait',
    question: '삼성전자 지금 사야 할까요?',
    check: (answer: string) =>
      /매수|보류|관망|사세요|기다리|분할/.test(answer),
  },
  {
    id: 'continue_or_stop',
    question: '이 사람 계속 만나도 될까요?',
    check: (answer: string) =>
      /계속|중단|멈추|조건부|만나도|그만/.test(answer),
  },
] as const;

export function scoreQA(answers: Record<string, string>): number {
  const passed = QA_QUESTIONS.filter((item) =>
    item.check(answers[item.id] ?? ''),
  ).length;

  return passed * 25;
}
