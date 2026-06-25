/**
 * Persona Self-Check QA
 *
 * 현재: 내장 fixture 답변을 정적 evaluator로 평가한다.
 * 향후: 브라우저 자동화 또는 API 응답 텍스트를 stdin JSON으로 연결해
 * 동일 evaluator를 재사용할 수 있다.
 *
 * 이 스크립트는 fetch, LLM SDK, app API를 호출하지 않는다.
 */
declare const require: any;

type PersonaKey = 'ray' | 'jack' | 'lucia' | 'echo';

type PersonaResponses = Record<PersonaKey, string>;

interface PersonaEvaluationInput {
  question: string;
  ray: string;
  jack: string;
  lucia: string;
  echo: string;
}

type CheckResult = {
  label: string;
  passed: boolean;
};

type PersonaEvaluation = {
  persona: PersonaKey;
  checks: CheckResult[];
  passed: boolean;
};

const QUESTIONS = [
  '행복의 기준은?',
  '창업할까요, 재취업할까요?',
  '이 사람을 계속 만나도 될까요?',
  '삼성전자 지금 살까요?',
  '퇴사할까요?',
  '성공의 기준은?',
  '경제적 자유란?',
  '직장 동료가 저를 무시합니다',
  '부모님과 갈등이 있습니다',
  '노후 준비는 어떻게 해야 하나요?',
] as const;

type Question = (typeof QUESTIONS)[number];

