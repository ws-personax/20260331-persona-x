const countMatchedTerms = (answer: string, terms: readonly string[]): number =>
  terms.filter((term) => answer.includes(term)).length;

const PERSONA_DNA_SIGNAL_GROUPS = [
  ['책임', '선택', '행동', '대가'],
  ['정의', '분해', '비교', '검증'],
  ['인간', '감정', '관계', '상처'],
  ['반복', '패턴', '구조', '누적'],
] as const;

const hasPersonaDnaSignals = (answer: string): boolean => {
  const groupMatches = PERSONA_DNA_SIGNAL_GROUPS.map((terms) =>
    countMatchedTerms(answer, terms),
  );
  const totalMatches = groupMatches.reduce((sum, count) => sum + count, 0);

  return groupMatches.every((count) => count >= 1) && totalMatches >= 6;
};

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
  {
    id: 'abstract_happiness',
    question: '행복이란?',
    check: hasPersonaDnaSignals,
  },
  {
    id: 'abstract_success',
    question: '성공이란?',
    check: hasPersonaDnaSignals,
  },
  {
    id: 'abstract_freedom',
    question: '자유란?',
    check: hasPersonaDnaSignals,
  },
  {
    id: 'abstract_good_life',
    question: '좋은 삶이란?',
    check: hasPersonaDnaSignals,
  },
  {
    id: 'abstract_life_meaning',
    question: '인생의 의미란?',
    check: hasPersonaDnaSignals,
  },
] as const;

export function scoreQA(answers: Record<string, string>): number {
  const passed = QA_QUESTIONS.filter((item) =>
    item.check(answers[item.id] ?? ''),
  ).length;

  return Math.round((passed / QA_QUESTIONS.length) * 100);
}
