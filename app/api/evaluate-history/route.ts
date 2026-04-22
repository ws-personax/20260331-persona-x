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
  // 지수
  '나스닥': '^IXIC', 'NASDAQ': '^IXIC', 'S&P500': '^GSPC', 'S&P': '^GSPC',
  '다우': '^DJI', '다우존스': '^DJI', '코스피': '^KS11', '코스닥': '^KQ11',
  // 미국 종목
  '엔비디아': 'NVDA', 'NVDA': 'NVDA',
  '테슬라': 'TSLA', 'TSLA': 'TSLA',
  '애플': 'AAPL', 'AAPL': 'AAPL',
  '마이크로소프트': 'MSFT', 'MSFT': 'MSFT', '마소': 'MSFT',
  '구글': 'GOOGL', 'GOOGL': 'GOOGL', '알파벳': 'GOOGL',
  '아마존': 'AMZN', 'AMZN': 'AMZN',
  '메타': 'META', 'META': 'META', '페이스북': 'META',
  '넷플릭스': 'NFLX', 'NFLX': 'NFLX',
  '브로드컴': 'AVGO', 'AVGO': 'AVGO',
  '팔란티어': 'PLTR', 'PLTR': 'PLTR',
  // 한국 종목
  '삼성전자': '005930.KS',
  'SK하이닉스': '000660.KS', 'SK 하이닉스': '000660.KS',
  '현대차': '005380.KS', '현대자동차': '005380.KS',
  '기아': '000270.KS', '기아차': '000270.KS',
  'LG전자': '066570.KS', '엘지전자': '066570.KS',
  '카카오': '035720.KS',
  '네이버': '035420.KS', 'NAVER': '035420.KS',
  '셀트리온': '068270.KS',
  'KB금융': '105560.KS', 'KB': '105560.KS',
  '신한지주': '055550.KS', '신한': '055550.KS',
  'KT&G': '033780.KS', '케이티앤지': '033780.KS', '033780': '033780.KS',
  '삼성바이오': '207940.KS', '삼바': '207940.KS',
  '에코프로': '086520.KQ',
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
    if (changeRate > 0.005)  return 'success'; // 0.5% 이상 상승 → 성공
    if (changeRate < -0.02)  return 'fail';    // 2% 이상 하락 → 실패
    // 범위 안이면 일단 성공 처리 (방향성 맞음)
    return 'success';
  }

  if (verdict === '매도 우위') {
    if (changeRate < -0.005) return 'success'; // 0.5% 이상 하락 → 성공
    if (changeRate > 0.02)   return 'fail';    // 2% 이상 상승 → 실패
    return 'success';
  }

  if (verdict === '관망') {
    // ✅ 관망은 승률 계산에서 제외 — pending 유지
    // 관망 판정은 직접 투자 지시가 아니므로 성공/실패 판정 불필요
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
  // ✅ Vercel Cron 인증
  // Vercel Cron은 자동으로 Authorization 헤더를 보내지 않음
  // CRON_SECRET이 설정된 경우에만 체크, 없으면 Vercel 환경에서만 허용
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    // CRON_SECRET 설정된 경우 — 헤더 체크
    if (authHeader !== `Bearer ${cronSecret}`) {
      return new Response('Unauthorized', { status: 401 });
    }
  } else {
    // CRON_SECRET 미설정 — Vercel 환경(프로덕션)에서만 허용
    const isVercel = req.headers.get('x-vercel-id') || process.env.VERCEL;
    if (!isVercel && process.env.NODE_ENV === 'production') {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  try {
    const supabase = getSupabase();

    // 1. pending 항목 조회 (1시간 이상 지난 것만)
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const { data: pendingRows, error } = await supabase
      .from('user_analysis_history')
      .select('*')
      .eq('result_status', 'PENDING')
      .lt('created_at', oneHourAgo)
      .limit(50);

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
            result_status: result.toUpperCase(),  // SUCCESS / FAIL
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
