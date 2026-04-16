import { CRYPTO_MAP, STOCK_MAP } from '@/lib/maps';

export const maxDuration = 15;

const fetchWithTimeout = async (url: string, ms = 6000) => {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    clearTimeout(id);
    return res;
  } catch (e) { clearTimeout(id); throw e; }
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const keyword = searchParams.get('keyword') || '';

  if (!keyword) {
    return Response.json({ error: 'keyword required' }, { status: 400 });
  }

  try {
    // 코인
    const cryptoTicker = CRYPTO_MAP[keyword] || CRYPTO_MAP[keyword.toUpperCase()];
    if (cryptoTicker) {
      const res = await fetchWithTimeout(`https://api.upbit.com/v1/ticker?markets=${cryptoTicker}`, 5000);
      if (!res.ok) return Response.json({ error: 'upbit error' }, { status: 502 });
      const json = await res.json();
      const d = json[0];
      return Response.json({
        rawPrice: d.trade_price,
        change: (d.signed_change_rate * 100).toFixed(2),
        currency: 'KRW',
      });
    }

    // 주식
    const symbol = STOCK_MAP[keyword] || STOCK_MAP[keyword.toUpperCase()];
    if (!symbol) return Response.json({ error: 'unknown keyword' }, { status: 404 });

    const res = await fetchWithTimeout(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
    );
    if (!res.ok) return Response.json({ error: 'yahoo error' }, { status: 502 });
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return Response.json({ error: 'no price' }, { status: 404 });

    const isKR = symbol.endsWith('.KS') || symbol.endsWith('.KQ') || symbol.startsWith('^KS') || symbol.startsWith('^KQ');
    const price = meta.regularMarketPrice;
    const prev = meta.previousClose || price;

    return Response.json({
      rawPrice: price,
      change: ((price - prev) / (prev || 1) * 100).toFixed(2),
      currency: isKR ? 'KRW' : 'USD',
    });
  } catch {
    return Response.json({ error: 'fetch failed' }, { status: 500 });
  }
}
