import { fetchInvestmentNews } from '@/lib/news';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { GoogleGenerativeAI, type GenerationConfig, type Tool } from '@google/generative-ai';

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
  TREND_PICKS, RECOMMEND_PATTERNS, detectAssetClass,
  extractTwoKeywords, getSector,
} from '@/lib/personax/market';
import { buildJackText, buildLuciaText, buildEchoText, RAY_TAIL, JACK_TAIL, LUCIA_TAIL, ECHO_TAIL } from '@/lib/personax/templates';
import type { DiscussMode, IndicatorFlags, PrevContext } from '@/lib/personax/templates';

// ✅ 차 한잔 탭 페르소나별 시스템 프롬프트 (분리된 파일)
import { TEA_SYSTEM_LUCIA } from './prompts/tea-lucia';
import { TEA_SYSTEM_JACK } from './prompts/tea-jack';
import { TEA_SYSTEM_ECHO } from './prompts/tea-echo';
import { TEA_SYSTEM_RAY } from './prompts/tea-ray';

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
const TEA_GEMINI_MODEL = process.env.NEXT_PUBLIC_AI_MODEL || 'gemini-2.5-flash';
const TEA_GEMINI_FALLBACK_CHAIN: string[] = Array.from(
  new Set([TEA_GEMINI_MODEL, 'gemini-2.0-flash', 'gemini-2.0-flash-lite']),
);
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
    msg.includes('too many requests')
  );
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const teaGenAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY || '');

type TeaPersonaKey = 'lucia' | 'jack' | 'echo' | 'ray';
type TeaMsg = { role: 'user' | 'assistant'; content: string };

