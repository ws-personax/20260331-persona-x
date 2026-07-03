/**
 * Route Response Guard — app/api/chat/route.ts에서 이동(move-only, 동작 변경 없음).
 *
 * callOptionD/callOptionDWithStage3Guard: Stage1/2/3(runRoutedRequest) 호출 +
 *   Stage 3 품질 가드 위반 시 재호출.
 * isHeeInvestComplex/applyInvestVocabSafetyNet: invest 필수 어휘(손절선/지지선) 안전망.
 * applyResponseGuardWithDebugLogging: applyResponseGuard 호출부 + 디버그 로깅 (route.ts의
 *   r1/r2 두 지점에서 거의 동일하게 중복되던 블록을 하나로 합침 — 로직 동일, 위치만 통합).
 */
import type { AllPersonaKey, TaggedRound1Result } from '@/app/api/chat/prompts/orchestrator-tagged';
import {
  detectEmotionalSubtypeHee,
  type CategoryV3,
} from '@/lib/personax/classifier';
import {
  routeMessage,
  runRoutedRequest,
  type RouterDecision,
  type LLMCaller,
  type TaggedPersonaKey,
} from '@/lib/personax/message-router';
import { callTeaPersona } from '@/lib/personax/tea-llm-caller';
import type { TeaMsg, TeaPersonaKey } from '@/lib/personax/tea-history';
import type { DecisionSummary } from '@/lib/personax/decision-summary';
import { detectStage3GuardViolations } from '@/lib/personax/guards';
import { detectQuestionType, applyResponseGuard } from '@/lib/personax/response-guard';
import {
  appendMarketDataSourceLabel,
  getMarketDataSourceLabelForGuard,
  hasMarketDataForGuard,
} from '@/lib/personax/market-data-label';
import { normalizeNoMarketDataInvestmentPersonaText } from '@/lib/personax/stock-response-builders';

// ─────────────────────────────────────────────
// ✅ 단일 호출 태그 기반 오케스트레이터 (1라운드 / 2라운드 분리)
//   1라운드: [FIRST] [SECOND] [THIRD] [ECHO_QUESTION]
//   2라운드: [FIRST_2] [SECOND_2] [THIRD_2] [ECHO_FINAL]
//   하이브리드 순서: 감정 키워드 감지 시 LUCIA 먼저, 아니면 카테고리 기반.
// ─────────────────────────────────────────────
export type OptionDRound1Result = TaggedRound1Result & {
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
export async function callOptionD(
  messages: Array<{ role?: string; content?: string }>,
  category: string,
  lastMessage: string,
  order: TaggedPersonaKey[],
  categoryV3?: CategoryV3,
  firstPersona?: AllPersonaKey,
  hasPriorConversation: boolean = false,
  closerPersona?: AllPersonaKey,
  soloPersona?: AllPersonaKey,
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
export async function callOptionDWithStage3Guard(
  messages: Array<{ role?: string; content?: string }>,
  category: string,
  lastMessage: string,
  order: TaggedPersonaKey[],
  categoryV3?: CategoryV3,
  firstPersona?: AllPersonaKey,
  hasPriorConversation: boolean = false,
  closerPersona?: AllPersonaKey,
  soloPersona?: AllPersonaKey,
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

// invest 카테고리 필수 어휘 안전망 판정 — hee(희) 모드지만 메시지에 투자 키워드가 있는 복합 케이스.
//   예: "삼성전자로 처음 수익 났어요" (emotional/hee + invest 어휘 동시 매치).
export function isHeeInvestComplex(categoryV3: CategoryV3 | undefined, lastMsg: string): boolean {
  return (
    categoryV3 === 'emotional' &&
    detectEmotionalSubtypeHee(lastMsg) &&
    /삼성전자|SK하이닉스|테슬라|애플|엔비디아|코스피|코스닥|나스닥|비트코인|주식|종목|펀드|ETF|부동산|퇴직금|연금|코인|투자|수익/.test(lastMsg)
  );
}

// invest 카테고리 필수 어휘 안전망 — 4명 응답에 '손절선'/'지지선' 둘 다 없으면
//   ECHO 끝에 투자 권유가 아닌 리스크 기준 원칙을 보강한다. 프롬프트 규칙은 LLM이 무시할 수 있음.
export function applyInvestVocabSafetyNet(
  personaText: Record<TaggedPersonaKey, string>,
  params: { categoryV3: CategoryV3 | undefined; isHeeInvestComplex: boolean },
): void {
  const { categoryV3, isHeeInvestComplex: heeInvestComplex } = params;
  if (categoryV3 === 'invest' || heeInvestComplex) {
    const allText = personaText.ray + personaText.jack + personaText.lucia + personaText.echo;
    if (!allText.includes('손절선') && !allText.includes('지지선')) {
      const fallback = '지금 문제는 살지 말지가 아니라, 리스크 기준 없이 들어가려는 반복 패턴입니다.\n기준 없는 매수는 투자가 아니라 불안의 반복입니다.';
      personaText.echo = personaText.echo
        ? personaText.echo.trimEnd().replace(/[?。！!]$/, '') + ' ' + fallback
        : fallback;
    }
  }
}

// applyResponseGuard 호출부 + 전/후 디버그 로깅 + hasMarketData일 때 데이터 출처 라벨 부착.
// route.ts의 1라운드(r1)/2라운드(r2) 두 지점에서 questionType/hasMarketData 변수명만
// 다르고 나머지는 동일하게 중복되던 블록을 하나로 합침 — 로그 문구는 logLabel로 그대로 재현.
export async function applyResponseGuardWithDebugLogging(
  personaText: Record<TaggedPersonaKey, string>,
  params: {
    question: string;
    isInvestmentContext: boolean;
    getOrBuildMarketDataContext: (userMessage: string) => Promise<string>;
    logLabel: string;
  },
): Promise<void> {
  const { question, isInvestmentContext, getOrBuildMarketDataContext, logLabel } = params;
  const questionType = detectQuestionType(question);
  const hasMarketData = await hasMarketDataForGuard(question, questionType, getOrBuildMarketDataContext);
  const guardDebugBeforeText = Object.values(personaText).join('\n\n');
  console.log(`[guard-debug] ${logLabel} before applyResponseGuard`, {
    questionType,
    hasMarketData,
    length: guardDebugBeforeText.length,
    hasPriceLikeNumber: /\d{1,3}(,\d{3})+/.test(guardDebugBeforeText),
    sample: guardDebugBeforeText.slice(0, 300),
  });
  applyResponseGuard(personaText, questionType, hasMarketData);
  normalizeNoMarketDataInvestmentPersonaText(personaText, {
    userMessage: question,
    questionType,
    hasMarketData,
    isInvestmentContext,
  });
  const guardDebugAfterText = Object.values(personaText).join('\n\n');
  console.log(`[guard-debug] ${logLabel} after applyResponseGuard`, {
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
      await getMarketDataSourceLabelForGuard(question, questionType, getOrBuildMarketDataContext),
    );
  }
}