const FIXTURE_RESPONSES: Record<Question, PersonaResponses> = {
  '행복의 기준은?': {
    ray: '행복은 감정 하나가 아니라 회복 시간이 짧아지고 만족이 반복되는 조건입니다. 수면, 관계 안정, 비용 부담, 선택권을 비교 기준으로 두고 최근 한 달에 무엇이 회복을 만들었는지 검증해야 합니다.',
    jack: '행복을 원한다면 먼저 선택해야 합니다. 무엇을 계속할지, 무엇을 포기할지 정하고 그 대가와 책임을 감당할 수 있는지 봐야 합니다.',
    lucia: '행복은 마음이 덜 다치고 관계 안에서 안전하다고 느끼는 시간이 늘어나는 쪽에 가깝습니다. 지금 상처가 줄고 회복이 가능한 방향인지 살펴야 합니다.',
    echo: '행복은 한 번의 기분이 아니라 회복되는 선택이 반복되는 구조에서 남습니다. 같은 조건이 반복될수록 삶의 만족이 누적됩니다.',
  },
  '창업할까요, 재취업할까요?': {
    ray: '먼저 비용, 기간, 리스크를 비교해야 합니다. 창업은 고정비와 버틸 기간, 재취업은 예상 연봉과 적응 기간을 놓고 어떤 조건이 검증 가능한지 확인해야 합니다.',
    jack: '핵심은 선택입니다. 창업을 고르면 안정성을 포기하고 책임을 집니다. 재취업을 고르면 자율성 일부를 포기하고 실행 가능성을 얻습니다.',
    lucia: '둘 중 무엇이 마음을 덜 무너뜨리는지도 봐야 합니다. 불안과 상처가 커지는 선택인지, 관계와 생활을 회복할 여지가 있는지 살펴야 합니다.',
    echo: '이 고민은 자유와 안정 사이에서 반복되는 구조입니다. 같은 회피가 반복되면 어떤 선택을 해도 불안이 누적됩니다.',
  },
  '이 사람을 계속 만나도 될까요?': {
    ray: '말과 행동의 일치, 갈등 후 회복 기간, 비용과 리스크를 비교해야 합니다. 감정만 보지 말고 반복된 행동이 검증 가능한지 확인해야 합니다.',
    jack: '계속 만날지 멈출지 선택해야 합니다. 남는다면 어떤 책임을 질지, 떠난다면 무엇을 포기할지 대가를 봐야 합니다.',
    lucia: '좋아하는 마음보다 마음이 계속 다치는지가 중요합니다. 관계 안에서 안전감이 있고 상처가 회복되는지 살펴야 합니다.',
    echo: '관계는 한 번의 말보다 반복되는 패턴으로 드러납니다. 같은 상처와 화해가 되풀이되면 그 구조가 결과를 만듭니다.',
  },
  '삼성전자 지금 살까요?': {
    ray: '가격, 기간, 손실 가능 비용, 리스크 기준이 먼저입니다. 현재 숫자와 비교 기준이 없으면 매수 판단보다 어떤 데이터를 검증할지 정해야 합니다.',
    jack: '살지 말지는 선택의 문제입니다. 들어간다면 손실 대가를 책임지고, 기다린다면 기회비용을 받아들여야 합니다.',
    lucia: '투자 결정도 마음이 버틸 수 있어야 합니다. 불안이 커져 일상이 흔들린다면 회복 가능한 방식인지 먼저 봐야 합니다.',
    echo: '종목은 바뀌어도 확신을 기다리는 패턴이 반복됩니다. 기준 없이 들어가면 같은 불안이 누적됩니다.',
  },
  '퇴사할까요?': {
    ray: '퇴사는 비용, 기간, 비상자금, 이직 가능성, 리스크를 비교해야 합니다. 감정이 아니라 확인 가능한 조건부터 검증해야 합니다.',
    jack: '퇴사는 선택입니다. 나가면 안정성을 포기하고, 남으면 시간을 대가로 냅니다. 무엇을 선택하고 책임질지 정해야 합니다.',
    lucia: '회사가 힘든 것과 마음이 계속 다치는 것은 다릅니다. 관계와 상처가 회복 가능한지, 마음이 더 건강해지는 방향인지 봐야 합니다.',
    echo: '퇴사 고민이 반복된다면 회사 하나의 문제가 아닐 수 있습니다. 같은 소진 구조가 반복되면 다음 자리에서도 결과가 누적됩니다.',
  },
  '성공의 기준은?': {
    ray: '성공은 목표 달성률, 기간, 비용, 리스크를 기준으로 비교할 수 있습니다. 무엇을 성공으로 볼지 정의하고 검증 가능한 조건을 남겨야 합니다.',
    jack: '성공은 선택과 포기의 결과입니다. 무엇을 얻을지보다 무엇을 포기해도 지킬 기준인지, 그 대가를 책임질 수 있는지 봐야 합니다.',
    lucia: '성공해도 마음이 무너지고 관계가 다치면 오래가기 어렵습니다. 불안과 상처가 줄고 회복 가능한 성공인지 살펴야 합니다.',
    echo: '성공은 한 번의 성취가 아니라 유지되는 패턴입니다. 같은 방식이 반복될 때 삶이 무너지지 않으면 결과가 누적됩니다.',
  },
  '경제적 자유란?': {
    ray: '경제적 자유는 생활비, 현금흐름, 기간, 비용, 리스크를 비교해 검증해야 합니다. 자산 규모보다 선택권을 유지할 조건이 있는지 확인해야 합니다.',
    jack: '경제적 자유는 하고 싶은 것을 다 하는 상태가 아닙니다. 무엇을 포기하고 어떤 책임을 줄일지 선택하는 문제입니다.',
    lucia: '돈이 있어도 마음이 계속 불안하면 자유가 아닐 수 있습니다. 관계가 안정되고 마음의 무게가 회복되는지 살펴야 합니다.',
    echo: '경제적 자유는 소득보다 선택권이 반복해서 넓어지는 구조입니다. 벌수록 불안이 커지면 같은 결핍이 누적됩니다.',
  },
  '직장 동료가 저를 무시합니다': {
    ray: '무시라고 판단하기 전에 반복 횟수, 기간, 상황, 비용과 리스크를 봐야 합니다. 말과 행동의 패턴이 검증 가능한지 비교해야 합니다.',
    jack: '참을지 말지 선택해야 합니다. 대응을 미루면 대가가 커집니다. 감정 싸움이 아니라 기준을 세우고 책임질 행동을 정해야 합니다.',
    lucia: '무시당했다는 느낌은 마음에 상처를 남깁니다. 관계 안에서 안전감이 무너졌는지, 회복 가능한 대화가 있는지 봐야 합니다.',
    echo: '한 번의 말보다 무시가 반복되는 구조가 중요합니다. 침묵으로 넘기면 그 방식이 굳어지고 결과가 누적됩니다.',
  },
  '부모님과 갈등이 있습니다': {
    ray: '갈등의 빈도, 기간, 비용, 리스크, 회복 시간을 비교해야 합니다. 어떤 조건에서 갈등이 커지는지 검증해야 합니다.',
    jack: '부모님을 바꾸는 것보다 내 선택이 먼저입니다. 어디까지 책임질지, 무엇을 포기하지 않을지 정해야 대가가 보입니다.',
    lucia: '가족 갈등은 마음의 무게가 큽니다. 상처를 인정하되 관계가 회복될 수 있는 안전한 거리와 방식을 살펴야 합니다.',
    echo: '가족 갈등은 같은 말과 같은 역할이 반복될 때 구조가 됩니다. 그 반복을 멈추지 않으면 상처가 누적됩니다.',
  },
  '노후 준비는 어떻게 해야 하나요?': {
    ray: '노후 준비는 기간, 생활비, 현금흐름, 의료비, 리스크를 비교해야 합니다. 지금 확인할 숫자와 검증할 조건을 먼저 정해야 합니다.',
    jack: '노후 준비는 선택의 문제입니다. 지금 소비를 일부 포기하고 책임질 계획을 실행해야 미래의 대가가 줄어듭니다.',
    lucia: '노후는 돈만의 문제가 아니라 마음의 안전감과 관계의 안정도 함께 봐야 합니다. 불안이 줄고 회복 가능한 생활인지 살펴야 합니다.',
    echo: '노후 준비는 작은 선택이 오래 반복되어 만드는 구조입니다. 미루는 패턴이 계속되면 부족함이 누적됩니다.',
  },
};

