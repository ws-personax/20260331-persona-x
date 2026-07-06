export interface KoreanStockQuote {
  price: string;
  change: string;
  high: string;
  low: string;
  volume: string;
  currency: string;
  marketState: string;
  source: string;
}

async function fetchWithTimeout(url: string, ms = 7000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
  } finally {
    clearTimeout(timer);
  }
}

// Pure quote fetch for a Yahoo Finance symbol not covered by the v1 STOCK_MAP,
// e.g. 카카오뱅크 (323410.KS). Deliberately independent of v1's judgment/prompt logic.
export async function fetchKoreanStockQuote(symbol: string): Promise<KoreanStockQuote | null> {
  try {
    const res = await fetchWithTimeout(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
    );
    if (!res.ok) return null;

    const json = await res.json();
    if (json?.chart?.error) return null;

    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) return null;

    const marketState = String(meta.marketState || 'UNKNOWN').toUpperCase();
    const prevClose = meta.previousClose || meta.regularMarketPreviousClose || meta.chartPreviousClose || 0;
    const price = meta.regularMarketPrice || (prevClose > 0 ? prevClose : null);
    if (!price) return null;

    let change = 0;
    const rawChangePct = meta.regularMarketChangePercent;
    if (typeof rawChangePct === 'number' && Number.isFinite(rawChangePct) && rawChangePct !== 0) {
      change = rawChangePct;
    } else if (meta.regularMarketPrice && prevClose) {
      change = ((meta.regularMarketPrice - prevClose) / prevClose) * 100;
    }

    const high = meta.regularMarketDayHigh || price;
    const low = meta.regularMarketDayLow || price;
    const volume = meta.regularMarketVolume || 0;

    return {
      price: Math.round(price).toLocaleString('ko-KR'),
      change: change.toFixed(2),
      high: Math.round(high).toLocaleString('ko-KR'),
      low: Math.round(low).toLocaleString('ko-KR'),
      volume: `${(volume / 1_000_000).toFixed(1)}M`,
      currency: 'KRW',
      marketState,
      source: change !== 0 ? '한국장 (15분 지연)' : '한국장 전일 종가 기준',
    };
  } catch {
    return null;
  }
}
