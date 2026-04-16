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
  const keyword = (searchParams.get('keyword') || '').trim();

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
    if (!symbol) return Response.json({ rawPrice: null, change: null, error: 'unknown keyword' }, { status: 404 });

    // ✅ 1d + 5d 동시 호출
    const fetchChart = async (range: string) => {
      const r = await fetchWithTimeout(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`
      );
      if (!r.ok) return null;
      const j = await r.json();
      if (j?.chart?.error) return null;
      return j?.chart?.result?.[0] || null;
    };

    const [result1d, result5d] = await Promise.all([
      fetchChart('1d'),
      fetchChart('5d'),
    ]);

    const meta = result1d?.meta;
    if (!meta?.regularMarketPrice) return Response.json({ error: 'no price' }, { status: 404 });

    const isKR = symbol.endsWith('.KS') || symbol.endsWith('.KQ') || symbol.startsWith('^KS') || symbol.startsWith('^KQ');
    const marketState = String(meta.marketState || 'UNKNOWN').toUpperCase();
    const price = meta.regularMarketPrice;

    let change = 0;
    if (typeof meta.regularMarketChangePercent === 'number' && Number.isFinite(meta.regularMarketChangePercent)) {
      change = meta.regularMarketChangePercent;
    } else {
      const prev = meta.previousClose || price;
      change = ((price - prev) / (prev || 1)) * 100;
    }

    // 미국 장마감 후 5d 보정
    if (!isKR && marketState !== 'REGULAR' && result5d) {
      const closes = result5d.indicators?.quote?.[0]?.close || [];
      const valid = closes.filter((v: unknown): v is number => typeof v === 'number' && Number.isFinite(v));
      if (valid.length >= 2) {
        const last = valid[valid.length - 1];
        const prev = valid[valid.length - 2];
        if (prev) change = ((last - prev) / prev) * 100;
      }
    }

    return Response.json({
      rawPrice: price,
      change: change.toFixed(2),
      currency: isKR ? 'KRW' : 'USD',
    });
  } catch {
    return Response.json({ rawPrice: null, change: null, error: 'fetch failed' }, { status: 500 });
  }
}
