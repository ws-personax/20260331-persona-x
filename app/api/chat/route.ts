import { fetchInvestmentNews } from '@/lib/news';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

// ─── 0. 캐싱 시스템 (가격 5초, 뉴스 30초) ──────────────────
const cache = new Map<string, { value: any; time: number }>();
const getCachedData = (key: string) => {
  const cached = cache.get(key);
  if (!cached) return null;
  const ttl = key.startsWith('price') ? 5000 : 30000;
  if (Date.now() - cached.time > ttl) { cache.delete(key); return null; }
  return cached.value;
};
const setCachedData = (key: string, value: any) => cache.set(key, { value, time: Date.now() });

// ─── 1. Supabase 기록소 ───────────────────────────────────
const getSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
};

const saveHistory = async (params: any): Promise<void> => {
  try {
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.from('user_analysis_history').insert({
      ...params,
      result: 'pending',
      created_at: new Date().toISOString(),
    });
  } catch (err) { console.warn('⚠️ DB 기록 실패:', err); }
};

// ─── 2. 확장된 데이터 수급 엔진 (지휘관님 리스트 반영) ──────────
const CRYPTO_MAP: Record<string, string> = { 
  '비트코인': 'KRW-BTC', 'BTC': 'KRW-BTC', '이더리움': 'KRW-ETH', 'ETH': 'KRW-ETH',
  '리플': 'KRW-XRP', 'XRP': 'KRW-XRP', '솔라나': 'KRW-SOL', 'SOL': 'KRW-SOL',
  '도지': 'KRW-DOGE', 'DOGE': 'KRW-DOGE', 'ADA': 'KRW-ADA', 'BNB': 'KRW-BNB'
};

const STOCK_MAP: Record<string, string> = { 
  // 미국 지수 및 주식
  '나스닥': '^IXIC', 'NASDAQ': '^IXIC', 'S&P500': '^GSPC', 'S&P': '^GSPC', '다우': '^DJI',
  '엔비디아': 'NVDA', 'NVDA': 'NVDA', '테슬라': 'TSLA', 'TSLA': 'TSLA',
  '애플': 'AAPL', 'AAPL': 'AAPL', '마이크로소프트': 'MSFT', 'MSFT': 'MSFT',
  '구글': 'GOOGL', 'GOOGL': 'GOOGL', '아마존': 'AMZN', 'AMZN': 'AMZN',
  '메타': 'META', 'META': 'META', '넷플릭스': 'NFLX', 'NFLX': 'NFLX',
  // 한국 주식 및 지수
  '삼성전자': '005930.KS', 'SK하이닉스': '000660.KS', '현대차': '005380.KS',
  '카카오': '035720.KS', '네이버': '035420.KS', '기아': '000270.KS',
  'LG에너지': '373220.KS', 'POSCO': '005490.KS', '셀트리온': '068270.KS',
  '에코프로': '086520.KQ', '알테오젠': '196170.KQ',
  '코스피': '^KS11', '코스닥': '^KQ11', '한국 증시': '^KS11', '한국증시': '^KS11'
};

const KEYWORD_PRIORITY = Object.keys({ ...CRYPTO_MAP, ...STOCK_MAP }).sort((a, b) => b.length - a.length);

const fetchWithTimeout = async (url: string, ms = 5000) => {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(id);
    return res;
  } catch (e) { clearTimeout(id); throw e; }
};

