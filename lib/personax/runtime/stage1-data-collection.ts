/**
 * Stage 1 — 데이터 수집 / marketData 준비.
 *
 * message-router.ts의 runRoutedRequest 본문에서 이동(move-only, 동작 변경 없음).
 * 태그 추출 유틸(extractTag)과 구조 라벨 정규식은 Stage 1/2/3 전체에서 공유되므로
 * 최초 소비 지점인 이 파일에 위치시키고 다른 Stage 파일에서 import한다.
 */
import { buildDataCollectionPrompt } from '@/app/api/chat/prompts/orchestrator-tagged';
import { buildMarketDataPromptContext } from '@/lib/personax/market-data';
import type { CategoryV3 } from '@/lib/personax/classifier';
import type { ChatMessage, LLMCaller } from '@/lib/personax/message-router';

/**
 * 페르소나 라벨 방어 스트리핑.
 * LLM이 few-shot 예시를 따라 본문에 "JACK:", "**LUCIA**:", "RAY :" 같은 헤더를 출력하면
 * 그 라벨이 다른 페르소나 버블(예: LUCIA 슬롯)에 그대로 표시되는 버그를 방지.
 * 라인 시작(^, m 플래그)에서만 스트리핑 — 본문 인용("OO이 'JACK은 옳다'고")은 보존.
 */
const PERSONA_LABEL_LINE_RE =
  /^\s*\**\s*(?:RAY|JACK|LUCIA|ECHO|루시아|루이사|루누님|루시|잭|짹|째앵|째액|레이꾼|레이|에코)\s*\**\s*[:：][^\S\n]*/gim;

export const stripPersonaLabelLines = (s: string): string =>
  s.replace(PERSONA_LABEL_LINE_RE, '').trim();

// Stage 1 (데이터 수집) / Stage 2 (페르소나 관점 분해) 전용 — 갈등 규칙 제외, 태그 추출 안정성 우선
export const OPTION_D_SYSTEM_DATA =
  'PersonaX 데이터 수집·분석 오케스트레이터입니다. ' +
  '요청한 태그 블록만 출력하고, ' +
  '코드펜스와 설명 문장은 금지합니다. ' +
  '⛔ 마크다운 사용 절대 금지.';

// ✅ 대괄호 구조 태그와 마크다운 헤더 구조 태그를 모두 경계/제거 대상으로 인식한다.
//   LLM이 "## SECOND"처럼 출력해도 사용자 화면 노출·블록 혼합을 막기 위함.
export const STRUCTURAL_LABELS = [
  'FIRST',
  'SECOND',
  'THIRD',
  'CLOSER',
  'FOURTH',
  'FIFTH',
  'LUCIA_VIEW',
  'JACK_VIEW',
  'RAY_VIEW',
  'ECHO_VIEW',
] as const;
export const STRUCTURAL_LABEL_PATTERN = STRUCTURAL_LABELS.join('|');
export const STRUCTURAL_TAG_RE = new RegExp(
  `\\[[A-Z_0-9]+\\]|^\\s*#{1,6}\\s*(?:${STRUCTURAL_LABEL_PATTERN})(?=\\s*(?:[:：-]|$))\\s*(?:[:：-]\\s*)?`,
  'gim',
);
export const STRUCTURAL_LABEL_LINE_RE = new RegExp(
  `^\\s*(?:#{1,6}\\s*)?(?:${STRUCTURAL_LABEL_PATTERN})(?=\\s*(?:[:：-]|$))\\s*(?:[:：-]\\s*)?`,
  'gim',
);

export const extractTag = (text: string | null, tag: string): string => {
  if (!text) return '';
  const re = new RegExp(
    `(?:\\[${tag}\\]|^\\s*#{1,6}\\s*${tag}(?=\\s*(?:[:：-]|$))\\s*(?:[:：-]\\s*)?)[^\\S\\n]*\\n?([\\s\\S]*?)(?=\\n\\s*(?:\\[[A-Z_0-9]+\\]|#{1,6}\\s*(?:${STRUCTURAL_LABEL_PATTERN})(?=\\s*(?:[:：-]|$)))|$)`,
    'im',
  );
  const m = text.match(re);
  const raw = (m?.[1] || '').trim().replace(STRUCTURAL_TAG_RE, '');
  return stripPersonaLabelLines(raw);
};

export const suppressUnsupportedMarketDataContext = (context: string): string => (
  /assetType:\s*real_estate\b/.test(context) ? '' : context
);

/**
 * marketData 준비 — 호출자가 override를 넘기지 않으면 buildMarketDataPromptContext로
 * 직접 조회 후 지원하지 않는 자산 유형(real_estate)을 억제.
 * runRoutedRequest 상단(솔로/일반 경로 분기 이전)에서 사용.
 */
export async function resolveMarketDataPromptContext(
  lastMessage: string,
  override?: string,
): Promise<string> {
  const rawMarketDataPromptContext = override ?? (await buildMarketDataPromptContext(lastMessage));
  return suppressUnsupportedMarketDataContext(rawMarketDataPromptContext);
}

/**
 * Stage 1: 데이터 수집 — emotional만 스킵, 나머지(invest/action/principle/knowledge)는 실행.
 *   · invest/knowledge: 웹 검색 ON으로 실시간 가격·뉴스·정책·거시경제 데이터 수집 → Stage 2/3 반박 근거.
 *   · action/principle: 웹 검색 OFF로 LLM이 정리한 맥락 데이터 수집 (실시간 불필요).
 *   · emotional: 데이터 수집 가치 없음 → Stage 1 LLM 호출 자체 스킵 (비용·지연 절감).
 */
export async function collectStageOneData(params: {
  callLLM: LLMCaller;
  messages: ChatMessage[];
  legacyCategory: string;
  lastMessage: string;
  categoryV3: CategoryV3;
}): Promise<string> {
  const { callLLM, messages, legacyCategory, lastMessage, categoryV3 } = params;
  const shouldEnableStage1Search = categoryV3 === 'invest' || categoryV3 === 'knowledge';
  const skipStage1 = categoryV3 === 'emotional';
  if (skipStage1) {
    return '';
  }
  const dataPrompt = buildDataCollectionPrompt(
    messages,
    legacyCategory,
    lastMessage,
    categoryV3,
  );
  const dataRaw = await callLLM('echo', OPTION_D_SYSTEM_DATA, [
    { role: 'user', content: dataPrompt },
  ], { enableSearch: shouldEnableStage1Search });
  return extractTag(dataRaw, 'DATA_PACK');
}