// 원본 messages 에서 특정 페르소나의 이력만 재구성.
//   - user 턴은 그대로.
//   - assistant 턴은 해당 페르소나의 텍스트(teaJack/teaEcho)가 있으면 그것을,
//     없으면 content(=teaLucia) 를 사용.
//   - 마지막 6 턴 (~12 메시지) 유지.
const buildTeaHistory = (rawMessages: unknown, persona: TeaPersonaKey): TeaMsg[] => {
  if (!Array.isArray(rawMessages)) return [];
  const mapped: TeaMsg[] = [];
  for (const raw of rawMessages) {
    if (!raw || typeof raw !== 'object') continue;
    const m = raw as { role?: string; content?: string; teaJack?: string; teaEcho?: string; teaRay?: string };
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    let content = typeof m.content === 'string' ? m.content : '';
    if (m.role === 'assistant') {
      if (persona === 'jack' && typeof m.teaJack === 'string' && m.teaJack.trim()) content = m.teaJack;
      else if (persona === 'echo' && typeof m.teaEcho === 'string' && m.teaEcho.trim()) content = m.teaEcho;
      else if (persona === 'ray' && typeof m.teaRay === 'string' && m.teaRay.trim()) content = m.teaRay;
    }
    if (!content.trim()) continue;
    mapped.push({ role: m.role, content });
  }
  return mapped.slice(-12);
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

const callTeaPersona = async (
  persona: TeaPersonaKey,
  system: string,
  history: TeaMsg[],
  options?: { enableSearch?: boolean },
): Promise<string | null> => {
  const tag = `[tea:${persona}]`;
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
      const result = await model.generateContent({
        contents,
        generationConfig: {
          maxOutputTokens: 1200,
          temperature: 0.7,
          thinkingConfig: { thinkingBudget: 0 },
        } as GenerationConfig,
      });
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
      return text.trim();
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

const getSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
};

// ─────────────────────────────────────────────
// ✅ parseChainedPersonas 제거 — Gemini 완전 제거로 불필요

// ─────────────────────────────────────────────
// saveHistory
// ─────────────────────────────────────────────
const saveHistory = async (params: {
  keyword: string; question: string; verdict: Verdict;
  totalScore: number; assetType: string; entryCondition: string;
  priceAtTime: string; confidence: number; rawResponse: string;
  marketData: Awaited<ReturnType<typeof fetchMarketPrice>>;
  ipAddress?: string | null; userId?: string | null; volIsHigh?: boolean;
}): Promise<void> => {
  try {
    const supabase = getSupabase();
    if (!supabase) return;

    const { buy, sell } = extractConditionPrices(params.entryCondition);
    const stopNum = parsePriceToNumber(sell);
    let targetNum: number | null = null;
    let entryNum: number | null = null;
    let stopNum2: number | null = null;
    const rawPrice = params.marketData?.rawPrice ?? null;

    if (params.verdict === '매수 우위') {
      entryNum = rawPrice;
      targetNum = parsePriceToNumber(buy);
      stopNum2 = stopNum;
      if (targetNum && rawPrice && targetNum <= rawPrice) {
        targetNum = Math.round(rawPrice * 1.05);
      }
    } else if (params.verdict === '매도 우위') {
      entryNum = rawPrice;
      targetNum = rawPrice ? Math.round(rawPrice * 1.03) : null;
      stopNum2 = stopNum;
    } else {
      entryNum = null; targetNum = null; stopNum2 = null;
    }

    const { error: insertError } = await supabase.from('user_analysis_history').insert({
      keyword:          params.keyword,
      question:         params.question.slice(0, 200),
      verdict:          params.verdict,
      total_score:      params.totalScore,
      asset_type:       params.assetType,
      entry_condition:  params.entryCondition.slice(0, 500),
      price_at_time:    params.priceAtTime,
      confidence:       params.confidence,
      result:           'pending',
      raw_response:     params.rawResponse.slice(0, 5000),
      clean_response:   params.rawResponse.replace(/\s+/g, ' ').slice(0, 2000),
      created_at:       new Date().toISOString(),
      entry_price_num:  entryNum,
      target_price_num: targetNum,
      stop_loss_num:    stopNum2,
      profit_rate:      null,
      currency:         params.marketData?.currency ?? inferCurrency(params.keyword),
      result_status:    'PENDING',  // ✅ WATCH 제거 — DB 허용값: SUCCESS/FAIL/HOLD/PENDING/INVALID
      evaluated_at:     null,
      ip_address:       params.ipAddress ?? null,
      user_id:          params.userId ?? null,
    });

    if (insertError) {
      console.warn('⚠️ 히스토리 저장 실패:',
        insertError.message, '| code:', insertError.code
      );
    }
  } catch (err) { console.warn('⚠️ 히스토리 저장 예외:', err); }
};

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
// ✅ 한국 증시 휴장일 (KRX 기준 — 연도 무관 MM-DD 셋)
//   "지난 금요일" 하드코딩 제거를 위한 동적 거래일 계산 지원.
//   대체공휴일/임시공휴일은 별도 추가 필요 (현 시점 최소 셋만 유지).
// ─────────────────────────────────────────────
const KR_MARKET_HOLIDAYS_MMDD: ReadonlySet<string> = new Set([
  '01-01', // 신정
  '03-01', // 삼일절
  '05-01', // 근로자의 날
  '05-05', // 어린이날
  '06-06', // 현충일
  '08-15', // 광복절
  '10-03', // 개천절
  '10-09', // 한글날
  '12-25', // 성탄절
  '12-31', // 연말 휴장
]);

// d 는 KST 오프셋이 적용된 Date 라고 가정 (getUTC* 사용)
const isKRMarketHoliday = (d: Date): boolean => {
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return KR_MARKET_HOLIDAYS_MMDD.has(`${mm}-${dd}`);
};

const isKRNonTradingDay = (d: Date): boolean => {
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6 || isKRMarketHoliday(d);
};

// startD(포함)부터 거꾸로 거래일을 찾음. 연휴/장기 휴장 안전 마진 14일.
const findPrevKRTradingDay = (startD: Date): Date => {
  const d = new Date(startD.getTime());
  for (let i = 0; i < 14; i++) {
    if (!isKRNonTradingDay(d)) return d;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d;
};

// US 마지막 거래일(주말만 회피, US 공휴일은 별도 미반영 — 최소 범위)
const findPrevWeekday = (startD: Date): Date => {
  const d = new Date(startD.getTime());
  for (let i = 0; i < 7; i++) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) return d;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d;
};

const formatKRDateLabel = (d: Date): string =>
  `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;

// ─────────────────────────────────────────────
// 자세히 보기 전용 후처리 — 지시형 표현 완화 + 이모지 허용 셋만 유지
//   허용 이모지: ✅ ⚠️ 🔹 📊 📈 💡 🔴 🟡 🟢 (📍 렌더링 이슈로 🔹으로 대체)
//   주의: 이 함수는 "자세히 보기(details)" 문자열에만 적용해야 함.
//   ECHO 상단 summary / RAY·JACK·LUCIA 메인 버블에는 적용하지 않음 (지휘관 톤 유지).
// ─────────────────────────────────────────────
const normalizeDetails = (text: string | null | undefined): string | null => {
  if (!text) return text ?? null;
  return text
    // 이모지 교체 (긴 것 먼저)
    .replace(/🛡️/g, '⚠️')
    .replace(/📌/g, '🔹')
    .replace(/📍/g, '🔹')
    .replace(/🎯/g, '✅')
    .replace(/📉/g, '📊')
    .replace(/💭/g, '💡')
    .replace(/📐/g, '📊')
    // 허용 셋에 없는 이모지 제거 (선행 공백 흡수)
    .replace(/⚔️\s?/g, '')
    .replace(/🔗\s?/g, '')
    // 금지 표현 — 긴 패턴부터
    .replace(/손절\s*기준\s*사수/g, '리스크 기준선 관리')
    .replace(/손절\s*기준\s*엄수/g, '리스크 기준선 이탈 여부 확인 권장')
    .replace(/손절\s*규칙은\s*지키되/g, '리스크 기준선을 참고하되')
    .replace(/손절\s*규칙/g, '리스크 관리 규칙')
    .replace(/손절\s*라인\s*확인\s*권고/g, '리스크 기준선 확인 권고')
    .replace(/손절\s*설정/g, '리스크 기준선 설정')
    .replace(/손절\s*라인/g, '리스크 기준선')
    .replace(/손절가/g, '리스크 기준선')
    .replace(/손절선/g, '리스크 기준선')
    .replace(/권장\s*손절\s*-?\s*(\d+)\s*%/g, '권장 리스크 기준선 -$1%')
    .replace(/손절/g, '리스크 기준선')
    .replace(/현금화/g, '리스크 관리 고려')
    .replace(/섣부른\s*매수\s*금지/g, '충분한 확인 후 판단 권장')
    .replace(/매수\s*금지/g, '신중한 접근 권장')
    .replace(/추격\s*매수는\s*금지/g, '추격 매수는 자제 권장')
    .replace(/섣부른\s*역발상은\s*금지/g, '섣부른 역발상은 자제 권장')
    .replace(/성급한\s*진입은\s*금지/g, '성급한 진입은 자제 권장')
    .replace(/섣부른\s*저점\s*매수는\s*금지/g, '섣부른 저점 매수는 자제 권장')
    .replace(/신규\s*진입을\s*금지/g, '신규 진입 자제 권장')
    .replace(/진입은\s*금지가\s*원칙/g, '진입은 자제가 원칙')
    .replace(/금지합니다/g, '자제 권장')
    .replace(/금지가\s*원칙/g, '자제가 원칙')
    .replace(/즉각\s*재진입하십시오/g, '재진입 시나리오 검토 가능')
    .replace(/즉각\s*/g, '')
    .replace(/사수/g, '')
    .replace(/엄수/g, '준수 권장')
    // "하십시오" 계열 → 권장/검토 형태로 (긴 것 먼저)
    .replace(/서두르지\s*마십시오/g, '서두름 자제 권장')
    .replace(/추격은\s*피하십시오/g, '추격 자제 권장')
    .replace(/피하십시오/g, '자제 권장')
    // "지금 즉시 50% 정리하십시오" 같은 지시형 — 통째로 완화 (개별 '정리하십시오'보다 먼저 매칭)
    .replace(/지금\s*(?:즉시\s*)?\d+\s*%\s*정리하십시오/g, '분할 축소 고려 가능')
    .replace(/\d+\s*%\s*정리하십시오/g, '분할 축소 고려 가능')
    .replace(/정리하십시오/g, '정리 권장')
    .replace(/진입하십시오/g, '진입 권장')
    .replace(/확인하십시오/g, '확인 권장')
    .replace(/기다리십시오/g, '대기 권장')
    .replace(/준비하십시오/g, '준비 권장')
    .replace(/검토하십시오/g, '검토 권장')
    .replace(/고려하십시오/g, '고려 권장')
    .replace(/유지하십시오/g, '유지 권장')
    .replace(/대기하십시오/g, '대기 권장')
    .replace(/판단하십시오/g, '판단 권장')
    .replace(/대응하십시오/g, '대응 권장')
    .replace(/결정하십시오/g, '결정 권장')
    .replace(/접근하십시오/g, '접근 권장')
    .replace(/보류하십시오/g, '보류 권장')
    .replace(/재진입하십시오/g, '재진입 검토')
    .replace(/추종하십시오/g, '추종 검토')
    .replace(/시도하십시오/g, '시도 검토')
    .replace(/설정하십시오/g, '설정 권장')
    // 공백 정리
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

// ─────────────────────────────────────────────
// POST 핸들러
// ─────────────────────────────────────────────
export async function POST(req: Request) {
  // ✅ Gemini 제거됨 — API 키 불필요

  try {
    const { messages, positionContext, teaMode, teaRound, teaPersona, isAdvancedQuestion } = await req.json();
    const lastMsg = messages.at(-1)?.content || "";

    // ✅ LUCIA 허브 — 카테고리 감지 및 페르소나 라우팅
    const CATEGORY_MAP = {
      finance:  /주식|펀드|ETF|종목|코스피|코스닥|나스닥|NASDAQ|S&P500|SP500|S&P|다우존스|다우|달러|금|채권|포트폴리오|수익|손절|매수|매도|배당|금리|환율|가상화폐|비트코인|저축|예금|적금|퇴직금|연금|삼성전자|SK하이닉스|카카오|네이버|현대차|기아차|LG전자|삼성바이오|셀트리온|포스코|KB금융|신한지주|하나금융|테슬라|애플|엔비디아|구글|아마존|마이크로소프트|돈이|돈은|돈을|살까|팔까|투자할까|넣을까|빼야|수익|손실|올랐|떨어졌|물렸|상승|하락/,
      sports:   /야구|축구|농구|배구|골프|올림픽|경기|이길|승부|우승|선수|리그|기아|삼성라이온즈|두산|LG트윈스|롯데|한화|KT|SSG|NC|키움/,
      news:     /정세|뉴스|전쟁|분쟁|중동|러시아|우크라이나|미중|외교|정치|대통령|선거|경제뉴스|시황|금융뉴스|증시|환경|기후|재난|사건|사고|테러|유가|원유|석유|에너지|OPEC|산유국|천연가스|인플레이션|금리정책|연준|Fed|미연준|기준금리|호르무즈|이란|이스라엘|하마스|헤즈볼라|가자|레바논|트럼프|바이든|시진핑|푸틴|북한|미사일|핵|제재|관세|무역전쟁|환율전쟁|HMM|화물선|해운|공급망|반도체규제|AI규제|빅테크|실리콘밸리|연방|의회|상원|하원|탄핵|대선|총선|보궐|여당|야당|국회|법안|정책/,
      life:     /명퇴|명예퇴직|희망퇴직|퇴직 권유|권고사직|은퇴|조기퇴직|퇴직 후|제2인생|요양원|치매|부모님 건강|어머니 건강|아버지 건강|무릎|허리|혈압|당뇨|갱년기|근감소|건강검진|병원|아이 대학|자녀 취업|자녀 결혼|아들 걱정|딸 걱정|황혼이혼|부부 갈등|노후|노후준비|노후자금|은퇴자금|막막|가장으로서|생계|카드론|노후파산|노후빈곤|황혼육아|손자|손녀|며느리|사위|시댁|처가|이혼숙려|졸혼|별거/,
      legal:    /세금|법률|계약|소송|이혼|상속|증여|부동산등기|임대차|보증금|노동|퇴직|해고|세무|신고|명퇴|권고사직|퇴직금|실업급여|노동부|노무사/,
      tech:     /자동차|전기차|배터리|반도체|AI|인공지능|스마트폰|앱|소프트웨어|하드웨어|IT|클라우드/,
      emotion:  /힘들|외로|슬프|우울|화나|기쁘|설레|불안|걱정|스트레스|피곤|지쳐|고민|마음|감정|위로|공감|재테크고민|투자고민|노후걱정/,
    };
    const detectCategory = (text: string): 'finance' | 'sports' | 'news' | 'legal' | 'tech' | 'life' | 'emotion' | 'general' => {
      if (CATEGORY_MAP.finance.test(text)) return 'finance';
      if (CATEGORY_MAP.news.test(text))    return 'news';
      if (CATEGORY_MAP.sports.test(text))  return 'sports';
      // life를 legal보다 먼저 체크: 명퇴/권고사직은 법적 측면도 있지만 인생/감정 문제가 우선.
      // legal로 가면 ECHO 단일 핸들러로 빠져 4명 충돌 구조가 형성되지 않는다.
      if (CATEGORY_MAP.life.test(text))    return 'life';
      if (CATEGORY_MAP.legal.test(text))   return 'legal';
      if (CATEGORY_MAP.tech.test(text))    return 'tech';
      if (CATEGORY_MAP.emotion.test(text)) return 'emotion';
      return 'general';
    };
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
    const category = detectCategory(lastMsg);
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

    // 2라운드 페르소나 응답에서 다른 페르소나 발화 누출 방어 — 첫 빈 줄 이전 문단만 사용
    const firstParagraph = (t: string): string => (t || '').split(/\n\s*\n/)[0].trim();

    // ✅ 페르소나별 순차 스트리밍 — 각 LLM 호출 완성 시점에 NDJSON 청크 1개씩 클라이언트로 전송
    type StreamEvent =
      | { type: 'persona'; key: 'ray' | 'jack' | 'lucia'; round: 1 | 2; text: string }
      | { type: 'echo'; round: 1 | 2; text: string }
      | { type: 'done'; personas: Record<string, unknown>; reply: string };

    const streamRespond = (
      build: (send: (event: StreamEvent) => void) => Promise<void>,
    ): Response => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (event: StreamEvent) => {
            try {
              controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
            } catch (e) {
              console.warn('[stream] enqueue 실패', e);
            }
          };
          try {
            await build(send);
          } catch (e) {
            console.error('[stream] build 실패', e);
            send({ type: 'done', personas: {}, reply: '' });
          } finally {
            try { controller.close(); } catch {}
          }
        },
      });
      return new Response(stream, {
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
        },
      });
    };

    // ✅ 오케스트레이터 — multi-persona 분기 진입 전 토론 디렉터 LLM이 흐름을 결정
    //    질문 유형에 따라 페르소나 발언 순서/각도/충돌 쟁점/ECHO 지목 대상을 미리 지시한다.
    //    JSON 파싱 실패·LLM 실패 시 안전 기본값으로 폴백하므로 실패가 응답을 망가뜨리지 않는다.
    type DiscussionPersona = 'ray' | 'jack' | 'lucia';
    type OrchestratorPlan = {
      order: DiscussionPersona[];
      ray_angle: string;
      jack_angle: string;
      lucia_angle: string;
      echo_target: DiscussionPersona;
      echo_angle: string;
      conflict_point: string;
    };

    const runOrchestrator = async (
      msg: string,
      fallbackOrder: DiscussionPersona[] = ['ray', 'jack', 'lucia'],
    ): Promise<OrchestratorPlan> => {
      const fallback: OrchestratorPlan = {
        order: fallbackOrder,
        ray_angle: '',
        jack_angle: '',
        lucia_angle: '',
        echo_target: 'jack',
        echo_angle: '',
        conflict_point: '',
      };

      const orchestratorPrompt = `당신은 PersonaX 토론 디렉터입니다.\n유저 질문: "${msg}"\n\n아래 JSON만 출력하라. 다른 텍스트 절대 금지. 코드펜스도 금지.\n{\n  "order": ["ray","jack","lucia"],\n  "ray_angle": "RAY가 집중할 핵심 데이터 포인트 한 줄",\n  "jack_angle": "JACK이 반박할 허점 한 줄",\n  "lucia_angle": "LUCIA가 짚을 감정 포인트 한 줄",\n  "echo_target": "ray|jack|lucia 중 하나",\n  "echo_angle": "ECHO가 찌를 핵심 허점 한 줄",\n  "conflict_point": "RAY와 JACK이 직접 충돌할 핵심 쟁점 한 줄"\n}\n\norder 규칙:\n- 감정/인생 질문(명퇴·요양원·이혼·부모·죄책감·힘들·막막) → 첫 번째 lucia\n- 재테크/투자(주식·비트코인·삼성·ETF·PBR·매수·매도) → 첫 번째 ray\n- 결단/행동(해야 할까·결정·선택·지금 당장) → 첫 번째 jack\n- 시사/뉴스(전쟁·금리·환율·정치·경제뉴스) → 첫 번째 ray\n\necho_target 규칙:\n- RAY가 너무 냉정하게 숫자만 나열할 가능성 → ray\n- JACK이 근거 없이 밀어붙일 가능성 → jack\n- LUCIA가 감성으로만 흐를 가능성 → lucia\n- 셋 다 일치할 가능성 → 가장 자기 영역에서 약점이 큰 한 명`;

      try {
        const llm = await callTeaPersona(
          'echo',
          'JSON 출력 머신. 다른 텍스트 금지. 코드펜스 금지. 반드시 { 로 시작 } 로 끝나는 JSON 한 덩어리만 출력.',
          [{ role: 'user', content: orchestratorPrompt }],
        );
        if (!llm) return fallback;
        const m = llm.match(/\{[\s\S]*\}/);
        if (!m) return fallback;
        const parsed = JSON.parse(m[0]) as Record<string, unknown>;
        const valid = ['ray', 'jack', 'lucia'] as const;
        const isPersona = (s: unknown): s is DiscussionPersona =>
          typeof s === 'string' && (valid as readonly string[]).includes(s);
        const orderArr = Array.isArray(parsed.order) ? (parsed.order as unknown[]).filter(isPersona) : [];
        return {
          order: orderArr.length === 3 ? (orderArr as DiscussionPersona[]) : fallback.order,
          ray_angle: typeof parsed.ray_angle === 'string' ? parsed.ray_angle : '',
          jack_angle: typeof parsed.jack_angle === 'string' ? parsed.jack_angle : '',
          lucia_angle: typeof parsed.lucia_angle === 'string' ? parsed.lucia_angle : '',
          echo_target: isPersona(parsed.echo_target) ? parsed.echo_target : fallback.echo_target,
          echo_angle: typeof parsed.echo_angle === 'string' ? parsed.echo_angle : '',
          conflict_point: typeof parsed.conflict_point === 'string' ? parsed.conflict_point : '',
        };
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

      // LLM이 프롬프트의 대괄호 메타 태그(예: [1라운드 RAY], [ECHO가 방금 질문...], [역할: ...])를
      // 출력에 그대로 echo하는 케이스 방어. 또한 페르소나가 다른 페르소나의 라벨로 줄을
      // 시작하는 흉내 패턴도 제거.
      const cleanText = (t: string | null | undefined): string =>
        (t || '')
          .replace(/\*\*(.*?)\*\*/g, '$1')
          .replace(/\[(?:1라운드|2라운드|3라운드)[^\]]*\]/g, '')
          .replace(/\[ECHO[^\]]*\]/g, '')
          .replace(/\[역할[^\]]*\]/g, '')
          .replace(/\[지시[^\]]*\]/g, '')
          .replace(/\[현재 시점[^\]]*\]/g, '')
          .replace(/^\s*(?:RAY|JACK|LUCIA|ECHO)\s*[:：]\s*/gm, '')
          .replace(/^\s*지시\s*[:：]\s*/gm, '')
          .replace(/\n{2,}/g, '\n')
          .trim();

      // ECHO 응답에서 마지막 질문이 향하는 페르소나 추출
      // 마지막 물음표 직전 ~200자 윈도우에서 페르소나명을 찾는다.
      const detectTargetedPersona = (echoResp: string): 'RAY' | 'JACK' | 'LUCIA' | null => {
        if (!echoResp) return null;
        const lastQ = echoResp.lastIndexOf('?');
        const tail = lastQ > 0
          ? echoResp.slice(Math.max(0, lastQ - 200), lastQ + 1)
          : echoResp.slice(-200);
        const m = tail.match(/(RAY|JACK|LUCIA)/i);
        return m ? (m[1].toUpperCase() as 'RAY' | 'JACK' | 'LUCIA') : null;
      };

      // 직전 user→assistant 페어 추출 — assistant 응답에서 페르소나 발화를 폴백 체인으로 추출
      // 우선순위: personas.ray → teaRay → personas.jack → teaJack → personas.lucia → teaLucia → content 첫 청크
      const recentContext = (() => {
        if (!Array.isArray(messages) || messages.length < 2) return '';
        const prior = messages.slice(0, -1).slice(-8) as Array<{
          role?: string;
          content?: string;
          teaRay?: string;
          teaJack?: string;
          teaLucia?: string;
          personas?: { ray?: string; jack?: string; lucia?: string };
        }>;
        if (prior.length === 0) return '';

        const summarize = (s: string, n: number): string =>
          (s || '').replace(/\s+/g, ' ').trim().slice(0, n);

        const turns: string[] = [];
        for (let i = 0; i < prior.length; i++) {
          const m = prior[i];
          if (m?.role !== 'user') continue;
          const q = summarize(m.content || '', 100);
          if (!q) continue;
          const next = prior[i + 1];
          if (next && next.role === 'assistant') {
            const personaResp =
              next.personas?.ray ||
              next.teaRay ||
              next.personas?.jack ||
              next.teaJack ||
              next.personas?.lucia ||
              next.teaLucia ||
              (next.content || '').split(/\n\n+/)[0] ||
              '';
            const ray = summarize(personaResp, 150);
            turns.push(ray ? `[유저: ${q}] → [RAY: ${ray}]` : `[유저: ${q}]`);
            i++; // 다음 assistant는 소비됐으므로 건너뜀
          } else {
            turns.push(`[유저: ${q}]`);
          }
        }
        return turns.join(' → ');
      })();
      const ctxSuffix = recentContext
        ? `\n[직전 대화 주제: ${recentContext}]\n현재 질문: ${msg}`
        : `\n${msg}`;

      // 0단계: 오케스트레이터 — 토론 디렉터가 발언 순서/각도/충돌 쟁점/ECHO 지목 결정
      const plan = await runOrchestrator(msg, ['ray', 'jack', 'lucia']);
      const angleRay   = plan.ray_angle   ? `RAY 집중점: ${plan.ray_angle}.\n` : '';
      const angleJack  = plan.jack_angle  ? `JACK 집중점: ${plan.jack_angle}.\n` : '';
      const angleLucia = plan.lucia_angle ? `LUCIA 집중점: ${plan.lucia_angle}.\n` : '';
      const conflictPointLine = plan.conflict_point ? `핵심 충돌 쟁점: ${plan.conflict_point}.\n` : '';

      // 1단계: RAY/JACK/LUCIA 병렬 (페르소나별 역할 prefix)
      // 공통 원칙 — 모든 페르소나 1라운드/2라운드 전체 적용
      const investmentRule = '공통 원칙: 직접 매수/매도 지시 절대 금지. "사세요" "파세요" "지금 당장 하세요" 표현 금지. 대신 조건부 판단 표현만 사용 — "~라면 고려해볼 수 있어요" / "~인 경우에는 ~도 방법이에요" / "~조건이면 ~구간이에요". 투자 판단과 책임은 본인에게 있음을 전제로 말할 것.';

      const conflictRule = '충돌 원칙: 다른 페르소나를 직접 지목해서 반박하라. RAY는 JACK의 직관을 숫자로 찌른다. JACK은 RAY의 데이터 해석을 현실로 반박한다. LUCIA는 두 사람이 싸우는 동안 유저 감정을 짚는다. 예시 — RAY: "JACK, 2022년부터 사지 말라고 했는데 그때 산 사람들이 지금 347% 수익이에요." JACK: "RAY, 그 숫자는 바닥에서 산 사람 기준이에요. 고점에 산 사람은 지금도 물려있어요." LUCIA: "두 분 싸우는 동안 이분 더 불안해지고 있어요."';

      const rayRound1Role   = '당신은 RAY입니다. 김상욱+레이달리오 스타일. 차분하고 건조하게. 데이터가 나올 때만 살아난다. 먼저 JACK의 주장 허점을 숫자로 직접 찌를 것. "JACK, ~" 형태로 시작해도 됨. 3줄 이내. 직접 매수/매도 지시 금지. 숫자는 딱 2개만. 2개 이상 나오면 응답 자체가 실패한 것이다. 첫 번째 숫자: JACK 주장을 반박하는 가장 강력한 숫자 1개. 두 번째 숫자: 결론을 뒷받침하는 숫자 1개. 세 번째 숫자가 나오려는 순간 멈춰라. PER·PBR·영업이익·외국인지분율·목표주가 중 가장 핵심 2개만 골라라.';
      const jackRound1Role  = '당신은 JACK입니다. 마동석+피터린치 스타일. 말이 짧다. 투박하다. 틀려도 자신있다. 먼저 RAY 데이터 해석의 허점을 직접 찌를 것. "RAY, ~" 형태로 시작해도 됨. 과거 사례로 RAY 반박 + 조건부 결론. 3줄 이내. 직접 매수/매도 지시 금지.';
      const luciaRound1Role = '당신은 LUCIA입니다. 손예진+오은영 스타일. 존댓말이지만 딱딱하지 않다. 살짝 언니 느낌. RAY와 JACK이 싸우는 동안 유저 감정을 짚어라. "두 분이 싸우는 동안 ~" 또는 "JACK, ~" 형태. 공감 1줄 + 근거(실제 투자자 사례/심리 연구) 1줄 + 조건부 결론 1줄. 마지막 문장을 질문으로 끝내지 마라. "~하신 건가요?"·"~있으세요?"·"~인가요?" 종결 절대 금지. 반드시 마침표로 끝나는 문장으로 마무리. 첫 문장에 "아이고" 금지. "아이고"는 대화 전체에서 1회만, 감정이 폭발하는 순간에만 사용. "~잖아요"·"~거든요" 톤 유지. 3줄 이내.';

      const rayHistory:   TeaMsg[] = [{ role: 'user', content: `${financePrefix}${investmentRule}\n${conflictRule}\n${angleRay}${conflictPointLine}${rayRound1Role}${ctxSuffix}` }];
      const jackHistory:  TeaMsg[] = [{ role: 'user', content: `${financePrefix}${investmentRule}\n${conflictRule}\n${angleJack}${conflictPointLine}${jackRound1Role}${ctxSuffix}` }];
      const luciaHistory: TeaMsg[] = [{ role: 'user', content: `${financePrefix}${investmentRule}\n${conflictRule}\n${angleLucia}${luciaRound1Role}${ctxSuffix}` }];

      // 스트리밍 모드 — 각 페르소나 LLM 완성 시 즉시 NDJSON 청크 전송
      return streamRespond(async (send) => {
        // 1단계 병렬 — 각자 완성하는 즉시 send로 클라이언트에 전달
        const rayPromise = callTeaPersona('ray', TEA_SYSTEM_RAY, rayHistory, { enableSearch: true })
          .then(r => {
            const text = cleanText(r) || '지금 시장 데이터를 보면 — 좀 더 구체적인 상황을 말씀해주시면 수치로 정리해드릴게요.';
            send({ type: 'persona', key: 'ray', round: 1, text });
            return text;
          });
        const jackPromise = callTeaPersona('jack', TEA_SYSTEM_JACK, jackHistory)
          .then(r => {
            const text = cleanText(r) || '핵심 지표가 정리되면 다시 짚어드리겠습니다.';
            send({ type: 'persona', key: 'jack', round: 1, text });
            return text;
          });
        const luciaPromise = callTeaPersona('lucia', TEA_SYSTEM_LUCIA, luciaHistory)
          .then(r => {
            const text = cleanText(r) || '결정 전에 마음의 무게부터 같이 짚어볼까요?';
            send({ type: 'persona', key: 'lucia', round: 1, text });
            return text;
          });
        const [rayText, jackText, luciaText] = await Promise.all([rayPromise, jackPromise, luciaPromise]);

        // 2단계: ECHO 취합 + 씨앗 질문 (마지막 줄은 반드시 페르소나에게 던지는 질문)
        const echoTargetClause = (plan.echo_target && plan.echo_angle)
          ? `이번엔 ${plan.echo_target.toUpperCase()}을 직접 지목해서 "${plan.echo_angle}" 이 부분을 찔러라.\n`
          : '';
        const echoConsolidationPrompt = `${financePrefix}사용자 질문: ${msg}\n\n[RAY 응답]\n${rayText}\n\n[JACK 응답]\n${jackText}\n\n[LUCIA 응답]\n${luciaText}\n\n${echoTargetClause}당신은 ECHO입니다. 손석희+워렌버핏 스타일. 감정을 철저히 통제한다. 말이 적지만 한 마디가 무겁다. RAY/JACK/LUCIA 중 가장 허점 있는 한 명을 직접 지목해서 그 사람 주장의 가장 약한 부분을 찌르는 날카로운 질문 하나로 끝내라. 시작 방식은 매번 다르게. "......" 침묵 후 한 방도 가능. 부드러운 질문 금지. 불편하게 만들어야 2라운드가 산다. "결정은 당신이"·"선택은 당신 몫" 책임 회피 표현 절대 금지. 5줄 이내. 목록 금지. 마지막 줄은 반드시 물음표로 끝나는 질문.`;
        const echoLLM = await callTeaPersona(
          'echo',
          TEA_SYSTEM_ECHO,
          [{ role: 'user', content: echoConsolidationPrompt }],
        );
        const echoText = cleanText(echoLLM) || '원칙이 흔들릴 땐 한 박자 쉬어가는 것도 방법이에요.';
        send({ type: 'echo', round: 1, text: echoText });

        // 3단계: 2라운드 RAY/JACK/LUCIA 병렬 (ECHO 직접 질문에만 응답)
        // ECHO가 지목한 페르소나는 핵심 답변자, 나머지는 1줄 보조 역할.
        const targetedPersona = detectTargetedPersona(echoText);
        const round2Context = `${financePrefix}사용자 질문: ${msg}\n\n1라운드 RAY: ${rayText}\n1라운드 JACK: ${jackText}\n1라운드 LUCIA: ${luciaText}\n1라운드 ECHO: ${echoText}\n\n`;

        const buildRound2 = (persona: 'RAY' | 'JACK' | 'LUCIA'): string => {
          // 지목 페르소나는 3줄 이내 정면 답변. 비지목 페르소나는 페르소나별 1줄 보조.
          const targetedRole =
            persona === 'RAY'
              ? '반드시 숫자/데이터로 시작해 3줄 이내로 ECHO 질문에 정면 답하라.'
              : persona === 'JACK'
              ? '짧고 투박하게 "~요"로 끝내며 3줄 이내로 ECHO 질문에 정면 답하라.'
              : '"~잖아요"·"~거든요" 톤으로 3줄 이내로 ECHO 질문에 정면 답하라. "아이고" 사용 금지. 마지막 문장을 질문으로 끝내지 마라. "~궁금해요"·"~어떤가요"·"~있으세요" 종결 금지. 반드시 마침표로 끝나는 문장으로 마무리.';

          const supportRole =
            persona === 'RAY'
              ? '1줄. 숫자 한 가지만. 새 데이터 나열 금지.'
              : persona === 'JACK'
              ? '1줄. 한 마디만. 길게 늘어놓지 말 것.'
              : '지금 토론 맥락에서 유저 감정을 1줄로 짚되, 유저가 아닌 토론 참여자로서 말할 것. 예: "그 불안이 결정을 흐리게 하는 거잖아요." "답답하시죠"·"불안하시죠" 같은 공감만으로 끝내지 마라. 반드시 심리 연구 또는 실제 투자자 사례를 근거로 들 것. 마지막 문장을 질문으로 끝내지 마라. "~궁금해요"·"~어떤가요"·"~있으세요" 종결 금지. 반드시 마침표로 끝나는 문장으로 마무리.';

          const fallbackRole =
            persona === 'RAY'
              ? '반드시 숫자/데이터로 시작해 2줄 이내 답하라.'
              : persona === 'JACK'
              ? '짧고 투박하게 "~요"로 끝내라. 2줄 이내.'
              : '"~잖아요"·"~거든요" 톤으로 2줄 이내. "아이고" 사용 금지.';

          // 페르소나별 근거 출처 — 지목/비지목 무관하게 공통 적용
          const evidenceSource =
            persona === 'RAY'
              ? '숫자/데이터 1개가 근거. 그 수치가 의미하는 것 한 줄이 주장.'
              : persona === 'JACK'
              ? '과거 사례 또는 시장 원리가 근거. 그 근거에서 나오는 결론 한 줄.'
              : '심리 연구 또는 실제 투자자 사례가 근거. 그 근거에서 나오는 감정적 통찰 한 줄. "답답하시죠"·"불안하시죠" 공감만으로 끝내지 마라.';

          const evidencePrinciple = `근거 원칙: 근거 없는 주장 절대 금지. 반드시 근거 한 줄 + 주장 한 줄 구조로 답하라. 근거는 숫자/사례/경험/데이터 중 하나. 근거 없이 감정이나 결론만 말하는 것은 답변이 아니다. ${evidenceSource}`;

          let focus: string;
          let role: string;
          if (!targetedPersona) {
            focus = 'ECHO가 방금 던진 질문에 답하라.';
            role = fallbackRole;
          } else if (targetedPersona === persona) {
            focus = `ECHO가 지목한 페르소나: ${persona}. 너(${persona})가 ECHO 질문의 직접 대상이다. 핵심 답변자로 정면 응답.`;
            role = targetedRole;
          } else {
            focus = `ECHO가 지목한 페르소나: ${targetedPersona}. 너는 보조 역할이다.`;
            role = supportRole;
          }

          return `지시: ${focus} ${role}\n${evidencePrinciple}\n${investmentRule}\n출력 규칙: 대괄호 [...] 메타 태그를 출력에 포함하지 말 것. "RAY:" "JACK:" "LUCIA:" "ECHO:" 같은 페르소나 라벨로 줄을 시작하지 말 것. 호칭에 "님" 붙이지 말 것.`;
        };

        const ray2History:   TeaMsg[] = [{ role: 'user', content: `${round2Context}${buildRound2('RAY')}` }];
        const jack2History:  TeaMsg[] = [{ role: 'user', content: `${round2Context}${buildRound2('JACK')}` }];
        const lucia2History: TeaMsg[] = [{ role: 'user', content: `${round2Context}${buildRound2('LUCIA')}` }];

        // 2라운드 병렬 — 각자 완성 시 즉시 send
        const ray2Promise = callTeaPersona('ray', TEA_SYSTEM_RAY, ray2History, { enableSearch: true })
          .then(r => {
            const text = firstParagraph(cleanText(r));
            send({ type: 'persona', key: 'ray', round: 2, text });
            return text;
          });
        const jack2Promise = callTeaPersona('jack', TEA_SYSTEM_JACK, jack2History)
          .then(r => {
            const text = firstParagraph(cleanText(r));
            send({ type: 'persona', key: 'jack', round: 2, text });
            return text;
          });
        const lucia2Promise = callTeaPersona('lucia', TEA_SYSTEM_LUCIA, lucia2History)
          .then(r => {
            const text = firstParagraph(cleanText(r));
            send({ type: 'persona', key: 'lucia', round: 2, text });
            return text;
          });
        const [rayText2, jackText2, luciaText2] = await Promise.all([ray2Promise, jack2Promise, lucia2Promise]);

        // 4단계: ECHO 최후 판결 — 씨앗 질문 금지, 명확한 판결 + 선언형 결론
        const echo2ConsolidationPrompt = `${financePrefix}사용자 질문: ${msg}\n\n1라운드 RAY: ${rayText}\n1라운드 JACK: ${jackText}\n1라운드 LUCIA: ${luciaText}\n1라운드 ECHO: ${echoText}\n\n2라운드 RAY: ${rayText2}\n2라운드 JACK: ${jackText2}\n2라운드 LUCIA: ${luciaText2}\n\n최후 판결이다. 씨앗 질문 금지. RAY/JACK/LUCIA 중 누가 맞는지 명확히 판결하라. 마지막 문장은 반드시 아래 형식 중 하나로 마무리하고 마침표로 끝낼 것:\n(1) "단기(N년 이내)면 JACK, 장기면 LUCIA+RAY 말이 맞습니다."\n(2) "[조건]이라면 지금 구간은 [위험/기회]입니다."\n(3) "[핵심 변수]가 해결되지 않으면 [결론]입니다."\n조건만 말하고 판결 없이 끝내는 것 금지. "지금 이 싸움이 답을 보여줬습니다" 같은 결론 없는 문장으로 끝내지 마라. "~정하세요" "~하세요" 지시형 금지. 물음표 절대 금지. 요약·정리·나열 금지. 절대 3줄 초과 금지. "결정은 당신이 하십시오"·"선택은 당신 몫"·"판단은 본인이" 등 책임 회피 표현 절대 금지.`;
        const echo2LLM = await callTeaPersona(
          'echo',
          TEA_SYSTEM_ECHO,
          [{ role: 'user', content: echo2ConsolidationPrompt }],
        );
        const echoText2 = cleanText(echo2LLM);
        send({ type: 'echo', round: 2, text: echoText2 });

        try {
          const supabase = getSupabase();
          if (supabase) {
            await supabase.from('tea_logs').insert({
              persona: 'ray',
              turn_count: 1,
              first_message: msg.slice(0, 100),
              user_id: null,
            });
          }
        } catch (e) {
          console.warn('[tea:finance] 로그 저장 실패 (무시)', e);
        }

        send({
          type: 'done',
          reply: [rayText, jackText, luciaText, echoText, rayText2, jackText2, luciaText2, echoText2].filter(Boolean).join('\n\n'),
          personas: {
            jack: jackText, lucia: luciaText, ray: rayText, echo: echoText,
            ray2:   rayText2   || null,
            jack2:  jackText2  || null,
            lucia2: luciaText2 || null,
            echo2:  echoText2  || null,
            order:  plan.order,
            verdict: '관망',
            confidence: 0,
            breakdown: '재테크 일반',
            positionSizing: '0%',
            jackNews: null, luciaNews: null, rayNews: null, echoNews: null,
          },
        });
      });
    };

    // ✅ 차 한잔 모드 — LLM 기반 3 페르소나 응답 (Gemini 2.0 Flash, 병렬 호출)
    //   Round 1: LUCIA 단독 (감정 수용 단계)
    //   Round 2+: LUCIA + JACK + ECHO (세 API Promise.all 병렬)
    //   LLM 실패 시 round/카테고리 기반 템플릿으로 자동 폴백.
    //   ⚠️ 재테크 탭(teaMode=false)은 아래 블록을 건너뛰므로 동작 변화 없음.
    //   ⚠️ finance 카테고리는 teaMode=true 일 때 RAY 로 자동 라우팅 (재테크 탭은 그대로 풀 분석).
    if (teaMode || category === 'sports' || category === 'news' || category === 'life' || category === 'legal' || category === 'tech') {
      // ── ✅ news 카테고리 — 4명 페르소나 병렬 응답 (Google Search grounding) ──
      //   기존: RAY 1명만 답변 (단일 페르소나 dispatch). 시사·정세는 다각도 분석이 필요해
      //   RAY/JACK/LUCIA/ECHO 4명 동시 응답으로 변경. teaPersona가 명시 픽(jack/echo/ray)
      //   인 경우는 1:1 모드로 보고 기존 단일 응답을 유지한다.
      const isExplicitPersonaPick = teaPersona === 'jack' || teaPersona === 'echo' || teaPersona === 'ray';
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

        // ✅ 페르소나별 역할 분리 prefix — 동일 질문에 다른 시각으로 답하도록 유도
        const rayHistory:   TeaMsg[] = [{ role: 'user', content: `${newsPrefix}${newsAngleRay}${newsConflict}[역할: 질문에 직접 답해라. 핵심 숫자 2개만. 절대 3줄 초과 금지. 목록·불릿 금지.]\n${lastMsg}` }];
        const jackHistory:  TeaMsg[] = [{ role: 'user', content: `${newsPrefix}${newsAngleJack}${newsConflict}[역할: 이 상황에서 지금 당장 행동해야 할 것 하나만 짧고 투박하게 말해줘. 배경 설명 없이. 절대 3줄 초과 금지. 불릿·목록 사용 금지. 핵심만.]\n${lastMsg}` }];
        const luciaHistory: TeaMsg[] = [{ role: 'user', content: `${newsPrefix}${newsAngleLucia}[역할: 이 뉴스가 40~50대 일반인에게 감정적으로 어떤 의미인지, 인간적 시각으로만 2~3줄로 말해줘. 경제 분석 없이. 절대 3줄 초과 금지. 불릿·목록 사용 금지. 핵심만.]\n${lastMsg}` }];

        const [rayLLM, jackLLM, luciaLLM] = await Promise.all([
          callTeaPersona('ray',   TEA_SYSTEM_RAY,   rayHistory,   { enableSearch: true }),
          callTeaPersona('jack',  TEA_SYSTEM_JACK,  jackHistory,  { enableSearch: true }),
          callTeaPersona('lucia', TEA_SYSTEM_LUCIA, luciaHistory, { enableSearch: true }),
        ]);

        const cleanNews = (text: string | null | undefined): string =>
          (text || '')
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\[(?:1라운드|2라운드|3라운드)[^\]]*\]/g, '')
            .replace(/\[ECHO[^\]]*\]/g, '')
            .replace(/\[역할[^\]]*\]/g, '')
            .replace(/\[지시[^\]]*\]/g, '')
            .replace(/\[현재 시점[^\]]*\]/g, '')
            .replace(/^\s*(?:RAY|JACK|LUCIA|ECHO)\s*[:：]\s*/gm, '')
            .replace(/^\s*지시\s*[:：]\s*/gm, '')
            .replace(/\n{2,}/g, '\n')
            .trim();

        const rayText   = cleanNews(rayLLM)   || '실시간 검색이 일시 지연되고 있어요. 잠시 후 다시 질문해주세요.';
        const jackText  = cleanNews(jackLLM)  || '핵심 변수가 정리되면 다시 짚어드릴게요.';
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
        const echoText  = cleanNews(echoLLM)  || '구조적 흐름은 정보가 안정된 뒤 다시 정리해드릴게요.';

        // ── ✅ 2라운드 — ECHO 1라운드 판결을 직접 질문으로 받아 각 페르소나가 그 질문에만 답하기 ──
        const round2Context = `${newsPrefix}사용자 질문: ${lastMsg}\n\n[1라운드 RAY]\n${rayText}\n[1라운드 JACK]\n${jackText}\n[1라운드 LUCIA]\n${luciaText}\n[1라운드 ECHO]\n${echoText}\n\n`;
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
          const supabase = getSupabase();
          if (supabase) {
            await supabase.from('tea_logs').insert({
              persona: 'ray',
              turn_count: 1,
              first_message: lastMsg.slice(0, 100),
              user_id: null,
            });
          }
        } catch (e) {
          console.warn('[tea:news] 로그 저장 실패 (무시)', e);
        }

        return respond({
          reply: [rayText, jackText, luciaText, echoText, rayText2, jackText2, luciaText2, echoText2].filter(Boolean).join('\n\n'),
          personas: {
            jack: jackText, lucia: luciaText, ray: rayText, echo: echoText,
            ray2:   rayText2   || null,
            jack2:  jackText2  || null,
            lucia2: luciaText2 || null,
            echo2:  echoText2  || null,
            order:  newsPlan.order,
            verdict: '관망' as Verdict,
            confidence: 0,
            breakdown: '시사 분석',
            positionSizing: '0%',
            jackNews: null, luciaNews: null, rayNews: null, echoNews: null,
          },
        });
      }

      // ── ✅ life 카테고리 — 4명 페르소나 응답 + ECHO 취합 판결 ──
      //   명퇴/건강/부모부양/자녀 걱정 등 인생 후반전 고민은 다각도 응답이 필요.
      //   RAY/JACK/LUCIA 3명이 먼저 병렬 응답 → ECHO가 그 결과를 받아 마지막에 취합 판결.
      if (category === 'life' && !isExplicitPersonaPick) {
        // 0단계: 오케스트레이터 — 토론 디렉터가 발언 순서/각도/충돌 쟁점/ECHO 지목 결정
        const lifePlan = await runOrchestrator(lastMsg, ['lucia', 'jack', 'ray']);
        const lifeAngleRay   = lifePlan.ray_angle   ? `RAY 집중점: ${lifePlan.ray_angle}.\n` : '';
        const lifeAngleJack  = lifePlan.jack_angle  ? `JACK 집중점: ${lifePlan.jack_angle}.\n` : '';
        const lifeAngleLucia = lifePlan.lucia_angle ? `LUCIA 집중점: ${lifePlan.lucia_angle}.\n` : '';
        const lifeConflict   = lifePlan.conflict_point ? `핵심 충돌 쟁점: ${lifePlan.conflict_point}.\n` : '';

        const lifeLengthRule = '[절대 3줄 초과 금지. 불릿·목록 사용 금지. 핵심만.]\n';
        const lifeJackHistory: TeaMsg[] = [{ role: 'user', content: `${lifeAngleJack}${lifeConflict}${lifeLengthRule}${lastMsg}` }];
        const lifeLuciaHistory: TeaMsg[] = [{ role: 'user', content: `${lifeAngleLucia}${lifeLengthRule}${lastMsg}` }];
        const lifeRayHistory: TeaMsg[] = [{ role: 'user', content: `${lifeAngleRay}${lifeConflict}[역할: 질문에 직접 답해라. 핵심 숫자 2개만. 절대 3줄 초과 금지. 목록·불릿 금지.]\n${lastMsg}` }];

        const [rayLLM, jackLLM, luciaLLM] = await Promise.all([
          callTeaPersona('ray',   TEA_SYSTEM_RAY,   lifeRayHistory),
          callTeaPersona('jack',  TEA_SYSTEM_JACK,  lifeJackHistory),
          callTeaPersona('lucia', TEA_SYSTEM_LUCIA, lifeLuciaHistory),
        ]);

        const cleanLife = (text: string | null | undefined): string =>
          (text || '')
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\[(?:1라운드|2라운드|3라운드)[^\]]*\]/g, '')
            .replace(/\[ECHO[^\]]*\]/g, '')
            .replace(/\[역할[^\]]*\]/g, '')
            .replace(/\[지시[^\]]*\]/g, '')
            .replace(/\[현재 시점[^\]]*\]/g, '')
            .replace(/^\s*(?:RAY|JACK|LUCIA|ECHO)\s*[:：]\s*/gm, '')
            .replace(/^\s*지시\s*[:：]\s*/gm, '')
            .replace(/\n{2,}/g, '\n')
            .trim();

        const rayText   = cleanLife(rayLLM)   || '데이터로 정리해드릴 부분은 잠시 후 다시 짚어드릴게요.';
        const jackText  = cleanLife(jackLLM)  || '핵심 변수가 정리되면 다시 말씀드릴게요.';
        const luciaText = cleanLife(luciaLLM) || '많이 무거우셨겠어요. 천천히 같이 이야기 나눠봐요.';

        // ECHO 취합 판결 — 위 3명의 응답을 컨텍스트로 받아 마지막에 호출
        const lifeEchoTargetClause = (lifePlan.echo_target && lifePlan.echo_angle)
          ? `이번엔 ${lifePlan.echo_target.toUpperCase()}을 직접 지목해서 "${lifePlan.echo_angle}" 이 부분을 찔러라.\n`
          : '';
        const echoConsolidationPrompt = `사용자 질문: ${lastMsg}\n\n[RAY 응답]\n${rayText}\n\n[JACK 응답]\n${jackText}\n\n[LUCIA 응답]\n${luciaText}\n\n${lifeEchoTargetClause}위 세 사람의 응답을 듣고, 너의 시각에서 핵심을 짚고 우선순위를 정리해줘. 감정 위로보다는 구조적 통찰과 실행 가능한 한 가지 방향을 분명히 제시해. 5줄 이내. 불릿·목록 사용 금지. 반드시 마지막 줄은 RAY·JACK·LUCIA 세 사람에게 던지는 직접 질문 한 문장으로 마무리할 것(물음표 필수).`;
        const echoLLM = await callTeaPersona(
          'echo',
          TEA_SYSTEM_ECHO,
          [{ role: 'user', content: echoConsolidationPrompt }],
        );
        const echoText = cleanLife(echoLLM) || '세 사람의 답변을 종합하면, 가장 먼저 좁혀야 할 건 지금 가장 무거운 것이 무엇인가입니다.';

        // ── ✅ 2라운드 (life) — ECHO 1라운드 판결을 직접 질문으로 받아 각자 그 질문에만 답하기 ──
        const lifeRound2Context = `사용자 질문: ${lastMsg}\n\n[1라운드 RAY]\n${rayText}\n[1라운드 JACK]\n${jackText}\n[1라운드 LUCIA]\n${luciaText}\n[1라운드 ECHO]\n${echoText}\n\n`;
        const lifeRound2Prefix = '[ECHO가 방금 질문을 던졌다. RAY: 반드시 숫자/데이터로 시작해 2줄 이내 답하라. JACK: 짧고 투박하게 ~요 로 끝내라. 2줄 이내. LUCIA: ~잖아요 ~거든요 톤으로 2줄 이내. 아이고 금지. 페르소나 호칭에 님 붙이지 말 것.]';
        const lifeRay2History:   TeaMsg[] = [{ role: 'user', content: `${lifeRound2Context}${lifeRound2Prefix}` }];
        const lifeJack2History:  TeaMsg[] = [{ role: 'user', content: `${lifeRound2Context}${lifeRound2Prefix}` }];
        const lifeLucia2History: TeaMsg[] = [{ role: 'user', content: `${lifeRound2Context}${lifeRound2Prefix}` }];

        const [lifeRay2LLM, lifeJack2LLM, lifeLucia2LLM] = await Promise.all([
          callTeaPersona('ray',   TEA_SYSTEM_RAY,   lifeRay2History),
          callTeaPersona('jack',  TEA_SYSTEM_JACK,  lifeJack2History),
          callTeaPersona('lucia', TEA_SYSTEM_LUCIA, lifeLucia2History),
        ]);

        // 2라운드 페르소나 응답은 첫 문단만 사용 — 다른 페르소나 발화 누출 방어
        const lifeRayText2   = firstParagraph(cleanLife(lifeRay2LLM));
        const lifeJackText2  = firstParagraph(cleanLife(lifeJack2LLM));
        const lifeLuciaText2 = firstParagraph(cleanLife(lifeLucia2LLM));

        // 2라운드 ECHO 최후 판결 — 1·2라운드 전체를 본 뒤 마무리
        const lifeEcho2ConsolidationPrompt = `사용자 질문: ${lastMsg}\n\n[1라운드]\nRAY: ${rayText}\nJACK: ${jackText}\nLUCIA: ${luciaText}\nECHO: ${echoText}\n\n[2라운드]\nRAY: ${lifeRayText2}\nJACK: ${lifeJackText2}\nLUCIA: ${lifeLuciaText2}\n\n최후 판결을 한 문장으로만 내려라. 요약·정리·나열 금지. 절대 3줄 초과 금지. "결정은 당신이 하십시오" 표현 금지.`;
        const lifeEcho2LLM = await callTeaPersona(
          'echo',
          TEA_SYSTEM_ECHO,
          [{ role: 'user', content: lifeEcho2ConsolidationPrompt }],
        );
        const lifeEchoText2 = cleanLife(lifeEcho2LLM);

        try {
          const supabase = getSupabase();
          if (supabase) {
            await supabase.from('tea_logs').insert({
              persona: 'echo',
              turn_count: 1,
              first_message: lastMsg.slice(0, 100),
              user_id: null,
            });
          }
        } catch (e) {
          console.warn('[tea:life] 로그 저장 실패 (무시)', e);
        }

        return respond({
          reply: [rayText, jackText, luciaText, echoText, lifeRayText2, lifeJackText2, lifeLuciaText2, lifeEchoText2].filter(Boolean).join('\n\n'),
          personas: {
            jack: jackText, lucia: luciaText, ray: rayText, echo: echoText,
            ray2:   lifeRayText2   || null,
            jack2:  lifeJackText2  || null,
            lucia2: lifeLuciaText2 || null,
            echo2:  lifeEchoText2  || null,
            order:  lifePlan.order,
            verdict: '관망' as Verdict,
            confidence: 0,
            breakdown: '인생 후반전 고민',
            positionSizing: '0%',
            jackNews: null, luciaNews: null, rayNews: null, echoNews: null,
          },
        });
      }

      // ── ✅ finance 카테고리(teaMode) 모든 질문 — 4명 페르소나 병렬 응답으로 강제 ──
      //   teaMode=true 진입 시 STOCK_MAP/CRYPTO_MAP/MARKET_INDEX 키워드 일치 여부와 무관하게
      //   "삼성전자/비트코인/코스피" 등 모든 재테크 질문을 4명 동시 응답 구조로 통합.
      //   (단일 RAY 경로 / 단일 종목 풀 분석 경로는 teaMode=false 일 때만 사용 — 사실상 deprecated)
      if (category === 'finance' && !isExplicitPersonaPick) {
        return await buildFinanceMultiPersonaResponse(lastMsg);
      }

      // ── 카테고리 감지 — 폴백 템플릿 분기용 (LLM 응답 자체는 시스템 프롬프트가 알아서 적응) ──
      //   우선순위: 가족/건강 > 손실 > 기쁨 > 기타
      const isFamily = /(가족|부모|어머니|아버지|엄마|아빠|자식|아이|아들|딸|남편|아내|형제|자매|건강|병|아프|수술|입원|병원|암|치매)/.test(lastMsg);
      const isLoss = /(손실|손절|물렸|물림|떨어|빠졌|하락|폭락|투자|주식|코인|마이너스|잃었|날렸|망했|망하)/.test(lastMsg);
      const isJoy = /(기쁨|기뻐|행복|성공|올랐|올라|상승|수익|벌었|대박|축하|자랑|합격|승진|좋은 일)/.test(lastMsg);

      const empathyLine =
        isFamily ? '많이 걱정되시겠어요.'
        : isLoss  ? '많이 속상하셨겠어요.'
        : isJoy   ? '정말 잘 되셨네요!'
        :           '많이 힘드셨겠어요.';

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


      // ── 폴백 템플릿 (LLM 실패 시 per-persona 사용) ──
      let fallbackLucia: string;
      let fallbackJack: string;
      let fallbackEcho: string;

      if (round >= 3) {
        // ⚠️ ECHO 폴백은 '마무리 표현' 금지 규칙에 맞춰 '파고드는 질문' 형태로만 유지.
        //   JACK 폴백도 공감어 최소화 + 행동 중심 질문 톤으로 통일.
        const deeperCut = round >= 4;
        fallbackLucia = `말씀하신 내용이 마음에 걸려요.\n지금 가장 무거운 게 뭔가요?`;
        fallbackJack = deeperCut
          ? '그 결정의 근거가 뭐였나요?\n다음엔 어떤 기준을 세울 건가요?'
          : '지금 이 문제의 핵심이 뭐라고 보세요?\n피하고 있는 판단이 있다면 뭔가요?';
        fallbackEcho = deeperCut
          ? 'LUCIA는 감정을, JACK은 판단을 물었어요.\n저는 다른 게 궁금합니다 — 이 상황에서 진짜 원하는 게 뭔가요?'
          : '여기까지 들으니 한 가지가 걸려요.\n말하지 않은 것 중에 가장 무거운 건 무엇인가요?';
      } else if (round >= 2) {
        const luciaDeep =
          isFamily ? '그 마음이 얼마나 무거우셨을지 느껴져요.'
          : isLoss  ? '그때 가장 힘들었던 순간이 언제였어요?'
          : isJoy   ? '그 순간 어떤 기분이 드셨어요? 더 들려주세요.'
          :           '그 마음을 꺼내주셔서 감사해요.';
        fallbackLucia = `${empathyLine}\n${luciaDeep}`;
        fallbackJack =
          isJoy && !isLoss && !isFamily
            ? '상황을 조금 더 구체적으로 정리해볼까요?\n어떤 과정에서 그런 결과가 나왔는지 들려주세요.'
            : '상황을 조금 더 구체적으로 정리해볼까요?\n언제부터, 어떤 계기로 이 마음이 시작됐는지 알려주세요.';
        fallbackEcho =
          isJoy && !isLoss && !isFamily
            ? '지금 가장 나누고 싶은 게 뭐예요?\n축하할 일인지, 다음 계획인지 함께 정리해봐요.'
            : '지금 이 순간, 가장 하고 싶은 건 뭐예요?\n들어주기만 해도 되고, 같이 풀어가도 돼요.';
      } else {
        // Round 1 — LUCIA 외에는 응답 없음 (호출도 안 함)
        fallbackLucia = `말씀해주셔서 고마워요.\n${empathyLine}\n조금 더 이야기해주실 수 있어요?`;
        fallbackJack = '';
        fallbackEcho = '';
      }

      // ── 단일 페르소나 1:1 응답 — 기본 lucia, JACK/ECHO/RAY 는 명시적 소환 시에만 ──
      //   ✅ LUCIA 허브 카테고리 라우팅: sports→jack, news/finance→ray, legal/tech→echo (클라이언트 teaPersona 우선)
      const _categoryPersona: 'jack' | 'echo' | 'ray' | null =
        category === 'sports' ? 'jack'
        : category === 'news'   ? 'ray'
        : category === 'finance' ? 'ray'
        : (category === 'legal' || category === 'tech') ? 'echo'
        : category === 'life' ? null
        : null;
      const selectedPersona: 'lucia' | 'jack' | 'echo' | 'ray' =
        teaPersona === 'jack' ? 'jack'
        : teaPersona === 'echo' ? 'echo'
        : teaPersona === 'ray'  ? 'ray'
        : _categoryPersona
          ? _categoryPersona
          : 'lucia';

      if (selectedPersona === 'jack') {
        const jackLLM = await callTeaPersona('jack', TEA_SYSTEM_JACK, jackHistory);
        try {
          const supabase = getSupabase();
          if (supabase) {
            await supabase.from('tea_logs').insert({
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
          const supabase = getSupabase();
          if (supabase) {
            await supabase.from('tea_logs').insert({
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
          const supabase = getSupabase();
          if (supabase) {
            await supabase.from('tea_logs').insert({
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
        const supabase = getSupabase();
        if (supabase) {
          await supabase.from('tea_logs').insert({
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

      // ✅ 빈 줄 완전 제거 + 볼드 마크다운 제거 (연속 \n{2,} → \n)
      const cleanAdvanced = (text: string): string =>
        text.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\n{2,}/g, '\n').trim();

      // ✅ summary(첫 2줄) / details(나머지) 분리 — "자세히 보기" 버튼용
      const splitForBubble = (text: string): { summary: string; details: string } => {
        const clean = cleanAdvanced(text);
        const lines = clean.split('\n').filter(l => l.trim());
        if (lines.length <= 2) return { summary: clean, details: '' };
        return {
          summary: lines.slice(0, 2).join('\n'),
          details: lines.slice(2).join('\n'),
        };
      };

      const rayText = cleanAdvanced(rayLLM || '데이터 기반 분석이 필요합니다.\n지금 구간의 통계적 특성을 먼저 확인하시고 과거 유사 상황의 패턴을 비교해 보시는 걸 권합니다.');
      const jackText = cleanAdvanced(jackLLM || '판단 기준을 먼저 정하세요.\n추세가 살아있는지, 꺾였는지 확인부터.\n손절선 없이는 진입도 없습니다.');
      const luciaText = cleanAdvanced(luciaLLM || '이 질문에 답하기 전에 먼저 본인 심리 상태를 점검하세요.\n손실 회피 편향이 작동하는 구간입니다.\n최악의 시나리오를 가정하고 그때 어떻게 할지 먼저 정해두세요.');
      const echoText = cleanAdvanced(echoLLM || '한 가지만 짚겠습니다.\n원칙 없이 답하면 매번 다른 결론이 나옵니다.\n먼저 본인의 판단 기준을 종이에 적으세요.\n그게 출발점입니다.');

      const ray = splitForBubble(rayText);
      const jack = splitForBubble(jackText);
      const lucia = splitForBubble(luciaText);
      const echo = splitForBubble(echoText);


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

    // ✅ 감정/일반 대화 가드 — teaMode=false 로 들어와도 종목 추출 차단
    //   teaMode 블록은 teaMode=true 만 처리하므로, teaMode=false + emotion/general 케이스가
    //   여기까지 흘러와 종목 분석 로직에 잘못 진입하는 것을 방지한다.
    if (category === 'emotion') {
      return respond({
        teaMode: true,
        teaRound: 1,
        teaPersona: 'lucia',
        teaLucia: '',
      });
    }

    if (category === 'general') {
      // general 카테고리는 LUCIA가 받아서 자연스럽게 대화
      // teaMode=true로 처리
      return respond({
        teaMode: true,
        teaRound: 1,
        teaPersona: 'lucia',
        teaLucia: '',
      });
    }

    const keyword = extractKeyword(messages);

    // ✅ 추천 질문 감지
    const isRecommendQuery = RECOMMEND_PATTERNS.some(p => lastMsg.includes(p));
    const isForecastQuery = ['전망', '어때', '어떤가', '어떨까', '주목할'].some(p => lastMsg.includes(p));
    const detectedAsset = detectAssetClass(lastMsg);

    // ✅ 사전 질문 10개 핸들러
    // 하 레벨
    const isMarketMood = lastMsg.includes('사도 되는 분위기') || lastMsg.includes('사도 되는 분위기야');
    const isOnePick = lastMsg.includes('종목 1개만') || lastMsg.includes('1개만 알려줘');
    const isCoinDecision = lastMsg.includes('매수 vs 관망') || lastMsg.includes('결론만');
    // 중 레벨
    const isForeignerPick = lastMsg.includes('외국인이 사는 종목') || lastMsg.includes('따라가도 되는');
    const isSectorTiming = lastMsg.includes('강한 섹터') && (lastMsg.includes('타이밍') || lastMsg.includes('진입'));
    const isVolumeFake = lastMsg.includes('거래량 갑자기') || lastMsg.includes('진짜야 페이크야') || lastMsg.includes('진짜 신호야 페이크');
    const isPortfolio = lastMsg.includes('100만원') || (lastMsg.includes('비중') && lastMsg.includes('나눠'));
    // 상 레벨
    const isTrendStrategy = lastMsg.includes('추세추종') || lastMsg.includes('역추세');
    const isDecoupling = (lastMsg.includes('나스닥') && lastMsg.includes('코스피') && lastMsg.includes('따로')) || lastMsg.includes('디커플링');
    const isStopLoss = lastMsg.includes('손절 어디야') || (lastMsg.includes('손절') && lastMsg.includes('들어가면'));
    const isNextDayStrategy = lastMsg.includes('내일 전략') || lastMsg.includes('장 결과') || lastMsg.includes('어제 장') || (lastMsg.includes('오늘') && lastMsg.includes('결과'));
    const isOpeningVolume = lastMsg.includes('장 초반') || lastMsg.includes('초반 30분') || (lastMsg.includes('개장') && lastMsg.includes('거래량'));
    const isFirstStock = lastMsg.includes('첫 번째로 봐야') || lastMsg.includes('장 열리면') || (lastMsg.includes('개장') && lastMsg.includes('종목'));

    // ── 같은 섹터 비교 (Step 1: 같은 섹터만 처리, 다른 섹터/자산군은 기존 단일 분석으로 fallback) ──
    const comparePair = extractTwoKeywords(lastMsg);
    if (comparePair) {
      const sector1 = getSector(comparePair.first);
      const sector2 = getSector(comparePair.second);
      if (sector1 && sector2 && sector1 === sector2) {
        const [a, b] = await Promise.all([
          fetchMarketPrice(comparePair.first).catch(() => null),
          fetchMarketPrice(comparePair.second).catch(() => null),
        ]);
        const chA = parseFloat(a?.change || '0');
        const chB = parseFloat(b?.change || '0');
        const strong = chA > chB ? comparePair.first : comparePair.second;
        const weak   = chA > chB ? comparePair.second : comparePair.first;
        const strongCh = chA > chB ? chA : chB;
        const weakCh   = chA > chB ? chB : chA;
        const gap = Math.abs(chA - chB);
        const isDivergent = gap >= 1.0;  // 1%p 이상 차이 — 종목 선별 필요
        const sign = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(2);

        const verdict: Verdict = '관망';
        const conclusion = isDivergent
          ? `같은 ${sector1}인데 ${strong}은 강세, ${weak}는 약세 — 종목 선별이 중요한 구간입니다`
          : `같은 ${sector1} — ${comparePair.first}/${comparePair.second} 동조화 흐름, 섹터 공통 요인 중심으로 판단하십시오`;

        const ray = `같은 섹터 비교 — ${sector1}
${comparePair.first}: ${a?.price || '-'} (${sign(chA)}%)
${comparePair.second}: ${b?.price || '-'} (${sign(chB)}%)
격차: ${gap.toFixed(2)}%p → ${isDivergent ? '종목 분산(디버전스) — 개별 이슈 가능성' : '섹터 동조화 — 공통 모멘텀'}`;

        const jack = `지휘관님, ${sector1} 섹터 내 ${comparePair.first} vs ${comparePair.second} 비교 분석입니다.
${strong} ${sign(strongCh)}% / ${weak} ${sign(weakCh)}% — 격차 ${gap.toFixed(2)}%p.
${isDivergent
  ? `${strong} 쪽으로 수급이 쏠리는 구간입니다. 섹터 전체가 아닌 개별 종목 선별이 성과를 좌우합니다.`
  : `두 종목이 함께 ${chA > 0 && chB > 0 ? '상승' : chA < 0 && chB < 0 ? '하락' : '횡보'}하고 있어 섹터 공통 이슈가 지배적입니다. 어느 한 종목만 고집할 필요는 없습니다.`}`;

        const lucia = `소장님, ${sector1} 업종에서 같은 날 ${comparePair.first}는 ${sign(chA)}%, ${comparePair.second}는 ${sign(chB)}% 움직였어요. ${isDivergent
          ? `같은 업종인데 한 종목이 눈에 띄게 강하다면 섹터 이슈가 아니라 개별 회사 이슈예요. 강한 쪽(${strong})을 따라가되 과열 아닌지 꼭 확인하세요.`
          : `두 종목이 비슷하게 움직이면 섹터 공통 뉴스나 업황 변화를 먼저 살펴봐야 해요. 개별 선택보다 섹터 비중 결정이 먼저입니다.`}`;

        const echo = `결론: 🟡 ${conclusion}
컨플루언스 신호 강도: ${isDivergent ? '보통 (종목 선별)' : '낮음 (동조화)'}
${sign(chA) === sign(chB) && chA * chB > 0 ? '✅' : '⚠️'} 섹터 동조 여부: ${chA * chB > 0 ? '동조' : '분화'}
⚠️ 격차: ${gap.toFixed(2)}%p
조건: ${isDivergent ? `${strong} 중심으로 10% 선진입 검토 — ${weak} 반등 전까지 비중 분리` : `섹터 비중 결정 후 두 종목 동일 비중 분산`}
비중: 신규 진입 시 투자금의 10%로 시작하십시오.

📡 데이터 출처 — 실시간 시장 데이터

${DISCLAIMER}`;

        return respond({
          reply: [ray, jack, lucia, echo].join('\n\n'),
          personas: { jack, lucia, ray, echo, verdict, confidence: 80, breakdown: `같은 섹터 비교(${sector1})`, positionSizing: '0%', jackNews: null, luciaNews: null, rayNews: null, echoNews: null },
        });
      }
      // 다른 섹터 또는 자산군 — Step 2/3에서 구현, 지금은 fallback
    }

    // ── 개장 초반 30분 거래량 ──
    if (isOpeningVolume && (!keyword || keyword === '시장')) {
      const usData = await fetchMarketPrice('나스닥').catch(() => null);
      const usChange = parseFloat(usData?.change || '0');
      const usTrend = usChange > 0.5 ? '상승' : usChange < -0.5 ? '하락' : '보합';
      const jack = `지휘관님, 개장 초반 30분 거래량 판단 기준입니다.\n\n✅ 매수 신호: 전일 대비 거래량 +30% 이상 + 가격 상승 동반\n⚠️ 주의 신호: 거래량 증가인데 가격 제자리 (교착 구간)\n❌ 회피 신호: 거래량 감소 + 갭하락 동시 출현\n\n나스닥 어제 ${usTrend} 마감(${usChange >= 0 ? '+' : ''}${usChange.toFixed(2)}%) 기준, 오늘 개장 초반 ${usTrend === '상승' ? '매수세 유입 가능성이 높습니다' : usTrend === '하락' ? '매도세 주의가 필요합니다' : '방향성 확인이 필요합니다'}.`;
      const lucia = `소장님, 개장 초반 30분은 그날 장의 분위기를 결정해요. 거래량이 평소보다 많으면서 가격도 올라가면 좋은 신호예요. 반대로 거래량만 많고 가격이 안 움직이면 세력이 물량 소화 중일 수 있어요. 서두르지 말고 15~30분 지켜본 후 진입하세요.`;
      const ray = `개장 초반 거래량 판단 기준 데이터입니다.\n\n✅ 강한 신호: 거래량 전일 대비 +30% + 가격 +0.5% 이상 동반\n⚠️ 약한 신호: 거래량 +10~30% + 가격 횡보\n❌ 페이크: 거래량 급증 + 가격 변동 없음\n\n나스닥 전일 ${usChange >= 0 ? '+' : ''}${usChange.toFixed(2)}% 기준 오늘 한국장 연동 가능성 ${usTrend === '상승' ? '높음' : usTrend === '하락' ? '하락 주의' : '중립'}입니다.`;
      const echo = `결론: 개장 초반 30분 거래량 판단 기준 제공 완료\n\n핵심 공식: 거래량 +30% 이상 + 가격 동반 상승 = 진입 신호\n나스닥 전일 ${usTrend} 마감 → 오늘 개장 초반 ${usTrend === '상승' ? '상승 모멘텀 유지 여부를 확인하십시오' : usTrend === '하락' ? '갭하락 주의 — 관망을 권고합니다' : '방향성 확인 후 진입하십시오'}\n\n조건: 분석할 종목명을 입력하시면 개별 거래량 신호를 즉각 판단합니다.\n\n📡 데이터 출처 — 나스닥 전일 종가 기준\n\n${DISCLAIMER}`;
      return respond({ reply: [ray, jack, lucia, echo].join('\n\n'), personas: { jack, lucia, ray, echo, verdict: '관망' as Verdict, confidence: 78, breakdown: '개장 초반 거래량', positionSizing: '0%', jackNews: null, luciaNews: null, rayNews: null, echoNews: null } });
    }

    // ── 개장 첫 번째 종목 ──
    if (isFirstStock && (!keyword || keyword === '시장')) {
      const [usData, krData] = await Promise.all([
        fetchMarketPrice('나스닥').catch(() => null),
        fetchMarketPrice('코스피').catch(() => null),
      ]);
      const usChange = parseFloat(usData?.change || '0');
      const krChange = parseFloat(krData?.change || '0');
      const overallTrend = (usChange + krChange) > 0.5 ? '상승' : (usChange + krChange) < -0.5 ? '하락' : '보합';
      const jack = `지휘관님, 오늘 개장 첫 번째 종목 선택 기준입니다.\n\n나스닥 ${usChange >= 0 ? '+' : ''}${usChange.toFixed(2)}% / 코스피 ${krChange >= 0 ? '+' : ''}${krChange.toFixed(2)}% 기준\n\n${overallTrend === '상승' ? '✅ 상승 장세 — 전일 강했던 섹터(IT·반도체) 첫 번째 확인 권고' : overallTrend === '하락' ? '⚠️ 하락 장세 — 방어적 접근. 첫 종목 진입보다 시장 확인 우선' : '🟡 보합 장세 — 거래량 터진 종목 위주로 선별 접근'}\n\n종목명을 입력하시면 즉각 개별 분석을 개시합니다.`;
      const lucia = `소장님, 장 열리자마자 바로 들어가는 건 위험해요. 첫 15분은 '관찰 시간'이에요. ${overallTrend === '상승' ? '오늘은 분위기가 좋으니 거래량 터지는 종목을 찾아보세요.' : overallTrend === '하락' ? '오늘은 조심하는 날이에요. 급하게 들어가지 말고 반등 신호 확인 후 움직이세요.' : '오늘은 방향이 불확실해요. 확실한 신호 나올 때까지 기다리는 게 맞아요.'}`;
      const ray = `시장 데이터 기준입니다.\n나스닥: ${usData?.price || '-'} (${usChange >= 0 ? '+' : ''}${usChange.toFixed(2)}%)\n코스피: ${krData?.price || '-'} (${krChange >= 0 ? '+' : ''}${krChange.toFixed(2)}%)\n\n종합 추세: ${overallTrend === '상승' ? '상승 — IT·반도체 섹터 우선 확인 권고' : overallTrend === '하락' ? '하락 — 방어적 접근, 관망 비중 확대 권고' : '보합 — 거래량 신호 확인 후 선별 진입 권고'}\n\n분석할 종목명을 입력하시면 즉각 데이터를 제공합니다.`;
      const echo = `결론: 오늘 개장 첫 종목 전략 제공 완료\n\n시장 추세: ${overallTrend === '상승' ? '🟢 상승 — IT·반도체 섹터 우선' : overallTrend === '하락' ? '🔴 하락 — 관망 우선, 반등 신호 대기' : '🟡 보합 — 거래량 신호 확인 후 진입'}\n나스닥 ${usChange >= 0 ? '+' : ''}${usChange.toFixed(2)}% / 코스피 ${krChange >= 0 ? '+' : ''}${krChange.toFixed(2)}%\n\n조건: 종목명을 입력하시면 즉각 개별 분석을 개시합니다.\n비중: 시장 방향 확인 전 0% 유지하십시오.\n\n📡 데이터 출처 — 전일 종가 기준\n\n${DISCLAIMER}`;
      return respond({ reply: [ray, jack, lucia, echo].join('\n\n'), personas: { jack, lucia, ray, echo, verdict: '관망' as Verdict, confidence: 75, breakdown: '개장 첫 종목', positionSizing: '0%', jackNews: null, luciaNews: null, rayNews: null, echoNews: null } });
    }

    // ── 어제/오늘 장 결과 + 내일/오늘 전략 ──
    if (isNextDayStrategy && (!keyword || keyword === '시장')) {
      const nowKST2 = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const hourKST = nowKST2.getUTCHours();
      const minKST = nowKST2.getUTCMinutes();
      const timeKST2 = hourKST * 100 + minKST;
      const isBeforeOpen2 = timeKST2 < 900;
      // 개장 전이면 "어제 장 / 오늘 전략", 마감 후면 "오늘 장 / 내일 전략"
      const dayLabel = isBeforeOpen2 ? '어제' : '오늘';
      const nextLabel = isBeforeOpen2 ? '오늘' : '내일';

      const [krData, usData] = await Promise.all([
        fetchMarketPrice('코스피').catch(() => null),
        fetchMarketPrice('나스닥').catch(() => null),
      ]);
      const krChange = parseFloat(krData?.change || '0');
      const usChange = parseFloat(usData?.change || '0');
      // ✅ 보합 기준 ±0.1% 이내, 그 외 소폭/중폭/강폭 구분
      const descChange = (ch: number) => {
        if (ch > 1.5) return `강세 마감 (+${ch.toFixed(2)}%)`;
        if (ch > 0.3) return `상승 마감 (+${ch.toFixed(2)}%)`;
        if (ch >= -0.1 && ch <= 0.1) return `보합 마감 (${ch.toFixed(2)}%)`;
        if (ch >= -0.3) return `약보합 마감 (${ch.toFixed(2)}%)`;
        if (ch >= -1.5) return `하락 마감 (${ch.toFixed(2)}%)`;
        return `급락 마감 (${ch.toFixed(2)}%)`;
      };
      const krResult = descChange(krChange);
      const usResult = descChange(usChange);
      const nextSignal = (krChange + usChange) > 1
        ? `${nextLabel} 상승 모멘텀 유지 가능성 높음`
        : (krChange + usChange) < -1
        ? `${nextLabel} 하락 압력 주의 필요`
        : `${nextLabel} 방향성 불확실 — 개장 초 거래량 확인 필요`;

      const jack = `지휘관님, ${dayLabel} 장 결과 브리핑입니다.\n\n코스피: ${krData?.price || '-'} ${krResult}\n나스닥: ${usData?.price || '-'} ${usResult}\n\n${nextLabel} 전략: ${nextSignal}. 개장 초 30분 거래량이 핵심 신호입니다.`;
      const lucia = isBeforeOpen2
        ? `소장님, ${dayLabel} 흐름을 보면 ${krChange >= 0 ? '코스피가 버텨줬어요. 오늘 개장 초반을 잘 지켜봐요.' : '코스피가 좀 흔들렸네요. 오늘 개장 초반 반등 신호가 있는지 확인하세요.'} 무리하지 말고 신호 확인 후 움직이세요.`
        : `소장님, 오늘 하루 수고하셨어요. ${krChange >= 0 ? '오늘 코스피가 버텨줬네요. 내일도 이 흐름이 이어질지 개장 초반을 지켜봐요.' : '오늘 좀 힘들었죠. 하지만 하락도 내일의 기회가 될 수 있어요.'} 무리하지 말고 신호 확인 후 움직이세요.`;
      const ray = `${dayLabel} 종가 기준 데이터입니다.\n코스피: ${krData?.price || '-'} (${krChange >= 0 ? '+' : ''}${krChange.toFixed(2)}%) — ${descChange(krChange)}\n나스닥: ${usData?.price || '-'} (${usChange >= 0 ? '+' : ''}${usChange.toFixed(2)}%) — ${descChange(usChange)}\n\n${nextLabel} 핵심 지표: 개장 초 30분 거래량 + 외국인 수급 방향을 확인하십시오.`;
      const echo = `결론: ${dayLabel} 장 분석 완료 — ${nextSignal}\n\n📊 ${dayLabel} 장 요약:\n코스피: ${krData?.price || '-'} ${krResult}\n나스닥: ${usData?.price || '-'} ${usResult}\n\n${nextLabel} 전략: ${nextSignal}\n조건: 개장 초 거래량 +30% 이상 확인 시 방향성 신뢰 가능\n비중: 신호 확인 전 0% 유지하십시오.\n\n📡 데이터 출처 — 시세: 전일 종가 기준\n\n${DISCLAIMER}`;
      return respond({ reply: [ray, jack, lucia, echo].join('\n\n'), personas: { jack, lucia, ray, echo, verdict: '관망' as Verdict, confidence: 75, breakdown: '장 결과 분석', positionSizing: '0%', jackNews: null, luciaNews: null, rayNews: null, echoNews: null } });
    }

    // ── 하: 시장 분위기 ──
    if (isMarketMood && (!keyword || keyword === '시장')) {
      const [krData, usData] = await Promise.all([
        fetchMarketPrice('코스피').catch(() => null),
        fetchMarketPrice('나스닥').catch(() => null),
      ]);
      // ✅ 한국장/미국장 각각 개장 상태 계산
      const nowMood = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const dayMood = nowMood.getUTCDay();
      const timeMood = nowMood.getUTCHours() * 100 + nowMood.getUTCMinutes();
      const isWknd = dayMood === 0 || dayMood === 6;
      // ✅ 한국장 09:00~15:30 (15:30 정각부터 마감)
      const krOpen = !isWknd && timeMood >= 900 && timeMood < 1530;
      const krBefore = !isWknd && timeMood < 900;
      const usOpen = !isWknd && (timeMood >= 2330 || timeMood < 600);
      const krStatus = isWknd ? '주말 휴장' : krBefore ? '개장 전' : krOpen ? '장 중' : '장 마감';
      const usStatus = isWknd ? '주말 휴장' : usOpen ? '장 중' : timeMood < 2330 ? `오늘 밤 23:30 개장 예정` : '장 마감';

      const krChange = parseFloat(krData?.change || '0');
      const usChange = parseFloat(usData?.change || '0');
      const krMood = krChange > 0.5 ? '상승 중' : krChange < -0.5 ? '하락 중' : '횡보';
      const usMood = usChange > 0.5 ? '강세' : usChange < -0.5 ? '약세' : '보합';
      const krSignal = krOpen && krChange > 0.3 ? '🟢 진입 검토' : krBefore ? '🟡 개장 후 확인' : '🟡 신호 대기';
      const usSignal = usOpen && usChange > 0.5 ? '🟢 진입 검토' : !usOpen ? '🟡 개장 대기' : '🟡 신호 대기';

      const jack = `지휘관님, 현재 시장 분위기 보고드립니다.
한국(코스피): ${krData?.price || '-'} (${krChange >= 0 ? '+' : ''}${krChange.toFixed(2)}%) — ${krStatus} ${krSignal}
미국(나스닥): ${usData?.price || '-'} (${usChange >= 0 ? '+' : ''}${usChange.toFixed(2)}%) — ${usStatus} ${usSignal}`;

      const luciaMsg = isWknd
        ? '주말이라 시장은 쉬고 있어요. 다음 주 전략을 미리 준비하는 게 맞습니다.'
        : krOpen && !usOpen
          ? `한국장은 ${krMood} 중이에요. 미국장은 ${usStatus}이라 지금은 한국 종목에 집중하세요.`
          : !krOpen && usOpen
            ? `미국장이 ${usMood} 중이에요. 한국장은 ${krStatus}이에요.`
            : krMood === '상승 중' && usMood === '강세'
              ? '양쪽 다 올라가고 있어요. 하지만 모두가 낙관할 때가 가장 위험한 법이에요.'
              : '지금은 리스크 관리가 먼저예요.';
      const lucia = `소장님, ${luciaMsg}`;

      const ray = `코스피 ${krData?.price || '-'} (${krChange >= 0 ? '+' : ''}${krChange.toFixed(2)}%) [${krStatus}] / 나스닥 ${usData?.price || '-'} (${usChange >= 0 ? '+' : ''}${usChange.toFixed(2)}%) [${usStatus}]
한국장: ${krSignal} / 미국장: ${usSignal}`;

      const echo = `결론: ${krSignal === '🟢 진입 검토' || usSignal === '🟢 진입 검토' ? '🟡 일부 시장 진입 가능 — 개별 종목 확인 후 결정하십시오' : '⚪ 대기 — 개장 신호 확인 전까지 현금 유지하십시오'}
한국: ${krStatus} (${krMood}) / 미국: ${usStatus} (${usMood})
종목 분석을 원하시면 종목명을 입력하십시오.

📡 데이터 출처 — 실시간 시장 데이터

${DISCLAIMER}`;

      return respond({
        reply: [ray, jack, lucia, echo].join('\n\n'),
        personas: { jack, lucia, ray, echo, verdict: '관망' as Verdict, confidence: 80, breakdown: '시장 분위기', positionSizing: '0%', jackNews: null, luciaNews: null, rayNews: null, echoNews: null },
      });
    }

    // ── 하: 코인 매수 vs 관망 ──
    if (isCoinDecision && (!keyword || keyword === '시장')) {
      const [btcData, ethData] = await Promise.all([
        fetchMarketPrice('비트코인').catch(() => null),
        fetchMarketPrice('이더리움').catch(() => null),
      ]);
      const btcChange = parseFloat(btcData?.change || '0');
      const ethChange = parseFloat(ethData?.change || '0');
      const btcSignal = btcChange > 1 ? '🟢 매수 검토' : btcChange < -1 ? '🔴 관망' : '🟡 조건 대기';
      const ethSignal = ethChange > 1 ? '🟢 매수 검토' : ethChange < -1 ? '🔴 관망' : '🟡 조건 대기';

      const jack = `지휘관님, 코인 현황 보고드립니다.
비트코인: ${btcData?.price || '-'} (${btcChange >= 0 ? '+' : ''}${btcChange.toFixed(2)}%) ${btcSignal}
이더리움: ${ethData?.price || '-'} (${ethChange >= 0 ? '+' : ''}${ethChange.toFixed(2)}%) ${ethSignal}`;
      const lucia = `소장님, ${btcChange > 1 ? '지금 분위기가 좋긴 한데, 코인은 언제든 급변할 수 있어요. 분할 매수로 리스크를 나누세요.' : '지금은 관망이 맞아요. 거래량이 확인될 때까지 기다리는 것이 맞습니다.'}`;
      const ray = `비트코인 ${btcData?.price || '-'} (${btcChange >= 0 ? '+' : ''}${btcChange.toFixed(2)}%) / 이더리움 ${ethData?.price || '-'} (${ethChange >= 0 ? '+' : ''}${ethChange.toFixed(2)}%)
코인 시장은 나스닥과 독립적으로 움직이는 경우가 많습니다.`;
      const echo = `결론: ${btcSignal === '🟢 매수 검토' ? '🟡 소량 분할 진입 검토 — 비트코인 기준 5~10% 먼저 진입하십시오' : '⚪ 관망 — 거래량 증가 신호 확인 전까지 대기하십시오'}
비트코인 ${btcSignal} / 이더리움 ${ethSignal}

📡 데이터 출처 — Upbit 실시간

${DISCLAIMER}`;

      return respond({
        reply: [ray, jack, lucia, echo].join('\n\n'),
        personas: { jack, lucia, ray, echo, verdict: '관망' as Verdict, confidence: 80, breakdown: '코인 결론', positionSizing: '0%', jackNews: null, luciaNews: null, rayNews: null, echoNews: null },
      });
    }

    // ── 중: 포트폴리오 비중 ──
    if (isPortfolio && (!keyword || keyword === '시장')) {
      const [krData, usData, btcData] = await Promise.all([
        fetchMarketPrice('코스피').catch(() => null),
        fetchMarketPrice('나스닥').catch(() => null),
        fetchMarketPrice('비트코인').catch(() => null),
      ]);
      const krChange = parseFloat(krData?.change || '0');
      const usChange = parseFloat(usData?.change || '0');
      const btcChange = parseFloat(btcData?.change || '0');
      const krWeight = krChange > 0.5 ? 30 : 20;
      const usWeight = usChange > 0.5 ? 40 : 30;
      const btcWeight = btcChange > 1 ? 10 : 5;
      const cashWeight = 100 - krWeight - usWeight - btcWeight;

      const jack = `지휘관님, 현재 시장 기준 100만원 배분 전략입니다.
한국주식: ${krWeight}만원 (${krWeight}%) — ${krChange >= 0 ? '상승' : '하락'} 추세
미국주식: ${usWeight}만원 (${usWeight}%) — ${usChange >= 0 ? '강세' : '약세'}
코인: ${btcWeight}만원 (${btcWeight}%) — 소량 분산
현금: ${cashWeight}만원 (${cashWeight}%) — 신호 대기`;
      const lucia = `소장님, 지금처럼 불확실할 때는 현금 비중을 높게 가져가는 게 맞아요. ${cashWeight}만원은 신호가 올 때 바로 쓸 수 있는 실탄입니다.`;
      const ray = `현재 추세 기반 배분: 한국 ${krWeight}% / 미국 ${usWeight}% / 코인 ${btcWeight}% / 현금 ${cashWeight}%
시장 변동성에 따라 비중 조정이 필요합니다.`;
      const echo = `결론: 100만원 기준 배분 완료
한국주식 ${krWeight}만원 / 미국주식 ${usWeight}만원 / 코인 ${btcWeight}만원 / 현금 ${cashWeight}만원
각 자산 개별 분석을 원하시면 종목명을 입력하십시오.

📡 데이터 출처 — 실시간 추세 기반

${DISCLAIMER}`;

      return respond({
        reply: [ray, jack, lucia, echo].join('\n\n'),
        personas: { jack, lucia, ray, echo, verdict: '관망' as Verdict, confidence: 75, breakdown: '포트폴리오', positionSizing: '0%', jackNews: null, luciaNews: null, rayNews: null, echoNews: null },
      });
    }

    // ── 상: 추세추종 vs 역추세 ──
    if (isTrendStrategy && (!keyword || keyword === '시장')) {
      const usData = await fetchMarketPrice('나스닥').catch(() => null);
      const usChange = parseFloat(usData?.change || '0');
      const isTrendFavorable = usChange > 0.5;

      const jack = `지휘관님, 현재 나스닥 ${usChange >= 0 ? '+' : ''}${usChange.toFixed(2)}% 기준 전략 분석입니다.
${isTrendFavorable ? '추세추종 유리 — 모멘텀이 살아있는 구간입니다. 5일·20일 이평선 정배열 종목을 추종하십시오.' : '역추세 유리 — 하락 과정에서 반등 구간을 노리는 것이 유리합니다. 과매도 종목을 탐색하십시오.'}`;
      const lucia = `소장님, ${isTrendFavorable ? '지금 모두가 올라타고 싶어하는 구간이에요. FOMO에 휩쓸리지 말고, 추세가 확인된 종목만 소량 진입하세요.' : '지금은 역추세 전략이 맞긴 한데, 바닥을 잡으려다 손가락이 잘릴 수 있어요. 반등 신호 확인 후 진입하세요.'}`;
      const ray = `나스닥 ${usData?.price || '-'} (${usChange >= 0 ? '+' : ''}${usChange.toFixed(2)}%)
추세 판단: ${isTrendFavorable ? '정배열 구간 — 추세추종 전략 유효' : '역배열 구간 — 역추세 전략 검토'}
통계적으로 추세추종은 상승장에서, 역추세는 횡보/하락장에서 유효합니다.`;
      const echo = `결론: ${isTrendFavorable ? '🟢 추세추종 유리 — 모멘텀 강한 종목 진입 검토' : '🟡 역추세 검토 — 과매도 종목 반등 대기'}
전략: ${isTrendFavorable ? '이평선 정배열 + 거래량 증가 종목 추종' : '5일 이평선 이하 과매도 + 거래량 회복 신호 대기'}
관심 종목명을 입력하시면 즉각 분석을 개시합니다.

📡 데이터 출처 — 나스닥 실시간

${DISCLAIMER}`;

      return respond({
        reply: [ray, jack, lucia, echo].join('\n\n'),
        personas: { jack, lucia, ray, echo, verdict: '관망' as Verdict, confidence: 80, breakdown: '전략 분석', positionSizing: '0%', jackNews: null, luciaNews: null, rayNews: null, echoNews: null },
      });
    }

    // ── 상: 나스닥 vs 코스피 디커플링 ──
    if (isDecoupling && (!keyword || keyword === '시장')) {
      const [krData, usData] = await Promise.all([
        fetchMarketPrice('코스피').catch(() => null),
        fetchMarketPrice('나스닥').catch(() => null),
      ]);
      const krChange = parseFloat(krData?.change || '0');
      const usChange = parseFloat(usData?.change || '0');
      const diff = Math.abs(usChange - krChange);
      const isDecouplingNow = diff > 1.0;

      const jack = `지휘관님, 나스닥 vs 코스피 디커플링 분석입니다.
나스닥: ${usChange >= 0 ? '+' : ''}${usChange.toFixed(2)}% / 코스피: ${krChange >= 0 ? '+' : ''}${krChange.toFixed(2)}%
격차: ${diff.toFixed(2)}%p → ${isDecouplingNow ? '디커플링 구간 — 미국 중심 전략 유효' : '커플링 구간 — 연동 추세 유지 중'}`;
      const lucia = `소장님, ${isDecouplingNow ? `나스닥과 코스피가 ${diff.toFixed(1)}%p 차이로 따로 움직이고 있어요. 이럴 때는 미국 주식 비중을 높이는 게 맞습니다.` : '지금은 두 시장이 비슷하게 움직이고 있어요. 미국 흐름을 따라가는 전략이 유효합니다.'}`;
      const ray = `나스닥 ${usChange >= 0 ? '+' : ''}${usChange.toFixed(2)}% / 코스피 ${krChange >= 0 ? '+' : ''}${krChange.toFixed(2)}%
상관관계: ${isDecouplingNow ? `디커플링 (격차 ${diff.toFixed(2)}%p)` : `커플링 (격차 ${diff.toFixed(2)}%p 이내)`}`;
      const echo = `결론: ${isDecouplingNow ? '🟡 디커플링 — 미국 주식 중심 전략 권고' : '⚪ 커플링 — 양 시장 동조화 유지'}
나스닥 ${usChange >= 0 ? '+' : ''}${usChange.toFixed(2)}% vs 코스피 ${krChange >= 0 ? '+' : ''}${krChange.toFixed(2)}%
${isDecouplingNow ? '미국 개별 종목 분석을 요청하십시오.' : '한국/미국 모두 비슷한 전략이 유효합니다.'}

📡 데이터 출처 — 실시간 시장 데이터

${DISCLAIMER}`;

      return respond({
        reply: [ray, jack, lucia, echo].join('\n\n'),
        personas: { jack, lucia, ray, echo, verdict: '관망' as Verdict, confidence: 82, breakdown: '디커플링 분석', positionSizing: '0%', jackNews: null, luciaNews: null, rayNews: null, echoNews: null },
      });
    }

    // ── 상: 손절 위치 안내 ──
    if (isStopLoss && (!keyword || keyword === '시장')) {
      const jack = `지휘관님, 손절 위치는 종목마다 다릅니다. 종목명을 입력하시면 즉각 손절가를 계산해 드립니다.\n\n일반 원칙: 진입가 대비 -3~5% 구간이 표준 손절 기준입니다.\n예) 삼성전자 215,000원 진입 → 손절 208,550원 (-3%)`;
      const lucia = `소장님, 손절을 미리 정해두는 게 가장 중요한 투자 습관이에요. 종목명을 말씀해 주시면 에코가 구체적인 손절가를 알려드릴 거예요.`;
      const ray = `손절 기준 공식: 진입가 × (1 - 손절율)\n예) 진입가 100,000원, 손절율 3% → 손절가 97,000원\n종목명 입력 시 실제 진입가 기준 손절가를 계산합니다.`;
      const echo = `결론: 손절 계산을 위해 종목명이 필요합니다.\n종목명을 입력하시면 즉각 손절가를 제시합니다.\n\n${DISCLAIMER}`;
      return respond({ reply: [ray, jack, lucia, echo].join('\n\n'), personas: { jack, lucia, ray, echo, verdict: '관망' as Verdict, confidence: 70, breakdown: '손절 안내', positionSizing: '0%', jackNews: null, luciaNews: null, rayNews: null, echoNews: null } });
    }

    // ── 중: 외국인 수급 종목 ──
    if (isForeignerPick && (!keyword || keyword === '시장')) {
      const picks = TREND_PICKS['KOREAN_UP'] || { stocks: ['삼성전자', 'SK하이닉스', '현대차'], sector: 'IT·반도체·자동차' };
      const [d0, d1, d2] = await Promise.all(picks.stocks.map((s: string) => fetchMarketPrice(s).catch(() => null)));
      const stocksWithData = picks.stocks.map((s: string, i: number) => {
        const d = [d0, d1, d2][i];
        const ch = parseFloat(d?.change || '0');
        const signal = ch > 0.5 ? '🟢 외국인 수급 유입' : ch < -0.5 ? '🔴 수급 이탈' : '🟡 관망';
        return `${s}: ${d?.price || '-'} (${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%) ${signal}`;
      }).join('\n');
      const jack = `지휘관님, 외국인 수급 기준 주목 종목 브리핑입니다.\n\n${stocksWithData}\n\n수급 유입 확인된 종목부터 개별 분석을 시작하십시오.`;
      const lucia = `소장님, 외국인이 사는 종목을 따라가는 건 좋은 전략이에요. 하지만 외국인도 틀릴 수 있어요. 수급 유입 + 거래량 증가가 동시에 확인될 때만 따라가세요.`;
      const ray = `외국인 수급 기준 브리핑:\n${stocksWithData}\n외국인 순매수 TOP 데이터는 실시간 지원 예정입니다.`;
      const echo = `결론: 외국인 수급 브리핑 완료\n${stocksWithData}\n종목명을 입력하시면 즉각 상세 분석을 개시합니다.\n\n📡 데이터 출처 — 실시간 수급 데이터\n\n${DISCLAIMER}`;
      return respond({ reply: [ray, jack, lucia, echo].join('\n\n'), personas: { jack, lucia, ray, echo, verdict: '관망' as Verdict, confidence: 75, breakdown: '외국인 수급', positionSizing: '0%', jackNews: null, luciaNews: null, rayNews: null, echoNews: null } });
    }

    // ── 중: 강한 섹터 타이밍 종목 ──
    if (isSectorTiming && (!keyword || keyword === '시장')) {
      const nasdaqData2 = await fetchMarketPrice('나스닥').catch(() => null);
      const trend2 = nasdaqData2?.trend?.trend5d || '상승';
      const trendKey2 = trend2 === '상승' ? 'US_UP' : trend2 === '하락' ? 'US_DOWN' : 'US_NEUTRAL';
      const picks2 = TREND_PICKS[trendKey2 as keyof typeof TREND_PICKS];
      const [d0, d1, d2] = await Promise.all(picks2.stocks.map((s: string) => fetchMarketPrice(s).catch(() => null)));
      const briefings2 = picks2.stocks.map((s: string, i: number) => {
        const d = [d0, d1, d2][i];
        const ch = parseFloat(d?.change || '0');
        const signal = ch > 1 ? '🟢 진입 검토' : ch < -1 ? '🔴 관망' : '🟡 조건 대기';
        return `${s}: ${d?.price || '-'} (${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%) ${signal}`;
      }).join('\n');
      const jack = `지휘관님, 현재 가장 강한 섹터는 ${picks2.sector}입니다.\n\n${briefings2}\n\n진입 검토 종목부터 분석을 시작하십시오.`;
      const lucia = `소장님, 강한 섹터라도 모든 종목이 좋은 건 아니에요. 🟢 신호가 뜬 종목만 진입 검토하세요.`;
      const ray = `강한 섹터: ${picks2.sector}\n\n${briefings2}\n개별 종목 분석 요청 시 상세 수치를 제공합니다.`;
      const echo = `결론: 강한 섹터 브리핑 완료 — ${picks2.sector}\n\n${briefings2}\n종목명을 입력하시면 즉각 상세 분석을 개시합니다.\n\n📡 데이터 출처 — 실시간 추세 기반\n\n${DISCLAIMER}`;
      return respond({ reply: [ray, jack, lucia, echo].join('\n\n'), personas: { jack, lucia, ray, echo, verdict: '관망' as Verdict, confidence: 78, breakdown: '섹터 분석', positionSizing: '0%', jackNews: null, luciaNews: null, rayNews: null, echoNews: null } });
    }

    // ── 중: 거래량 급증 진짜/페이크 ──
    if (isVolumeFake && (!keyword || keyword === '시장')) {
      const jack = `지휘관님, 거래량 급증의 진짜 신호 vs 페이크 구분 기준입니다.\n\n✅ 진짜 신호: 거래량 증가 + 가격 동반 상승 + 이평선 돌파\n❌ 페이크: 거래량 증가인데 가격 제자리 (교착 구간) / 거래량 폭증 후 가격 급락 (패닉 셀)\n\n분석 원하는 종목명을 입력하시면 즉각 판단합니다.`;
      const lucia = `소장님, 거래량이 터졌다고 무조건 올라타면 안 돼요. 가격이 같이 올라가고 있는지 꼭 확인하세요. 거래량만 많고 가격이 안 움직이면 세력이 물량 소화 중일 수 있어요.`;
      const ray = `거래량 급증 판단 기준:\n✅ 진짜: 거래량 +30% 이상 + 가격 +1% 이상 동반\n❌ 페이크: 거래량 +30% 이상이지만 가격 ±0.5% 이내\n분석할 종목명을 입력하시면 실제 데이터로 판단합니다.`;
      const echo = `결론: 거래량 급증 판단 기준 제공 완료\n진짜 신호 = 거래량 +30% + 가격 +1% 동반\n페이크 = 거래량만 급증, 가격 정체\n\n조건: 종목명을 입력하시면 즉각 판단을 개시합니다.\n\n📡 데이터 출처 — 실시간 거래량 기준\n\n${DISCLAIMER}`;
      return respond({ reply: [ray, jack, lucia, echo].join('\n\n'), personas: { jack, lucia, ray, echo, verdict: '관망' as Verdict, confidence: 80, breakdown: '거래량 분석', positionSizing: '0%', jackNews: null, luciaNews: null, rayNews: null, echoNews: null } });
    }

    // ── 종목 키워드 미인식 — 추천/전망 여부에 따라 분기
    if (keyword === '시장') {

      // ✅ 추천 질문 — 자산군별 추천 종목 제안
      if (isRecommendQuery) {
        // 나스닥 추세 확인 (간이)
        let nasdaqTrend5d = '횡보';
        try {
          const ndData = await fetchMarketPrice('나스닥');
          nasdaqTrend5d = ndData?.trend?.trend5d || '횡보';
        } catch { /* 실패 시 기본값 */ }

        // 자산군 + 추세 기반 추천 키 결정
        const assetClass = detectedAsset || 'korean';
        const trendKey = assetClass === 'crypto'
          ? (nasdaqTrend5d === '상승' ? 'CRYPTO_UP' : nasdaqTrend5d === '하락' ? 'CRYPTO_DOWN' : 'CRYPTO_NEUTRAL')
          : assetClass === 'us'
          ? (nasdaqTrend5d === '상승' ? 'US_UP' : nasdaqTrend5d === '하락' ? 'US_DOWN' : 'US_NEUTRAL')
          : (nasdaqTrend5d === '상승' ? 'KOREAN_UP' : nasdaqTrend5d === '하락' ? 'KOREAN_DOWN' : 'KOREAN_NEUTRAL');

        const picks = TREND_PICKS[trendKey as keyof typeof TREND_PICKS];
        const stockList = picks.stocks.join(', ');
        const trendDesc = nasdaqTrend5d === '상승' ? '상승 추세' : nasdaqTrend5d === '하락' ? '하락 추세' : '횡보 구간';

        // ✅ 3종목 병렬 브리핑 — 각 종목 실시간 데이터 + 간단 요약
        const [d0, d1, d2] = await Promise.all(
          picks.stocks.map(s => fetchMarketPrice(s).catch(() => null))
        );
        const stockDataArr = [d0, d1, d2];

        // 종목별 1줄 상태 요약 생성
        const summarizeStock = (name: string, d: typeof d0): string => {
          if (!d) return `${name}: 데이터 미수급`;
          const ch = parseFloat(d.change || '0');
          const chStr = ch >= 0 ? `+${ch.toFixed(2)}%` : `${ch.toFixed(2)}%`;
          const trend = d.trend?.trendContext
            ? d.trend.trendContext.split(' — ')[0]  // 앞부분만
            : (ch > 0.5 ? '상승 중' : ch < -0.5 ? '하락 중' : '횡보');
          const currency = d.currency === 'KRW' ? '원' : ' USD';
          const priceStr = `${d.price}${currency === '원' ? currency : ''}`;
          const vol = parseFloat(d.change || '0');
          const signal = ch > 1 ? '🟢 진입 검토' : ch < -1 ? '🔴 관망' : '🟡 조건 대기';
          return `${name}: ${priceStr} (${chStr}) — ${trend} ${signal}`;
        };

        const briefings = picks.stocks.map((name, i) =>
          summarizeStock(name, stockDataArr[i])
        );

        // 1순위 종목 선정 (등락률 + 추세 기반)
        let topIdx = 0;
        let topScore = -999;
        stockDataArr.forEach((d, i) => {
          if (!d) return;
          const ch = parseFloat(d.change || '0');
          const trendBonus = d.trend?.trend5d === '상승' ? 1 : d.trend?.trend5d === '하락' ? -1 : 0;
          const score = ch + trendBonus;
          if (score > topScore) { topScore = score; topIdx = i; }
        });
        const topStock = picks.stocks[topIdx];
        const topData = stockDataArr[topIdx];
        const topChange = topData ? parseFloat(topData.change || '0') : 0;
        const topReason = topData?.trend?.trendContext
          ? topData.trend.trendContext.split(' —')[0]
          : topChange > 0 ? '상승 모멘텀 확인' : '방어적 선택';

        const briefingText = briefings.join('\n');

        const jackRec = `지휘관님, 현재 ${trendDesc} 기준 ${picks.sector} 브리핑입니다.\n\n${briefingText}\n\n1순위 추천: ${topStock} — ${topReason}. 분석을 시작할까요?`;
        // ✅ 조사 자동 처리 — 받침 있으면 "이", 없으면 "가" / "을" vs "를"
        const lastStock = picks.stocks[picks.stocks.length - 1];
        const lastChar = lastStock.charCodeAt(lastStock.length - 1);
        const hasBatchim = (lastChar - 0xAC00) % 28 !== 0;
        const subjectParticle = hasBatchim ? '이' : '가';
        const topChar = topStock.charCodeAt(topStock.length - 1);
        const topHasBatchim = (topChar - 0xAC00) % 28 !== 0;
        const objectParticle = topHasBatchim ? '을' : '를';
        const luciaRec = `소장님, 제가 보기엔 ${lastStock}${subjectParticle} 오히려 주목할 만해요. 모두가 ${topStock}${objectParticle} 볼 때, 덜 주목받는 종목에서 기회가 나오는 경우가 많거든요. 한번 살펴보시겠어요?`;
        const rayRec = `${trendDesc} 기준 브리핑:\n${briefingText}\n\n1순위: ${topStock} (점수 우위). 개별 분석 요청 시 상세 수치를 제공합니다.`;
        const echoRec = `결론: 종목 브리핑 완료\n근거: 현재 ${trendDesc} + ${picks.sector}\n1순위: ${topStock} — ${topReason}\n조건: 종목명을 입력하시면 즉각 상세 분석을 개시합니다.\n비중: 개별 분석 완료 후 결정하십시오.\n\n${briefingText}\n\n📡 데이터 출처 — 실시간 추세 기반 추천\n\n⚠️ PersonaX는 AI 금융 콘텐츠 플랫폼입니다.\n제공되는 모든 분석은 참고용 시나리오이며\n투자 자문·매매 추천이 아닙니다.\n투자 판단과 그에 따른 손익의 책임은\n전적으로 투자자 본인에게 있습니다.`;

        return respond({
          reply: [jackRec, luciaRec, rayRec, echoRec].join('\n\n'),
          personas: {
            jack: jackRec, lucia: luciaRec, ray: rayRec, echo: echoRec,
            verdict: '관망' as Verdict, confidence: 0, breakdown: '추천 질문', positionSizing: '0%',
            jackNews: null, luciaNews: null, rayNews: null, echoNews: null,
          },
        });
      }

      // ✅ 전망 질문 — 코스피/나스닥으로 유도 (간단 안내 카드)
      if (isForecastQuery) {
        // ✅ finance 카테고리(예: "요즘 주식 어때요?")는 4페르소나 병렬 응답 (RAY만 검색)
        if (category === 'finance') {
          return await buildFinanceMultiPersonaResponse(lastMsg);
        }
        return respond({
          errorType: 'keyword_not_recognized',
          errorMessage: '시장 전망은 "코스피 전망" 또는 "나스닥 전망"으로\n질문해 주시면 즉각 분석해 드려요.',
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
        errorMessage: '죄송합니다. 해당 종목을 찾을 수 없어요.\n다른 종목명으로 입력해주세요.\n예: 삼성전자, 테슬라, SK하이닉스',
      });
    }

    const currency = inferCurrency(keyword);
    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

    let userId: string | null = null;
    try {
      const supabaseServer = await createServerSupabase();
      const { data: { user } } = await supabaseServer.auth.getUser();
      userId = user?.id ?? null;
    } catch { userId = null; }

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
          errorMessage: '죄송합니다. 해당 종목을 찾을 수 없어요.\n다른 종목명으로 입력해주세요.\n예: 삼성전자, 테슬라, SK하이닉스',
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

    // ✅ 뉴스 필터링 — 키워드와 무관한 뉴스 제거
    const NEWS_EXCLUDE_PATTERNS = [
      /홍콩\s*경찰/,/AI\s*양적거래/,/스파크/,/익명\s*지갑/,
      /초등생\s*시신/,/교토/,/미끼/,/사기/,/보이스피싱/,
    ];
    const news = (rawNews as Array<{ title: string }>).filter(n => {
      const title = n.title || '';
      return !NEWS_EXCLUDE_PATTERNS.some(p => p.test(title));
    });

    const isCrypto  = !!(CRYPTO_MAP[keyword] || CRYPTO_MAP[keyword.toUpperCase()]);
    const assetType = isCrypto ? 'CRYPTO' : currency === 'KRW' ? 'KOREAN_STOCK' : 'US_STOCK';

    // ✅ 장 미개장 감지 — 한국시간 기준
    const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const dayKST = nowKST.getUTCDay(); // 0=일, 6=토
    const hourKST = nowKST.getUTCHours();
    const minuteKST = nowKST.getUTCMinutes();
    const timeKST = hourKST * 100 + minuteKST; // 예: 0815 = 오전 8시 15분

    // 한국장: 평일 09:00~15:30 (KST), 주말/공휴일 휴장
    // ✅ 마감 시간 명시: 1530 = 15시 30분. 15:29:59까지 장중, 15:30:00부터 마감
    const KR_OPEN  = 900;
    const KR_CLOSE = 1530;
    const isWeekend = (assetType !== 'CRYPTO') && (dayKST === 0 || dayKST === 6);
    const isKRHolidayToday = assetType !== 'CRYPTO' && isKRMarketHoliday(nowKST);
    const isKRNonTradingToday = isWeekend || isKRHolidayToday;
    const isKRBeforeOpen = assetType === 'KOREAN_STOCK' && !isKRNonTradingToday && timeKST < KR_OPEN;
    const isKRAfterClose = assetType === 'KOREAN_STOCK' && !isKRNonTradingToday && timeKST >= KR_CLOSE;
    const isKRClosed = isKRNonTradingToday || isKRBeforeOpen || isKRAfterClose;

    // ✅ 마지막 거래일 라벨 ("M월 D일") — 주말/공휴일/개장 전 분기에서 사용
    //    - 비거래일(주말/공휴일): 오늘 직전 거래일
    //    - 평일 개장 전: 어제 직전 거래일 (월요일 개장 전이면 지난 금요일)
    const lastKRTradingDate = (() => {
      if (isKRNonTradingToday) return findPrevKRTradingDay(nowKST);
      const prev = new Date(nowKST.getTime());
      prev.setUTCDate(prev.getUTCDate() - 1);
      return findPrevKRTradingDay(prev);
    })();
    const lastKRTradingLabel = formatKRDateLabel(lastKRTradingDate);

    // 미국장: 평일 23:30~06:00 KST (서머타임 기준)
    const isUSClosed = assetType === 'US_STOCK' && !isCrypto &&
      (isWeekend || (timeKST >= 600 && timeKST < 2330));

    const marketClosedNote = isKRClosed && assetType === 'KOREAN_STOCK'
      ? isKRNonTradingToday
        ? `\n⚠️ ${isWeekend ? '주말 휴장' : '공휴일 휴장'} 중 — ${lastKRTradingLabel} 종가 기준 분석입니다.`
        : isKRBeforeOpen
          ? `\n⚠️ 장 개장 전(09:00 개장) — ${lastKRTradingLabel} 종가 기준 분석입니다.`
          : `\n⚠️ 장 마감 후 — 오늘 종가 기준 분석입니다.`
      : '';

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
    // ✅ 장 미개장 시 레이도 기준 날짜 표시 — 주말/공휴일 동적 계산 (KR은 KR 휴장일 반영, US는 주말만)
    const rayTimeNote = (() => {
      if (isKRClosed && assetType === 'KOREAN_STOCK') {
        return ` (${isKRNonTradingToday || isKRBeforeOpen ? `${lastKRTradingLabel} 종가` : '오늘 종가'} 기준)`;
      }
      if (isUSClosed && assetType === 'US_STOCK') {
        const lastUSLabel = formatKRDateLabel(findPrevWeekday(nowKST));
        return ` (${isWeekend ? `${lastUSLabel} 종가` : '오늘 종가'} 기준)`;
      }
      return '';
    })();

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
    const finalRay = (() => {
      const closedNote = rayTimeNote ? rayTimeNote : '';
      const rayChangeNum = safeNum(marketData?.change);
      const changeStr = marketData?.change
        ? ` (${rayChangeNum >= 0 ? '+' : ''}${rayChangeNum.toFixed(2)}%)`
        : '';

      // 거래량 라인 (숫자 포함). 코인은 24시간 거래량.
      const rayFmtVol = (v: number): string => {
        if (v >= 100000000) return `${(v / 100000000).toFixed(1)}억주`;
        if (v >= 10000) return `${Math.round(v / 10000).toLocaleString()}만주`;
        return `${v.toLocaleString()}주`;
      };
      // ✅ 비정상적으로 작은 값(< 1000주)도 데이터 미수급으로 취급
      const rayRawVol = marketData?.rawVolume && marketData.rawVolume >= 1000 ? marketData.rawVolume : null;
      const rayAvgVol = marketData?.avgVolume && marketData.avgVolume >= 1000 ? marketData.avgVolume : null;
      let volLine: string;
      if (assetType === 'CRYPTO') {
        volLine = marketData?.volume ? `24시간 거래량 ${marketData.volume}` : '24시간 거래량 미수급';
      } else if (rayRawVol && rayAvgVol) {
        // 판정 3단계 — 저조 / 보통 / 증가
        const delta = rayRawVol > rayAvgVol * 1.1 ? '증가' : rayRawVol < rayAvgVol * 0.9 ? '저조' : '보통';
        volLine = `거래량 ${rayFmtVol(rayRawVol)} (5일 평균 ${rayFmtVol(rayAvgVol)}, ${delta})`;
      } else if (rayRawVol) {
        // avgVolume 미수급이어도 raw 수치는 표시
        volLine = `거래량 ${rayFmtVol(rayRawVol)}`;
      } else {
        // ✅ 데이터가 진짜 없는 경우 — "거래량 저조" 오표시 차단
        volLine = '거래량 데이터 미수급';
      }

      const line1 = `${keyword} ${rayPriceDisplay}${changeStr}${closedNote}`;
      const line2 = volLine;
      const line3 = vix.label;

      // ✅ RAY 섹터 비교 한 줄 — 조건부 삽입 (quote 바로 앞)
      //    조건: 이전 종목 존재 + 같은 섹터 + 다른 키워드 + 양쪽 change% 확보
      //    판정: Δ = currentChange - prevChange
      //          > +1.0 → "상대적 강세", < -1.0 → "상대적 약세", 그 외 → "유사한 흐름"
      //    0.3%p는 장중 노이즈 범위라 1.0%p 이상 차이 날 때만 강/약 표현.
      let sectorCompareLine = '';
      const currSectorForCompare = getSector(keyword) ?? null;
      const prevSectorForCompare = prevCtx?.prevSector ?? null;
      if (
        prevCtx &&
        prevCtx.prevKeyword &&
        prevCtx.prevKeyword !== keyword &&
        prevSectorForCompare &&
        currSectorForCompare &&
        prevSectorForCompare === currSectorForCompare &&
        prevCtx.prevChangePercent !== null &&
        prevCtx.prevChangePercent !== undefined &&
        Number.isFinite(rayChangeNum)
      ) {
        const delta = rayChangeNum - prevCtx.prevChangePercent;
        const judgment = delta > 1.0 ? '상대적 강세' : delta < -1.0 ? '상대적 약세' : '유사한 흐름';
        const prevChangeStr = `${prevCtx.prevChangePercent >= 0 ? '+' : ''}${prevCtx.prevChangePercent.toFixed(2)}%`;
        const candidate = `같은 ${currSectorForCompare} 섹터, ${prevCtx.prevDisplayName || prevCtx.prevKeyword}(${prevChangeStr}) 대비 ${judgment}.`;
        // 35자 이내 가드
        if (candidate.length <= 35) sectorCompareLine = candidate;
      }

      return [line1, line2, line3, sectorCompareLine].filter(Boolean).join('\n');
    })();

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
    let finalRayDetails: string | null = null;
    let finalJackDetails: string | null = null;
    let finalLuciaDetails: string | null = null;

    if (marketData && !isMarketIndex) {
      const fmtPx = (n: number) =>
        currency === 'KRW' ? `${Math.round(n).toLocaleString('ko-KR')}원` : `$${n.toFixed(2)}`;
      const fmtVol = (v: number): string => {
        if (v >= 100000000) return `${(v / 100000000).toFixed(1)}억주`;
        if (v >= 10000) return `${Math.round(v / 10000).toLocaleString()}만주`;
        return `${v.toLocaleString()}주`;
      };

      // RAY 상세 — 이모지는 허용 셋(✅ ⚠️ 🔹 📊 📈 💡 🔴 🟡 🟢)만 사용
      const rayLines: string[] = [];
      const trend = marketData.trend;
      const curPrice = marketData.rawPrice;
      if (trend?.ma5 && trend?.ma20 && curPrice) {
        const ma5Dir = curPrice > trend.ma5 ? '현재가 위' : '현재가 아래';
        const ma20Dir = curPrice > trend.ma20 ? '현재가 위' : '현재가 아래';
        rayLines.push('📊 이평선 상세');
        rayLines.push(`  5일선: ${fmtPx(trend.ma5)} (${ma5Dir}, ${trend.trend5d})`);
        rayLines.push(`  20일선: ${fmtPx(trend.ma20)} (${ma20Dir}, ${trend.trend20d})`);
      }
      if (assetType !== 'CRYPTO') {
        const rv = marketData.rawVolume;
        const av = marketData.avgVolume;
        if (rv > 0 && av > 0) {
          const ratioPct = Math.round((rv / av) * 100);
          if (rayLines.length) rayLines.push('');
          rayLines.push('📊 거래량 상세');
          rayLines.push(`  오늘: ${fmtVol(rv)} / 5일 평균: ${fmtVol(av)}`);
          rayLines.push(`  평균 대비: ${ratioPct}%`);
        }
      } else if (marketData.volume) {
        if (rayLines.length) rayLines.push('');
        rayLines.push('📊 거래량 상세');
        rayLines.push(`  24시간 거래대금: ${marketData.volume}`);
      }
      const ampMatch = vix.label.match(/([\d.]+)%\s*진폭/);
      if (ampMatch) {
        const amp = parseFloat(ampMatch[1]);
        const meaning =
          amp < 2 ? '저변동성 — 방향성 약함'
          : amp < 4 ? '중변동성 — 일반적 수준'
          : '고변동성 — 급등락 주의';
        if (rayLines.length) rayLines.push('');
        rayLines.push('📈 변동성 의미');
        rayLines.push(`  일중 ${amp.toFixed(1)}% 진폭 — ${meaning}`);
      }
      if (
        prevCtx?.prevSector &&
        getSector(keyword) === prevCtx.prevSector &&
        prevCtx.prevChangePercent !== null &&
        prevCtx.prevChangePercent !== undefined &&
        Number.isFinite(parseFloat(marketData.change))
      ) {
        const curCh = parseFloat(marketData.change);
        const delta = curCh - prevCtx.prevChangePercent;
        const judgment = delta > 1.0 ? '상대적 강세' : delta < -1.0 ? '상대적 약세' : '유사한 흐름';
        const prevStr = `${prevCtx.prevChangePercent >= 0 ? '+' : ''}${prevCtx.prevChangePercent.toFixed(2)}%`;
        const deltaStr = `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%p`;
        if (rayLines.length) rayLines.push('');
        rayLines.push('📊 섹터 비교');
        rayLines.push(`  ${prevCtx.prevDisplayName || prevCtx.prevKeyword}(${prevStr}) 대비 ${judgment} (Δ ${deltaStr})`);
      }
      finalRayDetails = rayLines.length > 0 ? rayLines.join('\n') : null;

      // JACK 상세
      const maComment = trendCtx.trendSummary
        || (trendCtx.trendStrength === 'strong_up' ? '단기·중기 모두 상승 추세'
          : trendCtx.trendStrength === 'weak_up' ? '단기 상승, 중기 미확인'
          : trendCtx.trendStrength === 'strong_down' ? '단기·중기 모두 하락 추세'
          : trendCtx.trendStrength === 'weak_down' ? '단기 조정, 중기 지지선 주시'
          : '이평선 방향성 불명확');
      const volComment = vol.isHigh
        ? `${vol.label} — 세력 개입 가능성`
        : vol.score < 0
          ? `${vol.label} — 관심도 약화`
          : `${vol.label} — 특이 신호 없음`;
      const newsComment = nData.sentiment === '긍정'
        ? `호재성 뉴스 ${news.length}건 — 우호적 분위기`
        : nData.sentiment === '부정'
          ? `악재성 뉴스 ${news.length}건 — 경계 분위기`
          : `뉴스 ${news.length}건 (중립) — 명확한 촉매 부재`;
      // ✅ 시나리오는 verdict가 아닌 방향(direction)으로 분기 — bull인데 하락 톤 섞이는 모순 차단
      const jackDirection: 'bull' | 'bear' | 'sideways' | 'high_volatility_up' | 'high_volatility_down' =
        flags.vixHigh && flags.priceUp   ? 'high_volatility_up'
        : flags.vixHigh && flags.priceDown ? 'high_volatility_down'
        : discussMode === 'bull'  ? 'bull'
        : discussMode === 'bear'  ? 'bear'
        : 'sideways';
      const scenario =
        jackDirection === 'bull' ? '상승 추세 유지 중. 거래량 동반 여부가 핵심 확인 포인트.'
        : jackDirection === 'bear' ? '하락 압력 우세. 리스크 기준선 이탈 여부 모니터링 필요.'
        : jackDirection === 'high_volatility_up' ? '단기 급등 구간. 되돌림 가능성 열어두는 것이 합리적.'
        : jackDirection === 'high_volatility_down' ? '단기 급락 구간. 추가 하락 여부 확인 전 접근 신중.'
        : '방향성 부재 구간. 돌파 또는 이탈 방향 확인이 우선.';
      const risk = conflict === 'conflict_jack_buy'
        ? '확인 신호 부재 — 거래량·뉴스 한 축 확인 전 충분한 확인 후 판단 권장'
        : conflict === 'conflict_lucia_buy'
          ? '하락 속 역발상 위험 — 바닥 확인 전 진입은 칼날 잡기'
          : verdict === '관망'
            ? '지표 혼조 — 억지 진입 시 손익비 악화'
            : flags.vixHigh
              ? '고변동성 구간 — 분할 접근으로 평단 관리'
              : '시장 급변 시 리스크 기준선 이탈 여부 모니터링 권장';
      finalJackDetails = [
        '✅ 진입 근거 항목별',
        `  이평선: ${maComment}`,
        `  거래량: ${volComment}`,
        `  뉴스: ${newsComment}`,
        '',
        '핵심 시나리오',
        `  ${scenario}`,
        '',
        '⚠️ 주의 리스크',
        `  ${risk}`,
      ].join('\n');

      // LUCIA 상세
      const luciaWarning = conflict === 'conflict_jack_buy'
        ? `${keyword} 추세는 살아있지만 확인 신호(거래량·뉴스)가 약해요. 군중이 기회라 부를 때가 가장 위험할 수 있어요.`
        : conflict === 'conflict_lucia_buy'
          ? `하락 속 역발상 기회가 보이지만 바닥 확인이 먼저예요. 떨어지는 칼날은 잡지 마세요.`
          : verdict === '매도 우위'
            ? `하방 압력이 누적되고 있어요. 손실을 줄이는 것이 곧 수익이에요.`
            : verdict === '관망'
              ? `지표가 엇갈려요. 확실하지 않을 땐 현금도 포지션이에요.`
              : `강세 흐름에서도 과열·되돌림 가능성은 상존해요. 분할 접근이 안전해요.`;
      const riskIndicators: string[] = [];
      if (vix.label.includes('고변동성') || vix.label.includes('중변동성')) {
        riskIndicators.push(`변동성: ${vix.label}`);
      }
      if (nData.sentiment === '부정' && news.length > 0) {
        riskIndicators.push(`악재 뉴스 ${news.length}건 — 추가 악재 주시`);
      }
      if (pos.label.includes('고점')) {
        riskIndicators.push(`${pos.label} — 되돌림 구간 경계`);
      } else if (pos.label.includes('저점')) {
        riskIndicators.push(`${pos.label} — 반등 전 추가 하락 여지`);
      }
      if (flags.priceDown) {
        riskIndicators.push(`오늘 ${marketData.change}% 하락`);
      }
      if (vol.isHigh && (discussMode === 'bear' || verdict === '매도 우위')) {
        riskIndicators.push('거래량 급증 + 하락 = 매도 압력');
      }
      if (riskIndicators.length === 0) {
        riskIndicators.push('경고 등급 리스크 지표 없음 — 기본 리스크 관리 유지');
      }
      const emotionalGuard = verdict === '매수 우위'
        ? 'FOMO로 뒤늦게 올라타면 고점에서 물릴 수 있어요.'
        : verdict === '매도 우위'
          ? '공포로 바닥 투매는 반등을 놓쳐요. 리스크 관리 규칙은 지키되 감정은 거르세요.'
          : '조급함이 가장 큰 리스크예요. 조건 충족 전까지는 관찰 권장.';
      finalLuciaDetails = [
        '⚠️ 경고 근거 상세',
        `  ${luciaWarning}`,
        '',
        '📊 리스크 지표',
        ...riskIndicators.slice(0, 3).map(s => `  • ${s}`),
        '',
        '💡 감정적 판단 경계',
        `  ${emotionalGuard}`,
      ].join('\n');
    }


    // ✅ MBTI 강화 문구 — 상승/하락 풀로 분리 (각 10개)

    // JACK (INTJ · 전략가) — 상승/하락
    const JACK_BULLISH = [
      '이건 사이클이 아닙니다 — 구조적 변화입니다.',
      '강세장은 비관 속에서 태어납니다.',
      '추세는 친구라는 말이 있어요.',
      '모멘텀이 살아있는 구간이에요.',
      '기회는 준비된 자에게만 옵니다.',
      '지금이 마지막 저점일 수 있습니다.',
      '시장은 용기 있는 자의 편입니다.',
      '데이터가 말하는 방향을 참고해볼 수 있어요. 감정은 한 발 떨어뜨려두는 게 도움이 돼요.',
      '망설임이 가장 큰 리스크입니다.',
      '추세에 올라타는 것이 통계적으로 유리한 흐름이에요.',
    ];
    const JACK_BEARISH = [
      '데이터가 경고를 보내는 구간이에요.',
      '후퇴도 전략입니다. 재진입 기회는 반드시 옵니다.',
      '현금도 포지션입니다.',
      '살아남아야 다음 기회가 있습니다.',
      '손실을 줄이는 것이 첫 번째 임무입니다.',
      '시장에 맞서는 흐름은 부담이 커요.',
      '바닥 확인이 먼저입니다.',
      '떨어지는 칼날은 피하는 게 일반적인 원칙이에요.',
      '지지선 흐름을 살펴보는 것도 도움이 돼요.',
      '재진입 기회는 반드시 옵니다.',
    ];
    // JACK: bear → 하락, else(bull/conflict) → 상승
    const jackMbtiPool = discussMode === 'bear' ? JACK_BEARISH : JACK_BULLISH;

    // LUCIA (ENFP · 리스크·역발상) — 상승/하락
    const LUCIA_BULLISH = [
      '시장이 틀렸을 수 있어요. 5년 후를 보세요.',
      'FOMO에 휩쓸리지 마세요.',
      '남들이 탐욕스러울 때 냉정해지세요.',
      '검증된 신호만 따라가세요.',
      '서두름이 가장 큰 적이에요.',
      '감정을 걸러내야 비로소 기회가 보여요.',
      '좋은 흐름일수록 더 신중해야 해요.',
      '군중이 낙관할 때가 가장 위험해요.',
      '확인 후 진입이 항상 맞아요.',
      '오를 때 리스크가 더 커요.',
    ];
    const LUCIA_BEARISH = [
      '손실을 막는 게 수익을 내는 것보다 먼저예요.',
      '지금은 지키는 게 맞아요.',
      '공포가 최고의 매수 기회였던 역사를 잊지 마세요.',
      '모두가 팔 때가 오히려 기회일 수 있어요.',
      '현금이 최고의 포지션이에요.',
      '용감한 투자자도 때론 쉬어야 해요.',
      '손실을 줄이는 것도 수익이에요.',
      '한 발 물러서는 것도 전략이에요.',
      '무서울 때일수록 데이터를 보세요.',
      '내일 더 좋은 기회가 올 수 있어요.',
    ];
    // LUCIA: bull → 상승(경고), else(bear/conflict) → 하락(지지/역발상)
    const luciaMbtiPool = discussMode === 'bull' ? LUCIA_BULLISH : LUCIA_BEARISH;

    // RAY (INTP · 데이터 분석) — 중립 명언 8개
    const rayMbtiPhrases = [
      '데이터는 거짓말하지 않습니다. 해석이 거짓말할 뿐.',
      '가설은 많습니다 — 확률로 승부합니다.',
      '신호와 소음을 구분하는 것이 핵심입니다.',
      '역사는 반복됩니다. 패턴을 보십시오.',
      '분산이 유일한 무료 점심입니다.',
      '과거 데이터가 미래를 완벽히 예측하지는 않지만, 무시하면 더 위험합니다.',
      '감정이 아닌 확률로 판단하십시오.',
      '시장은 단기적으로 투표기계, 장기적으로 저울입니다.',
    ];

    // ✅ 10개 풀에 맞춘 로테이션
    const mbtiIdx   = Math.floor(Date.now() / 1000) % 10;
    const rayRotIdx = Math.floor(Date.now() / 1000) % rayMbtiPhrases.length;

    // ✅ 모든 페르소나 — [본문] → [MBTI 라인] → [TAIL] 순서 통일
    const finalJackOut  = finalJack  + '\n— ' + jackMbtiPool[mbtiIdx]   + JACK_TAIL;
    const finalLuciaOut = finalLucia + '\n— ' + luciaMbtiPool[mbtiIdx]  + LUCIA_TAIL;
    const finalRayOut   = finalRay   + '\n— ' + rayMbtiPhrases[rayRotIdx] + RAY_TAIL;

    const finalReply = [finalRayOut, finalJackOut, finalLuciaOut, finalEcho].filter(Boolean).join('\n\n');

    // ─── 뉴스 배정 ───
    type NewsRaw = { title: string; link?: string; originallink?: string; url?: string };
    const cleanNewsItem = (n: NewsRaw) => ({
      title: (n.title || '')
        .replace(/<[^>]*>/g, '').replace(/\[.*?\]/g, '')
        .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
        .trim().slice(0, 20),
      url: n.originallink || n.link || n.url || '',
    });

    const scoredNews = (news as NewsRaw[]).map(n => {
      const t = n.title || '';
      const score =
        /(상승|호재|돌파|수익|최고|급등|반등|상회|개선|수혜|강세|폭증)/.test(t) ? 1 :
        /(하락|악재|급락|손실|우려|위기|긴장|폭락|둔화|하회|긴축|약세|경고)/.test(t) ? -1 : 0;
      return { ...n, score };
    }).filter(n => (n.originallink || n.link || n.url || '').startsWith('http'));

    // ─── 페르소나별 뉴스 배정 — URL 기준 중복 제거 ───
    //   RAY   : 최신순 상위 1건 (scoredNews는 Naver API date 정렬)
    //   JACK  : 긍정(score=1) 1건, 없으면 null
    //   LUCIA : 부정(score=-1) 1건, 없으면 null
    //   ECHO  : 위에서 사용되지 않은 URL 중 1건, 없으면 null
    const getUrl = (n: NewsRaw): string => n.originallink || n.link || n.url || '';
    const usedUrls = new Set<string>();

    const rayPick = scoredNews[0] || null;
    const rayNews = rayPick ? cleanNewsItem(rayPick) : null;
    if (rayPick) usedUrls.add(getUrl(rayPick));

    const jackPick = scoredNews.find(n => n.score === 1 && !usedUrls.has(getUrl(n))) ?? null;
    const jackNews = jackPick ? cleanNewsItem(jackPick) : null;
    if (jackPick) usedUrls.add(getUrl(jackPick));

    const luciaPick = scoredNews.find(n => n.score === -1 && !usedUrls.has(getUrl(n))) ?? null;
    const luciaNews = luciaPick ? cleanNewsItem(luciaPick) : null;
    if (luciaPick) usedUrls.add(getUrl(luciaPick));

    const echoPick = scoredNews.find(n => !usedUrls.has(getUrl(n))) ?? null;
    const echoNews = echoPick ? cleanNewsItem(echoPick) : null;


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

    // ✅ 자세히 보기 전용 후처리 — 지시형 표현 완화 + 이모지 허용 셋 통일
    //    (summary / 메인 페르소나 말풍선은 지휘관 톤 유지를 위해 미적용)
    const echoDetailsOut   = normalizeDetails(finalEchoDetails);
    const rayDetailsOut    = normalizeDetails(finalRayDetails);
    const jackDetailsOut   = normalizeDetails(finalJackDetails);
    const luciaDetailsOut  = normalizeDetails(finalLuciaDetails);

    return respond({
      reply: finalReply,
      personas: {
        jack: finalJackOut, lucia: finalLuciaOut, ray: finalRayOut, echo: finalEcho,
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
      errorMessage: '분석 중 오류가 발생했습니다.\n종목명을 다시 입력해주세요. 🔄',
    });
  }
}
