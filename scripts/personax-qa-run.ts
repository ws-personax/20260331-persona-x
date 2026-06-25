/**
 * PersonaX integrated QA pipeline runner
 *
 * Input: PersonaX response JSON through stdin.
 * Pipeline: evaluatePersonaResponses -> metrics -> console report or JSON.
 *
 * This runner is static-only. It does not call fetch, app APIs, LLM SDKs,
 * promptfoo, or browser automation.
 */
import { evaluatePersonaResponses } from './personax-qa-persona';

type PersonaKey = 'ray' | 'jack' | 'lucia' | 'echo';

interface PersonaEvaluationInput {
  question: string;
  ray: string;
  jack: string;
  lucia: string;
  echo: string;
}

interface PersonaXExportInput {
  question: string;
  personas: {
    RAY?: string;
    JACK?: string;
    LUCIA?: string;
    ECHO?: string;
    ray?: string;
    jack?: string;
    lucia?: string;
    echo?: string;
  };
  summary?: string;
}

interface CheckResult {
  label: string;
  passed: boolean;
}

interface PersonaEvaluation {
  question: string;
  persona: PersonaKey;
  checks: CheckResult[];
  passed: boolean;
}

interface PersonaScore {
  score: number;
  passed: boolean;
  failedChecks: string[];
}

interface QaRunMetrics {
  overall: number;
  persona: Record<PersonaKey, PersonaScore>;
  summary: number;
  guardrail: {
    attackFree: number;
    noQuestionEnding: number;
    judgmentEnding: number;
    overall: number;
  };
  selfcheck: Record<PersonaKey, number>;
  passFail: 'PASS' | 'FAIL';
  trend: {
    status: 'ready';
    previous: null;
    delta: null;
  };
}

const PERSONAS: PersonaKey[] = ['ray', 'jack', 'lucia', 'echo'];

const average = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
};

const readStdinJson = (): unknown => {
  const raw = require('fs').readFileSync(0, 'utf8').trim();
  if (!raw) {
    throw new Error('qa:run requires PersonaX response JSON through stdin');
  }
  return JSON.parse(raw);
};

const isPersonaEvaluationInput = (value: unknown): value is PersonaEvaluationInput => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const input = value as Partial<PersonaEvaluationInput>;
  return ['question', 'ray', 'jack', 'lucia', 'echo'].every((key) => (
    typeof input[key as keyof PersonaEvaluationInput] === 'string'
    && Boolean(input[key as keyof PersonaEvaluationInput]?.trim())
  ));
};

const isPersonaXExportInput = (value: unknown): value is PersonaXExportInput => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const input = value as Partial<PersonaXExportInput>;
  const personas = input.personas;
  return typeof input.question === 'string'
    && Boolean(input.question.trim())
    && Boolean(personas)
    && typeof personas === 'object'
    && ['RAY', 'JACK', 'LUCIA', 'ECHO'].every((key) => (
      typeof personas[key as keyof PersonaXExportInput['personas']] === 'string'
      && Boolean(personas[key as keyof PersonaXExportInput['personas']]?.trim())
    ));
};

const fromPersonaXExport = (input: PersonaXExportInput): PersonaEvaluationInput => ({
  question: input.question,
  ray: input.personas.RAY ?? input.personas.ray ?? '',
  jack: input.personas.JACK ?? input.personas.jack ?? '',
  lucia: input.personas.LUCIA ?? input.personas.lucia ?? '',
  echo: input.personas.ECHO ?? input.personas.echo ?? '',
});

const normalizeInputs = (value: unknown): PersonaEvaluationInput[] => {
  if (Array.isArray(value)) {
    if (!value.every((item) => isPersonaEvaluationInput(item) || isPersonaXExportInput(item))) {
      throw new Error('qa:run array input must contain PersonaEvaluationInput or PersonaX export objects');
    }
    return value.map((item) => (
      isPersonaEvaluationInput(item) ? item : fromPersonaXExport(item)
    ));
  }

  if (isPersonaXExportInput(value)) {
    return [fromPersonaXExport(value)];
  }

  if (isPersonaEvaluationInput(value)) {
    return [value];
  }

  throw new Error('qa:run input must include question with ray/jack/lucia/echo or personas.RAY/JACK/LUCIA/ECHO strings');
};

