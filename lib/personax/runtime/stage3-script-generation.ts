/**
 * Stage 3 — 대본 생성 (TikiTaka 4인 갈등 토론 + solo 단독 응답) / LLM 호출.
 *
 * message-router.ts의 runRoutedRequest 본문에서 이동(move-only, 동작 변경 없음).
 */
import {
  buildScriptPrompt,
  type AllPersonaKey,
} from '@/app/api/chat/prompts/orchestrator-tagged';
import {
  detectEmotionalSubtypeHee,
  type CategoryV3,
} from '@/lib/personax/classifier';
import { TEA_SYSTEM_JACK } from '@/app/api/chat/prompts/tea-jack';
import { TEA_SYSTEM_LUCIA } from '@/app/api/chat/prompts/tea-lucia';
import { TEA_SYSTEM_RAY } from '@/app/api/chat/prompts/tea-ray';
import { TEA_SYSTEM_ECHO } from '@/app/api/chat/prompts/tea-echo';
import OpenAI from 'openai';
import { GoogleGenerativeAI, type GenerationConfig } from '@google/generative-ai';
import {
  createConversationState,
  recordMessage,
  recordSpeaker,
} from '@/lib/personax/conversation-state';
import {
  ECHO_VERDICT_MIN_STRUCTURE_RULE,
  ECHO_VERDICT_TURNING_POINT_RULE,
} from '@/lib/personax/prompts/rules';
import { extractKeySentence } from '@/lib/personax/quote-engine';
import { STRUCTURAL_LABEL_LINE_RE, extractTag } from '@/lib/personax/runtime/stage1-data-collection';
import type {
  ChatMessage,
  LLMCaller,
  RouterDecision,
  TaggedPersonaKey,
} from '@/lib/personax/message-router';

// 지연 초기화 — 모듈 로드 시점이 아닌 첫 호출 시점에 OpenAI 클라이언트 생성.
// 빌드 단계에서 OPENAI_API_KEY가 없어도 throw하지 않도록 함.
let openaiClient: OpenAI | null = null;
function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY 환경변수가 없습니다');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// Gemini 지연 초기화 — Stage 3 Gemini 분기(USE_GEMINI_STAGE3=true)에서만 사용.
let geminiClient: GoogleGenerativeAI | null = null;
function getGeminiClient(): GoogleGenerativeAI {
  if (!geminiClient) {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_GENERATIVE_AI_API_KEY 환경변수가 없습니다');
    }
    geminiClient = new GoogleGenerativeAI(apiKey);
  }
  return geminiClient;
}

/**
 * Stage 3 전용 GPT-4.1-mini 호출자.
 * (system, user) → string. 빈 응답 시 빈 문자열 반환.
 * full 경로 Stage 3 대본 생성에만 사용 — solo·Stage 1·Stage 2는 기존 callLLM 유지.
 */
async function callGPTMini(system: string, user: string): Promise<string> {
  const client = getOpenAIClient();
  const res = await client.chat.completions.create({
    model: 'gpt-4.1-mini',
    temperature: 0.95, // 갈등/스파크/개그 다양성 극대화
    presence_penalty: 0.3,
    frequency_penalty: 0.2,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  return res.choices[0]?.message?.content ?? '';
}

/**
 * Stage 3 Gemini 분기 — USE_GEMINI_STAGE3=true일 때 callGPTMini 대체.
 * 모델 ID는 GEMINI_STAGE3_MODEL env로 오버라이드 가능 (기본 gemini-3.5-flash).
 * Stage 1의 callTeaPersona Gemini 경로와 동일한 SDK·systemInstruction·generationConfig 패턴 사용.
 */
async function callGeminiStage3(system: string, user: string): Promise<string> {
  const modelName = process.env.GEMINI_STAGE3_MODEL || 'gemini-3.5-flash';
  const client = getGeminiClient();
  const model = client.getGenerativeModel({
    model: modelName,
    systemInstruction: system,
  });
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      maxOutputTokens: 1200,
      temperature: 0.95, // GPT 분기와 동일 — 갈등/다양성 유지
      thinkingConfig: { thinkingBudget: 0 },
    } as GenerationConfig,
  });
  const finishReason = result?.response?.candidates?.[0]?.finishReason;
  const blockReason = result?.response?.promptFeedback?.blockReason;
  console.log('[stage3-gemini-finish]', {
    model: modelName,
    finishReason: finishReason ?? null,
    hasBlockReason: Boolean(blockReason),
  });
  if (blockReason) {
    console.warn(`[stage3-gemini] ${modelName} 차단 — blockReason=${blockReason}`);
    return '';
  }
  try {
    return result?.response?.text?.() ?? '';
  } catch (e) {
    console.error(`[stage3-gemini] ${modelName} text() 추출 실패`, e);
    return '';
  }
}

/**
 * Stage 3 디스패처 — USE_GEMINI_STAGE3 플래그로 Gemini/GPT 분기.
 * true → callGeminiStage3 (gemini-3.5-flash 기본)
 * false/미설정 → callGPTMini (기존 gpt-4.1-mini)
 */
async function callStage3(system: string, user: string): Promise<string> {
  if (process.env.USE_GEMINI_STAGE3 === 'true') {
    return callGeminiStage3(system, user);
  }
  return callGPTMini(system, user);
}

const formatPreviousPersonaResponses = (
  previous: Array<{ name: string; text: string }>,
): string => {
  const body = previous
    .filter((item) => item.text.trim())
    .map((item) => `${item.name}:\n${item.text.trim()}`)
    .join('\n\n');

  return body
    ? `\n\n### Previous Persona Responses\n${body}\n`
    : '';
};

const formatPreviousPersonaQuoteContext = (
  previous: Array<{ name: string; text: string }>,
): string => {
  const body = previous
    .map((item) => ({
      name: item.name,
      quote: extractKeySentence(item.text, 80),
    }))
    .filter((item) => item.quote)
    .map((item) => `${item.name} said:\n"${item.quote}"`)
    .join('\n\n');

  return body
    ? `\n\n### Previous Persona Context\n${body}\n\nUse the quotes above as context only. You do not have to agree or disagree. Do not repeat them; add a new point from your own perspective.\n`
    : '';
};

const buildTikiTakaBlockPrompt = (
  basePrompt: string,
  tag: string,
  personaName: string,
  previous: Array<{ name: string; text: string }>,
): string => `${basePrompt}

## TikiTaka Engine V1 — Context Passing
이번 호출에서는 [${tag}] 블록만 작성한다.

${formatPreviousPersonaResponses(previous)}
${formatPreviousPersonaQuoteContext(previous)}
위 내용은 참고(Context)로만 사용한다.
동의하거나 반박할 필요는 없다.
앞 발언을 복사하지 말고, ${personaName}의 관점으로 새로운 관점을 추가하라.
이미 나온 내용을 반복하지 마라.

출력 형식:
[${tag}]
{${personaName} 본문만 작성}

다른 태그와 설명 문장은 출력하지 마라.`;