const hasAny = (answer: string, terms: readonly string[]): boolean =>
  terms.some((term) => answer.includes(term));

const endsWithQuestion = (answer: string): boolean =>
  answer.trim().endsWith('?') || answer.trim().endsWith('？');

const endsWithVerdict = (answer: string): boolean =>
  /(?:다|니다|입니다|됩니다|됩니다\.|입니다\.|다\.)$/.test(answer.trim());

const evaluateRay = (answer: string): CheckResult[] => [
  {
    label: 'quantitative signal',
    passed: hasAny(answer, ['숫자', '비율', '기간', '비용', '리스크', '생활비', '현금흐름', '가격']),
  },
  {
    label: 'comparison criteria',
    passed: hasAny(answer, ['비교', '기준', '조건']),
  },
  {
    label: 'verification action',
    passed: hasAny(answer, ['검증', '확인']),
  },
];

const evaluateJack = (answer: string): CheckResult[] => [
  {
    label: 'choice or sacrifice',
    passed: hasAny(answer, ['선택', '포기']),
  },
  {
    label: 'cost or responsibility',
    passed: hasAny(answer, ['대가', '책임', '기회비용']),
  },
  {
    label: 'no user attack',
    passed: !hasAny(answer, ['네가 못해서', '결단력도 없으면서', '당신이 문제', '네 탓']),
  },
];

const evaluateLucia = (answer: string): CheckResult[] => [
  {
    label: 'emotion or wound',
    passed: hasAny(answer, ['감정', '마음', '상처', '불안']),
  },
  {
    label: 'recovery',
    passed: hasAny(answer, ['회복', '안전감', '건강']),
  },
  {
    label: 'not comfort only',
    passed: !hasAny(answer, ['무조건 괜찮', '다 괜찮', '그냥 괜찮']),
  },
];

