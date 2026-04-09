import { createClient } from '@supabase/supabase-js';

// ─── 이 API는 Vercel Cron Job으로 매일 오전 9시 자동 실행됩니다 ───
// vercel.json 에서 스케줄 설정 필요
// GET /api/evaluate-history

export const maxDuration = 60;

// ─── 타입 ─────────────────────────────────────────────────
interface HistoryRow {
  id:              number;
  keyword:         string;
  verdict:         '매수 우위' | '매도 우위' | '관망';
  entry_condition: string;
  price_at_time:   string;
  confidence:      number;
  asset_type:      string;
  created_at:      string;
}

// ─── Supabase ─────────────────────────────────────────────
const getSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
};

// ─── 현재 가격 조회 ───────────────────────────────────────
const STOCK_MAP: Record<string, string> = {
  '나스닥': '^IXIC', 'NASDAQ': '^IXIC', 'S&P500': '^GSPC',
  '엔비디아': 'NVDA', '테슬라': 'TSLA', '애플': 'AAPL',
  '삼성전자': '005930.KS', 'SK하이닉스': '000660.KS', '현대차': '005380.KS',
  '카카오': '035720.KS', '네이버': '035420.KS',
  '비트코인': 'KRW-BTC', 'BTC': 'KRW-BTC', '이더리움': 'KRW-ETH',
};

const CRYPTO_KEYWORDS = new Set(['비트코인', 'BTC', '이더리움', 'ETH', '리플', 'XRP', '솔라나', 'SOL']);

const fetchCurrentPrice = async (keyword: string): Promise<number | null> => {
  try {
    const isCrypto = CRYPTO_KEYWORDS.has(keyword);

    if (isCrypto) {
      const tickerMap: Record<string, string> = {
        '비트코인': 'KRW-BTC', 'BTC': 'KRW-BTC',
        '이더리움': 'KRW-ETH', 'ETH': 'KRW-ETH',
      };
      const ticker = tickerMap[keyword];
      if (!ticker) return null;

      const res  = await fetch(`https://api.upbit.com/v1/ticker?markets=${ticker}`);
      const data = await res.json();
      return data?.[0]?.trade_price || null;

    } else {
      const symbol = STOCK_MAP[keyword];
      if (!symbol) return null;

      const res  = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      const data = await res.json();
      return data?.chart?.result?.[0]?.meta?.regularMarketPrice || null;
    }
  } catch {
    return null;
  }
};

// ─── 가격 문자열 → 숫자 파싱 ─────────────────────────────
const parseStoredPrice = (priceStr: string): number => {
  // "63,300원" → 63300 / "182.08 USD" → 182.08
  return parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0;
};

// ─── entryCondition에서 가격 조건 파싱 ───────────────────
const parseConditionPrices = (condition: string): {
  buyPrice:  number | null;
  sellPrice: number | null;
} => {
  // "63,500원" 또는 "63500" 패턴 탐지
  const numbers = condition.match(/[\d,]+(?:\.\d+)?(?:원| USD)?/g) || [];
  const parsed  = numbers
    .map(n => parseFloat(n.replace(/[^0-9.]/g, '')))
    .filter(n => n > 0);

  // 매수 조건 라인에서 첫 번째 숫자, 매도 조건 라인에서 첫 번째 숫자
  const buyLine  = condition.split('\n').find(l => l.includes('매수') || l.includes('진입'));
  const sellLine = condition.split('\n').find(l => l.includes('매도') || l.includes('손절'));

  const extractPrice = (line?: string): number | null => {
    if (!line) return null;
    const m = line.match(/[\d,]+(?:\.\d+)?/);
    return m ? parseFloat(m[0].replace(/,/g, '')) : null;
  };

  return {
    buyPrice:  extractPrice(buyLine)  || parsed[0] || null,
    sellPrice: extractPrice(sellLine) || parsed[1] || null,
  };
};

// ─── 결과 평가 로직 ───────────────────────────────────────
/**
 * verdict + 현재 가격 + 분석 시점 가격 + 조건 → success/fail 판단
 *
 * [매수 우위]
 *   성공: 현재가 > 분석 시점 가격 (상승)
 *   실패: 현재가 < 분석 시점 가격 * 0.97 (3% 이상 하락)
 *
 * [매도 우위]
 *   성공: 현재가 < 분석 시점 가격 (하락)
 *   실패: 현재가 > 분석 시점 가격 * 1.03 (3% 이상 상승)
 *
 * [관망]
 *   성공: 조건 가격에 근접 (±2%) — 진입 기회 제공
 *   실패: 조건 없이 크게 움직임 (±5% 이상)
 */