// Stage 3 (대본 작성) 전용 — 갈등 토론 6대 규칙 + 존댓말 절대 규칙
export const OPTION_D_SYSTEM = `PersonaX 4인 갈등 토론 대본 작성자입니다.

반드시 지켜야 할 규칙:
1. [FIRST] 발화자는 데이터/숫자로 시작
2. 두 번째 발화자는 첫 번째를 직접 호명하며 반박
   예: "RAY, 그 논리면..." "LUCIA, 그게 맞아요?"
3. 세 번째 발화자는 두 발화자 모두 공격
4. [CLOSER]는 싸움 멈추고 본질 찌르기
5. 최소 1회 직접 호명 반박 필수
6. 태그 블록만 출력. 마크다운 금지.

기본 어미는 존댓말 (~요 / ~입니다 / ~해요). 단, JACK은 아래 규칙 예외.

🚨 JACK 말투 강제 규칙 (다른 모든 규칙보다 우선)
JACK 발화([SECOND] 또는 [CLOSER] 블록)는
반드시 ~다 / ~야 / ~거든 / ~잖아 / ~없어 / ~이다 로 끝낼 것.
~요 / ~습니다 / ~입니다 로 끝나는 문장 절대 금지.
예시: "지금 들어가면 늦어." / "손절선 없으면 하지 마."
     "그게 문제야." / "리스크가 너무 크다."

ECHO는 무겁고 짧되 존댓말:
  좋은 예: "그게 핵심입니다."
           "먼저 정해야 하지 않나요?"
  나쁜 예: "그게 핵심이야." "정해야 해."

페르소나끼리 호명 반박도 존댓말:
  좋은 예: "RAY, 그 논리면 2022년에도 사야 했잖아요."
  나쁜 예: "RAY, 그건 틀렸어."`;

// ──────────────────────────────────────────────────────────────────────────
// postProcessPersonaOutput — LLM 출력 후 4가지 안전 필터 일괄 적용.
//   1) few-shot 누수 감지 → 빈 문자열 반환 (재생성 트리거용)
//   2) 투자 법적 표현 교체 (직접 행동 지시 → 정보 제공 형태)
//   3) 자기 지칭(3인칭) 제거 — 페르소나별 정확히 자기 이름만
//   4) 자기 호칭(형/오빠/누나/언니) → "제가"로 치환
// runRoutedRequest의 solo·full 경로 양쪽 호출에서 사용.
// ──────────────────────────────────────────────────────────────────────────

// 투자 법적 표현 교체 — 더 긴/구체적인 패턴 우선 (매수하세요 → 사세요 순)
const LEGAL_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/매수하세요/g, '진입을 고려해볼 수 있어요'],
  [/매도하세요/g, '비중 축소를 검토해볼 수 있어요'],
  [/사세요/g, '진입을 고려해볼 수 있어요'],
  [/파세요/g, '비중 축소를 검토해볼 수 있어요'],
  [/반드시\s*오릅니다/g, '상승 신호가 보여요'],
  [/오릅니다/g, '상승 가능성이 있어요'],
  [/내립니다/g, '하락 가능성이 있어요'],
  [/무조건/g, '확률적으로'],
];

// 자기 지칭 — 페르소나별 (영문 + 한국어 별칭). 해당 페르소나 슬롯에서만 제거.
// 매치 시 트레일링 구두점·공백까지 함께 제거해 자연스러운 문장 유지.
const SELF_REF_PATTERNS: Record<AllPersonaKey, RegExp> = {
  jack:  /(?<![가-힣a-zA-Z])(?:JACK|잭|짹|째앵|째액)(?:이|가|은|는)?\s*(?:한\s*마디(?:\s*할게요|\s*할\s*게요)?|보기엔|보면|봤을\s*때|말하면|분석하면|판단하면)\s*[,.]?\s*/gi,
  lucia: /(?<![가-힣a-zA-Z])(?:LUCIA|루시아|루이사|루누님|루시)(?:가|는|이|은)?\s*(?:한\s*번|보기엔|보면|봤을\s*때|말하면|분석하면)\s*[,.]?\s*/gi,
  ray:   /(?<![가-힣a-zA-Z])(?:RAY|레이꾼|레이)(?:가|는|이|은)?\s*(?:분석하면|보면|보기엔|봤을\s*때|말하면|판단하면)\s*[,.]?\s*/gi,
  echo:  /(?<![가-힣a-zA-Z])(?:ECHO|에코)(?:가|는|이|은)?\s*(?:말하면|보면|판결하면|보기엔|봤을\s*때)\s*[,.]?\s*/gi,
};

// 자기 이름 + 쉼표 호명 — "LUCIA, 그게..." / "잭, 그건..." 같이 줄 시작에서
// 자기 자신을 부르고 들어오는 패턴 제거. 라인 시작(^)에서만 매치 — 다른 페르소나
// 호명(예: JACK 슬롯의 "RAY, 그 논리면...")은 건드리지 않음.
// 영문 대문자: 쉼표 필수 / 한국어: 쉼표 선택(자연 문장 흐름 고려).
const SELF_NAME_LINE_PATTERNS: Record<AllPersonaKey, ReadonlyArray<RegExp>> = {
  lucia: [/^LUCIA[,，]\s*/gim, /^루시아[,，]?\s*/gim],
  jack:  [/^JACK[,，]\s*/gim,  /^잭[,，]?\s*/gim],
  ray:   [/^RAY[,，]\s*/gim,   /^레이[,，]?\s*/gim],
  echo:  [/^ECHO[,，]\s*/gim,  /^에코[,，]?\s*/gim],
};

// 자기 소개 — "JACK입니다." / "저는 JACK" / "잭입니다" 류 통째로 제거.
// JACK 캐릭터(존댓말 금지)와 본문 톤(직설)에서 이런 자기 소개는 캐릭터 붕괴 신호.
// 매칭 시 종결부호·트레일링 공백까지 같이 제거해 자연 문장 흐름 보존.
const SELF_INTRO_PATTERNS: Partial<Record<AllPersonaKey, RegExp>> = {
  jack: /(?<![가-힣a-zA-Z])(?:저는\s+)?(?:JACK|잭|짹|째앵|째액)(?:은|는|이|가)?\s*(?:입니다|이에요|이야|예요|이다)\s*[.!?]?\s*/gi,
  lucia: /(?<![가-힣a-zA-Z])(?:저는\s+)?(?:LUCIA|루시아|루이사)(?:은|는|이|가)?\s*(?:입니다|이에요|이야|예요|이다)\s*[.!?]?\s*/gi,
  ray: /(?<![가-힣a-zA-Z])(?:저는\s+)?(?:RAY|레이)(?:은|는|이|가)?\s*(?:입니다|이에요|이야|예요|이다)\s*[.!?]?\s*/gi,
  echo: /(?<![가-힣a-zA-Z])(?:저는\s+)?(?:ECHO|에코)(?:은|는|이|가)?\s*(?:입니다|이에요|이야|예요|이다)\s*[.!?]?\s*/gi,
};

// 자기 호칭 — 모든 페르소나 공통. 형/오빠/누나/언니 → 제가 치환.
// lookbehind로 "큰형/작은오빠" 같은 합성어 매치 차단.
const SELF_TITLE_RE =
  /(?<![가-힣])(?:형|오빠|누나|언니)(?:이|가)\s+(보기엔|봤을\s*때|말하면|보면|분석하면)/g;

// Few-shot 예시 직접 복사 감지 — 매치 시 빈 문자열 반환 (재생성 트리거)
const FEW_SHOT_LEAK_PATTERNS: ReadonlyArray<RegExp> = [
  /지난번\s*투자\s*얘기\s*이어서네요\.?\s*숫자로는\s*저점이라고\s*하는데/,
  /지난번\s*투자\s*얘기에서\s*나눴던\s*것들이\s*계속\s*맴도는\s*거네요/,
  /그\s*동안\s*생각해보신\s*게\s*있으신가요\?\s*아니면\s*지금\s*한\s*번\s*더/,
];

