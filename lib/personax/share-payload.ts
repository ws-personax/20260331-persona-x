import type { DecisionSummary } from '@/lib/personax/decision-summary';
import type { PersonaResponse } from '@/lib/personax/response-builder';

export type PersonaHighlightKey = 'ray' | 'jack' | 'lucia' | 'echo';

export type PersonaHighlights = Partial<Record<PersonaHighlightKey, string>>;

export type SharePayload = {
  title: string;
  questionPreview: string;
  verdict: string;
  reasons: string[];
  personaHighlights: PersonaHighlights;
  categoryV3?: string;
  decisionType?: string;
  summaryType?: string;
  createdAt: string;
};

export type SharePayloadInput = {
  question?: string | null;
  categoryV3?: string | null;
  decisionType?: string | null;
  decisionSummary?: DecisionSummary | null;
  personas?: Partial<Pick<PersonaResponse, PersonaHighlightKey>> | null;
  createdAt?: string | Date | null;
};

const QUESTION_LIMIT = 120;
const VERDICT_LIMIT = 120;
const REASON_LIMIT = 100;
const PERSONA_HIGHLIGHT_LIMIT = 120;
const MAX_REASONS = 3;

const normalizeWhitespace = (value: string): string =>
  value.replace(/\s+/g, ' ').trim();

const truncate = (value: string | null | undefined, maxLength: number): string => {
  const normalized = normalizeWhitespace(value ?? '');
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
};

const normalizeDate = (value: string | Date | null | undefined): string => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  }
  return new Date().toISOString();
};

const compactOptional = (value: string | null | undefined): string | undefined => {
  const normalized = normalizeWhitespace(value ?? '');
  return normalized || undefined;
};

const buildTitle = (input: SharePayloadInput, verdict: string, questionPreview: string): string =>
  truncate(verdict || questionPreview || input.decisionType || input.categoryV3 || 'PersonaX insight', VERDICT_LIMIT);

const buildReasons = (summary?: DecisionSummary | null): string[] =>
  (summary?.reasons ?? [])
    .map((reason) => truncate(reason, REASON_LIMIT))
    .filter(Boolean)
    .slice(0, MAX_REASONS);

const buildPersonaHighlights = (
  personas?: SharePayloadInput['personas'],
): PersonaHighlights => {
  if (!personas) return {};

  const entries: Array<[PersonaHighlightKey, string | undefined]> = [
    ['ray', personas.ray],
    ['jack', personas.jack],
    ['lucia', personas.lucia],
    ['echo', personas.echo],
  ];

  return entries.reduce<PersonaHighlights>((acc, [key, value]) => {
    const highlight = truncate(value, PERSONA_HIGHLIGHT_LIMIT);
    if (highlight) acc[key] = highlight;
    return acc;
  }, {});
};

export function buildSharePayload(input: SharePayloadInput): SharePayload {
  const questionPreview = truncate(input.question, QUESTION_LIMIT);
  const verdict = truncate(input.decisionSummary?.verdict, VERDICT_LIMIT);

  return {
    title: buildTitle(input, verdict, questionPreview),
    questionPreview,
    verdict,
    reasons: buildReasons(input.decisionSummary),
    personaHighlights: buildPersonaHighlights(input.personas),
    ...(compactOptional(input.categoryV3) ? { categoryV3: compactOptional(input.categoryV3) } : {}),
    ...(compactOptional(input.decisionType) ? { decisionType: compactOptional(input.decisionType) } : {}),
    ...(compactOptional(input.decisionSummary?.summaryType)
      ? { summaryType: compactOptional(input.decisionSummary?.summaryType) }
      : {}),
    createdAt: normalizeDate(input.createdAt),
  };
}
