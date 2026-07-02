/**
 * Route Save — app/api/chat/route.ts에서 이동(move-only, 동작 변경 없음).
 *
 * INDEX_KEYWORDS: 히스토리 저장 제외 키워드 — saveLegacyStockHistorySafely 게이팅에 사용.
 * saveTeaLog: getAdminSupabase().from('tea_logs').insert(...) + try/catch — route.ts 안에
 *   거의 동일하게 7곳 중복되던 블록을 하나로 합침 (콘솔 라벨은 logLabel로 그대로 재현).
 * saveLegacyStockHistorySafely: saveHistory(history.ts) 호출 + 5초 타임아웃 Promise.race +
 *   INDEX_KEYWORDS 게이팅 — 레거시 단일 종목 분석 경로 전용.
 */
import type { Verdict, MarketData } from '@/lib/personax/types';
import { saveHistory } from '@/lib/personax/history';
import { getAdminSupabase } from '@/lib/personax/chat-persistence';

// ─────────────────────────────────────────────
// INDEX_KEYWORDS — 히스토리 저장 제외
// ─────────────────────────────────────────────
export const INDEX_KEYWORDS = new Set([
  '나스닥', 'NASDAQ', 'S&P500', 'S&P', 'SP500',
  '다우', '다우존스', '코스피', '코스닥', '한국 증시', '한국증시',
]);

/**
 * tea_logs 저장 — route.ts 여러 지점에서 persona/turn_count/first_message만 다르게
 * 반복되던 getAdminSupabase().from('tea_logs').insert(...) + try/catch 블록을 통합.
 * 실패해도 응답에 영향 없음(기존과 동일 — catch에서 console.warn만).
 */
export async function saveTeaLog(params: {
  persona: string;
  turnCount: number;
  firstMessage: string;
  logLabel: string;
}): Promise<void> {
  const { persona, turnCount, firstMessage, logLabel } = params;
  try {
    const adminSupabase = getAdminSupabase();
    if (adminSupabase) {
      await adminSupabase.from('tea_logs').insert({
        persona,
        turn_count: turnCount,
        first_message: firstMessage.slice(0, 100),
        user_id: null,
      });
    }
  } catch (e) {
    console.warn(`${logLabel} 로그 저장 실패 (무시)`, e);
  }
}

/**
 * 레거시 단일 종목 분석 경로의 히스토리 저장.
 * ⚠️ Vercel 서버리스에서는 응답 반환 후 백그라운드 Promise 가 종료될 수 있어
 *    fire-and-forget(`void Promise.race`) 대신 await 로 저장 완료를 보장한다.
 *    Supabase 응답이 늦어질 경우 5초 타임아웃 후 응답을 반환한다.
 */
export async function saveLegacyStockHistorySafely(params: {
  keyword: string;
  question: string;
  verdict: Verdict;
  totalScore: number;
  assetType: string;
  entryCondition: string;
  marketData: MarketData | null;
  confidence: number;
  ipAddress: string | null;
  userId: string | null | undefined;
  volIsHigh: boolean;
}): Promise<void> {
  const { keyword, userId } = params;
  const isIndexKeyword = INDEX_KEYWORDS.has(keyword);
  if (userId && !isIndexKeyword) {
    try {
      await Promise.race([
        saveHistory({
          keyword: params.keyword,
          question: params.question,
          verdict: params.verdict,
          totalScore: params.totalScore,
          assetType: params.assetType,
          entryCondition: params.entryCondition,
          priceAtTime: params.marketData?.price || '미수급',
          confidence: params.confidence,
          rawResponse: '',
          marketData: params.marketData,
          ipAddress: params.ipAddress,
          userId: params.userId,
          volIsHigh: params.volIsHigh,
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
}
