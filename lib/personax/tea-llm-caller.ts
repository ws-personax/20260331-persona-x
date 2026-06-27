import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI, type GenerationConfig, type Tool } from '@google/generative-ai';
import type { TeaMsg, TeaPersonaKey } from '@/lib/personax/tea-history';
import { removeDangsin, sleep } from '@/lib/personax/utils';

const TEA_GEMINI_PRIMARY_MODEL = process.env.GEMINI_PRIMARY_MODEL || 'gemini-2.5-flash';
const TEA_GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.5-flash';
const TEA_GEMINI_FALLBACK_CHAIN: string[] = Array.from(
  new Set([TEA_GEMINI_PRIMARY_MODEL, TEA_GEMINI_FALLBACK_MODEL, 'gemini-2.0-flash']),
);
const TEA_RETRY_DELAY_MS = 500;

const getModelTimeoutMs = (modelName: string): number => {
  return modelName.toLowerCase().includes('pro') ? 60_000 : 30_000;
};

const isRetriableModelError = (err: unknown): boolean => {
  const anyErr = err as { status?: number; message?: string };
  if (anyErr?.status === 503 || anyErr?.status === 429) return true;
  const msg = (anyErr?.message || '').toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('429') ||
    msg.includes('overloaded') ||
    msg.includes('unavailable') ||
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('timeout')
  );
};

const teaGenAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY || '');
const CLAUDE_PRIMARY_MODEL = 'claude-haiku-4-5';
const CLAUDE_TIMEOUT_MS = 30_000;
const anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });

const toAnthropicMessages = (history: TeaMsg[]): Anthropic.MessageParam[] => {
  const raw: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));
  while (raw.length > 0 && raw[0].role !== 'user') raw.shift();
  while (raw.length > 0 && raw[raw.length - 1].role !== 'user') raw.pop();
  return raw;
};

