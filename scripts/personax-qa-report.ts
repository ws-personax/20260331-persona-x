/**
 * PersonaX Quality Report CLI
 *
 * Current: CLI-based quality report generation from stdin, a JSON file, or
 * the built-in sample report.
 *
 * Future: the same metrics JSON can be connected to GitHub Actions, PR
 * comments, or a dashboard UI without adding LLM/API calls.
 *
 * This script does not call fetch, app APIs, LLM SDKs, or promptfoo.
 */

type PersonaKey = 'ray' | 'jack' | 'lucia' | 'echo';

type MetricMap = Record<string, number>;

interface QualityMetrics {
  overall: number;
  persona: Record<PersonaKey, MetricMap>;
  summary: number;
  guardrail: MetricMap;
  selfcheck: MetricMap;
}

interface QualityReportInput {
  metrics?: PartialQualityMetrics;
  current?: PartialQualityMetrics;
  previous?: PartialQualityMetrics | number;
}

interface QaPersonaRow {
  persona: string;
  result?: string;
  passed?: boolean;
}

type PartialQualityMetrics = Partial<{
  overall: number;
  persona: Partial<Record<PersonaKey, MetricMap>>;
  summary: number;
  guardrail: MetricMap;
  selfcheck: MetricMap;
}>;

const PERSONAS: PersonaKey[] = ['ray', 'jack', 'lucia', 'echo'];

const DEFAULT_METRICS: QualityMetrics = {
  overall: 91,
  persona: {
    ray: {
      Accuracy: 94,
      Criteria: 92,
      Consistency: 90,
    },
    jack: {
      Action: 95,
      'Attack-Free': 100,
      Consistency: 91,
    },
    lucia: {
      Empathy: 96,
      Recovery: 93,
    },
    echo: {
      Pattern: 92,
      'Judgment Ending': 100,
    },
  },
  summary: 89,
  guardrail: {
    'Tag Bleed': 100,
    'Attack-Free': 100,
    'No Unsupported Numbers': 94,
    'Judgment Ending': 100,
  },
  selfcheck: {
    RAY: 92,
    JACK: 95,
    LUCIA: 94,
    ECHO: 96,
  },
};

const DEFAULT_PREVIOUS_OVERALL = 88;

const clampScore = (value: unknown, fallback: number): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
};

const average = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
};

const normalizePersonaKey = (persona: string): PersonaKey | null => {
  const key = persona.toLowerCase();
  return PERSONAS.includes(key as PersonaKey) ? (key as PersonaKey) : null;
};

const isPassedRow = (row: QaPersonaRow): boolean =>
  row.passed === true || row.result?.toUpperCase() === 'PASS';

const deriveMetricsFromPersonaRows = (rows: QaPersonaRow[]): QualityMetrics => {
  const personaScores = PERSONAS.reduce<Record<PersonaKey, number>>((acc, persona) => {
    const items = rows.filter((row) => normalizePersonaKey(row.persona) === persona);
    const passed = items.filter(isPassedRow).length;
    acc[persona] = items.length === 0 ? 0 : Math.round((passed / items.length) * 100);
    return acc;
  }, {
    ray: 0,
    jack: 0,
    lucia: 0,
    echo: 0,
  });

  const overall = average(Object.values(personaScores));

  return {
    overall,
    persona: {
      ray: {
        Accuracy: personaScores.ray,
        Criteria: personaScores.ray,
        Consistency: personaScores.ray,
      },
      jack: {
        Action: personaScores.jack,
        'Attack-Free': personaScores.jack,
        Consistency: personaScores.jack,
      },
      lucia: {
        Empathy: personaScores.lucia,
        Recovery: personaScores.lucia,
      },
      echo: {
        Pattern: personaScores.echo,
        'Judgment Ending': personaScores.echo,
      },
    },
    summary: overall,
    guardrail: {
      'Persona Rows': overall,
    },
    selfcheck: {
      RAY: personaScores.ray,
      JACK: personaScores.jack,
      LUCIA: personaScores.lucia,
      ECHO: personaScores.echo,
    },
  };
};

const mergeMetricMap = (base: MetricMap, override?: MetricMap): MetricMap => {
  const merged = { ...base };
  for (const [key, value] of Object.entries(override ?? {})) {
    merged[key] = clampScore(value, merged[key] ?? 0);
  }
  return merged;
};