const scoreChecks = (checks: CheckResult[]): number => {
  if (checks.length === 0) {
    return 0;
  }
  const passed = checks.filter((check) => check.passed).length;
  return Math.round((passed / checks.length) * 100);
};

const getCheckScore = (
  evaluations: PersonaEvaluation[],
  persona: PersonaKey,
  label: string,
): number => {
  const checks = evaluations
    .filter((item) => item.persona === persona)
    .flatMap((item) => item.checks.filter((check) => check.label === label));

  if (checks.length === 0) {
    return 0;
  }

  return Math.round((checks.filter((check) => check.passed).length / checks.length) * 100);
};

const buildMetrics = (evaluations: PersonaEvaluation[]): QaRunMetrics => {
  const persona = PERSONAS.reduce<Record<PersonaKey, PersonaScore>>((acc, key) => {
    const items = evaluations.filter((item) => item.persona === key);
    const checks = items.flatMap((item) => item.checks);
    acc[key] = {
      score: scoreChecks(checks),
      passed: items.every((item) => item.passed),
      failedChecks: checks
        .filter((check) => !check.passed)
        .map((check) => check.label),
    };
    return acc;
  }, {
    ray: { score: 0, passed: false, failedChecks: [] },
    jack: { score: 0, passed: false, failedChecks: [] },
    lucia: { score: 0, passed: false, failedChecks: [] },
    echo: { score: 0, passed: false, failedChecks: [] },
  });

  const overall = average(PERSONAS.map((key) => persona[key].score));
  const guardrail = {
    attackFree: getCheckScore(evaluations, 'jack', 'no user attack'),
    noQuestionEnding: getCheckScore(evaluations, 'echo', 'no question ending'),
    judgmentEnding: getCheckScore(evaluations, 'echo', 'verdict ending'),
    overall: 0,
  };
  guardrail.overall = average([
    guardrail.attackFree,
    guardrail.noQuestionEnding,
    guardrail.judgmentEnding,
  ]);

  return {
    overall,
    persona,
    summary: overall,
    guardrail,
    selfcheck: {
      ray: persona.ray.score,
      jack: persona.jack.score,
      lucia: persona.lucia.score,
      echo: persona.echo.score,
    },
    passFail: evaluations.every((item) => item.passed) ? 'PASS' : 'FAIL',
    trend: {
      status: 'ready',
      previous: null,
      delta: null,
    },
  };
};

const printTextReport = (metrics: QaRunMetrics): void => {
  console.log('========================');
  console.log('Persona QA Report');
  console.log('========================');
  console.log('');

  console.log('Overall Score');
  console.log(metrics.overall);
  console.log('');

  console.log('Persona Score');
  for (const persona of PERSONAS) {
    const item = metrics.persona[persona];
    console.log(`- ${persona.toUpperCase()}: ${item.score} (${item.passed ? 'PASS' : 'FAIL'})`);
    if (item.failedChecks.length > 0) {
      console.log(`  Failed: ${Array.from(new Set(item.failedChecks)).join(', ')}`);
    }
  }
  console.log('');

  console.log('Decision Summary');
  console.log(metrics.summary);
  console.log('');

  console.log('Guardrail');
  console.log(`- Attack-Free: ${metrics.guardrail.attackFree}`);
  console.log(`- No Question Ending: ${metrics.guardrail.noQuestionEnding}`);
  console.log(`- Judgment Ending: ${metrics.guardrail.judgmentEnding}`);
  console.log(`- Overall: ${metrics.guardrail.overall}`);
  console.log('');

  console.log('Self-Check');
  for (const persona of PERSONAS) {
    console.log(`- ${persona.toUpperCase()}: ${metrics.selfcheck[persona]}`);
  }
  console.log('');

  console.log('PASS / FAIL');
  console.log(metrics.passFail);
  console.log('');

  console.log('Trend(지원 준비)');
  console.log('ready');
  console.log('');

  console.log('========================');
};

const args = process.argv.slice(2);
const inputs = normalizeInputs(readStdinJson());
const evaluations = inputs.flatMap((input) => (
  evaluatePersonaResponses(input) as PersonaEvaluation[]
));
const metrics = buildMetrics(evaluations);

if (args.includes('--json')) {
  console.log(JSON.stringify({ metrics, evaluations }, null, 2));
} else {
  printTextReport(metrics);
}