const evaluateResult = (
  verdict:       string,
  priceAtTime:   number,
  currentPrice:  number,
  buyPrice:      number | null,
): 'success' | 'fail' | 'pending' => {
  if (!priceAtTime || !currentPrice) return 'pending';

  const changeRate = (currentPrice - priceAtTime) / priceAtTime;

  if (verdict === '매수 우위') {
    if (changeRate > 0.01)  return 'success'; // 1% 이상 상승
    if (changeRate < -0.03) return 'fail';    // 3% 이상 하락
    return 'pending'; // 아직 판단 이른 경우
  }

  if (verdict === '매도 우위') {
    if (changeRate < -0.01) return 'success'; // 1% 이상 하락
    if (changeRate > 0.03)  return 'fail';    // 3% 이상 상승
    return 'pending';
  }

  if (verdict === '관망') {
    // 관망: 제시한 매수 조건 가격에 근접했는지 확인
    if (buyPrice && Math.abs(currentPrice - buyPrice) / buyPrice < 0.02) {
      return 'success'; // 조건 가격 ±2% 내 도달 → 진입 기회 제공 성공
    }
    if (Math.abs(changeRate) > 0.05) {
      return 'fail'; // 5% 이상 변동인데 조건 제시 못한 경우
    }
    return 'pending';
  }

  return 'pending';
};

// ─── 수익률 계산 ──────────────────────────────────────────
const calcProfitRate = (
  verdict:      string,
  priceAtTime:  number,
  currentPrice: number,
): number => {
  if (!priceAtTime) return 0;
  const change = (currentPrice - priceAtTime) / priceAtTime * 100;
  // 매도 우위면 방향 반전 (하락이 수익)
  return verdict === '매도 우위' ? -change : change;
};

// ─── 메인 핸들러 ─────────────────────────────────────────
export async function GET(req: Request) {
  // Cron 인증 (Vercel이 보내는 Authorization 헤더 확인)
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const supabase = getSupabase();

    // 1. pending 항목 조회 (24시간 이상 지난 것만)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: pendingRows, error } = await supabase
      .from('user_analysis_history')
      .select('*')
      .eq('result', 'pending')
      .lt('created_at', oneDayAgo)
      .limit(50); // 한 번에 최대 50개

    if (error) throw error;
    if (!pendingRows?.length) {
      return Response.json({ message: 'pending 항목 없음', evaluated: 0 });
    }

    console.log(`🔄 평가 대상: ${pendingRows.length}건`);

    let successCount = 0;
    let failCount    = 0;
    let skipCount    = 0;

    // 2. 각 항목 평가
    for (const row of pendingRows as HistoryRow[]) {
      try {
        const currentPrice = await fetchCurrentPrice(row.keyword);
        if (!currentPrice) { skipCount++; continue; }

        const priceAtTime  = parseStoredPrice(row.price_at_time);
        if (!priceAtTime)  { skipCount++; continue; }

        const { buyPrice } = parseConditionPrices(row.entry_condition);
        const result       = evaluateResult(row.verdict, priceAtTime, currentPrice, buyPrice);
        const profitRate   = calcProfitRate(row.verdict, priceAtTime, currentPrice);

        if (result === 'pending') { skipCount++; continue; }

        // 3. 결과 업데이트
        await supabase
          .from('user_analysis_history')
          .update({
            result,
            result_price:  currentPrice,
            profit_rate:   Math.round(profitRate * 100) / 100,
            evaluated_at:  new Date().toISOString(),
          })
          .eq('id', row.id);

        if (result === 'success') successCount++;
        else failCount++;

        console.log(`✅ ${row.keyword} | ${row.verdict} | ${result} | ${profitRate.toFixed(2)}%`);

        // API 요청 간 딜레이 (rate limit 방지)
        await new Promise(r => setTimeout(r, 200));

      } catch (err) {
        console.warn(`⚠️ ${row.keyword} 평가 실패:`, err);
        skipCount++;
      }
    }

    const summary = {
      message:  '평가 완료',
      total:    pendingRows.length,
      success:  successCount,
      fail:     failCount,
      skip:     skipCount,
      timestamp: new Date().toISOString(),
    };

    console.log('📊 평가 결과:', summary);
    return Response.json(summary);

  } catch (e) {
    console.error('❌ 평가 에러:', e);
    return Response.json({ error: '평가 실패' }, { status: 500 });
  }
}
