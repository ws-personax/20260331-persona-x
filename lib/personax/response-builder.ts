import type { DecisionSummary } from '@/lib/personax/decision-summary';

export type PersonaKey = 'ray' | 'jack' | 'lucia' | 'echo';

export type StreamPersonaKey = Exclude<PersonaKey, 'echo'>;

export type PersonaOrder = PersonaKey[];

export type ErrorType =
  | 'market_data_unavailable'
  | 'keyword_not_recognized'
  | 'analysis_failed';

export type NewsLink = {
  title: string;
  url: string;
};

export type PersonaResponse = {
  jack: string;
  lucia: string;
  ray: string;
  echo: string;
  echoDetails?: string | null;
  rayDetails?: string | null;
  jackDetails?: string | null;
  luciaDetails?: string | null;
  verdict: string;
  confidence: number;
  breakdown: string;
  positionSizing: string;
  jackNews?: NewsLink | null;
  luciaNews?: NewsLink | null;
  rayNews?: NewsLink | null;
  echoNews?: NewsLink | null;
  isAdvancedAnswer?: boolean;
  ray2?: string | null;
  jack2?: string | null;
  lucia2?: string | null;
  echo2?: string | null;
  order?: PersonaOrder;
  lucia_close?: string | null;
};

export type ChatResponse = {
  reply: string;
  personas?: PersonaResponse | null;
  luciaIntro?: string;
  teaRound?: number;
  sourceLabel?: string;
  decisionSummary?: DecisionSummary;
};

export type ErrorResponse = {
  errorType: ErrorType;
  errorMessage: string;
  reply?: string;
  personas?: PersonaResponse | null;
  luciaIntro?: string;
  teaRound?: number;
};

export type StreamPersonaChunk = {
  type: 'persona';
  key: StreamPersonaKey;
  round: 1 | 2;
  text: string;
};

export type StreamEchoChunk = {
  type: 'echo';
  round: 1 | 2;
  text: string;
};

export type StreamDone = {
  type: 'done';
  personas: PersonaResponse;
  reply: string;
};

export type StreamError = {
  type: 'error';
  errorType: ErrorType;
  errorMessage: string;
};

export type StreamChunk =
  | StreamPersonaChunk
  | StreamEchoChunk
  | StreamDone
  | StreamError;

export function buildChatResponse(params: ChatResponse): ChatResponse {
  return {
    reply: params.reply,
    ...(params.personas !== undefined ? { personas: params.personas } : {}),
    ...(params.luciaIntro ? { luciaIntro: params.luciaIntro } : {}),
    ...(params.teaRound !== undefined ? { teaRound: params.teaRound } : {}),
    ...(params.sourceLabel ? { sourceLabel: params.sourceLabel } : {}),
    ...(params.decisionSummary ? { decisionSummary: params.decisionSummary } : {}),
  };
}

export function buildErrorResponse(params: ErrorResponse): ErrorResponse {
  return {
    errorType: params.errorType,
    errorMessage: params.errorMessage,
    ...(params.reply !== undefined ? { reply: params.reply } : {}),
    ...(params.personas !== undefined ? { personas: params.personas } : {}),
    ...(params.luciaIntro ? { luciaIntro: params.luciaIntro } : {}),
    ...(params.teaRound !== undefined ? { teaRound: params.teaRound } : {}),
  };
}

export function buildPersonaChunk(
  key: StreamPersonaKey,
  round: 1 | 2,
  text: string,
): StreamPersonaChunk {
  return { type: 'persona', key, round, text };
}

export function buildEchoChunk(round: 1 | 2, text: string): StreamEchoChunk {
  return { type: 'echo', round, text };
}

export function buildDoneEvent(params: Omit<StreamDone, 'type'>): StreamDone {
  return {
    type: 'done',
    personas: params.personas,
    reply: params.reply,
  };
}

export function buildStreamError(params: Omit<StreamError, 'type'>): StreamError {
  return {
    type: 'error',
    errorType: params.errorType,
    errorMessage: params.errorMessage,
  };
}
