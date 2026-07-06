import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI, type GenerationConfig } from '@google/generative-ai';
import OpenAI from 'openai';
import type {
  PersonaError,
  PersonaPromptDefinition,
  PersonaPromptInput,
  PersonaResult,
} from '../../types';

export const PERSONA_V2_FALLBACK_TEXT =
  '지금은 모델 응답을 바로 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.';

type ProviderName = 'anthropic' | 'gemini' | 'openai' | 'none';

type ProviderResult = {
  provider: ProviderName;
  model: string | null;
  text?: string;
  error?: PersonaError;
};

let anthropicClient: Anthropic | null = null;
let geminiClient: GoogleGenerativeAI | null = null;
let openaiClient: OpenAI | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });
  }
  return anthropicClient;
}

function getGeminiClient(): GoogleGenerativeAI {
  if (!geminiClient) {
    geminiClient = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY || '');
  }
  return geminiClient;
}

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
  }
  return openaiClient;
}

function buildStructuredError(
  code: PersonaError['code'],
  message: string,
  provider: ProviderName,
  model: string | null,
  retryable: boolean,
): PersonaError {
  return { code, message, provider, model, retryable };
}

async function callAnthropic(prompt: string): Promise<ProviderResult> {
  const model = process.env.PERSONAX_V2_ANTHROPIC_MODEL || 'claude-haiku-4-5';
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      provider: 'anthropic',
      model,
      error: buildStructuredError('missing_api_key', 'ANTHROPIC_API_KEY is not set.', 'anthropic', model, false),
    };
  }

  try {
    const response = await getAnthropicClient().messages.create({
      model,
      max_tokens: 900,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    if (!text) {
      return {
        provider: 'anthropic',
        model,
        error: buildStructuredError('empty_response', 'Anthropic returned an empty response.', 'anthropic', model, true),
      };
    }

    return { provider: 'anthropic', model, text };
  } catch (error) {
    return {
      provider: 'anthropic',
      model,
      error: buildStructuredError(
        'provider_error',
        error instanceof Error ? error.message : 'Anthropic request failed.',
        'anthropic',
        model,
        true,
      ),
    };
  }
}

async function callGemini(prompt: string): Promise<ProviderResult> {
  const model = process.env.PERSONAX_V2_GEMINI_MODEL || process.env.GEMINI_PRIMARY_MODEL || 'gemini-2.5-flash';
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return {
      provider: 'gemini',
      model,
      error: buildStructuredError(
        'missing_api_key',
        'GOOGLE_GENERATIVE_AI_API_KEY is not set.',
        'gemini',
        model,
        false,
      ),
    };
  }

  try {
    const response = await getGeminiClient()
      .getGenerativeModel({ model })
      .generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 900,
          thinkingConfig: { thinkingBudget: 0 },
        } as GenerationConfig,
      });
    const text = response.response.text().trim();

    if (!text) {
      return {
        provider: 'gemini',
        model,
        error: buildStructuredError('empty_response', 'Gemini returned an empty response.', 'gemini', model, true),
      };
    }

    return { provider: 'gemini', model, text };
  } catch (error) {
    return {
      provider: 'gemini',
      model,
      error: buildStructuredError(
        'provider_error',
        error instanceof Error ? error.message : 'Gemini request failed.',
        'gemini',
        model,
        true,
      ),
    };
  }
}

async function callOpenAI(prompt: string): Promise<ProviderResult> {
  const model = process.env.PERSONAX_V2_OPENAI_MODEL || 'gpt-4.1-mini';
  if (!process.env.OPENAI_API_KEY) {
    return {
      provider: 'openai',
      model,
      error: buildStructuredError('missing_api_key', 'OPENAI_API_KEY is not set.', 'openai', model, false),
    };
  }

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model,
      temperature: 0.6,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.choices[0]?.message?.content?.trim() || '';

    if (!text) {
      return {
        provider: 'openai',
        model,
        error: buildStructuredError('empty_response', 'OpenAI returned an empty response.', 'openai', model, true),
      };
    }

    return { provider: 'openai', model, text };
  } catch (error) {
    return {
      provider: 'openai',
      model,
      error: buildStructuredError(
        'provider_error',
        error instanceof Error ? error.message : 'OpenAI request failed.',
        'openai',
        model,
        true,
      ),
    };
  }
}

async function callProvider(prompt: string): Promise<ProviderResult> {
  const attempts = [callAnthropic, callGemini, callOpenAI];
  let lastResult: ProviderResult | null = null;

  for (const attempt of attempts) {
    const result = await attempt(prompt);
    if (result.text) {
      return result;
    }
    lastResult = result;
    if (result.error?.code !== 'missing_api_key') {
      return result;
    }
  }

  return (
    lastResult || {
      provider: 'none',
      model: null,
      error: buildStructuredError('missing_api_key', 'No LLM API key is configured.', 'none', null, false),
    }
  );
}

function trimLeadingLabel(personaName: string, text: string): string {
  const labelPattern = new RegExp(`^${personaName}\\s*[:：-]\\s*`, 'i');
  return text.replace(labelPattern, '').trim();
}

export async function generatePersonaText(
  definition: PersonaPromptDefinition,
  input: PersonaPromptInput,
): Promise<PersonaResult> {
  const prompt = definition.buildPrompt(input);
  const providerResult = await callProvider(prompt);

  if (providerResult.text) {
    return {
      personaId: definition.personaId,
      text: trimLeadingLabel(definition.displayName, providerResult.text),
      mode: 'live',
      metadata: {
        provider: providerResult.provider,
        model: providerResult.model,
      },
    };
  }

  return {
    personaId: definition.personaId,
    text: PERSONA_V2_FALLBACK_TEXT,
    mode: 'fallback',
    error: providerResult.error,
    metadata: {
      provider: providerResult.provider,
      model: providerResult.model,
    },
  };
}