const fetchMarketPrice = async (keyword: string) => {
  const cacheKey = `price:${keyword}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;
  try {
    const cryptoTicker = CRYPTO_MAP[keyword];
    if (cryptoTicker) {
      const res = await fetchWithTimeout(`https://api.upbit.com/v1/ticker?markets=${cryptoTicker}`);
      const d = (await res.json())[0];
      const result = { price: d.trade_price, change: d.signed_change_rate * 100, volume: d.acc_trade_price_24h, avgVolume: d.acc_trade_price_24h / 1.5 };
      setCachedData(cacheKey, result);
      return result;
    }
    const symbol = STOCK_MAP[keyword];
    if (!symbol) return null;
    const res = await fetchWithTimeout(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`);
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const result = { price: meta.regularMarketPrice, change: ((meta.regularMarketPrice - meta.previousClose) / (meta.previousClose || 1)) * 100, volume: meta.regularMarketVolume, avgVolume: meta.averageDailyVolume3Month };
    setCachedData(cacheKey, result);
    return result;
  } catch { return null; }
};

export async function POST(req: Request) {
  try {
    const { messages, positionContext } = await req.json();
    const lastMsg = (messages.at(-1)?.content || "").toLowerCase();
    const keyword = KEYWORD_PRIORITY.find(k => lastMsg.includes(k.toLowerCase())) || '시장';

    const [marketData, news] = await Promise.all([
      fetchMarketPrice(keyword).catch(() => null),
      fetchInvestmentNews(keyword).catch(() => []),
    ]);

    const hasMarket = !!marketData;
    const trendScore = hasMarket ? (marketData.change > 0.5 ? 1.3 : marketData.change < -0.5 ? -1.3 : 0) : 0;
    const volScore = hasMarket && (marketData.volume > marketData.avgVolume * 1.3) ? 1.0 : (hasMarket && marketData.volume < marketData.avgVolume * 0.7 ? -0.5 : 0);
    const newsScore = news.length >= 2 ? 0.7 : 0;
    
    const total = trendScore + volScore + newsScore;
    const verdict = total >= 2.0 ? '매수 우위' : total <= -2.0 ? '매도 우위' : '관망';
    
    let confidence = 40 + (hasMarket ? 25 : 0) + (news.length > 0 ? 15 : 0) + Math.abs(total) * 5;
    if (!hasMarket) confidence = Math.min(65, confidence); 
    confidence = Math.min(95, confidence);

    const breakdown = `추세: ${trendScore.toFixed(1)} | 거래량: ${volScore.toFixed(1)} | 뉴스: ${news.length}건`;
    const positionSizing = verdict === '매수 우위' ? '20-30% 분할 매수' : (verdict === '매도 우위' ? '보유 비중 축소' : '신규 진입 금지');

    const prompt = `당신은 투자 사령부 [PersonaX]입니다. 반드시 JSON으로만 응답하십시오.
{
  "jack": "상승 근거 2문장",
  "lucia": "하락 리스크 2문장",
  "ray": "데이터 상관관계 2문장",
  "echo": "결론: ${verdict}\\n근거: ...\\n지금: ...\\n조건: ...\\n비중: ${positionSizing}"
}
[데이터] 분석 대상: ${keyword} | 가격: ${marketData?.price || '수급제한'} | 추세: ${marketData?.change?.toFixed(2) || 0}%
[유저 상황] ${positionContext || '신규 진입 희망'}
[특수 지시] 사용자의 상황을 분석하여 ECHO의 '지금:' 항목에 반드시 맞춤형 조언을 포함하라.`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { response_mime_type: "application/json", temperature: 0.2 },
      }),
    });

    const json = await res.json();
    const aiRawText = json?.candidates?.[0]?.content?.parts?.[0]?.text?.replace(/```json|```/g, "").trim() || "{}";

    let p;
    try { p = JSON.parse(aiRawText); } catch {
      p = { jack: "해석 노이즈 발생.", lucia: "리스크 관리 중.", ray: "데이터 유효.", echo: `결론: ${verdict}\n근거: 퀀트 지표\n지금: 관망 유지\n조건: 지지선 확인\n비중: ${positionSizing}` };
    }

    const newsLinks = news.slice(0, 2).map((n: any) => {
      const shortTitle = n.title.length > 20 ? n.title.slice(0, 20) + "..." : n.title;
      return `🔗 ${shortTitle}\n   📍 ${n.link}`;
    }).join('\n\n');

    const responsePersonas = {
      jack: p.jack, lucia: p.lucia, ray: p.ray,
      echo: p.echo + (newsLinks ? `\n\n[참조 뉴스]\n${newsLinks}` : ""), 
      verdict, confidence, breakdown, positionSizing
    };

    void saveHistory({ 
      keyword, verdict, confidence, breakdown, positionSizing,
      totalScore: total, priceAtTime: String(marketData?.price || '0'), rawResponse: aiRawText 
    });

    return Response.json({ reply: p.echo, personas: responsePersonas });
  } catch (e) {
    return Response.json({ reply: "사령부 통신 지연." }, { status: 500 });
  }
}