const callClaudeHaiku = async (
  persona: TeaPersonaKey,
  system: string,
  history: TeaMsg[],
): Promise<string | null> => {
  const tag = `[tea:${persona}:claude]`;
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(`${tag} ANTHROPIC_API_KEY 미설정 → Gemini 폴백`);
    return null;
  }
  if (history.length === 0) {
    console.warn(`${tag} 히스토리 0 → Gemini 폴백`);
    return null;
  }
  const messages = toAnthropicMessages(history);
  if (messages.length === 0) {
    console.warn(`${tag} messages 무효 → Gemini 폴백`);
    return null;
  }
  try {
    const response = await Promise.race([
      anthropicClient.messages.create({
        model: CLAUDE_PRIMARY_MODEL,
        max_tokens: 1200,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${CLAUDE_PRIMARY_MODEL} timeout after ${CLAUDE_TIMEOUT_MS}ms`)), CLAUDE_TIMEOUT_MS),
      ),
    ]);
    if (response.stop_reason === 'refusal') {
      console.warn(`${tag} ${CLAUDE_PRIMARY_MODEL} refusal → Gemini 폴백`);
      return null;
    }
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    if (!text) {
      console.warn(`${tag} ${CLAUDE_PRIMARY_MODEL} 빈 응답 (stop_reason=${response.stop_reason}) → Gemini 폴백`);
      return null;
    }
    return text;
  } catch (err) {
    const anyErr = err as Error & { status?: number };
    if (err instanceof Anthropic.APIError) {
      console.error(`${tag} ${CLAUDE_PRIMARY_MODEL} APIError status=${anyErr.status} → Gemini 폴백`, anyErr.message);
    } else if (err instanceof Error) {
      console.error(`${tag} ${CLAUDE_PRIMARY_MODEL} 호출 실패 (${err.name}) → Gemini 폴백:`, err.message);
    } else {
      console.error(`${tag} ${CLAUDE_PRIMARY_MODEL} 호출 실패 (unknown) → Gemini 폴백:`, err);
    }
    return null;
  }
};

const toGeminiContents = (history: TeaMsg[]) => {
  type G = { role: 'user' | 'model'; parts: { text: string }[] };
  const raw: G[] = history.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  while (raw.length > 0 && raw[0].role !== 'user') raw.shift();
  while (raw.length > 0 && raw[raw.length - 1].role !== 'user') raw.pop();
  const merged: G[] = [];
  for (const item of raw) {
    const last = merged[merged.length - 1];
    if (last && last.role === item.role) {
      last.parts[0].text = `${last.parts[0].text}\n\n${item.parts[0].text}`;
    } else {
      merged.push({ role: item.role, parts: [{ text: item.parts[0].text }] });
    }
  }
  return merged;
};

export const callTeaPersona = async (
  persona: TeaPersonaKey,
  system: string,
  history: TeaMsg[],
  options?: { enableSearch?: boolean },
): Promise<string | null> => {
  const tag = `[tea:${persona}]`;

  if (!options?.enableSearch) {
    const claudeResult = await callClaudeHaiku(persona, system, history);
    if (claudeResult) return removeDangsin(claudeResult);
  }

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.warn(`${tag} GOOGLE_GENERATIVE_AI_API_KEY 미설정 → 템플릿 폴백`);
    return null;
  }
  if (history.length === 0) {
    console.warn(`${tag} 히스토리 0 → 템플릿 폴백`);
    return null;
  }
  const contents = toGeminiContents(history);
  if (contents.length === 0 || contents[contents.length - 1].role !== 'user') {
    console.warn(`${tag} contents 무효 (length=${contents.length}) → 템플릿 폴백`);
    return null;
  }

  const searchTools: Tool[] | undefined = options?.enableSearch
    ? ([{ googleSearch: {} }] as unknown as Tool[])
    : undefined;

  for (let i = 0; i < TEA_GEMINI_FALLBACK_CHAIN.length; i++) {
    const modelName = TEA_GEMINI_FALLBACK_CHAIN[i];
    const nextModel = TEA_GEMINI_FALLBACK_CHAIN[i + 1];
    try {
      const model = teaGenAI.getGenerativeModel({
        model: modelName,
        systemInstruction: system,
        ...(searchTools ? { tools: searchTools } : {}),
      });
      const timeoutMs = getModelTimeoutMs(modelName);
      const result = await Promise.race([
        model.generateContent({
          contents,
          generationConfig: {
            maxOutputTokens: 1200,
            temperature: 0.7,
            thinkingConfig: { thinkingBudget: 0 },
          } as GenerationConfig,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`${modelName} timeout after ${timeoutMs}ms`)), timeoutMs),
        ),
      ]);
      const blockReason = result?.response?.promptFeedback?.blockReason;
      if (blockReason) {
        console.warn(`${tag} ${modelName} 차단됨 — blockReason=${blockReason} → 템플릿 폴백`);
        return null;
      }
      const finishReason = result?.response?.candidates?.[0]?.finishReason;
      let text = '';
      try {
        text = result?.response?.text?.() || '';
      } catch (e) {
        console.error(`${tag} ${modelName} text() 추출 실패 (finishReason=${finishReason}) — full error:`, e);
        if (e instanceof Error) {
          console.error(`${tag} ${modelName} text() 추출 실패 — name=${e.name}, message=${e.message}, stack=${e.stack}`);
        }
        return null;
      }
      if (!text.trim()) {
        console.warn(`${tag} ${modelName} 빈 응답 (finishReason=${finishReason}) → 템플릿 폴백`);
        return null;
      }
      return removeDangsin(text.trim());
    } catch (err) {
      const retriable = isRetriableModelError(err);
      const anyErr = err as Error & { status?: number; statusText?: string; errorDetails?: unknown; response?: unknown };
      console.error(`${tag} ${modelName} 호출 오류 — full error object:`, err);
      if (err instanceof Error) {
        console.error(
          `${tag} ${modelName} 호출 오류 — name=${err.name}, message=${err.message}, status=${anyErr.status ?? 'n/a'}`,
        );
        if (anyErr.errorDetails !== undefined) {
          console.error(`${tag} ${modelName} errorDetails:`, anyErr.errorDetails);
        }
      } else {
        try {
          console.error(`${tag} ${modelName} 호출 오류 (non-Error) JSON:`, JSON.stringify(err));
        } catch {
          /* ignore */
        }
      }
      if (!retriable) {
        console.error(`${tag} ${modelName} 재시도 불가 오류 → 템플릿 폴백`);
        return null;
      }
      if (nextModel) {
        console.warn(`${tag} ${modelName} 실패 → ${nextModel} 시도 (${TEA_RETRY_DELAY_MS}ms 대기)`);
        await sleep(TEA_RETRY_DELAY_MS);
        continue;
      }
      console.error(`${tag} ${modelName} 실패 — 폴백 체인 소진 → 템플릿 폴백`);
      return null;
    }
  }
  return null;
};
