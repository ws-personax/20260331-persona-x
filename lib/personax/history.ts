import { createClient } from '@supabase/supabase-js';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import type { MarketData, Verdict } from './types';
import { inferCurrency } from './market';
import { extractConditionPrices, parsePriceToNumber } from './scoring';

const getSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
};

export const saveHistory = async (params: {
  keyword: string; question: string; verdict: Verdict;
  totalScore: number; assetType: string; entryCondition: string;
  priceAtTime: string; confidence: number; rawResponse: string;
  marketData: MarketData | null;
  ipAddress?: string | null; userId?: string | null; volIsHigh?: boolean;
}): Promise<void> => {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      console.warn('[saveHistory] supabase client null — 환경변수 확인 필요');
      return;
    }

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
      console.error('[saveHistory] 저장 실패:', insertError.message, insertError.code);
    }
  } catch (err) { console.error('[saveHistory] 예외:', err); }
};

// saveTeaConversation — teaMode(차 한잔/시사·인생·일상) 4페르소나 응답 저장
//   기존 saveHistory(finance 시그니처)에 매핑해서 user_analysis_history에 동일 적재.
//   verdict='관망' / assetType='TEA' / entryCondition=category / 가격·진입조건은 의미 없음.
//   userId는 함수 내부에서 createServerSupabase().auth.getUser()로 자체 조회.
export const saveTeaConversation = async (params: {
  keyword: string;
  category: string | null;
  rayText: string;
  jackText: string;
  luciaText: string;
  echoText: string;
}): Promise<void> => {
  try {
    const supabaseServer = await createServerSupabase();
    const { data: { user }, error: getUserErr } = await supabaseServer.auth.getUser();
    if (getUserErr) {
      console.warn('[tea:saveHistory:getUser] error:', getUserErr.message);
    }
    const userId = user?.id ?? null;
    if (!userId) {
      console.warn('[tea:saveHistory] userId null — saveHistory 스킵');
      return;
    }
    const rawResponse = [
      params.rayText   && `[RAY]\n${params.rayText}`,
      params.jackText  && `[JACK]\n${params.jackText}`,
      params.luciaText && `[LUCIA]\n${params.luciaText}`,
      params.echoText  && `[ECHO]\n${params.echoText}`,
    ].filter(Boolean).join('\n\n');

    await saveHistory({
      keyword: params.keyword.slice(0, 100),
      question: params.keyword,
      verdict: '관망' as Verdict,
      totalScore: 0,
      assetType: 'TEA',
      entryCondition: params.category || 'tea',
      priceAtTime: '-',
      confidence: 0,
      rawResponse,
      marketData: null,
      userId,
    });
  } catch (e) {
    console.warn('[tea:saveHistory] 예외:', e);
  }
};