// 희(喜) 모드에서 JACK·RAY가 자주 흘리는 찬물 어휘. 프롬프트로 막아도 GPT-4.1-mini가
// 가끔 "리스크/책임/부담/갈등" 등으로 양면 프레이밍 → 축하 자리 분위기 깎임.
// 매치 시 발화 전체를 사전 안전 fallback으로 교체(축하 톤 보장 우선).
const HEE_FORBIDDEN_RE = /리스크|손절|손실|위험|책임|부담|균형|경고|조심|방심|함정|갈등/;
const HEE_FALLBACKS: Partial<Record<AllPersonaKey, string>> = {
  jack: '잘 됐습니다. 본인이 진짜 해낸 거예요.',
  ray:  '이런 순간은 통계적으로 드뭅니다. 오래 기억될 만한 가치가 있어요.',
};

export const postProcessPersonaOutput = (
  text: string,
  personaKey: AllPersonaKey,
  options: { heeMode?: boolean } = {},
): string => {
  if (!text) return text;

  // 1) Few-shot 누수 감지 — 매치 시 빈 문자열 (caller가 fallback 처리)
  for (const pat of FEW_SHOT_LEAK_PATTERNS) {
    if (pat.test(text)) {
      console.warn(
        '[postProcessPersonaOutput] few-shot 누수 감지 — 빈 문자열 반환',
        '| persona:', personaKey,
        '| pattern:', pat.source.slice(0, 40),
        '| text 30자:', text.slice(0, 30),
      );
      return '';
    }
  }

  let out = text;

  // 2) 투자 법적 표현 교체 (모든 페르소나 공통)
  for (const [pat, replacement] of LEGAL_REPLACEMENTS) {
    out = out.replace(pat, replacement);
  }

  // 3) 자기 지칭 제거 — 해당 페르소나 슬롯에서만 자기 이름 제거
  //    (cross-reference "RAY가 봤을 때"는 JACK 슬롯에선 보존 — 호명 반박이 의도된 충돌)
  const selfRefRe = SELF_REF_PATTERNS[personaKey];
  if (selfRefRe) {
    out = out.replace(selfRefRe, '');
  }

  // 3-1) 라인 시작 자기 이름 + 쉼표 호명 제거 — "LUCIA, 그게..." / "잭, 그건..."
  //      다른 페르소나 호명("RAY, 그 논리면...")은 슬롯이 다르므로 건드리지 않음.
  const selfNameLineRes = SELF_NAME_LINE_PATTERNS[personaKey];
  if (selfNameLineRes) {
    for (const re of selfNameLineRes) {
      out = out.replace(re, '');
    }
  }

  // 3-2) 자기 소개 제거 — "JACK입니다." / "저는 JACK" / "잭이에요." 류 통째로 삭제.
  //      JACK 캐릭터(존댓말 금지)·본문 톤(직설)과 충돌하는 자기 소개 패턴.
  //      다른 페르소나도 LLM이 가끔 자기 소개 출력 → 4명 모두 적용.
  const selfIntroRe = SELF_INTRO_PATTERNS[personaKey];
  if (selfIntroRe) {
    out = out.replace(selfIntroRe, '');
  }

  // 4) 자기 호칭 치환 — 형/오빠/누나/언니 + 이/가 + 동사 → 제가 + 동사
  out = out.replace(SELF_TITLE_RE, '제가 $1');

  // 4-1) [/ECHO_QUESTION] 닫는 태그 누수 제거 — LLM이 가끔 닫는 태그를 본문에 노출.
  out = out.replace(/\[\/ECHO_QUESTION\]\??/g, '');

  // 4-1-1) 줄 시작 구조 라벨 제거 — "## SECOND" / "SECOND:" 류 내부 태그 누수 차단.
  out = out.replace(STRUCTURAL_LABEL_LINE_RE, '');

  // 4-2) JACK 3인칭 자기 호명 제거 — JACK이/JACK은/JACK의 → '' (jack 슬롯에서만 적용).
  //      Hidden Objective(시간 낭비 극혐) 톤에서 3인칭 자기 호명은 캐릭터 붕괴 신호.
  if (personaKey === 'jack') {
    out = out.replace(/(?<![가-힣a-zA-Z])(?:JACK|잭)(?:이|은|의)\s*/g, '');
  }

  // 4-3) 희(喜) 모드 안전망 — JACK·RAY가 찬물 어휘 흘리면 발화 전체 fallback 교체.
  //      프롬프트 가드에도 GPT-4.1-mini가 "리스크/책임/부담" 양면 프레이밍으로 새는 케이스 차단.
  if (options.heeMode && HEE_FORBIDDEN_RE.test(out)) {
    const fb = HEE_FALLBACKS[personaKey];
    if (fb) {
      console.warn(
        '[postProcessPersonaOutput] hee 모드 금지 어휘 검출 → fallback 교체',
        '| persona:', personaKey,
        '| text 40자:', out.slice(0, 40),
      );
      return fb;
    }
  }

  // 5) 마크다운 제거 — GPT-4.1-mini 등 마크다운 강조 성향 모델 대응.
  //    **볼드**, *이탤릭*, ## 헤더, ~~취소선~~, __밑줄__ 모두 일반 텍스트로.
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1');                    // **볼드**
  out = out.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1');         // *이탤릭*
  out = out.replace(/#{1,6}\s/g, '');                             // ## 헤더
  out = out.replace(/~~([^~]+)~~/g, '$1');                        // ~~취소선~~
  out = out.replace(/__([^_]+)__/g, '$1');                        // __밑줄__

  // 6) 깨진 문장 정상화 — 마침표/물음표/느낌표 직후 명사 없이 "처럼"이 붙는 패턴.
  //    GPT-4.1-mini 등이 문장을 잘라 "띄우니까요.처럼 ..." 같은 비문을 생성하는 케이스 대응.
  //    "처럼"은 앞에 명사가 와야 하므로 "그처럼"으로 보정해 의미 흐름 유지.
  out = out.replace(/([.!?])\s*처럼/g, '$1 그처럼');

  // 7) ECHO 전용 — 마지막 문장 종결 ? → . 일반화. JACK/LUCIA/RAY 절대 미적용.
  if (personaKey === 'echo') {
    out = out.replace(/\?(\s*)$/, '.$1');
  }

  // 연속 공백·줄바꿈 정리
  out = out.replace(/[^\S\n]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  return out;
};

/** Stage 3 raw 출력에서 "PersonaX 결론" 블록이 새어 들어온 경우 제거 */
const stripDecisionSummaryBlock = (value: string): string => {
  if (!value) return value;

  const summaryStart = value.match(/(?:^|\r?\n)[ \t]*PersonaX 결론[\s\S]*$/m);
  if (!summaryStart || summaryStart.index === undefined) return value;

  return value.slice(0, summaryStart.index).trimEnd();
};

/**
 * solo 단독 응답 — Stage 1(데이터 수집)·Stage 2(4-persona 관점) 스킵 경로.
 * 1개 페르소나만 응답하면 되므로 4-persona views 불필요 → LLM 호출 1회.
 */
export async function runSoloScriptGeneration(params: {
  callLLM: LLMCaller;
  messages: ChatMessage[];
  lastMessage: string;
  legacyCategory: string;
  effectiveSoloPersona: AllPersonaKey;
  firstPersona: AllPersonaKey;
  categoryV3: CategoryV3;
  hasPriorConversation: boolean;
  closerPersona: AllPersonaKey;
  decisionType: string;
  marketDataPromptContext: string;
}): Promise<{ soloContent: string; soloKey: TaggedPersonaKey }> {
  const {
    callLLM,
    messages,
    lastMessage,
    legacyCategory,
    effectiveSoloPersona,
    firstPersona,
    categoryV3,
    hasPriorConversation,
    closerPersona,
    decisionType,
    marketDataPromptContext,
  } = params;

  const display = effectiveSoloPersona.toUpperCase();
  // ✅ 페르소나별 톤 시스템 프롬프트 — solo 응답에서 캐릭터 톤 유지 보장.
  //   TEA_SYSTEM_* 는 각 페르소나의 어조/말투/위계/금지 표현 등 정체성 핵심.
  //   OPTION_D_SYSTEM의 "태그 블록만 출력" 지시와 결합해 [FIRST] 태그 + 페르소나 톤 둘 다 강제.
  const personaSystem: Record<AllPersonaKey, string> = {
    jack: TEA_SYSTEM_JACK,
    lucia: TEA_SYSTEM_LUCIA,
    ray: marketDataPromptContext ? `${TEA_SYSTEM_RAY}\n\n${marketDataPromptContext}` : TEA_SYSTEM_RAY,
    echo: TEA_SYSTEM_ECHO,
  };
  const soloSystem = `${personaSystem[effectiveSoloPersona]}\n\n---\n\n${OPTION_D_SYSTEM}`;
  // 의견/주제 질문 패턴 감지 — JACK 안부 섹션을 프롬프트에서 제외할지 결정.
  //   "어떻게 생각해/의견은/어떻게 봐/분석" 등은 직전 주제에 대한 의견 질문이지
  //   안부 질문 아님. LLM이 JACK 안부 섹션을 보면 verbatim 3-line 구조를 따라가는
  //   경향이 있어 의견 질문엔 섹션 자체를 노출하지 않는 게 가장 안전.
  const isOpinionStyleQuestion = /어떻게\s*생각|의견은|어떻게\s*봐|분석해|어떻게\s*판단|어떻게\s*보(?:세요|시는|냐)|네가\s*보기엔|당신이\s*보기엔/.test(lastMessage);
  // Stage 3만 실행 — personaViews는 빈 문자열로 buildScriptPrompt 통과 (style/vocab 가드 유지).
  const soloPrompt = `${buildScriptPrompt(
    messages,
    '',
    legacyCategory,
    firstPersona,
    categoryV3,
    hasPriorConversation,
    closerPersona,
    decisionType,
  )}

## 🚨 단독 응답 모드 (최우선 — 다른 모든 규칙보다 우선)
유저가 ${display}을(를) 직접 호명했습니다. 이번 답변은 ${display} 한 명만 답합니다.

🚨🚨🚨 출력 형식 절대 규칙 (다른 모든 규칙보다 우선 — 위반 시 무효):
\`\`\`
[FIRST]
{${display}의 응답 본문}
\`\`\`
- 응답은 반드시 "[FIRST]\\n"으로 시작해서 ${display} 본문을 작성. 태그 누락 절대 금지.
- [SECOND], [THIRD], [CLOSER], [LUCIA_CLOSE], [ECHO_QUESTION] 블록은 출력하지 마십시오.
- ${display}의 톤·관점·말투를 그대로 살려 자연스럽게 답합니다. (시스템 프롬프트의 ${display} 캐릭터 규칙 엄수)
- 다른 페르소나(${(['LUCIA','JACK','RAY','ECHO'].filter((p) => p !== display)).join('/')})는 절대 언급·인용하지 않습니다.

## 🎯 질문 의도 파악 (단독 응답 모드 — 본문 작성 전 반드시 분류)
유저 메시지를 다음 3가지 중 하나로 분류한 뒤, 분류에 맞는 방식으로만 답하십시오.

### 1) 안부/상태 질문 — "${display} 너는 어때?" "${display} 요즘 어때?" "${display} 잘 지내?" "${display} 어떻게 지내?"
⚠️ "어떻게 생각해" / "의견은" / "어떻게 봐" / "분석해줘" 같이 **주제에 대한 견해**를 묻는 표현은
   여기 안부가 아니라 **2) 의견/주제 질문**으로 분류한다.
이 경우 답변 구조는 정확히 다음 3단으로:

**A. 이전 대화 주제를 1문장으로만 자연스럽게 언급** (직전 user/assistant 메시지에 주제가 있을 때만)
   - 예) "삼성전자 얘기하시다가 저한테 물어보시네요."
   - 예) "잠 못 드는 얘기 나누다가 갑자기 안부 물어주시니 반갑네요."
   - 예) "방금 비트코인 얘기 중이셨는데, 저 안부 챙겨주시는 거예요?"
   - 직전 주제가 없거나 첫 메시지면 이 1문장은 생략.
   - ⛔ 이 1문장에서 분석·의견·통계·숫자·종목 판단 일절 금지. 가벼운 전환문만.

**B. 자기 안부 (페르소나별 길이·톤 엄수)**
   - **JACK — 1줄로만 끝낼 것 (마동석 톤: 짧다·강하다·직설)**
     - ✅ 좋은 예: "나는 괜찮아요." / "오늘 컨디션 좋아요." / "사무실 커피가 진해서 깨어있네요."
     - ❌ 나쁜 예: "지금 상황이 답답하신 거 맞아요" (유저 분석 — LUCIA 영역, 금지)
     - ❌ 나쁜 예: "숫자로는 저점이라고 하는데" (이전 주제 분석 — RAY 영역, 금지)
     - ❌ 나쁜 예: "힘드시겠어요" (공감 톤 — LUCIA 영역, 금지)
     - ❌ 나쁜 예: 2줄 이상 / 풀어쓰기 / 둘러말하기
   - **LUCIA — 1~2줄 (부드럽고 따뜻한 톤)**
     - 예) "요즘 차분한 음악 자주 들으며 일하고 있어요."
     - 예) "오늘 햇살이 좋아서 마음이 조금 가볍네요."
   - **RAY — 1줄 (차분·건조)**
     - 예) "장 마감 데이터 정리 중이에요."
     - 예) "지표 점검하느라 모니터 앞이에요."
   - **ECHO — 1줄 (짧고 무겁게)**
     - 예) "조용히 듣고 있었습니다."
     - 예) "지금까지의 흐름을 정리하던 중이었어요."

**C. 유저에게 가벼운 되묻기 1줄** (선택)
   - 예) JACK: "유저님은 컨디션 어떠세요?"
   - 예) LUCIA: "마음은 어떠세요?"
   - 예) ECHO: "가장 묻고 싶은 한 가지가 뭐예요?"

⛔ **절대 금지 (안부 질문에서)**:
- 이전 주제(삼성전자/비트코인/감정/뉴스 등)에 대한 분석·의견·전망·통계·숫자·종목명 본격 인용
- "방금 그 ○○은 ~한 상황이에요" 식으로 주제로 끌어가기
- 유저 상황 추측·진단·조언

### 2) 의견/주제 질문 — "${display} ○○ 어떻게 봐?" "${display} ○○ 분석해줘" "${display}은/는 어떻게 생각해요?" "${display} 의견은?" "${display}이라면 어떻게?"
→ 해당 주제에 대한 ${display}의 관점·판단으로 답.
→ 주제(○○)가 명시되지 않고 ${display}만 호명한 경우(예: "${display}은 어떻게 생각해요?")는
   **직전 대화의 주제**(messages의 가장 최근 user 메시지)를 그 주제로 사용해 ${display} 관점으로 답한다.
   ⛔ 이때 직전 주제를 다른 주제(예: 삼성전자/비트코인 등 본 예시 단어)로 절대 바꾸지 말 것.
   직전 대화에 실제로 등장한 주제만 사용.
→ 시스템 프롬프트의 캐릭터 규칙(어조/구조/숫자 개수 등) 그대로 적용.

### 3) 감정 질문 — 유저가 자기 감정·상태·고민을 토로하며 ${display}을(를) 호명
→ 1줄 공감(캐릭터 톤 유지) + ${display}만의 관점·조언 1~2줄.

## ⛔ 자기 지칭 금지 (형/오빠/누나/언니 류)
- 유저가 ${display}을(를) "형/오빠/누나/언니" 등으로 부를 수 있지만,
  ${display}이(가) 스스로를 그렇게 지칭하는 것은 절대 금지.
- 자기 자신은 1인칭("저는/제가/제 생각엔") 또는 호칭 없이 자연 진행.
- ❌ "오빠가 보기엔..." (LUCIA가 자기를 오빠로 — 금지)
- ❌ "형이 한 마디 할게" (JACK이 자기를 형으로 — 금지)
- ❌ "누나가 말해줄게" (LUCIA가 자기를 누나로 — 금지)
- ✅ "제가 보기엔..." / "저는 이렇게 봐요" / 호칭 없이 바로 본론${
        display === 'JACK' && !isOpinionStyleQuestion
          ? `

## 🥊 JACK 안부 응답 — 마동석 톤 강제 (위 1) 안부/상태 질문 A·B·C 가이드 덮어쓰기)
🚨 이 섹션은 유저가 **JACK 자신의 상태/안부를 묻는 질문**일 때만 적용:
- ✅ 적용: "JACK 너는 어때?" / "JACK 요즘 어때?" / "JACK 잘 지내?" / "JACK 어떻게 지내?"
- ⛔ 미적용: "JACK은 어떻게 생각해?" / "JACK 의견은?" / "JACK ○○ 어떻게 봐?" — 이건 위 의견/주제 질문(2)이므로 본 섹션 무시하고 의견 질문 규칙으로 답할 것.
JACK에게 안부 묻는 질문이면 위 A·B·C 일반 가이드 무시하고 아래 규칙만 따릅니다.

## 🚨🚨🚨 출력 길이 절대 규칙 (최우선 — 위반 시 답변 무효)
**JACK 안부는 반드시 정확히 3줄. A·B·C 모두 출력. 어느 하나 빠지면 무효.**
- A 1줄 + B 1줄 + C 1줄 = **총 3줄** (각 줄 사이 줄바꿈 1개)
- ⛔ 1줄만 출력하고 끝내기 — 절대 금지 (대표적 위반 케이스)
- ⛔ 2줄만 출력 — 절대 금지
- ⛔ A 한 줄 던지고 끝내기 — 절대 금지

**A. 이전 주제 받아치기 (반드시 1줄, 개그/역발상)**
   - 패턴: "[직전 대화의 실제 주제]" 얘기하다가 갑자기 제 안부냐는 톤. 직전 주제는 messages의 마지막 user 메시지에서 직접 추출.
   - ✅ "[직전 주제] 얘기하다가 갑자기 나요?"
   - ✅ "[직전 주제] 얘기하다가 갑자기 안부 물어보시네요."
   - 직전 주제가 없거나 첫 메시지인 경우엔 다음 중 하나로 대체 (생략 금지 — 무조건 1줄 출력):
     - ✅ "처음 뵙는데 바로 제 안부예요?"
     - ✅ "갑자기 저요? 좋네요, 그런 질문."
     - ✅ "안부부터 시작이네요. 흔치 않아요."
   - ⛔ "그렇게 물어주시니 반갑네요" 류 따뜻한 받기 절대 금지
   - ⛔ "[직전 주제]" 부분은 실제 대화 주제로 치환할 것 — placeholder를 그대로 출력 금지.
   - ⛔ 본 예시의 단어("삼성전자/비트코인/투자/환율" 등 본 프롬프트의 가상 주제)를 그대로 복사 금지.
     실제 직전 대화에 그 단어가 없으면 절대 사용 금지.

**B. 자기 안부 (반드시 1줄, 무뚝뚝 + 한 방 비교 농담)**
   - 패턴: "나는 [상태]. [직전 주제 또는 일반 비교 대상]보다는요." 식. 일반 표현도 OK.
   - ✅ "나는 좋아요. [직전 주제]보다는요."
   - ✅ "괜찮아요. 당신보다 덜 고민하고 있어요."
   - ✅ "멀쩡해요. 요즘 시장보다는요."
   - ⛔ "잘 지내고 있습니다" / "괜찮아요." 단독 종결 금지 — 반드시 "○○보다는요" 식 한 방 비교/역발상 동반
   - ⛔ "오늘 컨디션 좋아요" 식 무미건조 답 금지 (마동석 한 마디 톤 필수)
   - ⛔ B를 생략하고 A→C로 건너뛰기 절대 금지
   - ⛔ "삼성전자/비트코인/코스피/지수" 같은 본 예시 단어는 실제 직전 대화에 그 단어가 있을 때만 사용.

**C. 유저 되묻기 또는 역질문 (반드시 1줄 — 생략 금지)**
   - ✅ "당신은요?"
   - ✅ "요즘 어떠세요?"
   - ✅ "그쪽이 더 안 좋아 보이는데요?"
   - ✅ "장 끝나고도 안 쉬세요?"
   - ⛔ C를 생략하고 B에서 끝내기 절대 금지 — 반드시 1줄 추가

## ✅ JACK 안부 완성 예시 (이 3줄 구조를 정확히 따를 것 — 단어가 아닌 패턴만 모방)
**구조 (실제 대화 맥락에 맞춰 단어 치환):**
\`\`\`
[직전 주제] 얘기하다가 갑자기 저예요?
나는 좋아요. [직전 주제]보다는요.
당신은요?
\`\`\`
⛔ 위 [직전 주제]는 실제 messages 마지막 user 메시지의 토픽으로 치환할 것.
   본 프롬프트에 나오는 다른 단어(삼성전자/비트코인/코스피 등)를 실제 대화에 없으면 가져오지 말 것.

⛔ JACK 안부 핵심 규칙 (절대 어기지 말 것):
1. **반드시 3줄 출력** — A·B·C 전부, 어느 하나라도 빠지면 답변 무효
2. 존댓말 유지 — "나요/저요" 같은 의문 종결 OK, "나야/괜찮아" 같은 반말 절대 금지
3. 이전 주제를 개그·역발상으로 한 번 비틀기 (A에서)
4. 각 줄은 반드시 1줄로 끊기 — 풀어쓰기·둘러말하기 금지
5. 따뜻한 척·다정한 척 절대 안 함 (LUCIA 영역 침범 금지)
6. 분석·공감·진단 절대 금지 (RAY/LUCIA 영역 침범 금지)
7. 마동석 영화 톤 — 무뚝뚝하지만 유머 한 방

🔍 출력 직전 자기 검증 체크리스트:
□ 정확히 3줄인가? (1줄/2줄이면 다시 작성)
□ A 줄에 이전 주제 비틀기가 있는가? (없으면 다시 작성)
□ B 줄에 "○○보다는요" 식 비교 한 방이 있는가? (단순 "괜찮아요"만이면 다시 작성)
□ C 줄에 유저 되묻기/역질문이 있는가? (없으면 다시 작성)
모두 ✅여야 출력. 하나라도 NO면 다시 작성.`
          : ''
      }

## 🎯 ${display} 단독 답변 톤 규칙 (안부 이외 — 의견/주제/감정/일반 질문 모두 적용)
${
  effectiveSoloPersona === 'ray'
    ? `### RAY 단독 답변 규칙 (캐릭터 식별 핵심 — 위반 시 LUCIA/JACK 톤 침범)
- ✅ **무조건 숫자/데이터 1~2개 포함** — PBR/PER/거래량/순매수/팩터/통계 % 등.
- ✅ 톤: 차분한 퀀트 애널리스트 — "~입니다" / "~해요" / "~거든요"
- ⛔ **공감 표현 절대 금지** — "힘드시죠/마음 아프시겠어요/이해해요/괜찮아요" 전부 금지
- ⛔ **감정 단어 금지** — "마음", "느낌", "두려움", "불안", "걱정" 본문 사용 금지
  (유저가 감정 토로해도 RAY는 데이터로 응답 — "지표상 ~한 구간입니다" 식)
- ⛔ "숫자보다 더 중요한 게 있어요" / "데이터 너머에 ~" 같은 LUCIA 톤 절대 금지
- ✅ 좋은 예: "지난번 투자 얘기하시다가 저한테요? DRAM 스팟가 기준으로 말씀드리면, 최근 4주 평균 변동성 ±3.2%, 외국인 순매수 12조원 유입 중입니다."
- ⛔ 나쁜 예 (LUCIA 침범): "숫자보다 더 중요한 게 있을 때가 있어요" / "마음이 가는 쪽으로..."`
    : effectiveSoloPersona === 'jack'
    ? `### JACK 단독 답변 규칙 (캐릭터 식별 핵심)
- ✅ **짧고 강하게** — 1~2줄 끊어 치기, 마동석 톤 (존댓말 유지)
- ✅ **결단 촉구** — 판단을 명확히 던질 것 ("~가 먼저예요" / "~가 잘못된 거예요")
- ✅ 외부(회사·시스템·구조·시장) 공격으로 유저 편들기
- ⛔ **공감 표현 절대 금지** — "힘드시죠/마음 아프시겠어요/괜찮아요/이해해요" 전부 금지
- ⛔ 길게 풀어쓰기·둘러말하기·다정한 척 금지 (LUCIA 영역 침범 금지)
- ⛔ 분석·통계·숫자 본격 인용 금지 (RAY 영역 침범 금지)
- ✅ 좋은 예: "그 회사가 미친 거예요. 당신 잘못 하나도 없어요."
- ✅ 좋은 예: "지금 들어가면 늦어요. 다음 기회를 보는 게 비대칭입니다."`
    : effectiveSoloPersona === 'lucia'
    ? `### LUCIA 단독 답변 규칙 (캐릭터 식별 핵심)
- ✅ **감정 먼저** — 1줄 공감으로 시작, 마음을 받아준 뒤 본론
- ✅ 톤: 부드러운 존댓말 — "~해요" / "~거든요" / "~잖아요" / "~네요"
- ✅ 따뜻하고 부드럽지만, 통찰 한 줄로 마무리 (오은영 + 손예진 + 캐시우드)
- ⛔ **숫자/통계/팩터 본격 인용 금지** — PBR/PER/% 등 데이터 인용은 RAY 영역
  (필요 시 미시 동향 변화율 "작년 5% → 올해 18%" 정도만 — 차트 분석 X)
- ⛔ 짧고 무뚝뚝한 결단 톤 금지 (JACK 영역 침범 금지)
- ⛔ "본질은 ~입니다" 식 무거운 판결 톤 금지 (ECHO 영역 침범 금지)
- ✅ 좋은 예: "그 말 들으셨을 때 얼마나 무거우셨을까요. 지금 제일 마음에 걸리는 게 뭐예요?"
- ✅ 좋은 예: "마음이 흔들리실 때가 가장 정직한 신호예요. 그 흔들림 따라가도 괜찮아요."`
    : effectiveSoloPersona === 'echo'
    ? `### ECHO 단독 답변 규칙 (캐릭터 식별 핵심)
- ✅ **본질 짚기 1문장** — 빠진 전제·가정·핵심을 짧고 무겁게 짚을 것
- ✅ **질문으로 끝내기** — 반드시 "?"로 끝나는 짧은 역질문 1개 (유저에게만)
- ✅ 톤: 짧고 단호한 존댓말 — "~입니다" / "~합니다" (손석희 + 레이달리오)
- ✅ "...... " 도입부 허용 (정적 후 무겁게 진입)
- ⛔ **종합·요약 절대 금지** — "세 분 의견 잘 들었어요" / "다 일리 있어요" 금지 (애초에 solo라 다른 페르소나 언급 자체가 무의미)
- ⛔ 길게 풀어쓰기·여러 줄 분석 금지 (2~3줄 이내)
- ⛔ 공감·위로 톤 금지 (LUCIA 영역 침범 금지)
- ⛔ 숫자·통계 본격 인용 금지 (RAY 영역 침범 금지)
- ✅ 좋은 예: "...... 결정 전에 빠진 게 하나 있어요. ○○이 ○○이라는 전제, 맞는 건가요?"
- ✅ 좋은 예: "...... 답은 이미 마음에 있어요. 그걸 안 본 척하는 이유는 뭐예요?"`
    : ''
}`;
  // callLLM의 persona 인자도 effectiveSoloPersona로 — 모델·로깅 일관성.
  // ✅ RAY 단독 + invest 카테고리일 때만 웹 검색 ON (실시간 시세 반영).
  const soloEnableSearch =
    effectiveSoloPersona === 'ray' && categoryV3 === 'invest';
  const soloRaw = await callLLM(effectiveSoloPersona, soloSystem, [
    { role: 'user', content: soloPrompt },
  ], { enableSearch: soloEnableSearch });
  const soloExtracted = extractTag(soloRaw, 'FIRST');
  // ✅ 후처리 필터 — 법적 표현 교체 / 자기 지칭 제거 / 호칭 치환 / few-shot 누수 차단
  let soloText = postProcessPersonaOutput(soloExtracted, effectiveSoloPersona);
  if (!soloText) {
    // 솔로 Stage 3 빈 응답 — LLM이 [FIRST] 태그 누락하거나 분류 혼동으로 빈 결과 반환 시 진단.
    //   rawLen > 0 && hasFirstTag=false → LLM이 응답은 했으나 태그 누락 (분류 혼동 가능성)
    //   extractedLen > 0 && postProcessedLen=0 → postProcess few-shot 누수 필터에 걸림
    console.warn('[solo-empty]', {
      persona: effectiveSoloPersona,
      categoryV3,
      legacyCategory,
      rawLen: (soloRaw || '').length,
      rawHead: (soloRaw || '').slice(0, 200),
      hasFirstTag: /\[FIRST\]/i.test(soloRaw || ''),
      extractedLen: soloExtracted.length,
      extractedHead: soloExtracted.slice(0, 100),
      postProcessedLen: soloText.length,
      lastMsgHead: lastMessage.slice(0, 80),
      msgCount: messages.length,
    });
    // salvage 미적용 — [FIRST] 누락 raw 응답은 분류 혼동으로 broken content일 확률 높음
    //   (verbatim 예시 복사 등). UX 정확성 위해 fallback 메시지 유지. 빈 응답 자체는
    //   상위 솔로 ECHO fallback이 닫는 질문으로 보완하므로 사용자 경험상 자연스럽게 닫힘.
    soloText = `${display} 답변을 생성하지 못했습니다`;
  }
  return {
    soloContent: soloText,
    soloKey: effectiveSoloPersona as TaggedPersonaKey,
  };
}

/**
 * Stage 3: 대본 작성 (FIRST/SECOND/THIRD/CLOSER/LUCIA_CLOSE, TikiTaka 순차 호출) — 일반 4명 경로.
 * Stage 1 실시간 수집 데이터(dataPack)를 Stage 3에 명시적으로 주입.
 * Stage 2 personaViews 가공 과정에서 숫자가 희석되어 GPT가 감으로만 반박하는 문제 차단.
 */
export async function runStage3ScriptGeneration(params: {
  messages: ChatMessage[];
  lastMessage: string;
  legacyCategory: string;
  personaViews: string;
  dataPack: string;
  decisionType: string;
  marketDataPromptContext: string;
  router: RouterDecision;
}): Promise<{
  first: string;
  second: string;
  third: string;
  closer: string;
  closerKey: TaggedPersonaKey;
  luciaClose: string;
  echoQuestion: string;
  firstKey: AllPersonaKey;
  secondKey: AllPersonaKey;
  thirdKey: AllPersonaKey;
}> {
  const {
    messages,
    lastMessage,
    legacyCategory,
    personaViews,
    dataPack,
    decisionType,
    marketDataPromptContext,
    router,
  } = params;

  const dataContext = dataPack
    ? `\n\n## 실시간 수집 데이터 (반박 시 이 숫자 사용 필수)\n${dataPack}\n\n⛔ 위 실시간 데이터의 숫자를 반박 시 반드시 인용할 것. 데이터에 없는 숫자를 만들어내지 말 것.\n\n`
    : '';
  // CLOSER=JACK일 때 ~요 종결 위반이 stage3-guard에 반복 적발 → 재호출 비용 발생.
  // OPTION_D_SYSTEM·buildScriptPrompt의 JACK 톤 규칙이 있음에도 GPT-4.1-mini가 어김 →
  // 프롬프트 말미(recency bias 작용 지점)에 CLOSER 슬롯 한정 마동석 톤 Few-shot + ~요 금지 재명시.
  const marketDataContext = marketDataPromptContext
    ? `\n\n${marketDataPromptContext}\n\n`
    : '';
  const closerJackRule = router.closerPersona === 'jack'
    ? `\n\n🚨 [CLOSER] JACK 말투 절대 규칙 (위반 시 답변 무효 — 다른 모든 규칙보다 우선):
- [CLOSER] 블록은 JACK이 담당. JACK은 ~요 / ~습니다 / ~입니다로 끝나는 문장 절대 금지.
- 반드시 ~다 / ~야 / ~거든 / ~잖아 / ~없어 / ~이다로 끝낼 것 (마동석 톤).
- ✅ 좋은 예: "지금 들어가면 늦어." / "손절선 없으면 하지 마." / "그게 문제야." / "리스크가 너무 크다."
- ❌ 나쁜 예: "지금 들어가면 늦어요." / "리스크가 너무 큽니다." / "조심하세요."
- 2줄 이내, 짧고 직설적으로 끊어 칠 것.`
    : '';
  const firstKey2 = ((router.order[0] || router.firstPersona || 'lucia') as AllPersonaKey).toUpperCase();
  const secondKey2 = ((router.order[1] || 'jack') as AllPersonaKey).toUpperCase();
  const thirdKey2 = ((router.order[2] || 'ray') as AllPersonaKey).toUpperCase();
  const closerKey2 = ((router.closerPersona || router.order[router.order.length - 1] || 'jack') as AllPersonaKey).toUpperCase();
  const emotionalBanLine = router.firstPersona !== 'lucia'
    ? `\n⛔ [FIRST]가 ${firstKey2}이므로 감정 공감 오프닝("마음이", "덜컥", "걱정되셨겠다") 금지.`
    : '';
  const scriptPrompt = `${marketDataContext}${dataContext}${buildScriptPrompt(
    messages,
    personaViews,
    legacyCategory,
    router.firstPersona,
    router.categoryV3,
    router.hasPriorConversation,
    router.closerPersona,
    decisionType,
  )}

기존 화면 표시 참고 순서: ${router.order.map((key, index) => `${index + 1}. ${key.toUpperCase()}`).join(' / ')}
🚨 블록별 페르소나 고정 — 위반 시 전체 답변 무효:
[FIRST] = 반드시 ${firstKey2} 캐릭터만 발언. 다른 페르소나 어투 시작 절대 금지.
[SECOND] = 반드시 ${secondKey2} 캐릭터만 발언.
[THIRD] = 반드시 ${thirdKey2} 캐릭터만 발언.
[CLOSER] = 반드시 ${closerKey2} 캐릭터만 발언.
FIRST(${firstKey2})는 CLOSER 불가.${emotionalBanLine}${closerJackRule}`;
  // Stage 3 — 기본 GPT-4.1-mini, USE_GEMINI_STAGE3=true 시 Gemini Flash로 분기.
  // solo·Stage 1·Stage 2는 기존 callLLM 유지.
  // 어휘 차단 규칙은 user prompt(buildScriptPrompt) 말미에 이미 포함 — system 중복 제거.
  const stage3System = OPTION_D_SYSTEM;
  let conversationState = createConversationState({
    question: lastMessage,
    topic: router.categoryV3 ?? legacyCategory,
  });
  const firstPrompt = buildTikiTakaBlockPrompt(scriptPrompt, 'FIRST', firstKey2, []);
  const firstRawBlock = await callStage3(stage3System, firstPrompt);
  const firstTikiTakaRaw = extractTag(firstRawBlock, 'FIRST') || '';
  conversationState = recordMessage(
    recordSpeaker(conversationState, firstKey2),
    firstKey2,
    firstTikiTakaRaw,
  );

  const secondPrompt = buildTikiTakaBlockPrompt(scriptPrompt, 'SECOND', secondKey2, [
    { name: firstKey2, text: firstTikiTakaRaw },
  ]);
  const secondRawBlock = await callStage3(stage3System, secondPrompt);
  const secondTikiTakaRaw = extractTag(secondRawBlock, 'SECOND') || '';
  conversationState = recordMessage(
    recordSpeaker(conversationState, secondKey2),
    secondKey2,
    secondTikiTakaRaw,
  );

  const thirdPrompt = buildTikiTakaBlockPrompt(scriptPrompt, 'THIRD', thirdKey2, [
    { name: firstKey2, text: firstTikiTakaRaw },
    { name: secondKey2, text: secondTikiTakaRaw },
  ]);
  const thirdRawBlock = await callStage3(stage3System, thirdPrompt);
  const thirdTikiTakaRaw = extractTag(thirdRawBlock, 'THIRD') || '';
  conversationState = recordMessage(
    recordSpeaker(conversationState, thirdKey2),
    thirdKey2,
    thirdTikiTakaRaw,
  );

  const closerPrompt = buildTikiTakaBlockPrompt(scriptPrompt, 'CLOSER', closerKey2, [
    { name: firstKey2, text: firstTikiTakaRaw },
    { name: secondKey2, text: secondTikiTakaRaw },
    { name: thirdKey2, text: thirdTikiTakaRaw },
  ]);
  const closerRawBlock = await callStage3(stage3System, closerPrompt);
  const closerTikiTakaRaw = extractTag(closerRawBlock, 'CLOSER') || '';
  conversationState = recordMessage(
    recordSpeaker(conversationState, closerKey2),
    closerKey2,
    closerTikiTakaRaw,
  );

  let luciaCloseRawBlock = '';
  if (router.categoryV3 === 'emotional') {
    const luciaClosePrompt = buildTikiTakaBlockPrompt(scriptPrompt, 'LUCIA_CLOSE', 'LUCIA', [
      { name: firstKey2, text: firstTikiTakaRaw },
      { name: secondKey2, text: secondTikiTakaRaw },
      { name: thirdKey2, text: thirdTikiTakaRaw },
      { name: closerKey2, text: closerTikiTakaRaw },
    ]);
    luciaCloseRawBlock = await callStage3(stage3System, luciaClosePrompt);
    conversationState = recordMessage(
      recordSpeaker(conversationState, 'LUCIA'),
      'LUCIA',
      extractTag(luciaCloseRawBlock, 'LUCIA_CLOSE') || '',
    );
  }
  void conversationState;

  const scriptRawFromTikiTaka = [
    `[FIRST]\n${firstTikiTakaRaw}`,
    `[SECOND]\n${secondTikiTakaRaw}`,
    `[THIRD]\n${thirdTikiTakaRaw}`,
    `[CLOSER]\n${closerTikiTakaRaw}`,
    luciaCloseRawBlock ? `[LUCIA_CLOSE]\n${extractTag(luciaCloseRawBlock, 'LUCIA_CLOSE') || ''}` : '',
  ].filter(Boolean).join('\n\n');

  const hasTikiTakaCoreBlocks =
    firstTikiTakaRaw.trim() &&
    secondTikiTakaRaw.trim() &&
    thirdTikiTakaRaw.trim() &&
    closerTikiTakaRaw.trim();
  const scriptRaw = hasTikiTakaCoreBlocks
    ? scriptRawFromTikiTaka
    : await callStage3(stage3System, scriptPrompt);
  console.log('[stage3-raw]', {
    length: scriptRaw.length,
    hasFirst: scriptRaw.includes('[FIRST]'),
    hasSecond: scriptRaw.includes('[SECOND]'),
    hasThird: scriptRaw.includes('[THIRD]'),
    hasEchoQuestion: scriptRaw.includes('[ECHO_QUESTION]'),
    categoryV3: router.categoryV3,
    question: lastMessage.slice(0, 30),
  });
  // ✅ 후처리 필터 — 슬롯별 페르소나 키로 postProcessPersonaOutput 적용.
  //    first/second/third → router.order[0/1/2], closer → router.closerPersona,
  //    luciaClose → 'lucia' 고정, echoQuestion → 'echo' 고정.
  const firstKey = (router.order[0] || 'lucia') as AllPersonaKey;
  const secondKey = (router.order[1] || 'jack') as AllPersonaKey;
  const thirdKey = (router.order[2] || 'ray') as AllPersonaKey;
  const closerKeyForFilter = (router.closerPersona || 'jack') as AllPersonaKey;
  // 희(喜) 모드 판정 — JACK·RAY 슬롯에 찬물 어휘 안전망 적용용.
  const heeMode = router.categoryV3 === 'emotional' && detectEmotionalSubtypeHee(lastMessage);
  const ppOpts = { heeMode };
  const first = postProcessPersonaOutput(extractTag(scriptRaw, 'FIRST') || '', firstKey, ppOpts);
  const second = postProcessPersonaOutput(extractTag(scriptRaw, 'SECOND') || '', secondKey, ppOpts);
  const third = postProcessPersonaOutput(extractTag(scriptRaw, 'THIRD') || '', thirdKey, ppOpts);
  const closer = postProcessPersonaOutput(extractTag(scriptRaw, 'CLOSER') || '', closerKeyForFilter, ppOpts);
  const luciaClose = postProcessPersonaOutput(extractTag(scriptRaw, 'LUCIA_CLOSE') || '', 'lucia', ppOpts);

  // ECHO_QUESTION 누락 감지 — invest/action/principle(=비-emotional/knowledge) 카테고리에서만 보정.
  //   emotional은 [LUCIA_CLOSE] 액자 구조라 ECHO_QUESTION이 의도적으로 부재.
  //   knowledge는 ECHO가 질문이 아니라 정리형/판결형으로 닫을 수 있어 재요청·물음표 강제를 적용하지 않는다.
  //   1차 추출이 빈 값이면 ECHO_QUESTION만 별도 재요청, 그것도 실패 시 투자 실행 질문일 때만 투자 폴백 문장 사용.
  //   TikiTaka V1은 FIRST/SECOND/THIRD/CLOSER만 순차 조립하고 ECHO_QUESTION은 아직 1차 조립에 포함하지 않는다.
  //   그래서 비-emotional/knowledge 경로의 ECHO_QUESTION은 현재 구조상 이 rescue path에서 별도 생성된다.
  const expectsEchoQuestion = router.categoryV3 !== 'emotional' && router.categoryV3 !== 'knowledge';
  const isInvestmentEchoFallback =
    router.categoryV3 === 'invest' &&
    decisionType === 'buy_or_wait';
  let echoQuestionRaw = extractTag(scriptRaw, 'ECHO_QUESTION') || '';
  if (expectsEchoQuestion && !echoQuestionRaw.trim()) {
    console.warn('[runRoutedRequest] ECHO_QUESTION 누락 → 별도 재요청');
    const firstRaw = extractTag(scriptRaw, 'FIRST') || '';
    const secondRaw = extractTag(scriptRaw, 'SECOND') || '';
    const thirdRaw = extractTag(scriptRaw, 'THIRD') || '';
    const closerRaw = extractTag(scriptRaw, 'CLOSER') || '';
    const orderUpper = router.order.map((k) => k.toUpperCase());
    const closerLabel = (router.closerPersona || 'jack').toUpperCase();
    const retryPrompt = `[1] ${orderUpper[0] || 'RAY'}: ${firstRaw}
[2] ${orderUpper[1] || 'JACK'}: ${secondRaw}
[3] ${orderUpper[2] || 'LUCIA'}: ${thirdRaw}
[CLOSER] ${closerLabel}: ${closerRaw}

위 대화에서 RAY/JACK/LUCIA(및 CLOSER) 발언을 보고 ECHO 대표로서 Pattern → Action Translation 판결을 작성하라.
${ECHO_VERDICT_TURNING_POINT_RULE}
${ECHO_VERDICT_MIN_STRUCTURE_RULE}
위 [1][2][3] 발언자 이름을 밝히며 각자 무엇을 말했는지 구체적으로 인용할 것 — 새로운 숫자·조건은 만들지 말고 위에 이미 나온 내용만 재구성할 것.
마지막 문장은 반드시 판결형 선언(실행 기준)으로 끝내고, 물음표로 끝나는 질문형 마무리는 금지한다.
[ECHO_QUESTION] 태그로 감싸서 출력. 3~4줄.`;
    try {
      const retryRaw = await callStage3(stage3System, retryPrompt);
      echoQuestionRaw = extractTag(retryRaw, 'ECHO_QUESTION') || '';
    } catch (e) {
      console.warn('[runRoutedRequest] ECHO_QUESTION 재요청 실패', e);
    }
    if (!echoQuestionRaw.trim()) {
      console.warn('[runRoutedRequest] ECHO_QUESTION 재요청도 빈 값 → 폴백 사용');
      echoQuestionRaw = isInvestmentEchoFallback
        ? '지금 문제는 살지 말지가 아니라, 리스크 기준 없이 들어가려는 반복 패턴입니다.\n기준 없는 매수는 투자가 아니라 불안의 반복입니다.'
        : '지금 문제는 더 생각할지가 아니라, 같은 조건에서 같은 선택을 반복하는 구조입니다.\n결론보다 먼저 끊어야 할 반복 지점이 드러난 순간입니다.';
    }
  }
  const echoQuestionProcessed = postProcessPersonaOutput(echoQuestionRaw, 'echo');
  const echoQuestion = echoQuestionProcessed;

  const cleanedFirst = stripDecisionSummaryBlock(first);
  const cleanedSecond = stripDecisionSummaryBlock(second);
  const cleanedThird = stripDecisionSummaryBlock(third);
  const cleanedCloser = stripDecisionSummaryBlock(closer);
  const cleanedLuciaClose = stripDecisionSummaryBlock(luciaClose);
  const cleanedEchoQuestion = stripDecisionSummaryBlock(echoQuestion);

  return {
    first: cleanedFirst,
    second: cleanedSecond,
    third: cleanedThird,
    closer: cleanedCloser,
    closerKey: router.closerPersona as TaggedPersonaKey,
    luciaClose: cleanedLuciaClose,
    echoQuestion: cleanedEchoQuestion,
    firstKey,
    secondKey,
    thirdKey,
  };
}
