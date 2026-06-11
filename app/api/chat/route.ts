import { fetchInvestmentNews } from '@/lib/news';
import { allocatePersonaNews, filterInvestmentNews } from '@/lib/personax/news-allocation';
import {
  appendMarketDataSourceLabel,
  getMarketDataSourceLabelForGuard,
  hasMarketDataForGuard,
} from '@/lib/personax/market-data-label';
import type { NextRequest } from 'next/server';
import { GoogleGenerativeAI, type GenerationConfig, type Tool } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';

// ✅ 분리된 모듈 import
import type { Verdict } from '@/lib/personax/types';
import {
  safeNum, fmtPrice, DISCLAIMER,
  getVolumeInfo, getVolatility, getPricePos, getNewsData,
  calcScores, getPositionSizing, buildEntryCondition,
  extractConditionPrices, parsePriceToNumber, buildDataSourceLabel,
  detectMarketSituation, analyzeTrendContext, determineWatchLevel, detectPersonaConflict,
} from '@/lib/personax/scoring';
import {
  CRYPTO_MAP, STOCK_MAP, KEYWORD_PRIORITY,
  MARKET_KEYWORD_MAP, inferCurrency, extractKeyword, fetchMarketPrice,
  getSector,
} from '@/lib/personax/market';
import { buildMarketSessionLabels } from '@/lib/personax/market-session-label';
import { cleanEchoSelfReference, cleanJackEnding, detectStage3GuardViolations } from '@/lib/personax/guards';
import { buildJackText, buildLuciaText, buildEchoText, ECHO_TAIL } from '@/lib/personax/templates';
import type { DiscussMode, IndicatorFlags, PrevContext } from '@/lib/personax/templates';

// ✅ 차 한잔 탭 페르소나별 시스템 프롬프트 (분리된 파일)
import { TEA_SYSTEM_LUCIA } from './prompts/tea-lucia';
import { TEA_SYSTEM_JACK } from './prompts/tea-jack';
import { TEA_SYSTEM_ECHO } from './prompts/tea-echo';
import { TEA_SYSTEM_RAY } from './prompts/tea-ray';
import {
  detectPersonaOrderHybrid,
  buildCategoryVocabBlockRule,
  buildTaggedRound2SystemPrompt,
  buildTaggedRound2UserPrompt,
  parseTaggedRound2,
  type TaggedRound1Result,
  type TaggedRound2Result,
} from './prompts/orchestrator-tagged';
import {
  detectCategoryV3,
  detectEmotionalSubtypeHee,
  detectLegacyCategory,
  type CategoryV3,
} from '@/lib/personax/classifier';
import { hasExplicitConnector } from '@/lib/personax/routing-context';
import {
  routeMessage,
  runRoutedRequest,
  enforceOrder,
  type RouterDecision,
  type LLMCaller,
  type TaggedPersonaKey,
} from '@/lib/personax/message-router';
import {
  chunkText,
  cleanText,
  firstParagraph,
  removeDangsin,
  sleep,
  summarize,
  toPromptOrder,
} from '@/lib/personax/utils';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { cleanAdvanced, cleanNews, splitForBubble } from '@/lib/personax/text-format';
import {
  applyPersonaFallback,
  buildSoloEchoFollowup,
  HEE_FALLBACK,
  PERSONA_FALLBACK,
} from '@/lib/personax/fallbacks';
import { saveHistory, saveTeaConversation } from '@/lib/personax/history';
import { buildPriorRayResponse, buildRecentFinanceContext, detectTargetedPersona } from '@/lib/personax/finance-context';
import { buildTeaHistory, type TeaMsg, type TeaPersonaKey } from '@/lib/personax/tea-history';
import { buildTeaFallbacks, selectTeaPersona } from '@/lib/personax/tea-fallbacks';
import { resolveChatSession } from '@/lib/personax/auth';
import {
  detectQuestionType,
  applyResponseGuard,
} from '@/lib/personax/response-guard';
import { buildMarketDataPromptContext } from '@/lib/personax/market-data';
import {
  buildOptionDMemoryContext as buildOptionDMemoryContextFromSession,
  createChatSessionResolver,
} from '@/lib/personax/chat-memory-context';
import { getAdminSupabase, saveUnifiedConversation } from '@/lib/personax/chat-persistence';
import type { DecisionSummary } from '@/lib/personax/decision-summary';
import { buildRound2ContextFromMessages } from '@/lib/personax/finance-round2-context';
import { mapLegacyEchoRound2, mapOrderedRound1 } from '@/lib/personax/streaming';
import { streamPersonaTagged } from '@/lib/personax/stream-persona-events';
import { streamRespond, type StreamEvent } from '@/lib/personax/stream-response';
import { tryBuildMarketQuickResponse } from '@/lib/personax/market-quick-handlers';
import {
  buildFinalRay,
  buildJackDetail,
  buildLuciaDetail,
  normalizeNoMarketDataInvestmentPersonaText,
  buildRayDetail,
  buildStockDetailResponse,
} from '@/lib/personax/stock-response-builders';
import {
  createFallbackDebatePlan,
  parseDebatePlanJson,
  type DebatePersona,
  type DebatePlan,
  type DebatePlanPriorContext,
} from '@/lib/personax/debate-plan';

// ✅ Feature Flag — Router/3단계 호출/ECHO 선택/LUCIA 프레이밍 단계별 활성화
// router만 우선 활성화. 나머지는 다음 단계에서 켠다.
const FEATURES = {
  router: true,
  threeStageCall: false,
  echoOptional: false,
  luciaFraming: false,
} as const;

// ✅ 재테크 탭 고급 질문 — 4명 페르소나 투자 철학 프롬프트
import { ADVANCED_SYSTEM_RAY } from './prompts/advanced-ray';
import { ADVANCED_SYSTEM_JACK } from './prompts/advanced-jack';
import { ADVANCED_SYSTEM_LUCIA } from './prompts/advanced-lucia';
import { ADVANCED_SYSTEM_ECHO } from './prompts/advanced-echo';

export const maxDuration = 60;

// ─────────────────────────────────────────────
// ✅ 차 한잔(teaMode) 전용 — Gemini Flash LLM 호출
//   재테크 탭과 완전히 분리 (import/사용처 전부 teaMode 블록 안에서만)
//   기존 GOOGLE_GENERATIVE_AI_API_KEY 재사용. LLM 실패 시 호출부에서
//   기존 템플릿으로 폴백.
// ─────────────────────────────────────────────
// ✅ Pro/Flash 이중 폴백 구조
//   Primary: Gemini 2.5 Pro (느리지만 페르소나 지시 준수율 높음, 60초 타임아웃)
//   Fallback: Gemini 2.5 Flash → 2.0 Flash (빠른 폴백, 30초 타임아웃)
const TEA_GEMINI_PRIMARY_MODEL = process.env.GEMINI_PRIMARY_MODEL || 'gemini-2.5-flash';
const TEA_GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.5-flash';
const TEA_GEMINI_FALLBACK_CHAIN: string[] = Array.from(
  new Set([TEA_GEMINI_PRIMARY_MODEL, TEA_GEMINI_FALLBACK_MODEL, 'gemini-2.0-flash']),
);
// 모델별 타임아웃 — Pro는 60초, Flash는 30초
const getModelTimeoutMs = (modelName: string): number => {
  return modelName.toLowerCase().includes('pro') ? 60_000 : 30_000;
};
const TEA_RETRY_DELAY_MS = 500;
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

// ─────────────────────────────────────────────
// ✅ Claude Haiku 4.5 — Primary 모델 (Anthropic SDK)
//   - 오케스트레이터 1차 호출 대상. 실패/타임아웃 시 Gemini Flash 폴백.
//   - 검색(Google Search grounding) 요청은 Gemini로 우회 (Claude는 web_search 비활성).
// ─────────────────────────────────────────────
const CLAUDE_PRIMARY_MODEL = 'claude-haiku-4-5';
const CLAUDE_TIMEOUT_MS = 30_000;
const anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });

const toAnthropicMessages = (history: TeaMsg[]): Anthropic.MessageParam[] => {
  const raw: Anthropic.MessageParam[] = history.map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));
  // 반드시 user로 시작
  while (raw.length > 0 && raw[0].role !== 'user') raw.shift();
  // 마지막은 user로 끝나야 응답 받음
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
        // 페르소나 시스템 프롬프트는 호출마다 동일 → 프롬프트 캐싱으로 비용/지연 절감
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
      .map(b => b.text)
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
      console.error(`${tag} ${CLAUDE_PRIMARY_MODEL} APIError status=${anyErr.status} → Gemini 폴백`, err.message);
    } else if (err instanceof Error) {
      console.error(`${tag} ${CLAUDE_PRIMARY_MODEL} 호출 실패 (${err.name}) → Gemini 폴백:`, err.message);
    } else {
      console.error(`${tag} ${CLAUDE_PRIMARY_MODEL} 호출 실패 (unknown) → Gemini 폴백:`, err);
    }
    return null;
  }
};

