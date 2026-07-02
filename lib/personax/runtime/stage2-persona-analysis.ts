/**
 * Stage 2 — 페르소나 관점 분해 (LUCIA/JACK/RAY/ECHO_VIEW).
 *
 * message-router.ts의 runRoutedRequest 본문에서 이동(move-only, 동작 변경 없음).
 */
import { buildPersonaAnalysisPrompt } from '@/app/api/chat/prompts/orchestrator-tagged';
import {
  buildDecisionFrame,
  buildDecisionSummary,
} from '@/lib/personax/decision-frame';
import type { CategoryV3 } from '@/lib/personax/classifier';
import type { ChatMessage, LLMCaller } from '@/lib/personax/message-router';
import { OPTION_D_SYSTEM_DATA, extractTag } from '@/lib/personax/runtime/stage1-data-collection';

/**
 * Stage 2: 페르소나 관점 분해 (full 경로만 — solo·precomputedStages 재사용 시 호출 안 됨).
 */
export async function analyzePersonaViews(params: {
  callLLM: LLMCaller;
  messages: ChatMessage[];
  dataPack: string;
  legacyCategory: string;
  categoryV3: CategoryV3;
  lastMessage: string;
  marketDataPromptContext: string;
  memoryContext: string;
}): Promise<string> {
  const {
    callLLM,
    messages,
    dataPack,
    legacyCategory,
    categoryV3,
    lastMessage,
    marketDataPromptContext,
    memoryContext,
  } = params;

  const frame = buildDecisionFrame(lastMessage);
  const decisionSummary = buildDecisionSummary(frame);
  const rawAnalysisPrompt = buildPersonaAnalysisPrompt(
    messages,
    dataPack,
    legacyCategory,
    categoryV3,
  );
  // marketDataContext가 있을 때 Stage 2 프롬프트 앞에 시장 데이터 블록 주입.
  // Stage 2가 이 데이터를 보지 못하면 RAY_VIEW/JACK_VIEW가 원론적으로 생성되고,
  // Stage 3에서 marketDataContext를 받아도 personaViews가 이미 희석된 상태로 시작됨.
  const stage2MarketBlock = marketDataPromptContext
    ? `## 시장 데이터 (RAY/JACK 필수 활용)\n${marketDataPromptContext}\n- RAY는 high/low/rawHigh/rawLow 숫자를 반드시 언급해야 한다.\n- JACK은 price와 low를 기준으로 매수/보류 판단 근거를 제시해야 한다.\n- 위 숫자 외 임의 숫자 생성 금지.\n\n`
    : '';
  const stage2MemoryBlock = memoryContext
    ? `## 이전 결정 참고 (보조 맥락)\n${memoryContext}\n- 위 내용은 사용자의 과거 결정 맥락입니다. 현재 질문을 가장 우선하고, 과거 결정은 반복 패턴과 성향을 파악하는 참고로만 사용하십시오.\n- 과거 기록에 없는 사실을 만들거나 현재 질문의 답을 과거 결정으로 대체하지 마십시오.\n\n`
    : '';
  const analysisPrompt = `${stage2MarketBlock}${stage2MemoryBlock}${decisionSummary}\n\n${rawAnalysisPrompt}`;
  const analysisRaw = await callLLM('echo', OPTION_D_SYSTEM_DATA, [
    { role: 'user', content: analysisPrompt },
  ]);
  const luciaView = extractTag(analysisRaw, 'LUCIA_VIEW');
  const jackView = extractTag(analysisRaw, 'JACK_VIEW');
  const rayView = extractTag(analysisRaw, 'RAY_VIEW');
  const echoView = extractTag(analysisRaw, 'ECHO_VIEW');
  return `[LUCIA_VIEW]\n${luciaView}\n\n[JACK_VIEW]\n${jackView}\n\n[RAY_VIEW]\n${rayView}\n\n[ECHO_VIEW]\n${echoView}`;
}