const evaluateEcho = (answer: string): CheckResult[] => [
  {
    label: 'no question ending',
    passed: !endsWithQuestion(answer),
  },
  {
    label: 'verdict ending',
    passed: endsWithVerdict(answer),
  },
  {
    label: 'pattern or structure',
    passed: hasAny(answer, ['패턴', '구조', '반복', '누적', '되풀이']),
  },
];

const EVALUATORS: Record<PersonaKey, (answer: string) => CheckResult[]> = {
  ray: evaluateRay,
  jack: evaluateJack,
  lucia: evaluateLucia,
  echo: evaluateEcho,
};

export const evaluatePersonaAnswer = (
  persona: PersonaKey,
  answer: string,
): PersonaEvaluation => {
  const checks = EVALUATORS[persona](answer);
  return {
    persona,
    checks,
    passed: checks.every((check) => check.passed),
  };
};

export const evaluatePersonaResponses = (
  input: PersonaEvaluationInput,
): Array<PersonaEvaluation & { question: string }> => (
  (['ray', 'jack', 'lucia', 'echo'] as PersonaKey[]).map((persona) => ({
    question: input.question,
    ...evaluatePersonaAnswer(persona, input[persona]),
  }))
);

const formatPassFail = (passed: boolean): 'PASS' | 'FAIL' =>
  passed ? 'PASS' : 'FAIL';

const buildFixtureInputs = (): PersonaEvaluationInput[] => (
  QUESTIONS.map((question) => ({
    question,
    ...FIXTURE_RESPONSES[question],
  }))
);

const readStdinInput = (): PersonaEvaluationInput => {
  const { readFileSync } = require('fs');
  const raw = readFileSync(0, 'utf8').trim();
  if (!raw) {
    throw new Error('--stdin requires a JSON payload');
  }

  const parsed = JSON.parse(raw) as Partial<PersonaEvaluationInput>;
  for (const key of ['question', 'ray', 'jack', 'lucia', 'echo'] as const) {
    if (typeof parsed[key] !== 'string' || !parsed[key]?.trim()) {
      throw new Error(`--stdin JSON must include non-empty "${key}"`);
    }
  }

  return parsed as PersonaEvaluationInput;
};

const hasReadableStdin = (): boolean => {
  const { fstatSync } = require('fs');
  try {
    const stat = fstatSync(0);
    return stat.isFIFO() || stat.isFile();
  } catch {
    return false;
  }
};

const printEvaluationReport = (
  evaluations: Array<PersonaEvaluation & { question: string }>,
): void => {
  console.table(
    evaluations.map((item) => ({
      question: item.question,
      persona: item.persona.toUpperCase(),
      result: formatPassFail(item.passed),
      failedChecks: item.checks
        .filter((check) => !check.passed)
        .map((check) => check.label)
        .join(', '),
    })),
  );

  const personaRates = (['ray', 'jack', 'lucia', 'echo'] as PersonaKey[]).map((persona) => {
    const items = evaluations.filter((item) => item.persona === persona);
    const passed = items.filter((item) => item.passed).length;
    return {
      persona: persona.toUpperCase(),
      passed,
      total: items.length,
      passRate: `${Math.round((passed / items.length) * 100)}%`,
    };
  });

  console.table(personaRates);

  const totalPassed = evaluations.filter((item) => item.passed).length;
  const totalRate = Math.round((totalPassed / evaluations.length) * 100);
  console.log(`Overall pass rate: ${totalPassed}/${evaluations.length} (${totalRate}%)`);

  if (totalPassed !== evaluations.length) {
    process.exitCode = 1;
  }
};

const isDirectCli = process.argv[1]
  ?.replace(/\\/g, '/')
  .endsWith('/scripts/personax-qa-persona.ts');

const args = process.argv.slice(2);
const mode = args.includes('--stdin') || hasReadableStdin() ? 'stdin' : 'fixture';

if (isDirectCli) {
  if (mode === 'stdin') {
    printEvaluationReport(evaluatePersonaResponses(readStdinInput()));
  } else {
    printEvaluationReport(buildFixtureInputs().flatMap(evaluatePersonaResponses));
  }
}