// Gemini contents 형식으로 변환.
//   - role: 'user' → 'user', 'assistant' → 'model'
//   - contents 는 반드시 'user' 역할로 시작해야 하므로 앞의 model 턴을 제거.
//   - consecutive same-role 은 줄바꿈으로 병합 (Gemini 는 strict alternation 요구).
//   - 마지막이 model 이면 꼬리를 잘라 user 로 끝나도록 (Gemini 는 마지막 user 만 응답).
const toGeminiContents = (history: TeaMsg[]) => {
  type G = { role: 'user' | 'model'; parts: { text: string }[] };
  const raw: G[] = history.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  // 선두의 model 턴 제거 (user 시작 요구)
  while (raw.length > 0 && raw[0].role !== 'user') raw.shift();
  // 마지막이 model 이면 뒤로부터 잘라서 user 로 끝나게
  while (raw.length > 0 && raw[raw.length - 1].role !== 'user') raw.pop();
  // consecutive same-role 병합
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

// ─────────────────────────────────────────────
// ✅ '당신' 호칭 후처리 필터
//   LLM이 가끔 '당신은/이/의/을/...'로 화자를 가리키는데,
//   PersonaX는 친근한 1인칭 대화체 톤이 핵심이라 호칭을 통째로 제거.
//   조사별 패턴을 먼저 제거하고, 단독 '당신'(앞뒤 공백 포함)도 정리.
//   JSON 응답(오케스트레이터)에도 안전 — JSON 문법 문자(",{,} 등)와 충돌 없음.
// ─────────────────────────────────────────────
const callTeaPersona = async (
  persona: TeaPersonaKey,
  system: string,
  history: TeaMsg[],
  options?: { enableSearch?: boolean },
): Promise<string | null> => {
  const tag = `[tea:${persona}]`;

  // ✅ Primary: Claude Haiku 4.5 (검색 비요청 시에만)
  //   검색 grounding이 필요한 호출은 Gemini googleSearch tool로 직접 우회.
  if (!options?.enableSearch) {
    const claudeResult = await callClaudeHaiku(persona, system, history);
    if (claudeResult) return removeDangsin(claudeResult);
    // Claude 실패 → Gemini Flash 폴백으로 진행
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
  // ✅ Gemini 2.5 Google Search grounding — 시사/실시간 정보 질문에만 선택 적용 (비용 통제)
  //    SDK Tool 타입에 googleSearch 필드가 아직 노출되지 않아 unknown 캐스팅 사용.
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
      // ✅ 모델별 타임아웃 — Pro 60s / Flash 30s (Promise.race로 강제 컷)
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
        try { console.error(`${tag} ${modelName} 호출 오류 (non-Error) JSON:`, JSON.stringify(err)); } catch { /* ignore */ }
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

// ─────────────────────────────────────────────
// ✅ 단일 호출 태그 기반 오케스트레이터 (1라운드 / 2라운드 분리)
//   1라운드: [FIRST] [SECOND] [THIRD] [ECHO_QUESTION]
//   2라운드: [FIRST_2] [SECOND_2] [THIRD_2] [ECHO_FINAL]
//   하이브리드 순서: 감정 키워드 감지 시 LUCIA 먼저, 아니면 카테고리 기반.
// ─────────────────────────────────────────────
type OptionDRound1Result = TaggedRound1Result & {
  closerContent?: string;
  closerKey?: TaggedPersonaKey;
  soloContent?: string;
  soloKey?: TaggedPersonaKey;
  decisionSummary?: DecisionSummary;
  decisionType?: string;
  /** [LUCIA_CLOSE] 액자 구조 — 감정/복합 카테고리 전용 별도 LUCIA 버블 */
  luciaClose?: string;
  /** Stage 1+2 캐시 — 품질 가드 위반 시 Stage 3만 재호출하는 데 사용 (full 경로만 존재) */
  _stage12Cache?: {
    dataPack: string;
    personaViews: string;
  };
};

// callOptionD는 runRoutedRequest로 흡수됨.
// route.ts는 LLM 호출자(callTeaPersona)를 주입하는 얇은 wrapper만 유지.
async function callOptionD(
  messages: Array<{ role?: string; content?: string }>,
  category: string,
  lastMessage: string,
  order: TaggedPersonaKey[],
  categoryV3?: CategoryV3,
  firstPersona?: import('./prompts/orchestrator-tagged').AllPersonaKey,
  hasPriorConversation: boolean = false,
  closerPersona?: import('./prompts/orchestrator-tagged').AllPersonaKey,
  soloPersona?: import('./prompts/orchestrator-tagged').AllPersonaKey,
  precomputedStages?: { dataPack: string; personaViews: string },
  marketDataPromptContext?: string,
  memoryContext?: string,
): Promise<OptionDRound1Result | null> {
  const normalizedMessages = (messages || []).map((m) => ({
    role: m.role || '',
    content: m.content || '',
  }));
  // route.ts 호출 측이 이미 계산한 V3 결정을 그대로 RouterDecision으로 재구성.
  // 미전달 시 runRoutedRequest 내부 routeMessage 호출 폴백 (구간 안전망).
  const router: RouterDecision | undefined =
    categoryV3 && firstPersona && closerPersona
      ? routeMessage(normalizedMessages, lastMessage, category)
      : undefined;
  // 상위 호출자가 V3 정렬한 order를 사용 (news/life 등 다른 경로와의 일관성을 위해).
  if (router) {
    router.categoryV3 = categoryV3 ?? router.categoryV3;
    router.firstPersona = firstPersona ?? router.firstPersona;
    router.closerPersona = closerPersona ?? router.closerPersona;
    router.hasPriorConversation = hasPriorConversation;
    router.order = order;
    router.legacyCategory = category;
  }
  const llmCaller: LLMCaller = (persona, sys, history, opts) =>
    callTeaPersona(
      persona as TeaPersonaKey,
      sys,
      history as TeaMsg[],
      opts,
    );
  return runRoutedRequest(llmCaller, {
    messages: normalizedMessages,
    lastMessage,
    router,
    soloPersona,
    precomputedStages,
    marketDataPromptContext,
    memoryContext,
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Stage 3 응답 품질 가드 — 다음 두 조건 감지 시 1회 callOptionD 재호출.
//   1) JACK 발화에 ~요로 끝나는 문장 — JACK은 짧고 강한 ~다/~입니다만 허용
//   2) ECHO 발화에 "ECHO는/가" / "에코는/가" 자기 3인칭 언급
// 재생성도 위반이면 재생성 결과를 그대로 사용 (LLM 한 번 더 기회 부여 의미).
// ──────────────────────────────────────────────────────────────────────────
async function callOptionDWithStage3Guard(
  messages: Array<{ role?: string; content?: string }>,
  category: string,
  lastMessage: string,
  order: TaggedPersonaKey[],
  categoryV3?: CategoryV3,
  firstPersona?: import('./prompts/orchestrator-tagged').AllPersonaKey,
  hasPriorConversation: boolean = false,
  closerPersona?: import('./prompts/orchestrator-tagged').AllPersonaKey,
  soloPersona?: import('./prompts/orchestrator-tagged').AllPersonaKey,
  marketDataPromptContext?: string,
  memoryContext?: string,
): Promise<OptionDRound1Result | null> {
  // 희(喜) 모드 감지 — emotional + 좋은 소식 키워드. RAY/JACK 금지어휘 가드 활성화 조건.
  const isHeeMode =
    categoryV3 === 'emotional' && detectEmotionalSubtypeHee(lastMessage);

  const first = await callOptionD(
    messages, category, lastMessage, order, categoryV3, firstPersona,
    hasPriorConversation, closerPersona, soloPersona, undefined, marketDataPromptContext, memoryContext,
  );
  if (!first) return first;

  const reasons = detectStage3GuardViolations(first, order, isHeeMode);
  if (reasons.length === 0) return first;

  // Stage 1+2 캐시 재사용 — Stage 3(GPT-4o-mini)만 재호출.
  // full 경로면 _stage12Cache 존재, solo 경로면 없음 → 없으면 전체 재호출로 폴백.
  const cache = (first as OptionDRound1Result)._stage12Cache;
  if (cache) {
    console.warn('[stage3-guard] 위반 감지 → Stage 3만 재호출 (Stage 1+2 캐시 재사용):', reasons.join(', '));
    const retry = await callOptionD(
      messages, category, lastMessage, order, categoryV3, firstPersona,
      hasPriorConversation, closerPersona, soloPersona, cache, marketDataPromptContext, memoryContext,
    );
    if (!retry) {
      console.warn('[stage3-guard] 재생성 결과 null → 1차 결과 사용');
      return first;
    }
    const retryReasons = detectStage3GuardViolations(retry, order, isHeeMode);
    if (retryReasons.length > 0) {
      console.warn('[stage3-guard] 재생성도 위반:', retryReasons.join(', '), '— 재생성 결과 사용');
    }
    return retry;
  }

  // solo 경로 — Stages 1+2가 원래 없으므로 전체 재호출 (사실상 1개 LLM 호출만 재실행).
  console.warn('[stage3-guard] 위반 감지(solo) → 전체 재호출:', reasons.join(', '));
  const retry = await callOptionD(
    messages, category, lastMessage, order, categoryV3, firstPersona,
    hasPriorConversation, closerPersona, soloPersona, undefined, marketDataPromptContext, memoryContext,
  );
  if (!retry) {
    console.warn('[stage3-guard] 재생성 결과 null → 1차 결과 사용');
    return first;
  }
  const retryReasons = detectStage3GuardViolations(retry, order, isHeeMode);
  if (retryReasons.length > 0) {
    console.warn('[stage3-guard] 재생성도 위반(solo):', retryReasons.join(', '), '— 재생성 결과 사용');
  }
  return retry;
}

async function callTaggedRound2(
  userMessage: string,
  category: string,
  recentContext: string,
  order: TaggedPersonaKey[],
  round1: TaggedRound1Result,
  userAnswer: string,
  enableSearch: boolean,
): Promise<TaggedRound2Result | null> {
  try {
    const systemPrompt = buildTaggedRound2SystemPrompt();
    const userPrompt = buildTaggedRound2UserPrompt(userMessage, category, recentContext, toPromptOrder(order), round1, userAnswer);
    const llm = await callTeaPersona(
      'echo',
      systemPrompt,
      [{ role: 'user', content: userPrompt }],
      { enableSearch },
    );
    if (!llm) return null;
    return parseTaggedRound2(llm);
  } catch (e) {
    console.warn('[tagged-r2] 호출 실패', e);
    return null;
  }
}

// ─────────────────────────────────────────────
// ✅ parseChainedPersonas 제거 — Gemini 완전 제거로 불필요

// ─────────────────────────────────────────────
// INDEX_KEYWORDS — 히스토리 저장 제외
// ─────────────────────────────────────────────
const INDEX_KEYWORDS = new Set([
  '나스닥', 'NASDAQ', 'S&P500', 'S&P', 'SP500',
  '다우', '다우존스', '코스피', '코스닥', '한국 증시', '한국증시',
]);

// ✅ 지수/시장 키워드 — 투자 지시 제외 대상
const MARKET_INDEX_SET = new Set([
  '나스닥', 'NASDAQ', 'S&P500', 'S&P', 'SP500',
  '다우', '다우존스', '코스피', '코스닥', '한국 증시', '한국증시',
  '^IXIC', '^GSPC', '^DJI', '^KS11', '^KQ11',
]);

// ─────────────────────────────────────────────
// POST 핸들러
// ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // ✅ Gemini 제거됨 — API 키 불필요
  console.log('[chat request host]', {
    url: req.url,
    origin: req.nextUrl.origin,
    host: req.headers.get('host'),
    forwardedHost: req.headers.get('x-forwarded-host'),
    forwardedProto: req.headers.get('x-forwarded-proto'),
    hasCookieHeader: Boolean(req.headers.get('cookie')),
    hasKakaoCookie: Boolean(req.cookies.get('px_kakao_session')?.value),
  });

  // ✅ Rate Limit 체크 — IP당 1분 5회 초과 시 429 반환
  const clientIp = getClientIp(req);
  if (!checkRateLimit(clientIp)) {
    return new Response(
      JSON.stringify({ error: '요청이 너무 많아요. 잠시 후 다시 시도해주세요.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    const { messages, positionContext, teaMode, teaRound, teaPersona, isAdvancedQuestion, providerUserId: requestProviderUserId } = await req.json();
    const lastMsg = messages.at(-1)?.content || "";

    // ✅ LUCIA 허브 — 카테고리 감지 및 페르소나 라우팅

    const LUCIA_ROUTING_MESSAGE: Record<string, string> = {
      finance: '재테크 질문이시군요! RAY와 JACK이 전문가예요. 바로 연결해드릴게요. 📊',
      sports:  '스포츠 승부 예측은 JACK이 제일 잘해요! 연결해드릴게요. ⚡',
      news:    '시사/뉴스 분석은 RAY가 정리해드릴게요! 연결해드릴게요. 📰',
      life:    '인생 후반전 고민이시군요. RAY/JACK/LUCIA가 같이 짚어드리고, ECHO가 마지막에 정리해드릴게요. 🌿',
      legal:   '법률/세금 문제는 RAY와 ECHO가 함께 분석해드릴게요. 🔍',
      tech:    '기술/자동차 관련은 RAY가 데이터로 분석해드릴게요. 💡',
      emotion: '',
      general: '',
    };

    // ✅ LUCIA 허브 라우팅 결정 — teaMode 분기 이전 (모든 분기에서 공유)
    // ✅ V2 결함 #10 — 이전 카테고리 vs 현재 카테고리 비교
    //   마지막 메시지가 새 주제로 전환된 경우, recentContext를 약화시키기 위함.
    //   AND 로직: 카테고리 변경 + 연결어 없음 모두 충족 시만 약화 (마스터 결정 보정 — 짧음은 부수 정보).
    const _prevUserMsg = (messages as Array<{ role?: string; content?: string }>)
      .slice(0, -1)
      .reverse()
      .find((m) => m?.role === 'user')?.content || '';
    const prevCategory = _prevUserMsg ? detectLegacyCategory(_prevUserMsg) : null;
    const _prevCategoryV3 = _prevUserMsg ? detectCategoryV3(_prevUserMsg) : null;
    const category = detectLegacyCategory(lastMsg);
    const categoryChanged = !!(prevCategory && prevCategory !== category);
    const _hasConnector = hasExplicitConnector(lastMsg);
    // 맥락 약화 조건: 카테고리 변경 AND 연결어 없음 (진짜 신호는 명시 연결어, 짧음은 신뢰성 X)
    const shouldWeakenContext = categoryChanged && !_hasConnector;

    // ✅ Stage 0 단일 진입점 — routeMessage가 V3/FIRST/CLOSER/strategy/order 일괄 결정.
    //   FIRST=order[0], CLOSER=order[last] 코드 레벨 정렬은 routeMessage 내부에서 적용됨.
    const _routerDecision: RouterDecision = routeMessage(
      messages as Array<{ role: string; content: string }>,
      lastMsg,
      category,
    );
    const _categoryV3 = _routerDecision.categoryV3;
    const _firstPersonaV3 = _routerDecision.firstPersona;
    const _closerPersonaV3 = _routerDecision.closerPersona;
    const _hasPriorConversation = _routerDecision.hasPriorConversation;
    // 모든 응답 경로(news/life/finance/tagged)에 공통 적용되는 FIRST+CLOSER 정렬 헬퍼.
    // 기존 order 배열을 받아 enforceOrder를 그대로 호출.
    const _orderCategory = _routerDecision.category === 'invest' ? 'invest' : _categoryV3;
    const applyV3OrderOverride = (arr: TaggedPersonaKey[]): TaggedPersonaKey[] =>
      enforceOrder(arr, _firstPersonaV3, _closerPersonaV3, _orderCategory);
    const luciaRoutingMsg = LUCIA_ROUTING_MESSAGE[category];
    // ✅ 동일 카테고리 luciaIntro 중복 방지
    const _alreadyIntroduced = Array.isArray(messages) && (messages as Array<{
      role?: string;
      luciaIntro?: string;
    }>).some(m => {
      if (m?.role !== 'assistant' || !m?.luciaIntro) return false;
      const intro = m.luciaIntro;
      if (category === 'sports'  && intro.includes('JACK')) return true;
      if (category === 'news'    && intro.includes('RAY'))  return true;
      if (category === 'legal'   && intro.includes('ECHO')) return true;
      if (category === 'tech'    && intro.includes('RAY'))  return true;
      if (category === 'finance' && intro.includes('재테크')) return true;
      if (category === 'life'    && intro.includes('인생 후반전')) return true;
      return false;
    });
    // luciaIntro 주입 대상: finance/sports/legal/tech 만 (emotion/general 은 LUCIA 직접 처리)
    // ✅ life/news 카테고리는 LUCIA 인트로 주입 제외 (4페르소나 응답 자체가 라우팅 안내 역할)
    const _shouldInjectLuciaIntro =
      (category === 'sports' || category === 'legal' || category === 'tech')
      && !!luciaRoutingMsg
      && !_alreadyIntroduced;
    const respond = (body: unknown, init?: ResponseInit): Response => {
      if (
        _shouldInjectLuciaIntro &&
        body && typeof body === 'object' && !Array.isArray(body)
      ) {
        return Response.json({ ...(body as Record<string, unknown>), luciaIntro: luciaRoutingMsg }, init);
      }
      return Response.json(body as Parameters<typeof Response.json>[0], init);
    };

    const marketDataContextCache = new Map<string, Promise<string>>();
    const getOrBuildMarketDataContext = async (userMessage: string): Promise<string> => {
      if (!marketDataContextCache.has(userMessage)) {
        marketDataContextCache.set(
          userMessage,
          buildMarketDataPromptContext(userMessage),
        );
      }

      return await marketDataContextCache.get(userMessage) ?? '';
    };

    const getChatSession = createChatSessionResolver(req, requestProviderUserId);
    const buildOptionDMemoryContext = (categoryV3?: string | null) =>
      buildOptionDMemoryContextFromSession(getChatSession, categoryV3);

    // ✅ 페르소나별 순차 스트리밍 — 각 LLM 호출 완성 시점에 NDJSON 청크 1개씩 클라이언트로 전송
    const streamFallbackEvent: StreamEvent = {
      type: 'done',
      personas: {
        ray:   PERSONA_FALLBACK.ray,
        jack:  PERSONA_FALLBACK.jack,
        lucia: PERSONA_FALLBACK.lucia,
        echo:  PERSONA_FALLBACK.echo,
      },
      reply: PERSONA_FALLBACK.ray,
    };

    // ✅ 오케스트레이터 — multi-persona 분기 진입 전 토론 디렉터 LLM이 흐름을 결정
    //    질문 유형에 따라 페르소나 발언 순서/각도/충돌 쟁점/ECHO 지목 대상을 미리 지시한다.
    //    JSON 파싱 실패·LLM 실패 시 안전 기본값으로 폴백하므로 실패가 응답을 망가뜨리지 않는다.
    const runOrchestrator = async (
      msg: string,
      fallbackOrder: DebatePersona[] = ['ray', 'jack', 'lucia'],
      priorContext: DebatePlanPriorContext = {},
    ): Promise<DebatePlan> => {
      const hasPrior = !!(priorContext.recentSummary || priorContext.priorRayResponse);
      const fallback = createFallbackDebatePlan(fallbackOrder, priorContext);

      const priorBlock = hasPrior
        ? `\n[이전 대화 요약] ${priorContext.recentSummary || ''}\n[이전 RAY 응답] ${(priorContext.priorRayResponse || '').slice(0, 200)}\n`
        : '';

      const orchestratorPrompt = `당신은 PersonaX 토론 디렉터입니다.\n유저 질문: "${msg}"${priorBlock}\n\n아래 JSON만 출력하라. 다른 텍스트 절대 금지. 코드펜스도 금지.\n{\n  "order": ["ray","jack","lucia"],\n  "ray_angle": "RAY가 집중할 핵심 데이터 포인트 한 줄",\n  "jack_angle": "JACK이 반박할 허점 한 줄",\n  "lucia_angle": "LUCIA가 짚을 감정 포인트 한 줄",\n  "echo_target": "ray|jack|lucia 중 하나",\n  "echo_angle": "ECHO가 찌를 핵심 허점 한 줄",\n  "conflict_point": "RAY와 JACK이 직접 충돌할 핵심 쟁점 한 줄",\n  "ray_limit": "숫자 2개만. 핵심 지표명 명시.",\n  "lucia_limit": "3줄 이내. 마침표 종결.",\n  "is_followup": true|false,\n  "avoid_repeat": "이전 RAY가 이미 언급한 내용 한 줄 요약 — LUCIA·JACK 반복 금지용. 이전 대화 없으면 빈 문자열."\n}\n\norder 규칙:\n- 감정/인생 질문(명퇴·요양원·이혼·부모·죄책감·힘들·막막) → 첫 번째 lucia\n- 재테크/투자(주식·비트코인·삼성·ETF·PBR·매수·매도) → 첫 번째 ray\n- 결단/행동(해야 할까·결정·선택·지금 당장) → 첫 번째 jack\n- 시사/뉴스(전쟁·금리·환율·정치·경제뉴스) → 첫 번째 ray\n\necho_target 규칙:\n- RAY가 너무 냉정하게 숫자만 나열할 가능성 → ray\n- JACK이 근거 없이 밀어붙일 가능성 → jack\n- LUCIA가 감성으로만 흐를 가능성 → lucia\n- 셋 다 일치할 가능성 → 가장 자기 영역에서 약점이 큰 한 명\n\nis_followup 규칙:\n- "[이전 대화 요약]" 또는 "[이전 RAY 응답]" 블록이 위에 존재하거나, 질문이 "그럼/그러면/그건/그래서" 등으로 시작하면 true.\n- 그렇지 않으면 false.\n\navoid_repeat 규칙:\n- is_followup=true 일 때, 이전 RAY 응답에서 핵심 키워드/수치를 한 줄 요약해 LUCIA·JACK이 반복하지 않도록 가이드.\n- is_followup=false 면 빈 문자열.`;

      try {
        const llm = await callTeaPersona(
          'echo',
          'JSON 출력 머신. 다른 텍스트 금지. 코드펜스 금지. 반드시 { 로 시작 } 로 끝나는 JSON 한 덩어리만 출력.',
          [{ role: 'user', content: orchestratorPrompt }],
        );
        if (!llm) return fallback;
        return parseDebatePlanJson(llm, fallback);
      } catch (e) {
        console.warn('[orchestrator] 파싱 실패, 폴백 사용', e);
        return fallback;
      }
    };

    // ✅ finance/뉴스 카테고리에서 종목명 없는 일반 질문 — 4페르소나 병렬 응답 빌더
    //    RAY만 Google Search grounding 활성화(비용 통제), 나머지는 페르소나 톤만 적용.
    //    news 카테고리 블록과 별도 — news는 4명 모두 검색이 필요하지만 finance 일반 질문은
    //    RAY 사실 인용을 받아 JACK/LUCIA/ECHO 가 자기 톤으로 코멘트하는 구조.
    const buildFinanceMultiPersonaResponse = async (msg: string): Promise<Response> => {
      const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const yearNow = kstNow.getUTCFullYear();
      const monthNow = kstNow.getUTCMonth() + 1;
      const financePrefix = `[현재 시점: ${yearNow}년 ${monthNow}월 — 최신(${yearNow}년) 데이터·보도 기준으로 답변. 과거 인물·정책을 현재형으로 단정하지 말 것.]\n`;

      const recentContext = buildRecentFinanceContext(messages, shouldWeakenContext, _prevCategoryV3, _categoryV3);
      const ctxSuffix = recentContext
        ? `\n[직전 대화 주제: ${recentContext}]\n현재 질문: ${msg}`
        : `\n${msg}`;

      // 0단계: 오케스트레이터 — 토론 디렉터가 발언 순서/각도/충돌 쟁점/ECHO 지목 결정
      // 후속 질문 감지를 위해 직전 RAY 응답 한 줄 추출해 priorContext로 전달
      const priorRayResponse = buildPriorRayResponse(messages);
      const plan = await runOrchestrator(msg, ['ray', 'jack', 'lucia'], {
        recentSummary: recentContext,
        priorRayResponse,
      });
      const angleRay   = plan.ray_angle   ? `RAY 집중점: ${plan.ray_angle}.\n` : '';
      const angleJack  = plan.jack_angle  ? `JACK 집중점: ${plan.jack_angle}.\n` : '';
      const angleLucia = plan.lucia_angle ? `LUCIA 집중점: ${plan.lucia_angle}.\n` : '';
      const conflictPointLine = plan.conflict_point ? `핵심 충돌 쟁점: ${plan.conflict_point}.\n` : '';
      // is_followup / avoid_repeat 주입 — 후속 질문에서 페르소나 간 중복 발화 방지
      const followupClause = plan.is_followup ? '후속 질문이다. 이전 1라운드와 다른 각도로만 말하라.\n' : '';
      const avoidClause = (plan.is_followup && plan.avoid_repeat) ? `RAY가 이미 "${plan.avoid_repeat}" 언급함. 동일 내용 반복 금지.\n` : '';
      const rayLimitClause = plan.ray_limit ? ` ${plan.ray_limit}` : '';
      const luciaLimitClause = plan.lucia_limit ? ` ${plan.lucia_limit}` : '';

      // 1단계: RAY/JACK/LUCIA 병렬 (페르소나별 역할 prefix)
      // 공통 원칙 — 모든 페르소나 1라운드/2라운드 전체 적용
      const investmentRule = '공통 원칙: 직접 매수/매도 지시 절대 금지. "사세요" "파세요" "지금 당장 하세요" 표현 금지. 대신 조건부 판단 표현만 사용 — "~라면 고려해볼 수 있어요" / "~인 경우에는 ~도 방법이에요" / "~조건이면 ~구간이에요". 투자 판단과 책임은 본인에게 있음을 전제로 말할 것.';

      const conflictRule = '충돌 원칙: 다른 페르소나를 직접 지목해서 반박하라. RAY는 JACK의 직관을 숫자로 찌른다. JACK은 RAY의 데이터 해석을 현실로 반박한다. LUCIA는 두 사람이 싸우는 동안 유저 감정을 짚는다. 예시 — RAY: "JACK, 2022년부터 사지 말라고 했는데 그때 산 사람들이 지금 347% 수익이에요." JACK: "RAY, 그 숫자는 바닥에서 산 사람 기준이에요. 고점에 산 사람은 지금도 물려있어요." LUCIA: "두 분 싸우는 동안 이분 더 불안해지고 있어요."';

      const rayRound1Role   = '당신은 RAY입니다. 김상욱+레이달리오 스타일. 차분하고 건조하게. 데이터가 나올 때만 살아난다. 먼저 JACK의 주장 허점을 숫자로 직접 찌를 것. "JACK, ~" 형태로 시작해도 됨. 3줄 이내. 직접 매수/매도 지시 금지. 숫자는 딱 2개만. 2개 이상 나오면 응답 자체가 실패한 것이다. 첫 번째 숫자: JACK 주장을 반박하는 가장 강력한 숫자 1개. 두 번째 숫자: 결론을 뒷받침하는 숫자 1개. 세 번째 숫자가 나오려는 순간 멈춰라. PER·PBR·영업이익·외국인지분율·목표주가 중 가장 핵심 2개만 골라라. 응답 전에 숫자 개수를 세어라. 3개 이상이면 가장 약한 숫자를 지워라. 2개가 될 때까지 반복해라.';
      const jackRound1Role  = '당신은 JACK입니다. 마동석+피터린치 스타일. 말이 짧다. 투박하다. 틀려도 자신있다. 먼저 RAY 데이터 해석의 허점을 직접 찌를 것. "RAY, ~" 형태로 시작해도 됨. 과거 사례로 RAY 반박 + 조건부 결론. 3줄 이내. 직접 매수/매도 지시 금지.';
      const luciaRound1Role = '당신은 LUCIA입니다. 손예진+오은영 스타일. 존댓말이지만 딱딱하지 않다. 살짝 언니 느낌. RAY와 JACK이 싸우는 동안 유저 감정을 짚어라. 투자/시장 질문에서는 관계·상처·외로움·마음의 바닥·버림받음·사랑·인간관계식 표현 금지. 감정 공감은 손실 불안, 변동성으로 인한 판단 흔들림, 놓칠까 봐 서두르는 마음, 감당 가능한 손실 범위로만 제한하라. 가격 판단을 대신하지 말고 투자 판단이 흔들릴 수 있는 심리 요인을 짧게 짚어라. 반드시 조건부 표현만 사용하고, 사세요·파세요·매수 추천·매도 추천·손절하세요 같은 직접 행동 지시 금지. "두 분이 싸우는 동안 ~" 또는 "JACK, ~" 형태. 공감 1줄 + 근거(실제 투자자 사례/심리 연구) 1줄 + 조건부 결론 1줄. 이전 RAY나 JACK이 말한 내용을 그대로 반복하거나 요약하지 마라. 당신만의 감성적 관점으로만 말할 것. 질문 1개도 금지. 0개다. 마지막 문장은 반드시 마침표. "~하신 건가요?"·"~있으세요?"·"~인가요?"·"~건지"·"~건가요"·"~궁금" 으로 끝나는 문장 절대 금지. 첫 문장에 "아이고" 금지. "아이고"는 대화 전체에서 1회만, 감정이 폭발하는 순간에만 사용. "~잖아요"·"~거든요" 톤 유지. 3줄 이내. 절대 초과 금지.';

      const rayHistory:   TeaMsg[] = [{ role: 'user', content: `${financePrefix}${investmentRule}\n${conflictRule}\n${followupClause}${angleRay}${conflictPointLine}${rayRound1Role}${rayLimitClause}${ctxSuffix}` }];
      const jackHistory:  TeaMsg[] = [{ role: 'user', content: `${financePrefix}${investmentRule}\n${conflictRule}\n${followupClause}${avoidClause}${angleJack}${conflictPointLine}${jackRound1Role}${ctxSuffix}` }];
      const luciaHistory: TeaMsg[] = [{ role: 'user', content: `${financePrefix}${investmentRule}\n${conflictRule}\n${followupClause}${avoidClause}${angleLucia}${luciaRound1Role}${luciaLimitClause}${ctxSuffix}` }];

      // 스트리밍 모드 — 각 페르소나 LLM 완성 시 즉시 NDJSON 청크 전송
      return streamRespond(async (send) => {
        // ─────────────────────────────────────────────
        // ✅ 단일 호출 태그 기반 오케스트레이터 (1라운드 / 2라운드 분리)
        //   - 1라운드: [FIRST] [SECOND] [THIRD] [ECHO_QUESTION] (4개 태그)
        //   - 2라운드: [FIRST_2] [SECOND_2] [THIRD_2] [ECHO_FINAL] (4개 태그)
        //   - 하이브리드 순서: 감정 키워드 시 LUCIA 먼저, 아니면 카테고리 기반.
        //   - 라운드 분리는 teaRound 파라미터로 결정 (클라이언트가 메시지 수로 계산).
        // ─────────────────────────────────────────────
        const rawOrder = detectPersonaOrderHybrid(msg, category);
        // ✅ FIRST 페르소나 V3 강제 정렬 — 상위 helper 재사용
        const categoryV3Local = _categoryV3;
        const firstPersonaLocal = _firstPersonaV3;
        const order: TaggedPersonaKey[] = applyV3OrderOverride(rawOrder);
        // ✅ V3 invest 카테고리 + legacy finance/news 시 웹 검색 ON
        //    'stock' | 'crypto' | 'economy' 는 legacy detectCategory 반환값에 없어 데드 코드지만,
        //    화이트리스트 확장 가능성 고려해 주석으로 보존 (향후 detectCategory 보강 시 활성화).
        const enableSearchTagged =
          _routerDecision.categoryV3 === 'invest' ||
          category === 'finance' ||
          category === 'news';
          // || ['stock', 'crypto', 'economy'].includes(category)  // legacy dead branches — 보존
        const isRound1 = !teaRound || teaRound <= 1 || shouldWeakenContext;

        if (isRound1) {
          if (_routerDecision.strategy === 'solo' && _routerDecision.invokedPersona) {
            const optionDMessages = (messages as Array<{ role?: string; content?: string }>).slice(-1);
            const invoked = _routerDecision.invokedPersona;
            const marketDataPromptContext = await getOrBuildMarketDataContext(msg);
            // ✅ invokedPersona를 callOptionD에 명시 전달 — runRoutedRequest 내부의
            //   strict 검출(personaCall) 미스매치를 무시하고 solo 모드 강제.
            const soloResult = await callOptionDWithStage3Guard(
              optionDMessages,
              category,
              msg,
              order,
              categoryV3Local,
              firstPersonaLocal,
              _hasPriorConversation,
              _closerPersonaV3,
              invoked,
              marketDataPromptContext,
            );
            let reply = soloResult?.soloKey === invoked
              ? soloResult.soloContent || ''
              : '';
            // ✅ invoked persona 빈 응답 → non-invest 최소 fallback
            if (!reply.trim() && _categoryV3 !== 'invest') {
              const _isHeeSolo = _categoryV3 === 'emotional' && detectEmotionalSubtypeHee(msg);
              reply = (_isHeeSolo ? HEE_FALLBACK : PERSONA_FALLBACK)[invoked as TaggedPersonaKey];
            }
            await streamPersonaTagged(send, invoked, reply);
            const echoFollowup = invoked === 'echo' ? reply : buildSoloEchoFollowup(invoked);

            send({
              type: 'done',
              reply,
              personas: {
                ray: invoked === 'ray' ? reply : '',
                jack: invoked === 'jack' ? reply : '',
                lucia: invoked === 'lucia' ? reply : '',
                echo: echoFollowup,
                ray2: null, jack2: null, lucia2: null, echo2: null,
                order: [invoked],
                verdict: '관망',
                confidence: 0,
                breakdown: '재테크 일반',
                positionSizing: '0%',
                jackNews: null, luciaNews: null, rayNews: null, echoNews: null,
              },
            });
            return;
          }

          // ✅ 이전 질문 키워드 오염 차단 — Stage2/Stage3에는 현재 질문만 전달
          const optionDMessages = (messages as Array<{ role?: string; content?: string }>).slice(-1);
          const marketDataPromptContext = await getOrBuildMarketDataContext(msg);
          const memoryContext = (shouldWeakenContext || !_categoryV3)
            ? ''
            : await buildOptionDMemoryContext(_categoryV3);
          let r1: OptionDRound1Result | null = await callOptionDWithStage3Guard(
            optionDMessages,
            category,
            msg,
            order,
            categoryV3Local,
            firstPersonaLocal,
            _hasPriorConversation,
            _closerPersonaV3,
            undefined,
            marketDataPromptContext,
            memoryContext,
          );
          // ✅ callOptionD 빈 결과 시 폴백 완전 차단 — null/빈 객체여도 정상 done 경로로 강제 통과
          if (!r1) {
            console.warn('[optionD] null 반환 → 빈 결과 객체로 강제 통과 (폴백 차단)');
            r1 = { first: '', second: '', third: '', echoQuestion: '' };
          }
          if (r1) {
            const personaText = mapOrderedRound1(r1, order);

            // ✅ 빈 persona 보정 — LLM 파싱 실패로 빈 문자열 방어
            const _isHee = _categoryV3 === 'emotional' && detectEmotionalSubtypeHee(msg);
            applyPersonaFallback(personaText, _isHee);

            // invest 카테고리 필수 어휘 안전망 — 4명 응답에 '손절선'/'지지선' 둘 다 없으면
            //   ECHO 질문 끝에 손절선 가이드 1줄을 강제 부착. 프롬프트 규칙은 LLM이 무시할 수 있음.
            // hee+invest 복합 케이스도 포함: HEE 모드(emotional)지만 메시지에 투자 키워드가
            //   있으면 (예: "삼성전자로 처음 수익 났어요") 경사 + 투자 vocab 둘 다 필요.
            const _isHeeInvestComplex =
              _categoryV3 === 'emotional' &&
              detectEmotionalSubtypeHee(lastMsg) &&
              /삼성전자|SK하이닉스|테슬라|애플|엔비디아|코스피|코스닥|나스닥|비트코인|주식|종목|펀드|ETF|부동산|퇴직금|연금|코인|투자|수익/.test(lastMsg);
            if (_categoryV3 === 'invest' || _isHeeInvestComplex) {
              const allText = personaText.ray + personaText.jack + personaText.lucia + personaText.echo;
              if (!allText.includes('손절선') && !allText.includes('지지선')) {
                const fallback = '지금 손절선 정해놓으셨어요?';
                personaText.echo = personaText.echo
                  ? personaText.echo.trimEnd().replace(/[?。！!]$/, '') + ' ' + fallback
                  : fallback;
              }
            }
            const questionType = detectQuestionType(msg);
            const hasMarketData = await hasMarketDataForGuard(msg, questionType, getOrBuildMarketDataContext);
            const guardDebugBeforeText = Object.values(personaText).join('\n\n');
            console.log('[guard-debug] route before applyResponseGuard', {
              questionType,
              hasMarketData,
              length: guardDebugBeforeText.length,
              hasPriceLikeNumber: /\d{1,3}(,\d{3})+/.test(guardDebugBeforeText),
              sample: guardDebugBeforeText.slice(0, 300),
            });
            applyResponseGuard(personaText, questionType, hasMarketData);
            normalizeNoMarketDataInvestmentPersonaText(personaText, {
              userMessage: msg,
              questionType,
              hasMarketData,
              isInvestmentContext: _categoryV3 === 'invest' || _isHeeInvestComplex,
            });
            const guardDebugAfterText = Object.values(personaText).join('\n\n');
            console.log('[guard-debug] route after applyResponseGuard', {
              questionType,
              hasMarketData,
              length: guardDebugAfterText.length,
              lengthDelta: guardDebugAfterText.length - guardDebugBeforeText.length,
              hasPriceLikeNumber: /\d{1,3}(,\d{3})+/.test(guardDebugAfterText),
              sample: guardDebugAfterText.slice(0, 300),
            });
            if (hasMarketData) {
              appendMarketDataSourceLabel(
                personaText,
                await getMarketDataSourceLabelForGuard(msg, questionType, getOrBuildMarketDataContext),
              );
            }

            for (const key of order) {
              await streamPersonaTagged(send, key, personaText[key]);
            }

            try {
              const adminSupabase = getAdminSupabase();
              if (adminSupabase) {
                await adminSupabase.from('tea_logs').insert({
                  persona: 'ray',
                  turn_count: 1,
                  first_message: msg.slice(0, 100),
                  user_id: null,
                });
              }
            } catch (e) {
              console.warn('[tea:tagged-r1] 로그 저장 실패 (무시)', e);
            }

            await saveUnifiedConversation({
              getChatSession,
              category: _categoryV3 ?? 'general',
              title: msg,
              personaText,
              decisionSummary: r1.decisionSummary,
              decisionType: r1.decisionType,
            });

            send({
              type: 'done',
              reply: order.map((key) => personaText[key]).filter(Boolean).join('\n\n'),
              personas: {
                ray: personaText.ray,
                jack: personaText.jack,
                lucia: personaText.lucia,
                echo: personaText.echo,
                ray2: null, jack2: null, lucia2: null, echo2: null,
                order,
                verdict: '관망',
                confidence: 0,
                breakdown: '재테크 일반',
                positionSizing: '0%',
                jackNews: null, luciaNews: null, rayNews: null, echoNews: null,
                lucia_close: r1.decisionSummary ? null : (r1.luciaClose || null),
              },
            });
            return;
          }
          console.error('[tagged-r1] 파싱 실패 — done 응답');
          send({
            type: 'done',
            reply: '',
            personas: {
              ray: '', jack: '', lucia: '', echo: '',
              ray2: null, jack2: null, lucia2: null, echo2: null,
              order,
              verdict: '관망', confidence: 0, breakdown: '재테크 일반', positionSizing: '0%',
              jackNews: null, luciaNews: null, rayNews: null, echoNews: null,
            },
          });
          return;
        }

        // 2라운드 — 직전 어시스턴트 메시지에서 1라운드 컨텍스트 추출 + 직전 유저 답변 전달.
        const { priorOrder, priorRound1, priorUserQuestion } = buildRound2ContextFromMessages({
          messages,
          fallbackOrder: order,
          applyOrderOverride: applyV3OrderOverride,
          fallbackQuestion: msg,
        });

        const r2 = await callTaggedRound2(
          priorUserQuestion,
          category,
          recentContext,
          priorOrder,
          priorRound1,
          msg, // 직전 유저 메시지 = ECHO_QUESTION에 대한 답변
          enableSearchTagged,
        );

        if (r2) {
          const personaText2 = mapLegacyEchoRound2(r2, priorOrder);

          // ✅ 빈 persona 보정 — r2 경로
          const _isHee2 = _categoryV3 === 'emotional' && detectEmotionalSubtypeHee(msg);
          applyPersonaFallback(personaText2, _isHee2);
          const questionType = detectQuestionType(priorUserQuestion);
          const hasMarketData = await hasMarketDataForGuard(
            priorUserQuestion,
            questionType,
            getOrBuildMarketDataContext,
          );
          const guardDebugBeforeText2 = Object.values(personaText2).join('\n\n');
          console.log('[guard-debug] route r2 before applyResponseGuard', {
            questionType,
            hasMarketData,
            length: guardDebugBeforeText2.length,
            hasPriceLikeNumber: /\d{1,3}(,\d{3})+/.test(guardDebugBeforeText2),
            sample: guardDebugBeforeText2.slice(0, 300),
          });
          applyResponseGuard(personaText2, questionType, hasMarketData);
          normalizeNoMarketDataInvestmentPersonaText(personaText2, {
            userMessage: priorUserQuestion,
            questionType,
            hasMarketData,
            isInvestmentContext: _categoryV3 === 'invest',
          });
          const guardDebugAfterText2 = Object.values(personaText2).join('\n\n');
          console.log('[guard-debug] route r2 after applyResponseGuard', {
            questionType,
            hasMarketData,
            length: guardDebugAfterText2.length,
            lengthDelta: guardDebugAfterText2.length - guardDebugBeforeText2.length,
            hasPriceLikeNumber: /\d{1,3}(,\d{3})+/.test(guardDebugAfterText2),
            sample: guardDebugAfterText2.slice(0, 300),
          });
          if (hasMarketData) {
            appendMarketDataSourceLabel(
              personaText2,
              await getMarketDataSourceLabelForGuard(priorUserQuestion, questionType, getOrBuildMarketDataContext),
            );
          }

          for (const key of priorOrder) {
            await streamPersonaTagged(send, key, personaText2[key]);
          }

          try {
            const adminSupabase = getAdminSupabase();
            if (adminSupabase) {
              await adminSupabase.from('tea_logs').insert({
                persona: 'echo',
                turn_count: 2,
                first_message: msg.slice(0, 100),
                user_id: null,
              });
            }
          } catch (e) {
            console.warn('[tea:tagged-r2] 로그 저장 실패 (무시)', e);
          }

          await saveUnifiedConversation({
            getChatSession,
            category: _categoryV3 ?? 'general',
            title: msg,
            personaText: personaText2,
          });

          send({
            type: 'done',
            reply: priorOrder.map((key) => personaText2[key]).filter(Boolean).join('\n\n'),
            personas: {
              ray: personaText2.ray,
              jack: personaText2.jack,
              lucia: personaText2.lucia,
              echo: personaText2.echo,
              ray2: null, jack2: null, lucia2: null, echo2: null,
              order: priorOrder,
              verdict: '관망',
              confidence: 0,
              breakdown: '재테크 일반',
              positionSizing: '0%',
              jackNews: null, luciaNews: null, rayNews: null, echoNews: null,
            },
          });
          return;
        }
        console.error('[tagged-r2] 파싱 실패 — done 응답');
        const _r2Fb = (_categoryV3 === 'emotional' && detectEmotionalSubtypeHee(msg))
          ? HEE_FALLBACK : PERSONA_FALLBACK;
        send({
          type: 'done',
          reply: _r2Fb.ray,
          personas: {
            ray: _r2Fb.ray, jack: _r2Fb.jack, lucia: _r2Fb.lucia, echo: _r2Fb.echo,
            ray2: null, jack2: null, lucia2: null, echo2: null,
            order: priorOrder,
            verdict: '관망', confidence: 0, breakdown: '재테크 일반', positionSizing: '0%',
            jackNews: null, luciaNews: null, rayNews: null, echoNews: null,
          },
        });
        return;
      }, streamFallbackEvent);
    };

    // ──────────────────────────────────────────────────────────────
    // ✅ 보편 solo 조기 종료 — teaMode/category/teaRound와 무관하게 우선 처리.
    //   호명 감지(_routerDecision.invokedPersona)가 있으면 해당 페르소나 1명만 응답.
    //   ⚠️ 반드시 모든 카테고리/teaRound 분기보다 먼저 위치할 것.
    //     · 새 세션 (teaRound 없음) → 일반 4명 분기 빠지기 전 차단
    //     · 이어지는 세션 (teaRound>=2) → 2라운드 분기 진입 전 차단
    // ──────────────────────────────────────────────────────────────
    if (_routerDecision.strategy === 'solo' && _routerDecision.invokedPersona) {
      const invoked = _routerDecision.invokedPersona;
      // ✅ solo도 이전 질문 키워드 오염 차단 — Stage2/Stage3에는 현재 질문만 전달
      const soloMessages = (messages as Array<{ role?: string; content?: string }>).slice(-1);
      // order 인자는 callOptionD 내부 routeMessage 재구성에 쓰임 — invoked가 echo면
      // TaggedPersonaKey(3-key) 범위 밖이라 더미 'lucia'로 채움.
      const dummyOrder: TaggedPersonaKey[] =
        invoked === 'echo' ? ['lucia', 'jack', 'ray'] : [invoked, 'jack', 'lucia'].filter((k, i, a) => a.indexOf(k) === i) as TaggedPersonaKey[];
      return streamRespond(async (send) => {
        const marketDataPromptContext = await getOrBuildMarketDataContext(lastMsg);
        const soloResult = await callOptionDWithStage3Guard(
          soloMessages,
          category,
          lastMsg,
          dummyOrder,
          _categoryV3,
          _firstPersonaV3,
          _hasPriorConversation,
          _closerPersonaV3,
          invoked,
          marketDataPromptContext,
        );
        let reply = soloResult?.soloKey === invoked
          ? soloResult.soloContent || ''
          : '';
        // ✅ invoked persona 빈 응답 → non-invest 최소 fallback
        if (!reply.trim() && _categoryV3 !== 'invest') {
          const _isHeeOuter = _categoryV3 === 'emotional' && detectEmotionalSubtypeHee(lastMsg);
          reply = (_isHeeOuter ? HEE_FALLBACK : PERSONA_FALLBACK)[invoked as TaggedPersonaKey];
        }
        // 스트리밍 — echo면 echo 이벤트, 그 외 페르소나는 persona 이벤트
        let acc = '';
        for (const c of chunkText(reply, 15)) {
          acc += c;
          if (invoked === 'echo') {
            send({ type: 'echo', round: 1, text: acc });
          } else {
            send({ type: 'persona', key: invoked as 'ray' | 'jack' | 'lucia', round: 1, text: acc });
          }
          await new Promise((r) => setTimeout(r, 20));
        }
        const echoFollowup = invoked === 'echo' ? reply : buildSoloEchoFollowup(invoked);
        send({
          type: 'done',
          reply,
          personas: {
            ray:   invoked === 'ray'   ? reply : '',
            jack:  invoked === 'jack'  ? reply : '',
            lucia: invoked === 'lucia' ? reply : '',
            echo:  echoFollowup,
            ray2: null, jack2: null, lucia2: null, echo2: null,
            order: [invoked],
            verdict: '관망',
            confidence: 0,
            breakdown: 'solo',
            positionSizing: '0%',
            jackNews: null, luciaNews: null, rayNews: null, echoNews: null,
          },
        });
      }, streamFallbackEvent);
    }

    // ✅ 차 한잔 모드 — LLM 기반 3 페르소나 응답 (Gemini 2.0 Flash, 병렬 호출)
    //   Round 1: LUCIA 단독 (감정 수용 단계)
    //   Round 2+: LUCIA + JACK + ECHO (세 API Promise.all 병렬)
    //   LLM 실패 시 round/카테고리 기반 템플릿으로 자동 폴백.
    //   ⚠️ 재테크 탭(teaMode=false)은 아래 블록을 건너뛰므로 동작 변화 없음.
    //   ⚠️ finance 카테고리는 teaMode=true 일 때 RAY 로 자동 라우팅 (재테크 탭은 그대로 풀 분석).
    if (teaMode || category === 'sports' || category === 'news' || category === 'life' || category === 'legal' || category === 'tech' || category === 'emotion' || category === 'general') {
      // ── ✅ news 카테고리 — 4명 페르소나 병렬 응답 (Google Search grounding) ──
      //   기존: RAY 1명만 답변 (단일 페르소나 dispatch). 시사·정세는 다각도 분석이 필요해
      //   RAY/JACK/LUCIA/ECHO 4명 동시 응답으로 변경. teaPersona가 명시 픽(jack/echo/ray)
      //   인 경우는 1:1 모드로 보고 기존 단일 응답을 유지한다.
      // ✅ V2 근본 원칙: 무조건 4명 출동. 단일 페르소나 픽 전면 폐기.
      //   카테고리별 라우팅(sports→jack, finance→ray 등) 전부 무력화.
      //   PersonaX의 본질 = 4명 = 티키타카 = 도파민 = 차별성.
      const isExplicitPersonaPick = false;
      if (category === 'news' && !isExplicitPersonaPick) {
        // 시간 컨텍스트 프리픽스 — 검색 결과가 구식 자료(2024 이하)에 편향되는 문제 방지
        const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
        const yearNow = kstNow.getUTCFullYear();
        const monthNow = kstNow.getUTCMonth() + 1;
        const newsPrefix = `[현재 시점: ${yearNow}년 ${monthNow}월 — 가장 최근 보도(${yearNow}년)를 우선 참고하여 답변. 과거 인물·사건을 현재형으로 단정하지 말 것.]\n`;

        // 0단계: 오케스트레이터 — 토론 디렉터가 발언 순서/각도/충돌 쟁점/ECHO 지목 결정
        const newsPlan = await runOrchestrator(lastMsg, ['ray', 'jack', 'lucia']);
        const newsAngleRay   = newsPlan.ray_angle   ? `RAY 집중점: ${newsPlan.ray_angle}.\n` : '';
        const newsAngleJack  = newsPlan.jack_angle  ? `JACK 집중점: ${newsPlan.jack_angle}.\n` : '';
        const newsAngleLucia = newsPlan.lucia_angle ? `LUCIA 집중점: ${newsPlan.lucia_angle}.\n` : '';
        const newsConflict   = newsPlan.conflict_point ? `핵심 충돌 쟁점: ${newsPlan.conflict_point}.\n` : '';

        // ✅ 카테고리 어휘 차단 — news 카테고리는 시사/뉴스이므로 invest/emotional 어휘 금지
        const newsVocabGuard = buildCategoryVocabBlockRule(_categoryV3);
        // ✅ 페르소나별 역할 분리 prefix — 동일 질문에 다른 시각으로 답하도록 유도
        const rayHistory:   TeaMsg[] = [{ role: 'user', content: `${newsPrefix}${newsVocabGuard}${newsAngleRay}${newsConflict}[역할: 질문에 직접 답해라. 핵심 숫자 2개만. 절대 3줄 초과 금지. 목록·불릿 금지.]\n${lastMsg}` }];
        const jackHistory:  TeaMsg[] = [{ role: 'user', content: `${newsPrefix}${newsVocabGuard}${newsAngleJack}${newsConflict}[역할: 이 상황에서 지금 당장 행동해야 할 것 하나만 짧고 투박하게 말해줘. 배경 설명 없이. 절대 3줄 초과 금지. 불릿·목록 사용 금지. 핵심만.]\n${lastMsg}` }];
        const luciaHistory: TeaMsg[] = [{ role: 'user', content: `${newsPrefix}${newsVocabGuard}${newsAngleLucia}[역할: 이 뉴스가 40~50대 일반인에게 감정적으로 어떤 의미인지, 인간적 시각으로만 2~3줄로 말해줘. 경제 분석 없이. 절대 3줄 초과 금지. 불릿·목록 사용 금지. 핵심만.]\n${lastMsg}` }];

        const [rayLLM, jackLLM, luciaLLM] = await Promise.all([
          callTeaPersona('ray',   TEA_SYSTEM_RAY,   rayHistory,   { enableSearch: true }),
          callTeaPersona('jack',  TEA_SYSTEM_JACK,  jackHistory,  { enableSearch: true }),
          callTeaPersona('lucia', TEA_SYSTEM_LUCIA, luciaHistory, { enableSearch: true }),
        ]);

        const rayText   = cleanNews(rayLLM)   || '실시간 검색이 일시 지연되고 있어요. 잠시 후 다시 질문해주세요.';
        const jackText  = cleanJackEnding(cleanNews(jackLLM)  || '핵심 변수가 정리되면 다시 짚어드릴게요.');
        const luciaText = cleanNews(luciaLLM) || '뉴스를 보고 마음이 흔들리시면 천천히 이야기 나눠봐요.';

        // ✅ ECHO 취합 판결 — 위 3명 응답을 컨텍스트로 받아 마지막에 호출
        //    'RAY는 ~로, JACK은 ~로, LUCIA는 ~로' 형식 절대 금지 (시스템 프롬프트에 원칙 등재)
        const newsEchoTargetClause = (newsPlan.echo_target && newsPlan.echo_angle)
          ? `이번엔 ${newsPlan.echo_target.toUpperCase()}을 직접 지목해서 "${newsPlan.echo_angle}" 이 부분을 찔러라.\n`
          : '';
        const echoConsolidationPrompt = `${newsPrefix}사용자 질문: ${lastMsg}\n\n[RAY 응답]\n${rayText}\n\n[JACK 응답]\n${jackText}\n\n[LUCIA 응답]\n${luciaText}\n\n${newsEchoTargetClause}위 세 답변을 듣고 ECHO로서 판결하라. 시스템 프롬프트의 '뉴스/시사 질문에서 ECHO 시작 방식' 원칙을 반드시 따를 것. 5줄 이내. 불릿·목록 사용 금지. 반드시 마지막 줄은 RAY·JACK·LUCIA 세 사람에게 던지는 직접 질문 한 문장으로 마무리할 것(물음표 필수).`;
        const echoLLM = await callTeaPersona(
          'echo',
          TEA_SYSTEM_ECHO,
          [{ role: 'user', content: echoConsolidationPrompt }],
          { enableSearch: true },
        );
        const echoText  = cleanEchoSelfReference(cleanNews(echoLLM)  || '구조적 흐름은 정보가 안정된 뒤 다시 정리해드릴게요.');

        // ── ✅ 2라운드 — ECHO 1라운드 판결을 직접 질문으로 받아 각 페르소나가 그 질문에만 답하기 ──
        // 1라운드 원문 전체 대신 50자 요약만 주입 — 이전 주제 어휘가 2라운드 프롬프트를 오염시키지 않도록.
        const ctx50 = (t: string) => t.length > 50 ? `${t.slice(0, 50)}...` : t;
        const round2Context = `${newsPrefix}사용자 질문: ${lastMsg}\n\n[1라운드 RAY]\n${ctx50(rayText)}\n[1라운드 JACK]\n${ctx50(jackText)}\n[1라운드 LUCIA]\n${ctx50(luciaText)}\n[1라운드 ECHO]\n${ctx50(echoText)}\n\n`;
        const round2Prefix = '[ECHO가 방금 질문을 던졌다. RAY: 반드시 숫자/데이터로 시작해 2줄 이내 답하라. JACK: 짧고 투박하게 ~요 로 끝내라. 2줄 이내. LUCIA: ~잖아요 ~거든요 톤으로 2줄 이내. 아이고 금지. 페르소나 호칭에 님 붙이지 말 것.]';
        const ray2History:   TeaMsg[] = [{ role: 'user', content: `${round2Context}${round2Prefix}` }];
        const jack2History:  TeaMsg[] = [{ role: 'user', content: `${round2Context}${round2Prefix}` }];
        const lucia2History: TeaMsg[] = [{ role: 'user', content: `${round2Context}${round2Prefix}` }];

        const [ray2LLM, jack2LLM, lucia2LLM] = await Promise.all([
          callTeaPersona('ray',   TEA_SYSTEM_RAY,   ray2History,   { enableSearch: true }),
          callTeaPersona('jack',  TEA_SYSTEM_JACK,  jack2History,  { enableSearch: true }),
          callTeaPersona('lucia', TEA_SYSTEM_LUCIA, lucia2History, { enableSearch: true }),
        ]);

        // 2라운드 페르소나 응답은 첫 문단만 사용 — 다른 페르소나 발화 누출 방어
        const rayText2   = firstParagraph(cleanNews(ray2LLM));
        const jackText2  = firstParagraph(cleanNews(jack2LLM));
        const luciaText2 = firstParagraph(cleanNews(lucia2LLM));

        // 2라운드 ECHO 최후 판결 — 1·2라운드 전체를 본 뒤 마무리
        const echo2ConsolidationPrompt = `${newsPrefix}사용자 질문: ${lastMsg}\n\n[1라운드]\nRAY: ${rayText}\nJACK: ${jackText}\nLUCIA: ${luciaText}\nECHO: ${echoText}\n\n[2라운드]\nRAY: ${rayText2}\nJACK: ${jackText2}\nLUCIA: ${luciaText2}\n\n최후 판결을 한 문장으로만 내려라. 요약·정리·나열 금지. 절대 3줄 초과 금지. "결정은 당신이 하십시오" 표현 금지.`;
        const echo2LLM = await callTeaPersona(
          'echo',
          TEA_SYSTEM_ECHO,
          [{ role: 'user', content: echo2ConsolidationPrompt }],
          { enableSearch: true },
        );
        const echoText2 = cleanNews(echo2LLM);

        try {
          const adminSupabase = getAdminSupabase();
          if (adminSupabase) {
            await adminSupabase.from('tea_logs').insert({
              persona: 'ray',
              turn_count: 1,
              first_message: lastMsg.slice(0, 100),
              user_id: null,
            });
          }
        } catch (e) {
          console.warn('[tea:news] 로그 저장 실패 (무시)', e);
        }

        // teaMode 히스토리 저장 (news 4페르소나)
        void saveTeaConversation({
          keyword: lastMsg,
          category: category || 'news',
          rayText:   [rayText,   rayText2  ].filter(Boolean).join('\n\n'),
          jackText:  [jackText,  jackText2 ].filter(Boolean).join('\n\n'),
          luciaText: [luciaText, luciaText2].filter(Boolean).join('\n\n'),
          echoText:  [echoText,  echoText2 ].filter(Boolean).join('\n\n'),
        });

        return respond({
          reply: [rayText, jackText, luciaText, echoText, rayText2, jackText2, luciaText2, echoText2].filter(Boolean).join('\n\n'),
          personas: {
            jack: jackText, lucia: luciaText, ray: rayText, echo: echoText,
            ray2:   rayText2   || null,
            jack2:  jackText2  || null,
            lucia2: luciaText2 || null,
            echo2:  echoText2  || null,
            order:  applyV3OrderOverride(newsPlan.order),
            verdict: '관망' as Verdict,
            confidence: 0,
            breakdown: '시사 분석',
            positionSizing: '0%',
            jackNews: null, luciaNews: null, rayNews: null, echoNews: null,
          },
        });
      }

      // ── ✅ life 카테고리 — Option D 통합 path로 이관 (deprecated 2-round 핸들러 제거) ──
      //   기존 핸들러는 orchestrator + 3페르소나 병렬 + ECHO 1라운드 + 3페르소나 2라운드 + ECHO 2라운드
      //   = 5개 순차 LLM 호출로 Vercel 60s 타임아웃 초과 (FUNCTION_INVOCATION_TIMEOUT).
      //   Option D path(callOptionDWithStage3Guard)는 Stage 1+2+3 = 2~3개 LLM 호출로 30s 이내 완료.
      //   life는 아래 fallback (line 2384, buildFinanceMultiPersonaResponse) 으로 자동 진입.
      //   buildFinanceMultiPersonaResponse는 이름과 달리 generic Option D 스트리밍 빌더.

      // ── ✅ finance 카테고리(teaMode) 모든 질문 — 4명 페르소나 병렬 응답으로 강제 ──
      //   teaMode=true 진입 시 STOCK_MAP/CRYPTO_MAP/MARKET_INDEX 키워드 일치 여부와 무관하게
      //   "삼성전자/비트코인/코스피" 등 모든 재테크 질문을 4명 동시 응답 구조로 통합.
      //   (단일 RAY 경로 / 단일 종목 풀 분석 경로는 teaMode=false 일 때만 사용 — 사실상 deprecated)
      if (!isExplicitPersonaPick) {
        return await buildFinanceMultiPersonaResponse(lastMsg);
      }

      // ── teaRound 결정 — 클라이언트 값 우선, 누락 시 user 턴 수 폴백 ──
      const userTurns = Array.isArray(messages)
        ? messages.filter((m: { role?: string }) => m?.role === 'user').length
        : 0;
      const round = Number.isFinite(Number(teaRound)) && Number(teaRound) > 0
        ? Number(teaRound)
        : userTurns || 1;

      // ── 페르소나별 이력 구성 (JACK/ECHO/RAY 는 과거 자기 발화로 재구성) ──
      const luciaHistory = buildTeaHistory(messages, 'lucia');
      const jackHistory = buildTeaHistory(messages, 'jack');
      const echoHistory = buildTeaHistory(messages, 'echo');
      const rayHistory = buildTeaHistory(messages, 'ray');


      const { fallbackLucia, fallbackJack, fallbackEcho } =
        buildTeaFallbacks(lastMsg, round);
      const selectedPersona = selectTeaPersona({ teaPersona, category });

      if (selectedPersona === 'jack') {
        const jackLLM = await callTeaPersona('jack', TEA_SYSTEM_JACK, jackHistory);
        try {
          const adminSupabase = getAdminSupabase();
          if (adminSupabase) {
            await adminSupabase.from('tea_logs').insert({
              persona: selectedPersona,
              turn_count: round,
              first_message: lastMsg.slice(0, 100),
              user_id: null,
            });
          }
        } catch (e) {
          console.warn('[tea] 로그 저장 실패 (무시)', e);
        }
        return respond({
          teaMode: true,
          teaRound: round,
          teaPersona: 'jack',
          teaJack: jackLLM || fallbackJack || '지금 상황의 핵심이 뭐라고 보세요?',
        });
      }

      if (selectedPersona === 'echo') {
        const echoLLM = await callTeaPersona('echo', TEA_SYSTEM_ECHO, echoHistory);
        try {
          const adminSupabase = getAdminSupabase();
          if (adminSupabase) {
            await adminSupabase.from('tea_logs').insert({
              persona: selectedPersona,
              turn_count: round,
              first_message: lastMsg.slice(0, 100),
              user_id: null,
            });
          }
        } catch (e) {
          console.warn('[tea] 로그 저장 실패 (무시)', e);
        }
        return respond({
          teaMode: true,
          teaRound: round,
          teaPersona: 'echo',
          teaEcho: echoLLM || fallbackEcho || '말하지 않은 것 중에 가장 무거운 건 뭔가요?',
        });
      }

      if (selectedPersona === 'ray') {
        // ✅ 시사/금융 일반 질문은 Google Search grounding 활성화 (실시간 정보)
        const enableSearchForRay = category === 'news' || category === 'finance' || category === 'tech';
        const rayLLM = await callTeaPersona('ray', TEA_SYSTEM_RAY, rayHistory, { enableSearch: enableSearchForRay });
        try {
          const adminSupabase = getAdminSupabase();
          if (adminSupabase) {
            await adminSupabase.from('tea_logs').insert({
              persona: selectedPersona,
              turn_count: round,
              first_message: lastMsg.slice(0, 100),
              user_id: null,
            });
          }
        } catch (e) {
          console.warn('[tea] 로그 저장 실패 (무시)', e);
        }
        return respond({
          teaMode: true,
          teaRound: round,
          teaPersona: 'ray',
          teaRay: rayLLM || '데이터 분석에 일시적인 문제가 있어요. 다시 질문해주세요.',
        });
      }

      // lucia 기본
      let luciaLLM = await callTeaPersona('lucia', TEA_SYSTEM_LUCIA, luciaHistory);
      if (luciaLLM) {
        luciaLLM = luciaLLM
          .replace(/생각:[\s\S]*?\n\n/g, '')
          .replace(/\(생각:[\s\S]*?\)/g, '')
          .replace(/분석:[\s\S]*?\n\n/g, '')
          .trim();
      }
      try {
        const adminSupabase = getAdminSupabase();
        if (adminSupabase) {
          await adminSupabase.from('tea_logs').insert({
            persona: selectedPersona,
            turn_count: round,
            first_message: lastMsg.slice(0, 100),
            user_id: null,
          });
        }
      } catch (e) {
        console.warn('[tea] 로그 저장 실패 (무시)', e);
      }
      return respond({
        teaMode: true,
        teaRound: round,
        teaPersona: 'lucia',
        teaLucia: luciaLLM || fallbackLucia,
      });
    }

    // ✅ 재테크 탭 고급 질문 — 4명 페르소나 LLM 병렬 호출 (투자 철학 기반)
    //   isAdvancedQuestion=true 일 때만 진입.
    //   종목 데이터 없이 순수 전략·철학 답변.
    //   LLM 실패 시 폴백 텍스트 반환.
    if (isAdvancedQuestion) {
      const advancedHistory: TeaMsg[] = [{ role: 'user', content: lastMsg }];

      const [rayLLM, jackLLM, luciaLLM, echoLLM] = await Promise.all([
        callTeaPersona('ray', ADVANCED_SYSTEM_RAY, advancedHistory),
        callTeaPersona('jack', ADVANCED_SYSTEM_JACK, advancedHistory),
        callTeaPersona('lucia', ADVANCED_SYSTEM_LUCIA, advancedHistory),
        callTeaPersona('echo', ADVANCED_SYSTEM_ECHO, advancedHistory),
      ]);

      const rayText = cleanAdvanced(rayLLM || '데이터 기반 분석이 필요합니다.\n지금 구간의 통계적 특성을 먼저 확인하시고 과거 유사 상황의 패턴을 비교해 보시는 걸 권합니다.');
      const jackText = cleanJackEnding(cleanAdvanced(jackLLM || '판단 기준을 먼저 정하세요.\n추세가 살아있는지, 꺾였는지 확인부터.\n손절선 없이는 진입도 없습니다.'));
      const luciaText = cleanAdvanced(luciaLLM || '이 질문에 답하기 전에 먼저 본인 심리 상태를 점검하세요.\n손실 회피 편향이 작동하는 구간입니다.\n최악의 시나리오를 가정하고 그때 어떻게 할지 먼저 정해두세요.');
      const echoText = cleanEchoSelfReference(cleanAdvanced(echoLLM || '한 가지만 짚겠습니다.\n원칙 없이 답하면 매번 다른 결론이 나옵니다.\n먼저 본인의 판단 기준을 종이에 적으세요.\n그게 출발점입니다.'));

      const ray = splitForBubble(rayText);
      const jack = splitForBubble(jackText);
      const lucia = splitForBubble(luciaText);
      const echo = splitForBubble(echoText);


      // teaMode 히스토리 저장 (advanced 4페르소나)
      void saveTeaConversation({
        keyword: lastMsg,
        category: category || 'advanced',
        rayText, jackText, luciaText, echoText,
      });

      return respond({
        reply: [rayText, jackText, luciaText, echoText].join('\n\n'),
        personas: {
          jack: jack.summary,
          lucia: lucia.summary,
          ray: ray.summary,
          echo: echo.summary,
          jackDetails: jack.details || null,
          luciaDetails: lucia.details || null,
          rayDetails: ray.details || null,
          echoDetails: echo.details || null,
          verdict: '관망' as Verdict,
          confidence: 0,
          breakdown: '전략 분석',
          positionSizing: '0%',
          jackNews: null, luciaNews: null, rayNews: null, echoNews: null,
          isAdvancedAnswer: true,
        },
      });
    }

    // ✅ V2 위기 모드 — 자살/자해/극단 표현 감지 처리는 orchestrator-tagged.ts 170-189줄에 일임.
    //   PersonaX 근본 원칙: 4명 출동 = 차별성 = 티키타카.
    //   위기 모드에서도 4명이 출동하되, 위기 톤으로 역할 분담:
    //     LUCIA(마음 받기) / JACK(109·1393 안내) / RAY(전화 권유) / ECHO(부드러운 권유)
    //   별도 분기 없이 그대로 4명 토론 분기로 보냄.

    // ✅ 감정/일반 대화 가드 — teaMode=false 로 들어와도 종목 추출 차단
    //   teaMode 블록은 teaMode=true 만 처리하므로, teaMode=false + emotion/general 케이스가
    //   여기까지 흘러와 종목 분석 로직에 잘못 진입하는 것을 방지한다.
    // ✅ V2: emotion 카테고리 단독 분기 삭제. 4명 토론으로 흘러가게 한다.
    //   기존: emotion → LUCIA 단독 → ChatGPT와 차별성 없음
    //   V2: emotion도 4명 토론. LUCIA가 첫 자리에서 마음 받고, JACK/RAY/ECHO가 이어받음.
    //   (실제 4명 분기는 위 teaMode 블록에서 이미 처리되므로 여기는 도달 안 함)

    // ✅ V2: general 카테고리 단독 분기 삭제. 4명 토론으로 흘러가게 한다.
    //   PersonaX는 일상 잡담에도 4명이 출동해야 한다 (근본 원칙).

    const keyword = extractKeyword(messages);

    const isForecastQuery = ['전망', '어때', '어떤가', '어떨까', '주목할'].some(p => lastMsg.includes(p));

    const marketQuickResponse = await tryBuildMarketQuickResponse({
      lastMsg,
      keyword,
      fetchMarketPrice,
    });
    if (marketQuickResponse) {
      return respond(marketQuickResponse);
    }

    // ── 종목 키워드 미인식 — 추천/전망 여부에 따라 분기
    if (keyword === '시장') {

      // ✅ 전망 질문 — 코스피/나스닥으로 유도 (간단 안내 카드)
      if (isForecastQuery) {
        // ✅ finance 카테고리(예: "요즘 주식 어때요?")는 4페르소나 병렬 응답 (RAY만 검색)
        if (category === 'finance') {
          return await buildFinanceMultiPersonaResponse(lastMsg);
        }
        return respond({
          errorType: 'keyword_not_recognized',
          errorMessage: '죄송해요, 지금 답변하기 어려운 질문이에요. 재테크, 감정, 건강, 일상 고민을 말씀해 주시면 4명이 함께 생각해드릴게요.',
        });
      }
      // ✅ finance 카테고리(예: "주식 사도 될까요?", "요즘 미국 금리 어때요?") — 종목명 없는 일반 재테크 질문
      //    4페르소나 병렬 응답 (RAY만 Google Search grounding 활성화)
      if (category === 'finance') {
        return await buildFinanceMultiPersonaResponse(lastMsg);
      }
      // ✅ 종목 미인식 — 친절한 안내 카드
      return respond({
        errorType: 'keyword_not_recognized',
        errorMessage: '죄송해요, 지금 답변하기 어려운 질문이에요. 재테크, 감정, 건강, 일상 고민을 말씀해 주시면 4명이 함께 생각해드릴게요.',
      });
    }

    const currency = inferCurrency(keyword);
    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

    const { session } = await resolveChatSession(req, requestProviderUserId, true);

    const providerUserId = session.providerUserId;
    const userId = session.userId;

    // hee+invest 복합 분기 — '삼성전자로 처음 수익 났어요' 같이 HEE(축하/경사)와 invest(종목)가
    //   동시에 매치되는 경우 legacy stock-detail 템플릿(시장 분석 위주)이 경사 모드를 인식 못함.
    //   Option D path(buildFinanceMultiPersonaResponse)는 V3='emotional'(hee) 프롬프트로 진입하고
    //   하위 안전망(_isHeeInvestComplex)이 손절선 vocab까지 부착 — 경사+투자 둘 다 충족.
    if (detectEmotionalSubtypeHee(lastMsg)) {
      return await buildFinanceMultiPersonaResponse(lastMsg);
    }

    const [marketData, nasdaqData, rawNews] = await Promise.all([
      fetchMarketPrice(keyword),
      fetchMarketPrice('나스닥').catch(() => null),
      fetchInvestmentNews(keyword).catch(() => []),
    ]);

    // ✅ 시세 미수급 — STOCK_MAP/CRYPTO_MAP에 없으면 "종목 미인식", 있는데 실패면 "시세 API 일시 장애"
    if (!marketData) {
      const isRecognized = !!(
        STOCK_MAP[keyword] || STOCK_MAP[keyword.toUpperCase()] ||
        CRYPTO_MAP[keyword] || CRYPTO_MAP[keyword.toUpperCase()]
      );
      if (!isRecognized) {
        return respond({
          errorType: 'keyword_not_recognized',
          errorMessage: '죄송해요, 지금 답변하기 어려운 질문이에요. 재테크, 감정, 건강, 일상 고민을 말씀해 주시면 4명이 함께 생각해드릴게요.',
        });
      }
      // ✅ 지수(다우/^DJI 등) 데이터 일시 미수급 시 RAY 일반 응답으로 폴백 — 에러 카드 대신 자연스러운 답변
      //    실시간 시황 보강을 위해 Google Search grounding 활성화
      if (MARKET_INDEX_SET.has(keyword)) {
        const rayLLM = await callTeaPersona('ray', TEA_SYSTEM_RAY, [{ role: 'user', content: lastMsg }], { enableSearch: true });
        return respond({
          teaMode: true,
          teaRound: 1,
          teaPersona: 'ray',
          teaRay: rayLLM || `${keyword} 실시간 데이터가 일시적으로 미수급이에요. 잠시 후 다시 질문해 주시면 데이터 기반으로 분석해 드릴 수 있어요.`,
        });
      }
      return respond({
        errorType: 'market_data_unavailable',
        errorMessage: '잠시 후 다시 시도해주세요.\n시세 데이터를 불러오는 중입니다. ⏳',
        keyword,
      });
    }

    const news = filterInvestmentNews(rawNews);

    const isCrypto  = !!(CRYPTO_MAP[keyword] || CRYPTO_MAP[keyword.toUpperCase()]);
    const assetType = isCrypto ? 'CRYPTO' : currency === 'KRW' ? 'KOREAN_STOCK' : 'US_STOCK';

    const {
      nowKST,
      timeKST,
      isWeekend,
      isKRNonTradingToday,
      isKRBeforeOpen,
      isKRAfterClose,
      isKRClosed,
      isUSClosed,
      lastKRTradingLabel,
      marketClosedNote,
      rayTimeNote,
    } = buildMarketSessionLabels({ assetType, isCrypto });

    const vol   = getVolumeInfo(marketData?.rawVolume || 0, marketData?.avgVolume || 0, assetType as 'CRYPTO' | 'KOREAN_STOCK' | 'US_STOCK');
    const vix   = getVolatility(marketData?.rawPrice || 0, marketData?.rawHigh || 0, marketData?.rawLow || 0, assetType as 'CRYPTO' | 'KOREAN_STOCK' | 'US_STOCK');
    const pos   = getPricePos(marketData?.rawPrice || 0, marketData?.rawHigh || 0, marketData?.rawLow || 0);
    const nData = getNewsData(news as Array<{ title: string; source?: string }>);

    const { total, verdict, confidence, breakdown } = calcScores({
      volScore: vol.score, change: marketData?.change || '0', newsAvg: nData.avgScore,
      posScore: pos.score, vitScore: vix.score, hasData: !!marketData, newsCount: news.length,
      volLabel: vol.label, posLabel: pos.label, vixLabel: vix.label, newsSentiment: nData.sentiment,
    });

    const positionSizing  = getPositionSizing(verdict, total);
    const dataSourceLabel = buildDataSourceLabel(assetType as 'CRYPTO' | 'KOREAN_STOCK' | 'US_STOCK', marketData, news.length);
    const entryCondition  = buildEntryCondition(marketData, pos.ratio, vol.isHigh, verdict, keyword);
    const { buy: buyPrice, sell: sellPrice } = extractConditionPrices(entryCondition);
    const condSummary = [buyPrice && `관심 구간(${buyPrice})`, sellPrice && `리스크 기준선(${sellPrice})`]
      .filter(Boolean).join(' / ') || '시장 상황 주시';

    const confidenceBasis = [
      marketData ? `시세(${marketData.source})` : null,
      news.length > 0 ? `뉴스 ${news.length}건(${nData.sentiment})` : null,
      vol.isHigh ? '거래량 신호' : null,
    ].filter(Boolean).join(' + ') || '데이터 제한적';

    // ─── 이전 종목 맥락 추출 ───
    const prevUserMsg = messages.slice(-3, -1).find((m: { role: string }) => m.role === 'user')?.content || '';
    const prevKeyword = prevUserMsg ? extractKeyword([{ role: 'user', content: prevUserMsg }]) : null;
    const prevVolIsHigh = vol.isHigh; // 이전 종목의 vol은 현재 세션에서 알 수 없으므로 현재 기준 사용

    // ─── B안: 잭/루시아 코드 직접 조립 ───
    const vixAvailable = !vix.label.includes('없음') && !vix.label.includes('불가') && !vix.label.includes('집계');

    // ✅ 시장 상황 감지
    const situation = detectMarketSituation({
      volScore: vol.score,
      volIsHigh: vol.isHigh,
      vixLabel: vix.label,
      change: safeNum(marketData?.change || '0'),
      posLabel: pos.label,
    });

    // ✅ 추세 맥락 분석 (5일/20일 이평선)
    const trendCtx = analyzeTrendContext(marketData?.trend);

    // ✅ JACK/LUCIA용 trendSummary — 오늘 등락률 부착
    //    +1% 이상: 강한 상승 마감 / +0.3~1%: 소폭 상승 마감 / -0.3~+0.3%: 방향성 없는 횡보
    //    -1~-0.3%: 소폭 하락 마감 / -1% 이하: 강한 하락 마감
    const changeForTrend = marketData?.change ? parseFloat(marketData.change) : NaN;
    const closeDescTrend = !Number.isFinite(changeForTrend)
      ? '마감'
      : changeForTrend >= 1   ? '강한 상승 마감'
      : changeForTrend >= 0.3 ? '소폭 상승 마감'
      : changeForTrend > -0.3 ? '방향성 없는 횡보'
      : changeForTrend > -1   ? '소폭 하락 마감'
      :                          '강한 하락 마감';
    const trendSummaryWithChange = (trendCtx.trendSummary && !Number.isNaN(changeForTrend))
      ? `${trendCtx.trendSummary}, 오늘 ${changeForTrend >= 0 ? '+' : ''}${changeForTrend.toFixed(2)}% ${closeDescTrend}`
      : (trendCtx.trendSummary || null);

    // ✅ 관망 세분화
    const watchLevel = verdict === '관망' ? determineWatchLevel({
      confidence,
      trendStrength: trendCtx.trendStrength,
      sentiment: nData.sentiment,
      volScore: vol.score,
    }) : undefined;

    // ✅ 페르소나 충돌 감지 — verdict도 전달해 조건 확대
    const conflict = detectPersonaConflict({
      trendStrength: trendCtx.trendStrength,
      sentiment: nData.sentiment,
      volScore: vol.score,
      situation,
      verdict,
    });

    // ✅ 지표 카운트로 토론 모드 결정 (bull/bear/conflict)
    const changeMode = safeNum(marketData?.change || '0');
    const rawVolMode = marketData?.rawVolume && marketData.rawVolume > 0 ? marketData.rawVolume : 0;
    const avgVolMode = marketData?.avgVolume && marketData.avgVolume > 0 ? marketData.avgVolume : 0;
    const flags: IndicatorFlags = {
      trendUp:   trendCtx.trendStrength === 'strong_up'   || trendCtx.trendStrength === 'weak_up',
      trendDown: trendCtx.trendStrength === 'strong_down' || trendCtx.trendStrength === 'weak_down',
      volUp:     rawVolMode > 0 && avgVolMode > 0 && rawVolMode > avgVolMode * 1.1,
      volDown:   rawVolMode > 0 && avgVolMode > 0 && rawVolMode < avgVolMode * 0.9,
      newsPos:   nData.sentiment === '긍정',
      newsNeg:   nData.sentiment === '부정',
      priceUp:   changeMode > 0.5,
      priceDown: changeMode < -0.5,
      vixHigh:   vix.label.includes('고변동성'),
    };
    const bullCount = [flags.trendUp, flags.volUp, flags.newsPos, flags.priceUp].filter(Boolean).length;
    const bearCount = [flags.trendDown, flags.volDown, flags.newsNeg, flags.priceDown].filter(Boolean).length;
    const discussMode: DiscussMode =
      bullCount >= 3 ? 'bull' :
      bearCount >= 3 ? 'bear' :
      'conflict';

    // ✅ 이전 종목 맥락 (섹터/자산군 비교용) — RAY 섹터 비교 한 줄 + LUCIA 자산군 구분에 사용
    const prevIsCryptoKeyword = (k: string) =>
      ['비트코인','이더리움','리플','솔라나','도지','에이다','바이낸스','BTC','ETH','XRP','SOL','DOGE','ADA','BNB'].includes(k);
    const hasPrevCtx = !!(prevKeyword && prevKeyword !== '시장' && prevKeyword !== keyword);

    // ✅ 이전 종목 change% 수급 — 같은 섹터일 때 RAY 비교 줄 생성에 필요
    //    실패 시 null (조건 미충족 → 비교 줄 생략)
    let prevChangePercent: number | null = null;
    if (hasPrevCtx && prevKeyword) {
      try {
        const prevMd = await fetchMarketPrice(prevKeyword);
        const parsed = prevMd?.change ? parseFloat(prevMd.change) : NaN;
        if (Number.isFinite(parsed)) prevChangePercent = parsed;
      } catch {
        // noop — prevChangePercent null 유지
      }
    }

    const prevCtx: PrevContext | undefined = hasPrevCtx && prevKeyword
      ? {
          prevKeyword,
          prevSector: getSector(prevKeyword) ?? null,
          currSector: getSector(keyword) ?? null,
          prevIsCrypto: prevIsCryptoKeyword(prevKeyword),
          currIsCrypto: assetType === 'CRYPTO',
          prevChangePercent,
          prevDisplayName: prevKeyword,
        }
      : undefined;

    // ✅ 주말일 때 volLabel에 휴장 안내 추가
    const volLabelWithWeekend = isKRClosed && assetType === 'KOREAN_STOCK'
      ? vol.label + (isWeekend
          ? ' (주말 휴장 중 — 지난 주 데이터 기준)'
          : isKRBeforeOpen
            ? ' (장 개장 전 — 전일 데이터 기준)'
            : ' (장 마감 후 — 오늘 종가 기준)')
      : vol.label;

    const finalJack = marketData
      ? buildJackText({
          keyword,
          volLabel: volLabelWithWeekend,
          volIsHigh: vol.isHigh,
          vixLabel: vix.label,
          vixAvailable,
          change: safeNum(marketData.change),
          verdict,
          // ✅ 같은 자산군일 때만 맥락 연결 (코인→주식 같은 어색한 연결 방지)
          prevKeyword: (() => {
            if (!prevKeyword || prevKeyword === '시장' || prevKeyword === keyword) return null;
            // 이전 종목의 자산군 확인
            const prevIsCrypto = ['비트코인','이더리움','리플','솔라나','도지','에이다','바이낸스','BTC','ETH','XRP','SOL','DOGE','ADA','BNB'].includes(prevKeyword);
            const currIsCrypto = assetType === 'CRYPTO';
            const prevIsKorean = prevKeyword.endsWith('.KS') || ['삼성전자','현대차','엘지전자','LG전자','코스피','코스닥','SK하이닉스','카카오','네이버','셀트리온','기아','현대자동차'].includes(prevKeyword);
            const currIsKorean = assetType === 'KOREAN_STOCK';
            // 같은 자산군이거나 둘 다 주식(한국+미국)이면 연결 허용
            if (prevIsCrypto !== currIsCrypto) return null; // 코인↔주식 연결 금지
            return prevKeyword;
          })(),
          prevVolIsHigh,
          changeRaw: marketData.change,
          volRatio: vol.label.includes('배') ? parseFloat(vol.label.match(/([\d.]+)배/)?.[1] || '0') : null,
          price: marketData.price,
          situation,
          trendSummary: trendSummaryWithChange,
          trendStrength: trendCtx.trendStrength,
          consecutiveDays: trendCtx.consecutiveDays,
          conflict,
          // ✅ 장 미개장 파라미터
          isMarketClosed: isKRClosed && assetType === 'KOREAN_STOCK',
          isBeforeOpen: isKRBeforeOpen,
          isWeekend,
          isUSClosed: isUSClosed && assetType === 'US_STOCK',
          assetType,
          avgVolume: marketData?.avgVolume ?? null,
          rawVolume: marketData?.rawVolume ?? null,
          currency,
          mode: discussMode,
          flags,
          supportPrice: sellPrice || null,
          breakoutPrice: buyPrice || null,
          rawPrice: marketData?.rawPrice ?? null,
        })
      : `지휘관님, ${keyword} 시세 미수급으로 추세 판단이 제한됩니다. 뉴스 확인 후 신호 포착 시 진입을 검토하십시오.`;

    const finalLucia = marketData
      ? buildLuciaText({
          keyword,
          volLabel: volLabelWithWeekend,
          volIsHigh: vol.isHigh,
          vixLabel: vix.label,
          vixAvailable,
          sentiment: nData.sentiment,
          verdict,
          assetType: assetType as 'CRYPTO' | 'KOREAN_STOCK' | 'US_STOCK',
          // ✅ 같은 자산군일 때만 맥락 연결
          prevKeyword: (() => {
            if (!prevKeyword || prevKeyword === '시장' || prevKeyword === keyword) return null;
            const prevIsCrypto = ['비트코인','이더리움','리플','솔라나','도지','에이다','바이낸스','BTC','ETH','XRP','SOL','DOGE','ADA','BNB'].includes(prevKeyword);
            const currIsCrypto = assetType === 'CRYPTO';
            if (prevIsCrypto !== currIsCrypto) return null;
            return prevKeyword;
          })(),
          situation,
          // ✅ LUCIA는 오프너에서 이미 등락률을 표시하므로 trendSummary는 원본 유지 (중복 방지)
          trendSummary: trendCtx.trendSummary || null,
          trendStrength: trendCtx.trendStrength,
          conflict,
          jackVerdict: verdict,
          // ✅ 장 미개장 파라미터
          isMarketClosed: isKRClosed && assetType === 'KOREAN_STOCK',
          isBeforeOpen: isKRBeforeOpen,
          isWeekend,
          isUSClosed: isUSClosed && assetType === 'US_STOCK',
          avgVolume: marketData?.avgVolume ?? null,
          rawVolume: marketData?.rawVolume ?? null,
          changeRaw: marketData?.change ?? null,
          mode: discussMode,
          flags,
          prevCtx,
        })
      : `하지만 소장님, 데이터조차 없는 지금은 마치 재료 없이 요리하는 것과 같아요. 충분한 정보가 확인될 때까지 기다리는 것이 맞습니다.`;
    let profitRateNote = '';
    if (positionContext && marketData) {
      const avgPriceMatch = positionContext.match(/(?:평단가?|매수가|취득가|평균가)[:\s]*([\d,.]+)/);
      if (avgPriceMatch) {
        const avgPrice = parseFloat(avgPriceMatch[1].replace(/,/g, ''));
        if (avgPrice > 0) {
          const rate = ((marketData.rawPrice - avgPrice) / avgPrice * 100).toFixed(2);
          const sign = parseFloat(rate) >= 0 ? '+' : '';
          profitRateNote = `\n현재 수익률: ${sign}${rate}% (평단 ${fmtPrice(avgPrice, currency)} → 현재 ${marketData.price})`;
        }
      }
    }

    const positionNote = positionContext
      ? `\n[유저 포지션]\n${positionContext}${profitRateNote}\n→ 에코는 이 포지션 기준으로 손절/홀딩/추가매수 중 하나를 명확히 권고하라.`
      : `\n[포지션 없음] 에코는 절대로 평단가/보유수량/수익률을 지어내지 마십시오. 신규 진입 기준으로만 판단하십시오.`;

    const currencyRule = currency === 'KRW'
      ? '\n[화폐 규칙] 모든 가격은 반드시 원화(원, KRW) 표기. USD 표기 절대 금지.'
      : '\n[화폐 규칙] 모든 가격은 USD로 표기하라.';

    const noDataNote = !marketData
      ? `\n[주의] ${keyword} 실시간 시세 미지원. 뉴스와 거시 데이터 기반으로만 분석하라.`
      : '';

    const watchConditionRule = verdict === '관망' ? `
[관망 강제 규칙 — 절대 위반 금지]
1. 숫자가 포함된 매수 조건 (구체적 가격 또는 %)
2. 숫자가 포함된 매도/손절 조건
3. 명확한 시간 조건 (3일 내, 이번 주 등)
절대 금지: "근접", "가능성", "검토", "추후", "상황 지켜보기"
` : '';

    const rayAdaptability = !marketData ? '판단 보류' : confidence >= 80 && vol.isHigh ? '높음' : confidence >= 70 ? '보통' : '낮음';
    // ✅ echoBiasNote — positionSizing와 충돌 방지
    // 관망/매도 우위(비중 0%)일 때는 진입 지시 금지
    const echoBiasNote = (verdict === '관망' || verdict === '매도 우위')
      ? '신규 진입을 보류하십시오'
      : rayAdaptability === '높음' ? '단계적으로 진입하십시오'
      : rayAdaptability === '보통' ? '소량 분할 진입을 검토하십시오'
      : '진입을 보류하십시오';

    // ✅ 히스토리 — 이전 종목 맥락 연결용으로만 사용

    // ─── ✅ 레이: 완전 템플릿화 (Gemini 배제) ───
    // ✅ USD 가격 간소화 표기 — "380.56" → "약 $381"
    // ✅ 지수(코스피/나스닥/S&P500/다우 등)는 통화 단위 대신 "pt" 표기
    const isMarketIndexKeyword = MARKET_INDEX_SET.has(keyword);
    const rayPriceDisplay = marketData
      ? (isMarketIndexKeyword
          ? `${marketData.price}pt`
          : currency === 'USD' && marketData.rawPrice
            ? `약 $${Math.round(marketData.rawPrice).toLocaleString('en-US')}`
            : `${marketData.price}${currency === 'KRW' ? '원' : ''}`)
      : '미지원';

    // ✅ RAY — 중립 팩트 3줄 (시세 / 거래량 / 변동성). 이평선·뉴스는 언급하지 않음.
    const finalRay = buildFinalRay({
      keyword,
      marketData,
      assetType,
      vix,
      rayPriceDisplay,
      rayTimeNote,
      prevCtx,
    });

    // ─── ✅ Gemini 완전 제거 — 에코 템플릿 직접 사용 ───
    // ✅ 지수/시장 키워드 감지 — 투자 지시 대신 시장 해석으로 전환
    const isMarketIndex = MARKET_INDEX_SET.has(keyword);

    let finalEcho: string;
    let finalEchoDetails: string | null = null;

    if (isMarketIndex) {
      const marketTrendDesc = trendCtx.trendSummary
        ? trendCtx.trendSummary
        : `${keyword} 현재 ${marketData?.price || '데이터 없음'} (${safeNum(marketData?.change)}%)`;

      const isKRIndex = keyword === '코스피' || keyword === '코스닥' || keyword.includes('한국');
      const isSP500 = keyword === 'S&P500' || keyword === 'SP500' || keyword === 'S&P';
      const isDow = keyword === '다우' || keyword === '다우존스';

      // ✅ ETF 실시간 데이터 — 지수별 매핑
      //   코스피/코스닥 → KODEX 200, KODEX 레버리지
      //   S&P500       → SPY, VOO, IVV
      //   다우존스     → DIA
      //   나스닥(기본) → QQQ, TQQQ
      let etfLine = '';
      try {
        if (isKRIndex) {
          const [k200, klev] = await Promise.all([
            fetchMarketPrice('KODEX 200').catch(() => null),
            fetchMarketPrice('KODEX 레버리지').catch(() => null),
          ]);
          const k200ch = parseFloat(k200?.change || '0');
          const klevch = parseFloat(klev?.change || '0');
          etfLine = `📊 코스피 ETF 현황:\nKODEX 200: ${k200?.price || '-'}원 (${k200ch >= 0 ? '+' : ''}${k200ch.toFixed(2)}%) ${k200ch > 0 ? '🟢' : k200ch < 0 ? '🔴' : '🟡'}\nKODEX 레버리지: ${klev?.price || '-'}원 (${klevch >= 0 ? '+' : ''}${klevch.toFixed(2)}%) ${klevch > 0 ? '🟢' : klevch < 0 ? '🔴' : '🟡'} ⚠️ 2배 레버리지`;
        } else if (isSP500) {
          const [spy, voo, ivv] = await Promise.all([
            fetchMarketPrice('SPY').catch(() => null),
            fetchMarketPrice('VOO').catch(() => null),
            fetchMarketPrice('IVV').catch(() => null),
          ]);
          const spych = parseFloat(spy?.change || '0');
          const vooch = parseFloat(voo?.change || '0');
          const ivvch = parseFloat(ivv?.change || '0');
          etfLine = `📊 S&P500 ETF 현황 (ETF로 직접 투자 가능):\nSPY (SPDR): $${spy?.price || '-'} (${spych >= 0 ? '+' : ''}${spych.toFixed(2)}%) ${spych > 0 ? '🟢' : spych < 0 ? '🔴' : '🟡'}\nVOO (Vanguard): $${voo?.price || '-'} (${vooch >= 0 ? '+' : ''}${vooch.toFixed(2)}%) ${vooch > 0 ? '🟢' : vooch < 0 ? '🔴' : '🟡'}\nIVV (iShares): $${ivv?.price || '-'} (${ivvch >= 0 ? '+' : ''}${ivvch.toFixed(2)}%) ${ivvch > 0 ? '🟢' : ivvch < 0 ? '🔴' : '🟡'}`;
        } else if (isDow) {
          const dia = await fetchMarketPrice('DIA').catch(() => null);
          const diach = parseFloat(dia?.change || '0');
          etfLine = `📊 다우존스 ETF 현황 (ETF로 직접 투자 가능):\nDIA (SPDR Dow Jones): $${dia?.price || '-'} (${diach >= 0 ? '+' : ''}${diach.toFixed(2)}%) ${diach > 0 ? '🟢' : diach < 0 ? '🔴' : '🟡'}`;
        } else {
          // 나스닥 ETF
          const [qqq, tqqq] = await Promise.all([
            fetchMarketPrice('QQQ').catch(() => null),
            fetchMarketPrice('TQQQ').catch(() => null),
          ]);
          const qqqch = parseFloat(qqq?.change || '0');
          const tqqqch = parseFloat(tqqq?.change || '0');
          etfLine = `📊 나스닥 ETF 현황 (ETF로 직접 투자 가능):\nQQQ (나스닥100): $${qqq?.price || '-'} (${qqqch >= 0 ? '+' : ''}${qqqch.toFixed(2)}%) ${qqqch > 0 ? '🟢' : qqqch < 0 ? '🔴' : '🟡'}\nTQQQ (3배 레버리지): $${tqqq?.price || '-'} (${tqqqch >= 0 ? '+' : ''}${tqqqch.toFixed(2)}%) ${tqqqch > 0 ? '🟢' : tqqqch < 0 ? '🔴' : '🟡'} ⚠️ 고위험`;
        }
      } catch { etfLine = ''; }

      const sectorHint = isKRIndex
        ? '관심 섹터: IT·반도체(삼성전자, SK하이닉스), 자동차(현대차, 기아), 금융(KB금융, 신한지주)'
        : '관심 섹터: AI·반도체(엔비디아, 브로드컴), 빅테크(애플, 마이크로소프트), 소비재(아마존)';

      const verdictLabel = verdict === '매수 우위'
        ? '시장 전반 강세 — ETF 또는 개별 종목 진입 검토 가능합니다'
        : verdict === '매도 우위'
          ? '시장 전반 약세 — 인버스 ETF 또는 현금 보유를 권고합니다'
          : '시장 방향성 탐색 중 — 개별 종목 선별 접근을 권고합니다';

      const indexEcho = [
        `결론: ${verdictLabel} (신뢰도 ${confidence}%)`,
        `근거: ${marketTrendDesc} / ${vol.label} / 뉴스 ${nData.sentiment}`,
        `지금: ${etfLine.trim()}`,
        `섹터: ${sectorHint}`,
        `조건: ETF 투자 또는 종목명을 입력하시면 개별 분석을 즉시 개시합니다.`,
      ].join('\n');

      // ✅ ECHO 답변 마지막 — 관심 연결 문장 부착
      finalEcho = `${indexEcho}\n\n${dataSourceLabel}${DISCLAIMER}${ECHO_TAIL}`;

    } else {
      const echoBuilt = buildEchoText({
        keyword,
        situation,
        verdict,
        confidence,
        confidenceBasis,
        volLabel: vol.label,
        condSummary,
        positionSizing,
        echoBiasNote,
        changeRaw: marketData?.change || '0.00',
        nasdaqChange: safeNum(nasdaqData?.change).toFixed(2),
        buyPrice,
        sellPrice,
        volScore: vol.score,
        sentiment: nData.sentiment,
        assetType,
        watchLevel,
        trendStrength: trendCtx.trendStrength,
        trendSummary: trendCtx.trendSummary || undefined,
        conflict,
        consecutiveDays: trendCtx.consecutiveDays,
        // ✅ 진입 조건 구체화용 데이터
        rawPrice: marketData?.rawPrice ?? null,
        avgVolume: marketData?.avgVolume ?? null,
        rawVolume: marketData?.rawVolume ?? null,
        currency,
        // ✅ Confluence Score용 (이평선/거래량/뉴스/시세 일치 판단)
        volIsHigh: vol.isHigh,
        hasMarketData: !!marketData,
        // ✅ 토론 모드 + 지표 플래그 (ECHO 질문용)
        mode: discussMode,
        flags,
        // ✅ 시간대 — forecastMode 분기
        isForecast: (isKRClosed && assetType === 'KOREAN_STOCK') || (isUSClosed && assetType === 'US_STOCK'),
        isBeforeOpen: isKRBeforeOpen || (assetType === 'US_STOCK' && !isWeekend && timeKST < 2330 && timeKST >= 600),
        // ✅ details 3블록 구조용 — 이평선/뉴스 현황
        ma5: marketData?.trend?.ma5 ?? null,
        ma20: marketData?.trend?.ma20 ?? null,
        newsCount: news.length,
      });
      // ✅ ECHO 1 (summary): 즉시 표시 — 결론/조건/행동 3줄 + 답변 마지막 관심 연결 문장
      // ✅ ECHO 2 (details): 별도 버블 — confluence + 근거 + 지금 + 조건 + 비중 + dataSource + disclaimer
      finalEcho = echoBuilt.summary + ECHO_TAIL;
      finalEchoDetails = `${echoBuilt.details}\n\n${dataSourceLabel}${marketClosedNote}${DISCLAIMER}`;
    }

    // ─── RAY/JACK/LUCIA 자세히 보기 상세 ───
    const finalRayDetails = marketData && !isMarketIndex
      ? buildRayDetail({ keyword, marketData, currency, assetType, vix, prevCtx })
      : null;
    const finalJackDetails = marketData && !isMarketIndex
      ? buildJackDetail({ trendCtx, vol, nData, newsCount: news.length, flags, discussMode, conflict, verdict })
      : null;
    const finalLuciaDetails = marketData && !isMarketIndex
      ? buildLuciaDetail({ keyword, marketData, vix, vol, pos, nData, newsCount: news.length, flags, discussMode, conflict, verdict })
      : null;

    const {
      finalRayOut,
      finalJackOut,
      finalLuciaOut,
      finalEchoOut,
      finalReply,
      echoDetailsOut,
      rayDetailsOut,
      jackDetailsOut,
      luciaDetailsOut,
    } = buildStockDetailResponse({
      finalRay,
      finalJack,
      finalLucia,
      finalEcho,
      finalEchoDetails,
      finalRayDetails,
      finalJackDetails,
      finalLuciaDetails,
      discussMode,
    });

    const { rayNews, jackNews, luciaNews, echoNews } = allocatePersonaNews(news);


    // ─── 히스토리 저장 ───
    // ⚠️ Vercel 서버리스에서는 응답 반환 후 백그라운드 Promise 가 종료될 수 있어
    //    fire-and-forget(`void Promise.race`) 대신 await 로 저장 완료를 보장한다.
    //    Supabase 응답이 늦어질 경우 5초 타임아웃 후 응답을 반환한다.
    const isIndexKeyword = INDEX_KEYWORDS.has(keyword);
    if (userId && !isIndexKeyword) {
      try {
        await Promise.race([
          saveHistory({
            keyword, question: lastMsg, verdict, totalScore: total, assetType, entryCondition,
            priceAtTime: marketData?.price || '미수급', confidence, rawResponse: '',
            marketData, ipAddress, userId, volIsHigh: vol.isHigh,
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('saveHistory timeout')), 5000)
          ),
        ]);
      } catch (e) {
        console.warn('[saveHistory] 저장 실패/타임아웃:', e);
      }
    } else if (!userId) {
      console.warn('[saveHistory] 저장 스킵 — userId null');
    }

    return respond({
      reply: finalReply,
      personas: {
        jack: finalJackOut, lucia: finalLuciaOut, ray: finalRayOut, echo: finalEchoOut,
        echoDetails: echoDetailsOut,
        rayDetails: rayDetailsOut,
        jackDetails: jackDetailsOut,
        luciaDetails: luciaDetailsOut,
        verdict, confidence, breakdown, positionSizing,
        jackNews, luciaNews, rayNews, echoNews,
      },
    });

  } catch (e) {
    console.error("❌ 사령부 에러:", e);
    return Response.json({
      errorType: 'analysis_failed',
      errorMessage: '죄송해요, 지금 답변하기 어려운 질문이에요. 재테크, 감정, 건강, 일상 고민을 말씀해 주시면 4명이 함께 생각해드릴게요.',
    });
  }
}