const normalizeMetrics = (input?: PartialQualityMetrics): QualityMetrics => {
  const base = DEFAULT_METRICS;
  return {
    overall: clampScore(input?.overall, base.overall),
    persona: {
      ray: mergeMetricMap(base.persona.ray, input?.persona?.ray),
      jack: mergeMetricMap(base.persona.jack, input?.persona?.jack),
      lucia: mergeMetricMap(base.persona.lucia, input?.persona?.lucia),
      echo: mergeMetricMap(base.persona.echo, input?.persona?.echo),
    },
    summary: clampScore(input?.summary, base.summary),
    guardrail: mergeMetricMap(base.guardrail, input?.guardrail),
    selfcheck: mergeMetricMap(base.selfcheck, input?.selfcheck),
  };
};

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON input: ${(error as Error).message}`);
  }
};

const readJsonFile = (filePath: string): unknown => {
  const { readFileSync } = require('fs');
  return parseJson(readFileSync(filePath, 'utf8'));
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

const readStdinJson = (): unknown => {
  const { readFileSync } = require('fs');
  const raw = readFileSync(0, 'utf8').trim();
  if (!raw) {
    throw new Error('stdin mode requires a JSON payload');
  }
  return parseJson(raw);
};

const getPositionalInputFile = (args: string[]): string | null => {
  const consumedIndexes = new Set<number>();
  for (const flag of ['--input', '--previous']) {
    const index = args.indexOf(flag);
    if (index >= 0) {
      consumedIndexes.add(index);
      consumedIndexes.add(index + 1);
    }
  }

  return args.find((arg, index) => (
    !consumedIndexes.has(index)
    && !arg.startsWith('--')
  )) ?? null;
};

const resolveInput = (args: string[]): unknown => {
  const inputIndex = args.indexOf('--input');
  if (inputIndex >= 0) {
    const filePath = args[inputIndex + 1];
    if (!filePath) {
      throw new Error('--input requires a JSON file path');
    }
    return readJsonFile(filePath);
  }

  const positionalFile = getPositionalInputFile(args);
  if (positionalFile) {
    return readJsonFile(positionalFile);
  }

  if (args.includes('--stdin') || hasReadableStdin()) {
    return readStdinJson();
  }

  return {
    metrics: DEFAULT_METRICS,
    previous: DEFAULT_PREVIOUS_OVERALL,
  } satisfies QualityReportInput;
};

const resolvePrevious = (args: string[], input: unknown): number | null => {
  const previousIndex = args.indexOf('--previous');
  if (previousIndex >= 0) {
    const filePath = args[previousIndex + 1];
    if (!filePath) {
      throw new Error('--previous requires a JSON file path');
    }
    const previousInput = readJsonFile(filePath);
    return extractOverall(previousInput);
  }

  if (isQualityReportInput(input) && input.previous !== undefined) {
    return typeof input.previous === 'number'
      ? clampScore(input.previous, 0)
      : extractOverall(input.previous);
  }

  return null;
};

const isQaPersonaRows = (input: unknown): input is QaPersonaRow[] =>
  Array.isArray(input)
  && input.every((item) => (
    item
    && typeof item === 'object'
    && typeof (item as QaPersonaRow).persona === 'string'
  ));

const isQualityReportInput = (input: unknown): input is QualityReportInput =>
  Boolean(input && typeof input === 'object' && !Array.isArray(input));

const extractMetrics = (input: unknown): QualityMetrics => {
  if (isQaPersonaRows(input)) {
    return deriveMetricsFromPersonaRows(input);
  }

  if (isQualityReportInput(input)) {
    if (input.metrics) {
      return normalizeMetrics(input.metrics);
    }
    if (input.current) {
      return normalizeMetrics(input.current);
    }
    return normalizeMetrics(input as PartialQualityMetrics);
  }

  throw new Error('Input must be a metrics object or qa:persona row array');
};

const extractOverall = (input: unknown): number | null => {
  if (typeof input === 'number') {
    return clampScore(input, 0);
  }
  if (isQaPersonaRows(input)) {
    return deriveMetricsFromPersonaRows(input).overall;
  }
  if (isQualityReportInput(input)) {
    if (input.metrics?.overall !== undefined) {
      return clampScore(input.metrics.overall, 0);
    }
    if (input.current?.overall !== undefined) {
      return clampScore(input.current.overall, 0);
    }
    if ((input as PartialQualityMetrics).overall !== undefined) {
      return clampScore((input as PartialQualityMetrics).overall, 0);
    }
  }
  return null;
};

const trendLabel = (delta: number): string => {
  if (delta > 0) {
    return `\u25B2 +${delta}`;
  }
  if (delta < 0) {
    return `\u25BC ${delta}`;
  }
  return '0';
};

const printMetricBlock = (title: string, metrics: MetricMap): void => {
  console.log(`${title}:`);
  for (const [label, score] of Object.entries(metrics)) {
    console.log(`- ${label}: ${score}`);
  }
  console.log('');
};

const printReport = (metrics: QualityMetrics, previousOverall: number | null): void => {
  console.log('=========================');
  console.log('PersonaX Quality Report');
  console.log('=========================');
  console.log('');
  console.log(`Overall Score: ${metrics.overall}`);
  console.log('');

  printMetricBlock('RAY', metrics.persona.ray);
  printMetricBlock('JACK', metrics.persona.jack);
  printMetricBlock('LUCIA', metrics.persona.lucia);
  printMetricBlock('ECHO', metrics.persona.echo);

  console.log('Decision Summary:');
  console.log(metrics.summary);
  console.log('');

  console.log('Guardrail:');
  for (const [label, score] of Object.entries(metrics.guardrail)) {
    console.log(`- ${label}: ${score}`);
  }
  console.log('');

  console.log('Self-Check:');
  for (const [label, score] of Object.entries(metrics.selfcheck)) {
    console.log(`- ${label}: ${score}`);
  }
  console.log('');

  if (previousOverall !== null) {
    const delta = metrics.overall - previousOverall;
    console.log('Previous:');
    console.log(previousOverall);
    console.log('');
    console.log('Current:');
    console.log(metrics.overall);
    console.log('');
    console.log('Delta:');
    console.log(delta > 0 ? `+${delta}` : `${delta}`);
    console.log('');
    console.log('Overall Trend:');
    console.log(trendLabel(delta));
    console.log('');
  } else {
    console.log('Overall Trend:');
    console.log('n/a');
    console.log('');
  }

  console.log('=========================');
};

const args = process.argv.slice(2);
const input = resolveInput(args);
const metrics = extractMetrics(input);
const previousOverall = resolvePrevious(args, input);

printReport(metrics, previousOverall);
