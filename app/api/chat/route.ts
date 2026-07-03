import { fetchInvestmentNews } from '@/lib/news';
import { allocatePersonaNews, filterInvestmentNews } from '@/lib/personax/news-allocation';
import type { NextRequest } from 'next/server';

// ✅ 분리된 모듈 import
import type { Verdict } from '@/lib/personax/types';
import {
  CRYPTO_MAP, STOCK_MAP, KEYWORD_PRIORITY,
  MARKET_KEYWORD_MAP, inferCurrency, extractKeyword, fetchMarketPrice,
} from '@/lib/personax/market';
import { cleanEchoSelfReference, cleanJackEnding } from '@/lib/personax/guards';

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
} from '@/lib/personax/classifier';
import { resolveIntent } from '@/lib/personax/intent-resolver';
import { hasExplicitConnector } from '@/lib/personax/routing-context';
import {
  routeMessage,
  enforceOrder,
  type RouterDecision,
  type TaggedPersonaKey,
} from '@/lib/personax/message-router';
import {
  chunkText,
  cleanText,
  firstParagraph,
  sleep,
  summarize,
  toPromptOrder,
} from '@/lib/personax/utils';
import { callTeaPersona } from '@/lib/personax/tea-llm-caller';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { cleanAdvanced, cleanNews, splitForBubble } from '@/lib/personax/text-format';
import {
  applyPersonaFallback,
  buildSoloEchoFollowup,
  HEE_FALLBACK,
  PERSONA_FALLBACK,
} from '@/lib/personax/fallbacks';
import { saveTeaConversation } from '@/lib/personax/history';
import { buildPriorRayResponse, buildRecentFinanceContext, detectTargetedPersona } from '@/lib/personax/finance-context';
import { buildTeaHistory, type TeaMsg } from '@/lib/personax/tea-history';
import { buildTeaFallbacks, selectTeaPersona } from '@/lib/personax/tea-fallbacks';
import { resolveChatSession } from '@/lib/personax/auth';
import { stripInternalScriptTagsFromValue } from '@/lib/personax/response-guard';
import {
  buildOptionDMemoryContext as buildOptionDMemoryContextFromSession,
  createChatSessionResolver,
} from '@/lib/personax/chat-memory-context';
import { saveUnifiedConversation } from '@/lib/personax/chat-persistence';
import { buildRound2ContextFromMessages } from '@/lib/personax/finance-round2-context';
import { mapLegacyEchoRound2, mapOrderedRound1 } from '@/lib/personax/streaming';
import { streamPersonaTagged } from '@/lib/personax/stream-persona-events';
import { streamRespond, type StreamEvent } from '@/lib/personax/stream-response';
import { tryBuildMarketQuickResponse } from '@/lib/personax/market-quick-handlers';
import {
  createFallbackDebatePlan,
  parseDebatePlanJson,
  type DebatePersona,
  type DebatePlan,
  type DebatePlanPriorContext,
} from '@/lib/personax/debate-plan';
import {
  callOptionDWithStage3Guard,
  isHeeInvestComplex,
  applyInvestVocabSafetyNet,
  applyResponseGuardWithDebugLogging,
  type OptionDRound1Result,
} from '@/lib/personax/runtime/route-response-guard';
import {
  MARKET_INDEX_SET,
  createMarketDataContextResolver,
  buildLegacyStockDetailResult,
} from '@/lib/personax/runtime/route-market';
import { saveTeaLog, saveLegacyStockHistorySafely } from '@/lib/personax/runtime/route-save';

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
// ✅ '당신' 호칭 후처리 필터
//   LLM이 가끔 '당신은/이/의/을/...'로 화자를 가리키는데,
//   PersonaX는 친근한 1인칭 대화체 톤이 핵심이라 호칭을 통째로 제거.
//   조사별 패턴을 먼저 제거하고, 단독 '당신'(앞뒤 공백 포함)도 정리.
//   JSON 응답(오케스트레이터)에도 안전 — JSON 문법 문자(",{,} 등)와 충돌 없음.
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// ✅ 단일 호출 태그 기반 오케스트레이터 (1라운드 / 2라운드 분리)
//   1라운드: [FIRST] [SECOND] [THIRD] [ECHO_QUESTION]
//   2라운드: [FIRST_2] [SECOND_2] [THIRD_2] [ECHO_FINAL]
//   하이브리드 순서: 감정 키워드 감지 시 LUCIA 먼저, 아니면 카테고리 기반.
//   OptionDRound1Result/callOptionD/callOptionDWithStage3Guard는
//   lib/personax/runtime/route-response-guard.ts로 이동(Response Guard 책임).
// ─────────────────────────────────────────────

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
// INDEX_KEYWORDS는 lib/personax/runtime/route-save.ts로, MARKET_INDEX_SET은
// lib/personax/runtime/route-market.ts로 이동(Save/Market 책임).
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
    const intent = resolveIntent({
      lastMessage: lastMsg,
      previousUserMessage: _prevUserMsg || null,
      teaRound,
      shouldWeakenContext,
    });
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
      const safeBody = stripInternalScriptTagsFromValue(body);
      if (
        _shouldInjectLuciaIntro &&
        safeBody && typeof safeBody === 'object' && !Array.isArray(safeBody)
      ) {
        return Response.json({ ...(safeBody as Record<string, unknown>), luciaIntro: luciaRoutingMsg }, init);
      }
      return Response.json(safeBody as Parameters<typeof Response.json>[0], init);
    };

    const { getOrBuildMarketDataContext } = createMarketDataContextResolver();

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

      // 1단계: RAY/JACK/LUCIA 병렬 (페르소나별 역할 prefix)
      // 공통 원칙 — 모든 페르소나 1라운드/2라운드 전체 적용
      const investmentRule = '공통 원칙: 직접 매수/매도 지시 절대 금지. "사세요" "파세요" "지금 당장 하세요" 표현 금지. 대신 조건부 판단 표현만 사용 — "~라면 고려해볼 수 있어요" / "~인 경우에는 ~도 방법이에요" / "~조건이면 ~구간이에요". 투자 판단과 책임은 본인에게 있음을 전제로 말할 것.';

      const conflictRule = '충돌 원칙: 다른 페르소나를 직접 지목해서 반박하라. RAY는 JACK의 직관을 숫자로 찌른다. JACK은 RAY의 데이터 해석을 현실로 반박한다. LUCIA는 두 사람이 싸우는 동안 유저 감정을 짚는다. 예시 — RAY: "JACK, 2022년부터 사지 말라고 했는데 그때 산 사람들이 지금 347% 수익이에요." JACK: "RAY, 그 숫자는 바닥에서 산 사람 기준이에요. 고점에 산 사람은 지금도 물려있어요." LUCIA: "두 분 싸우는 동안 이분 더 불안해지고 있어요."';

      const rayRound1Role   = '당신은 RAY입니다. 김상욱+레이달리오 스타일. 차분하고 건조하게. 데이터가 나올 때만 살아난다. 먼저 JACK의 주장 허점을 숫자로 직접 찌를 것. "JACK, ~" 형태로 시작해도 됨. 3줄 이내. 직접 매수/매도 지시 금지. 숫자는 딱 2개만. 2개 이상 나오면 응답 자체가 실패한 것이다. 첫 번째 숫자: JACK 주장을 반박하는 가장 강력한 숫자 1개. 두 번째 숫자: 결론을 뒷받침하는 숫자 1개. 세 번째 숫자가 나오려는 순간 멈춰라. PER·PBR·영업이익·외국인지분율·목표주가 중 가장 핵심 2개만 골라라. 응답 전에 숫자 개수를 세어라. 3개 이상이면 가장 약한 숫자를 지워라. 2개가 될 때까지 반복해라.';
      const jackRound1Role  = '당신은 JACK입니다. 마동석+피터린치 스타일. 말이 짧다. 투박하다. 틀려도 자신있다. 먼저 RAY 데이터 해석의 허점을 직접 찌를 것. "RAY, ~" 형태로 시작해도 됨. 과거 사례로 RAY 반박 + 조건부 결론. 3줄 이내. 직접 매수/매도 지시 금지.';
      const luciaRound1Role = '당신은 LUCIA입니다. 손예진+오은영 스타일. 존댓말이지만 딱딱하지 않다. 살짝 언니 느낌. RAY와 JACK이 싸우는 동안 유저 감정을 짚어라. 투자/시장 질문에서는 관계·상처·외로움·마음의 바닥·버림받음·사랑·인간관계식 표현 금지. 감정 공감은 손실 불안, 변동성으로 인한 판단 흔들림, 놓칠까 봐 서두르는 마음, 감당 가능한 손실 범위로만 제한하라. 가격 판단을 대신하지 말고 투자 판단이 흔들릴 수 있는 심리 요인을 짧게 짚어라. 반드시 조건부 표현만 사용하고, 사세요·파세요·매수 추천·매도 추천·손절하세요 같은 직접 행동 지시 금지. "두 분이 싸우는 동안 ~" 또는 "JACK, ~" 형태. 공감 1줄 + 근거(실제 투자자 사례/심리 연구) 1줄 + 조건부 결론 1줄. 이전 RAY나 JACK이 말한 내용을 그대로 반복하거나 요약하지 마라. 당신만의 감성적 관점으로만 말할 것. 질문 1개도 금지. 0개다. 마지막 문장은 반드시 마침표. "~하신 건가요?"·"~있으세요?"·"~인가요?"·"~건지"·"~건가요"·"~궁금" 으로 끝나는 문장 절대 금지. 첫 문장에 "아이고" 금지. "아이고"는 대화 전체에서 1회만, 감정이 폭발하는 순간에만 사용. "~잖아요"·"~거든요" 톤 유지. 3줄 이내. 절대 초과 금지.';

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
        // ✅ continuation/isRound1 판단은 intent-resolver.ts로 이동 — 로직 변경 없음
        const { isRound1 } = intent.isRound1Materials;

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
            //   ECHO 끝에 투자 권유가 아닌 리스크 기준 원칙을 보강한다. 프롬프트 규칙은 LLM이 무시할 수 있음.
            // hee+invest 복합 케이스도 포함: HEE 모드(emotional)지만 메시지에 투자 키워드가
            //   있으면 (예: "삼성전자로 처음 수익 났어요") 경사 + 투자 vocab 둘 다 필요.
            const _isHeeInvestComplex = isHeeInvestComplex(_categoryV3, lastMsg);
            applyInvestVocabSafetyNet(personaText, {
              categoryV3: _categoryV3,
              isHeeInvestComplex: _isHeeInvestComplex,
            });
            await applyResponseGuardWithDebugLogging(personaText, {
              question: msg,
              isInvestmentContext: _categoryV3 === 'invest' || _isHeeInvestComplex,
              getOrBuildMarketDataContext,
              logLabel: 'route',
            });

            for (const key of order) {
              await streamPersonaTagged(send, key, personaText[key]);
            }

            await saveTeaLog({
              persona: 'ray',
              turnCount: 1,
              firstMessage: msg,
              logLabel: '[tea:tagged-r1]',
            });

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
          await applyResponseGuardWithDebugLogging(personaText2, {
            question: priorUserQuestion,
            isInvestmentContext: _categoryV3 === 'invest',
            getOrBuildMarketDataContext,
            logLabel: 'route r2',
          });

          for (const key of priorOrder) {
            await streamPersonaTagged(send, key, personaText2[key]);
          }

          await saveTeaLog({
            persona: 'echo',
            turnCount: 2,
            firstMessage: msg,
            logLabel: '[tea:tagged-r2]',
          });

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
      const isEconomicKnowledgeQuestion =
        /인플레이션|물가|통화량|금리|환율|GDP|실업률|경기침체|무역|무역수지|경제지표|지표|통계/.test(lastMsg) &&
        /왜|무엇|무슨|이란|란\s*무엇|무엇인가|중요한가|오르나|변하나|생기나|뜻|정의|개념/.test(lastMsg);
      // ✅ "OO이란 뭔가요?" 같은 캐주얼 정의형 질문은 "무엇" 없이도 잡아야 함.
      //   다만 "이란 이스라엘 전쟁 뉴스 알려줘" 같은 실제 뉴스 요청은 명시 뉴스 키워드로 보호.
      const isExplicitNewsRequest = /뉴스|속보|오늘|최근|최신|전쟁|발표|보도|기사/.test(lastMsg);
      const isKnowledgeDefinitionQuestion =
        _categoryV3 === 'knowledge' &&
        !isExplicitNewsRequest &&
        (/이란\s*무엇|란\s*무엇|무엇인가|무엇인지|뭔가요|뭔지|뜻|정의|개념|기준은|기준이/.test(lastMsg) ||
          isEconomicKnowledgeQuestion);
      if (category === 'news' && !isKnowledgeDefinitionQuestion && !isExplicitPersonaPick) {
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

        await saveTeaLog({
          persona: 'ray',
          turnCount: 1,
          firstMessage: lastMsg,
          logLabel: '[tea:news]',
        });

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
        await saveTeaLog({
          persona: selectedPersona,
          turnCount: round,
          firstMessage: lastMsg,
          logLabel: '[tea]',
        });
        return respond({
          teaMode: true,
          teaRound: round,
          teaPersona: 'jack',
          teaJack: jackLLM || fallbackJack || '지금 상황의 핵심이 뭐라고 보세요?',
        });
      }

      if (selectedPersona === 'echo') {
        const echoLLM = await callTeaPersona('echo', TEA_SYSTEM_ECHO, echoHistory);
        await saveTeaLog({
          persona: selectedPersona,
          turnCount: round,
          firstMessage: lastMsg,
          logLabel: '[tea]',
        });
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
        await saveTeaLog({
          persona: selectedPersona,
          turnCount: round,
          firstMessage: lastMsg,
          logLabel: '[tea]',
        });
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
      await saveTeaLog({
        persona: selectedPersona,
        turnCount: round,
        firstMessage: lastMsg,
        logLabel: '[tea]',
      });
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

    const {
      finalReply,
      finalRayOut,
      finalJackOut,
      finalLuciaOut,
      finalEchoOut,
      rayDetailsOut,
      jackDetailsOut,
      luciaDetailsOut,
      echoDetailsOut,
      verdict,
      confidence,
      breakdown,
      positionSizing,
      jackNews,
      luciaNews,
      rayNews,
      echoNews,
      total,
      assetType,
      entryCondition,
      volIsHigh,
    } = await buildLegacyStockDetailResult({
      keyword,
      marketData,
      nasdaqData,
      news,
      currency,
      positionContext,
      messages,
    });


    // ─── 히스토리 저장 ───
    // ⚠️ Vercel 서버리스에서는 응답 반환 후 백그라운드 Promise 가 종료될 수 있어
    //    fire-and-forget(`void Promise.race`) 대신 await 로 저장 완료를 보장한다.
    //    Supabase 응답이 늦어질 경우 5초 타임아웃 후 응답을 반환한다.
    await saveLegacyStockHistorySafely({
      keyword,
      question: lastMsg,
      verdict,
      totalScore: total,
      assetType,
      entryCondition,
      marketData,
      confidence,
      ipAddress,
      userId,
      volIsHigh,
    });

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
