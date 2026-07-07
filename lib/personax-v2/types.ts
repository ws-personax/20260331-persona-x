export type PersonaId = 'ray' | 'jack' | 'lucia' | 'echo';

export interface ClassifierResult {
  isInvest: boolean;
}

export interface ResearchResult {
  rawFacts: string[];
  metadata: {
    source: string;
    detectedKeyword: string | null;
    assetName: string | null;
    symbol: string | null;
    matchedKeyword: string | null;
    questionType: 'invest' | 'general';
    fetchedAt: string;
    marketData?: {
      price: string;
      change: string;
      high: string;
      low: string;
      volume: string;
      currency: string;
      marketState: string;
      source: string;
    };
    error?: {
      code: string;
      message: string;
    };
  };
}

export interface PersonaPromptInput {
  userQuestion: string;
  classifierResult: ClassifierResult;
  researchResult: ResearchResult;
}

export interface PersonaOutputSection {
  key: string;
  label: string;
}

export interface PersonaOutputContract {
  sections: PersonaOutputSection[];
}

export interface PersonaPromptDefinition {
  personaId: PersonaId;
  displayName: string;
  role: string;
  outputContract: PersonaOutputContract;
  buildPrompt: (input: PersonaPromptInput) => string;
}

export type PersonaEngineMode = 'live' | 'fallback';

export interface PersonaError {
  code: 'missing_api_key' | 'provider_error' | 'empty_response';
  message: string;
  provider: 'anthropic' | 'gemini' | 'openai' | 'none';
  model: string | null;
  retryable: boolean;
}

export interface PersonaResult {
  personaId: PersonaId;
  text: string;
  mode: PersonaEngineMode;
  error?: PersonaError;
  metadata?: {
    provider: 'anthropic' | 'gemini' | 'openai' | 'none';
    model: string | null;
  };
}

export interface DecisionResult {
  personaResults: PersonaResult[];
  decisionSummary: DecisionSummary;
}

export interface DecisionSummary {
  conclusion: string;
  keyRisks: string[];
  suggestedNextStep: string;
  confidence: 'low' | 'medium' | 'high';
}

export interface RuntimeV2Response {
  personaResults: PersonaResult[];
  decisionSummary: DecisionSummary;
  order: PersonaId[];
}
