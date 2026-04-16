import { fetchInvestmentNews } from '@/lib/news';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerSupabase } from '@/lib/supabase/server';

export const maxDuration = 60;

const getSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
};

type AssetType = 'CRYPTO' | 'KOREAN_STOCK' | 'US_STOCK';
type Verdict   = '매수 우위' | '매도 우위' | '관망';

export interface PersonaResponse {
  jack: string; lucia: string; ray: string; echo: string;
  verdict: Verdict; confidence: number; breakdown: string; positionSizing: string;
}

interface MarketData {
  price: string; change: string; high: string; low: string; volume: string;
  rawPrice: number; rawHigh: number; rawLow: number; rawVolume: number; avgVolume: number;
  currency: 'KRW' | 'USD'; source: string; marketState?: string;
}

interface ScoreParams {
  volScore: number; change: string; newsAvg: number;
  posScore: number; vitScore: number;
  hasData: boolean; newsCount: number;
  volLabel: string; posLabel: string; vixLabel: string; newsSentiment: string;
}

const CRYPTO_MAP: Record<string, string> = {
  '비트코인': 'KRW-BTC', 'BTC':  'KRW-BTC',
  '이더리움': 'KRW-ETH', 'ETH':  'KRW-ETH',
  '리플':     'KRW-XRP', 'XRP':  'KRW-XRP',
  '솔라나':   'KRW-SOL', 'SOL':  'KRW-SOL',
  '도지':    'KRW-DOGE', 'DOGE': 'KRW-DOGE',
  '에이다':   'KRW-ADA', 'ADA':  'KRW-ADA',
  '바이낸스': 'KRW-BNB', 'BNB':  'KRW-BNB',
};

const STOCK_MAP: Record<string, string> = {
  '나스닥': '^IXIC', 'NASDAQ': '^IXIC',
  'S&P500': '^GSPC', 'S&P': '^GSPC', 'SP500': '^GSPC',
  '다우': '^DJI', '다우존스': '^DJI',
  '엔비디아': 'NVDA', 'NVDA': 'NVDA',
  '테슬라': 'TSLA', 'TSLA': 'TSLA',
  '애플': 'AAPL', 'AAPL': 'AAPL',
  '마이크로소프트': 'MSFT', 'MSFT': 'MSFT', '마소': 'MSFT',
  '구글': 'GOOGL', 'GOOGL': 'GOOGL', '알파벳': 'GOOGL',
  '아마존': 'AMZN', 'AMZN': 'AMZN',
  '메타': 'META', 'META': 'META', '페이스북': 'META',
  '넷플릭스': 'NFLX', 'NFLX': 'NFLX',
  '삼성전자': '005930.KS',
  'SK하이닉스': '000660.KS', 'SK 하이닉스': '000660.KS',
  '현대차': '005380.KS', '현대자동차': '005380.KS',
  '카카오': '035720.KS',
  '네이버': '035420.KS', 'NAVER': '035420.KS',
  '기아': '000270.KS', '기아차': '000270.KS',
  'LG에너지': '373220.KS', 'LG에너지솔루션': '373220.KS',
  'POSCO': '005490.KS', '포스코': '005490.KS',
  '셀트리온': '068270.KS',
  '에코프로': '086520.KQ',
  '알테오젠': '196170.KQ',
  'SK이노베이션': '096770.KS', 'SK이노': '096770.KS', 'SK에너지': '096770.KS',
  'S오일': '010950.KS', 'S-Oil': '010950.KS', '에쓰오일': '010950.KS',
  'LG화학': '051910.KS',
  '현대모비스': '012330.KS',
  'KB금융': '105560.KS', 'KB': '105560.KS',
  '신한지주': '055550.KS', '신한': '055550.KS',
  '삼성바이오': '207940.KS', '삼바': '207940.KS',
  '코스피': '^KS11', '코스닥': '^KQ11',
  '한국 증시': '^KS11', '한국증시': '^KS11',
};

const KEYWORD_PRIORITY: string[] = [
  '비트코인', 'BTC', '이더리움', 'ETH', '리플', 'XRP',
  '솔라나', 'SOL', '도지', 'DOGE', '에이다', 'ADA', '바이낸스', 'BNB',
  'SK이노베이션', 'SK에너지', 'SK이노', 'SK하이닉스', 'SK 하이닉스',
  'LG에너지솔루션', 'LG에너지', 'LG화학',
  '삼성바이오', '삼바', '삼성전자',
  '현대자동차', '현대모비스', '현대차',
  '신한지주', '신한', 'KB금융', 'KB',
  '에쓰오일', 'S-Oil', 'S오일',
  '카카오', '네이버', 'NAVER', '기아차', '기아',
  'POSCO', '포스코', '셀트리온', '에코프로', '알테오젠',
  '엔비디아', 'NVDA', '테슬라', 'TSLA', '애플', 'AAPL',
  '마이크로소프트', '마소', 'MSFT',
  '알파벳', '구글', 'GOOGL', '아마존', 'AMZN',
  '페이스북', '메타', 'META', '넷플릭스', 'NFLX',
  '한국 증시', '한국증시', '코스피', '코스닥',
  'S&P500', 'SP500', 'S&P', '다우존스', '다우', '나스닥', 'NASDAQ',
];

const inferCurrency = (keyword: string): 'KRW' | 'USD' => {
  if (CRYPTO_MAP[keyword] || CRYPTO_MAP[keyword.toUpperCase()]) return 'KRW';
  const sym = STOCK_MAP[keyword] || STOCK_MAP[keyword.toUpperCase()] || '';
  if (sym.endsWith('.KS') || sym.endsWith('.KQ') || sym.startsWith('^KS') || sym.startsWith('^KQ')) return 'KRW';
  return 'USD';
};

const safeNum = (val: unknown): number => {
  const n = parseFloat(String(val));
  return isNaN(n) ? 0 : n;
};

const fmtPrice = (n: number, currency: 'KRW' | 'USD'): string =>
  currency === 'KRW'
    ? Math.round(n).toLocaleString('ko-KR') + '원'
    : n.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' USD';

const DISCLAIMER = `
─────────────────────────
⚠️ 본 분석은 AI 생성 참고 자료이며 투자 권유가 아닙니다.
⚠️ 최종 투자 판단과 그에 따른 책임은 지휘관님께 있습니다.`;

const getVolumeInfo = (v: number, av: number, t: AssetType) => {
  if (t === 'US_STOCK' && av > 0) {
    const r = v / av;
    if (r > 2.0) return { label: `거래량 폭증 (평균의 ${r.toFixed(1)}배)`, score: 2, isHigh: true };
    if (r > 1.2) return { label: `거래량 증가 (평균의 ${r.toFixed(1)}배)`, score: 1, isHigh: true };
    if (r < 0.5) return { label: `거래량 저조 (평균의 ${r.toFixed(1)}배)`, score: -1, isHigh: false };
    return { label: '거래량 보통', score: 0, isHigh: false };
  }
  if (t === 'CRYPTO') {
    if (v > 1_000_000_000_000) return { label: '코인 거래대금 폭증', score: 2, isHigh: true };
    if (v < 100_000_000_000)   return { label: '코인 거래대금 저조', score: -1, isHigh: false };
    return { label: '코인 거래대금 보통', score: 0, isHigh: false };
  }
  if (v > 50_000_000) return { label: '거래량 폭증', score: 2, isHigh: true };
  if (v > 10_000_000) return { label: '거래량 증가', score: 1, isHigh: true };
  if (v < 1_000_000)  return { label: '거래량 저조', score: -1, isHigh: false };
  return { label: '거래량 보통', score: 0, isHigh: false };
};

const getVolatility = (p: number, h: number, l: number) => {
  if (!p) return { label: '변동성 데이터 없음', score: 0 };
  const v = ((h - l) / p) * 100;
  if (v > 8) return { label: `고변동성 (일중 ${v.toFixed(1)}% 진폭)`, score: -2 };
  if (v > 4) return { label: `중변동성 (일중 ${v.toFixed(1)}% 진폭)`, score: -1 };
  return { label: `저변동성 (일중 ${v.toFixed(1)}% 진폭)`, score: 0 };
};

const getPricePos = (p: number, h: number, l: number) => {
  if (h === l || !p) return { label: '가격 위치 확인 불가', score: 0, ratio: 0.5 };
  const pos = (p - l) / (h - l);
  if (pos > 0.8) return { label: `고점 근접 (${(pos*100).toFixed(0)}%)`, score: -2, ratio: pos };
  if (pos < 0.2) return { label: `저점 근접 (${(pos*100).toFixed(0)}%)`, score: 2,  ratio: pos };
  return { label: `중간 구간 (${(pos*100).toFixed(0)}%)`, score: 0, ratio: pos };
};

const getNewsData = (items: Array<{ title: string; source?: string }>) => {
  if (!items.length) return { avgScore: 0, sentiment: '중립', context: '관련 뉴스 없음' };
  const context = items.slice(0, 3).map((n, i) => `${i + 1}. ${n.title}`).join('\n');
  const count   = Math.min(items.length, 3);
  const score   = items.slice(0, 3).reduce((acc, item) => {
    if (/(상승|호재|돌파|수익|최고|급등|반등|상회|개선|수혜|강세)/.test(item.title)) return acc + 1;
    if (/(하락|악재|급락|손실|우려|위기|긴장|폭락|둔화|하회|긴축|약세)/.test(item.title)) return acc - 1;
    return acc;
  }, 0) / count;
  return { avgScore: score, sentiment: score > 0 ? '긍정' : score < 0 ? '부정' : '중립', context };
};

const calcScores = (p: ScoreParams) => {
  const ch = safeNum(p.change);
  const tr = ch > 0.5 ? 1 : ch < -0.5 ? -1 : 0;
  const ns = Math.round(p.newsAvg * 2);
  const total = p.volScore + tr + ns + p.posScore + p.vitScore;
  const verdict: Verdict = total >= 3 ? '매수 우위' : total <= -3 ? '매도 우위' : '관망';
  let conf = 30;
  if (p.hasData)        conf += 30;
  if (p.newsCount > 0)  conf += 20;
  if (p.volScore !== 0) conf += 10;
  if (p.newsCount >= 3) conf += 5;
  const trendLabel = tr > 0 ? '단기 상승 추세' : tr < 0 ? '단기 하락 추세' : '추세 중립';
  const breakdown  = `${p.volLabel} / ${trendLabel} / 뉴스 ${p.newsSentiment} / ${p.posLabel} / ${p.vixLabel}`;
  return { total, verdict, confidence: Math.min(95, conf), breakdown };
};

const getPositionSizing = (v: Verdict, total: number): string => {
  if (v === '관망')      return '현재 0% (신규 진입 금지)';
  if (v === '매도 우위') return '현재 0% (전량 현금화 검토)';
  return total >= 4 ? '40~50% 적극 매수' : '20~30% 분할 매수';
};

const buildEntryCondition = (
  marketData: MarketData | null, posRatio: number, volIsHigh: boolean,
  verdict: Verdict, keyword: string,
): string => {
  const currency = marketData?.currency ?? inferCurrency(keyword);
  if (!marketData) return `시세 데이터 없음 — 뉴스 확인 후 판단 필요`;
  const { rawHigh, rawLow } = marketData;
  const mid = (rawHigh + rawLow) / 2;
  const volNote = volIsHigh ? ' + 거래량 증가 확인' : '';
  if (verdict === '매도 우위') return [
    `지금 행동: 신규 매수 금지. 보유 시 손절 검토`,
    `매도 조건: ${fmtPrice(rawLow * 0.98, currency)} 이탈 시 전량 정리 (오늘 종가 기준)`,
    `시간 조건: 3일 내 반등 없으면 보유분 50% 축소`,
  ].join('\n');
  if (verdict === '매수 우위') {
    if (posRatio < 0.3) return [
      `지금 행동: 분할 매수 진입 가능 (10~20%)`,
      `추가 매수: ${fmtPrice(rawLow * 0.99, currency)} 이하 하락 시 2차 매수 (오늘~내일 기준)`,
      `돌파 조건: ${fmtPrice(rawHigh, currency)} 돌파${volNote} 시 비중 확대`,
      `시간 조건: 3일 내 반등 미확인 시 관망 전환`,
    ].join('\n');
    if (posRatio <= 0.7) return [
      `지금 행동: 소량 분할 매수 (10~15%)`,
      `매수 조건: ${fmtPrice(rawLow, currency)} 재접근 시 추가 매수 (이번 주 기준)`,
      `매도 조건: ${fmtPrice(rawLow * 0.97, currency)} 이탈 시 손절`,
      `돌파 조건: ${fmtPrice(rawHigh, currency)} 돌파${volNote} 시 비중 확대`,
    ].join('\n');
    return [
      `지금 행동: 고점 추격 자제. 눌림 대기`,
      `매수 조건: ${fmtPrice(mid, currency)} 수준 눌림 시 소량 매수 (3일 내)`,
      `매도 조건: ${fmtPrice(rawLow * 0.97, currency)} 이탈 시 손절`,
      `돌파 조건: ${fmtPrice(rawHigh * 1.01, currency)} 돌파${volNote} 시 추세 편승`,
    ].join('\n');
  }
  if (posRatio < 0.3) return [
    `지금 행동: 신규 진입 금지 (관망)`,
    `매수 조건: ${fmtPrice(rawLow * 0.98, currency)} 이하 하락 확인 후 소량 진입 (오늘~내일)`,
    `매도 조건: 보유 중이라면 ${fmtPrice(rawLow * 0.96, currency)} 이탈 시 손절`,
    `시간 조건: 3일 내 방향성 미확인 시 재분석`,
  ].join('\n');
  if (posRatio <= 0.7) return [
    `지금 행동: 신규 진입 금지 (관망)`,
    `매수 조건: ${fmtPrice(rawLow, currency)} 근접 + 반등 캔들 확인 시 진입 (이번 주)`,
    `매도 조건: ${fmtPrice(rawLow * 0.97, currency)} 이탈 시 손절`,
    `돌파 조건: ${fmtPrice(rawHigh, currency)} 돌파${volNote} 확인 후 추세 매수`,
  ].join('\n');
  return [
    `지금 행동: 신규 진입 금지 — 고점 구간 (관망)`,
    `매수 조건: ${fmtPrice(mid, currency)} 이하 눌림 확인 후 진입 (3일 내)`,
    `매도 조건: ${fmtPrice(rawLow * 0.97, currency)} 이탈 시 손절`,
    `시간 조건: 이번 주 내 눌림 미발생 시 다음 주 재분석`,
  ].join('\n');
};

const extractConditionPrices = (entryCondition: string): { buy: string; sell: string } => {
  const lines    = entryCondition.split('\n');
  const buyLine  = lines.find(l => l.includes('매수 조건') || l.includes('추가 매수') || l.includes('돌파 조건'));
  const sellLine = lines.find(l => l.includes('매도 조건') || l.includes('손절') || l.includes('이탈'));
  const extract  = (line?: string): string => {
    if (!line) return '';
    const m = line.match(/([\d,]+(?:\.\d+)?\s?(?:원|USD))/);
    return m ? m[0] : '';
  };
  return { buy: extract(buyLine), sell: extract(sellLine) };
};

// ✅ 수정본에서 추가 — 텍스트 가격을 숫자로 변환
const parsePriceToNumber = (text: string): number | null => {
  if (!text) return null;
  const cleaned = text.replace(/,/g, '').replace(/\s/g, '');
  const m = cleaned.match(/([\d.]+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
};

const buildDataSourceLabel = (assetType: AssetType, marketData: MarketData | null, newsCount: number): string => {
  if (!marketData) {
    const newsSource = newsCount > 0 ? `뉴스: 최신 ${newsCount}건 반영` : '뉴스: 수급 없음';
    return `📡 데이터 출처 — 시세: 미수급 | ${newsSource}`;
  }
  const state = (marketData.marketState || '').toUpperCase();
  const isRegular = state === 'REGULAR';
  const priceSource = assetType === 'CRYPTO'
    ? '시세: Upbit 실시간 ✅'
    : assetType === 'KOREAN_STOCK'
      ? (isRegular ? '시세: 한국장 실시간 ✅' : '시세: 한국장 (약 15분 지연) ⚠️')
      : (isRegular ? '시세: 미국장 실시간 ✅' : '시세: 미국장 전일 종가 기준 ⚠️');
  const newsSource = newsCount > 0 ? `뉴스: 최신 ${newsCount}건 반영` : '뉴스: 수급 없음';
  return `📡 데이터 출처 — ${priceSource} | ${newsSource}`;
};

const fetchWithTimeout = async (url: string, ms = 7000) => {
  const ctrl = new AbortController();
  const id   = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    clearTimeout(id);
    return res;
  } catch (e) { clearTimeout(id); throw e; }
};

// ✅ Yahoo 차트 공통 fetch — range 파라미터로 1d/5d 유연하게 호출
const fetchYahooChart = async (symbol: string, range: '1d' | '5d') => {
  const res = await fetchWithTimeout(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`
  );
  if (!res.ok) return null;
  const json = await res.json();
  if (json?.chart?.error) { console.warn('⚠️ Yahoo API error:', json.chart.error); return null; }
  return json?.chart?.result?.[0] || null;
};

const fetchMarketPrice = async (keyword: string): Promise<MarketData | null> => {
  try {
    const cryptoTicker = CRYPTO_MAP[keyword] || CRYPTO_MAP[keyword.toUpperCase()];
    if (cryptoTicker) {
      const res = await fetchWithTimeout(`https://api.upbit.com/v1/ticker?markets=${cryptoTicker}`, 5000);
      if (!res.ok) return null;
      const json = await res.json();
      if (!Array.isArray(json) || !json[0]) return null;
      const d = json[0];
      return {
        price: d.trade_price.toLocaleString('ko-KR'), change: (d.signed_change_rate * 100).toFixed(2),
        high: d.high_price.toLocaleString('ko-KR'), low: d.low_price.toLocaleString('ko-KR'),
        volume: `${(d.acc_trade_price_24h / 1_000_000_000).toFixed(0)}억`,
        rawPrice: d.trade_price, rawHigh: d.high_price, rawLow: d.low_price,
        rawVolume: d.acc_trade_price_24h, avgVolume: 0,
        currency: 'KRW', source: 'Upbit 실시간', marketState: 'REGULAR',
      };
    }

    const symbol = STOCK_MAP[keyword] || STOCK_MAP[keyword.toUpperCase()];
    if (!symbol) return null;

    // ✅ 1d + 5d 동시 호출 — 응답 시간 단축
    const [result1d, result5d] = await Promise.all([
      fetchYahooChart(symbol, '1d'),
      fetchYahooChart(symbol, '5d'),
    ]);
    if (!result1d) return null;
    const meta = result1d.meta;
    if (!meta?.regularMarketPrice) return null;

    const isKR = symbol.endsWith('.KS') || symbol.endsWith('.KQ') || symbol.startsWith('^KS') || symbol.startsWith('^KQ');
    const marketState = String(meta.marketState || 'UNKNOWN').toUpperCase();
    const price = meta.regularMarketPrice;

    // ✅ change 계산 우선순위
    // 1순위: regularMarketChangePercent (Yahoo 공식 필드)
    // 2순위: previousClose 기반 계산
    // 3순위 (미국 장마감 후): 5d 전일 종가 비교
    let change = 0;
    if (typeof meta.regularMarketChangePercent === 'number' && Number.isFinite(meta.regularMarketChangePercent)) {
      change = meta.regularMarketChangePercent;
    } else {
      const prev = meta.previousClose || meta.regularMarketPreviousClose || price;
      change = ((price - prev) / (prev || 1)) * 100;
    }

    // 미국 장마감 후 — 5d 전일 종가 비교로 보정 (이미 동시 호출됨)
    // 한국 주식은 marketState 무시
    if (!isKR && marketState !== 'REGULAR') {
      if (result5d) {
        const closes = result5d.indicators?.quote?.[0]?.close || [];
        const validCloses = closes.filter((v: unknown): v is number => typeof v === 'number' && Number.isFinite(v));
        if (validCloses.length >= 2) {
          const lastClose = validCloses[validCloses.length - 1];
          const prevClose = validCloses[validCloses.length - 2];
          if (prevClose) change = ((lastClose - prevClose) / prevClose) * 100;
        }
      }
    }

    const high = meta.regularMarketDayHigh || price;
    const low  = meta.regularMarketDayLow  || price;

    return {
      price: isKR ? Math.round(price).toLocaleString('ko-KR') : price.toLocaleString('en-US', { minimumFractionDigits: 2 }),
      change: change.toFixed(2),
      high: isKR ? Math.round(high).toLocaleString('ko-KR') : high.toLocaleString('en-US', { minimumFractionDigits: 2 }),
      low:  isKR ? Math.round(low).toLocaleString('ko-KR')  : low.toLocaleString('en-US',  { minimumFractionDigits: 2 }),
      volume: `${((meta.regularMarketVolume || 0) / 1_000_000).toFixed(1)}M`,
      rawPrice: price, rawHigh: high, rawLow: low,
      rawVolume: meta.regularMarketVolume || 0,
      avgVolume: meta.averageDailyVolume3Month || 0,
      currency: isKR ? 'KRW' : 'USD',
      marketState,
      source: isKR
        ? '한국장 (15분 지연)'
        : marketState === 'REGULAR' ? '미국장 실시간' : '미국장 전일 종가 기준',
    };
  } catch { return null; }
};

const extractKeyword = (messages: Array<{ role: string; content: string }>): string => {
  const lastMsg = (messages.at(-1)?.content || "").toLowerCase();
  for (const t of KEYWORD_PRIORITY) {
    if (lastMsg.includes(t.toLowerCase())) return t;
  }
  return '시장';
};

const parseChainedPersonas = (text: string): Partial<PersonaResponse> => {
  const tags: Record<string, string> = {
    JACK:  '(\\[JACK\\]|🔴\\s*잭|JACK[:\\s])',
    LUCIA: '(\\[LUCIA\\]|🔵\\s*루시아|LUCIA[:\\s])',
    RAY:   '(\\[RAY\\]|⚪\\s*레이|RAY[:\\s])',
    ECHO:  '(\\[ECHO\\]|🟡\\s*에코|ECHO[:\\s])',
  };
  const extract = (tag: string, next: string | null): string => {
    const m = text.match(new RegExp(tags[tag], 'i'));
    if (!m || m.index === undefined) return '';
    const start = m.index + m[0].length;
    let end = text.length;
    if (next) {
      const nm = text.match(new RegExp(tags[next], 'i'));
      if (nm && nm.index !== undefined) end = nm.index;
    }
    return text.slice(start, end).replace(/^[:\s\-—*#]+/, '').trim();
  };
  const truncate = (t: string, limit: number) => {
    if (t.length <= limit) return t;
    const cut  = t.slice(0, limit);
    const last = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('다'), cut.lastIndexOf('요'));
    return last > limit * 0.6 ? cut.slice(0, last + 1) : cut + '...';
  };
  return {
    jack:  truncate(extract('JACK',  'LUCIA'), 200),
    lucia: truncate(extract('LUCIA', 'RAY'),   300),
    ray:   truncate(extract('RAY',   'ECHO'),  300),
    echo:  extract('ECHO', null),
  };
};

// ✅ saveHistory — 기존 컬럼 + 숫자 컬럼 + userId + ipAddress
const saveHistory = async (params: {
  keyword:        string;
  question:       string;
  verdict:        Verdict;
  totalScore:     number;
  assetType:      string;
  entryCondition: string;
  priceAtTime:    string;
  confidence:     number;
  rawResponse:    string;
  marketData:     MarketData | null;
  ipAddress?:     string | null;
  userId?:        string | null;
}): Promise<void> => {
  try {
    const supabase = getSupabase();
    if (!supabase) return;

    const { buy, sell } = extractConditionPrices(params.entryCondition);
    const targetNum = parsePriceToNumber(buy);
    const stopNum   = parsePriceToNumber(sell);

    const { error: insertError } = await supabase.from('user_analysis_history').insert({
      // 기존 컬럼 유지
      keyword:         params.keyword,
      question:        params.question.slice(0, 200),
      verdict:         params.verdict,
      total_score:     params.totalScore,
      asset_type:      params.assetType,
      entry_condition: params.entryCondition.slice(0, 500),
      price_at_time:   params.priceAtTime,
      confidence:      params.confidence,
      result:          'pending',
      raw_response:    params.rawResponse.slice(0, 5000),
      clean_response:  params.rawResponse.replace(/\s+/g, ' ').slice(0, 2000),
      created_at:      new Date().toISOString(),
      // ✅ 신규 숫자 컬럼
      entry_price_num: params.marketData?.rawPrice ?? null,
      target_price_num: targetNum,
      stop_loss_num:   stopNum,
      profit_rate:     null,
      currency:        params.marketData?.currency ?? inferCurrency(params.keyword),
      result_status:   'PENDING',
      evaluated_at:    null,
      ip_address:      params.ipAddress ?? null,
      user_id:         params.userId ?? null,
    });

    if (insertError) {
      console.warn('⚠️ 히스토리 저장 실패:',
        insertError.message, '| code:', insertError.code, '| details:', insertError.details
      );
    }
  } catch (err) { console.warn('⚠️ 히스토리 저장 예외:', err); }
};

export async function POST(req: Request) {
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY 누락');
    return Response.json({ reply: '사령부 통신 키 누락. 환경 변수를 확인하십시오.' }, { status: 500 });
  }

  try {
    const { messages, positionContext } = await req.json();
    const lastMsg  = messages.at(-1)?.content || "";
    const keyword  = extractKeyword(messages);
    const currency = inferCurrency(keyword);

    // ✅ IP 추출 (비로그인 제한 대비)
    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

    // ✅ 로그인 사용자 ID 추출 (비로그인이면 null)
    let userId: string | null = null;
    try {
      const supabaseServer = await createServerSupabase();
      const { data: { user } } = await supabaseServer.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      userId = null;
    }

    const [marketData, nasdaqData, news] = await Promise.all([
      fetchMarketPrice(keyword),
      fetchMarketPrice('나스닥').catch(() => null),
      fetchInvestmentNews(keyword).catch(() => []),
    ]);

    const nasdaqDisplay = nasdaqData ? `${safeNum(nasdaqData?.change)}%` : '데이터 없음';
    const isCrypto  = !!(CRYPTO_MAP[keyword] || CRYPTO_MAP[keyword.toUpperCase()]);
    const assetType: AssetType = isCrypto ? 'CRYPTO' : currency === 'KRW' ? 'KOREAN_STOCK' : 'US_STOCK';

    const vol   = getVolumeInfo(marketData?.rawVolume || 0, marketData?.avgVolume || 0, assetType);
    const vix   = getVolatility(marketData?.rawPrice  || 0, marketData?.rawHigh   || 0, marketData?.rawLow || 0);
    const pos   = getPricePos(marketData?.rawPrice    || 0, marketData?.rawHigh   || 0, marketData?.rawLow || 0);
    const nData = getNewsData(news as Array<{ title: string; source?: string }>);

    const { total, verdict, confidence, breakdown } = calcScores({
      volScore: vol.score, change: marketData?.change || '0', newsAvg: nData.avgScore,
      posScore: pos.score, vitScore: vix.score, hasData: !!marketData, newsCount: news.length,
      volLabel: vol.label, posLabel: pos.label, vixLabel: vix.label, newsSentiment: nData.sentiment,
    });

    const positionSizing  = getPositionSizing(verdict, total);
    const dataSourceLabel = buildDataSourceLabel(assetType, marketData, news.length);
    const entryCondition  = buildEntryCondition(marketData, pos.ratio, vol.isHigh, verdict, keyword);
    const { buy: buyPrice, sell: sellPrice } = extractConditionPrices(entryCondition);
    const condSummary = [buyPrice && `매수(${buyPrice})`, sellPrice && `손절(${sellPrice})`]
      .filter(Boolean).join(' / ') || '시장 상황 주시';

    const confidenceBasis = [
      marketData ? `시세(${marketData.source})` : null,
      news.length > 0 ? `뉴스 ${news.length}건(${nData.sentiment})` : null,
      vol.isHigh ? '거래량 신호' : null,
    ].filter(Boolean).join(' + ') || '데이터 제한적';

    const noDataNote = !marketData
      ? `\n[주의] ${keyword} 실시간 시세 미지원. 뉴스와 거시 데이터 기반으로만 분석하라.`
      : '';

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
      : '';

    const currencyRule = currency === 'KRW'
      ? '\n[화폐 규칙] 모든 가격은 반드시 원화(원, KRW) 표기. USD 표기 절대 금지.'
      : '\n[화폐 규칙] 모든 가격은 USD로 표기하라.';

    const rawHistory = messages.slice(-7, -1).filter((m: { role: string; content: string }) => m.role && m.content);
    const dedupedHistory = rawHistory.filter(
      (m: { role: string }, i: number, arr: Array<{ role: string }>) => i === 0 || m.role !== arr[i - 1].role
    );

    const watchConditionRule = verdict === '관망' ? `
[관망 강제 규칙 — 절대 위반 금지]
1. 숫자가 포함된 매수 조건 (구체적 가격 또는 %)
2. 숫자가 포함된 매도/손절 조건
3. 명확한 시간 조건 (3일 내, 이번 주 등)
절대 금지: "근접", "가능성", "검토", "추후", "상황 지켜보기"
` : '';

    // ✅ 기존 파일 프롬프트 그대로 유지
    const prompt = `
[절대 규칙 — 위반 시 전체 응답 무효]
1. 반드시 [JACK],[LUCIA],[RAY],[ECHO] 4개 태그 모두 출력. 순서 변경 금지.
2. 태그 형식 엄수: 새 줄 맨 앞에 [JACK] 단독. 절대 변형 금지.
   올바른 예) [JACK]
내용
[LUCIA]
내용
[RAY]
내용
[ECHO]
내용
   금지) JACK:, 잭:, **[JACK]**, J소장
3. 마크다운 완전 금지 (**, ##, -, * 모두 금지).
4. [LUCIA][RAY][ECHO] 절대 생략 금지.
5. 각 페르소나 캐릭터 말투를 반드시 유지:

[JACK] INTJ 전략가: "지휘관님, ~" 시작. 군사적 어조. "즉각 집행하십시오" 형태. 존대말.
[LUCIA] ENFP 감성가: "하지만 소장님, ~" 시작. 날씨/감정 비유. "~요" 구어체. 걱정 표출. 존대말.
[RAY] INTP 분석가: 감정 없이 숫자만. "나스닥 X%, 거래량 X배" 나열. 의견 금지. 존대말.
${currencyRule}
${watchConditionRule}${noDataNote}${positionNote}

[실시간 데이터]
- 분석 대상: ${keyword} | 가격: ${marketData?.price || '미지원'} (${safeNum(marketData?.change)}%)
- 나스닥: ${safeNum(nasdaqData?.change)}%
- 시장 신호: ${breakdown}
- 최신 뉴스:
${nData.context}

[퀀트 판단] 결론: ${verdict} | 신뢰도: ${confidence}% | 포지션: ${positionSizing}

[JACK] — INTJ 전략가. 냉정하고 단정적. 리스크 언급 금지. 반드시 2문장.
문장1: "지휘관님, ~" 으로 시작. ${keyword} ${marketData?.price || '현재가'} 기준 상승 근거 1가지 + 수치. 군사적 자신감 있는 어조.
문장2: "즉각 ~하십시오" 형태의 구체적 매수 명령 1가지.

[LUCIA] — ENFP 감성 리스크 전문가. 기회 언급 금지. 반드시 2문장.
문장1: "하지만 소장님, ~"으로 시작. 감성적 비유(날씨, 계절, 감정)를 섞어 하락 리스크 1가지 표현. 구어체 "~요" 말투.
문장2: 손절 또는 회피 근거 1가지. 불안감 감정 포함. 예) "정말 무서운 거 아세요?"처럼 감정 표출.

[RAY] — 숫자와 데이터만. 의견 금지. 반드시 2문장.
문장1: 나스닥 ${safeNum(nasdaqData?.change)}%와 ${keyword} 상관관계 (수치 포함).
문장2: 신뢰도 ${confidence}% 기반 — 뉴스 ${news.length}건, 시세 ${marketData ? '수급됨' : '미수급'}.

[ECHO] 에코 감독관 — 최종 결론 (반드시 5줄 고정. 초과 금지)
결론: ${verdict} (신뢰도 ${confidence}% — ${confidenceBasis} 기반)
근거: (잭+루시아+레이 핵심 요약 1줄. 수치 포함)
지금: (지금 당장 할 행동 1가지)
조건: ${condSummary}
비중: ${positionSizing}

질문: ${lastMsg}
`;

    const contents = [
      ...dedupedHistory.map((m: { role: string; content: string }) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(m.content) }],
      })),
      { role: 'user', parts: [{ text: prompt }] },
    ];

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: { maxOutputTokens: 5000, temperature: 0.4 },
          safetySettings: [
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          ],
        }),
      }
    );

    if (!res.ok) {
      const detail = await res.text();
      console.error('[Gemini API Error]', detail);
      throw new Error(`Gemini API 오류: ${res.status}`);
    }

    const data = await res.json();
    if (!data?.candidates?.length) throw new Error('Gemini 응답 없음');
    const candidate = data.candidates[0];
    const finishReason = candidate?.finishReason || 'STOP';
    if (finishReason === 'MAX_TOKENS') {
      console.warn('⚠️ Gemini MAX_TOKENS: 응답 잘림');
    } else if (finishReason !== 'STOP') {
      throw new Error(`Gemini blocked: ${finishReason}`);
    }
    const parts = candidate?.content?.parts;
    if (!parts || !Array.isArray(parts)) throw new Error('Gemini parts 없음');
    const aiText = parts.map((pt: { text?: string }) => pt.text || '').join('') || "";
    const p = parseChainedPersonas(aiText);

    const hasCore = !!(p.jack && p.lucia && p.ray);
    const echoLines = (p.echo || '').split('\n').map(l => l.trim()).filter(Boolean);
    const isValidEcho = !!(p.echo &&
      ['결론:', '근거:', '지금:', '조건:', '비중:'].every(k => p.echo!.includes(k)) &&
      echoLines.length >= 5);
    const useFullFallback = !hasCore || finishReason === 'MAX_TOKENS';

    if (!hasCore) {
      console.warn('⚠️ fallback: core missing', { jack: !!p.jack, lucia: !!p.lucia, ray: !!p.ray });
      console.warn('원문 앞 300자:', aiText.slice(0, 300));
    }
    if (p.echo && !isValidEcho) console.warn('⚠️ fallback: echo invalid', p.echo.slice(0, 100));

    console.log(
      `✅ ${keyword}(${assetType}) | ${verdict}(${total}점) | 신뢰도:${confidence}% | ` +
      `jack:${p.jack ? '✅' : '❌'} lucia:${p.lucia ? '✅' : '❌'} ` +
      `ray:${p.ray ? '✅' : '❌'} echo:${p.echo ? (isValidEcho ? '✅' : 'INVALID') : '❌'}`
    );

    const jackFallback  = `${keyword} ${marketData?.price || ''} 기준, ${breakdown}. 현재 ${verdict} 구간 판단.`;
    const luciaFallback = `신뢰도 ${confidence}%(${confidenceBasis}). ${positionSizing} 기준으로 신중한 접근 권장.`;
    const correlationNote = assetType === 'CRYPTO' ? '코인은 나스닥과 독립 변수로 작용하는 경우 多'
      : assetType === 'KOREAN_STOCK' ? '외국인 수급을 통해 나스닥과 간접 연동'
      : '나스닥과 직접 연동, 동조화 경향 높음';
    const rayFallback = [
      `나스닥 ${safeNum(nasdaqData?.change)}% — ${keyword}와 상관관계: ${correlationNote}.`,
      `신뢰도 ${confidence}% — 뉴스 ${news.length}건, 시세 ${marketData ? '수급됨' : '미수급'} 기준.`,
    ].join('\n');

    const echoFallback = [
      `결론: ${verdict} (신뢰도 ${confidence}% — ${confidenceBasis} 기반)`,
      `근거: ${breakdown}`,
      `지금: ${entryCondition.split('\n')[0]?.split(':')[1]?.trim() || '시장 주시'}`,
      `조건: ${condSummary}`,
      `비중: ${positionSizing}`,
    ].join('\n');
    const echoWithMeta = `${echoFallback}\n\n${dataSourceLabel}${DISCLAIMER}`;

    const finalJack  = useFullFallback ? jackFallback  : (p.jack  || jackFallback);
    const finalLucia = useFullFallback ? luciaFallback : (p.lucia && p.lucia.length > 15 ? p.lucia : luciaFallback);
    const finalRay   = useFullFallback ? rayFallback   : (p.ray   && p.ray.length   > 15 ? p.ray   : rayFallback);
    const finalEcho  = useFullFallback ? echoWithMeta  : (isValidEcho ? `${p.echo}\n\n${dataSourceLabel}${DISCLAIMER}` : echoWithMeta);

    const finalReply = [finalJack, finalLucia, finalRay, finalEcho].filter(Boolean).join('\n\n');

    // ✅ newsLinks — 감정 분석 기반 페르소나별 배정
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

    const used = new Set<number>();

    const jackIdx = (() => {
      const i = scoredNews.findIndex(n => n.score === 1);
      if (i !== -1) { used.add(i); return i; }
      const fallback = scoredNews.findIndex((_, i) => !used.has(i));
      if (fallback !== -1) used.add(fallback);
      return fallback;
    })();

    const luciaIdx = (() => {
      const i = scoredNews.findIndex((n, i) => n.score === -1 && !used.has(i));
      if (i !== -1) { used.add(i); return i; }
      const fallback = scoredNews.findIndex((_, i) => !used.has(i));
      if (fallback !== -1) used.add(fallback);
      return fallback;
    })();

    const rayIdx = (() => {
      const i = scoredNews.findIndex((n, i) => n.score === 0 && !used.has(i));
      if (i !== -1) { used.add(i); return i; }
      const fallback = scoredNews.findIndex((_, i) => !used.has(i));
      if (fallback !== -1) used.add(fallback);
      return fallback;
    })();

    const jackNewsItem  = jackIdx  !== -1 ? scoredNews[jackIdx]  : null;
    const luciaNewsItem = luciaIdx !== -1 ? scoredNews[luciaIdx] : null;
    const rayNewsItem   = rayIdx   !== -1 ? scoredNews[rayIdx]   : null;
    const echoNewsItem  = scoredNews[0] || null;

    const jackNews  = jackNewsItem  ? cleanNewsItem(jackNewsItem)  : null;
    const luciaNews = luciaNewsItem ? cleanNewsItem(luciaNewsItem) : null;
    const rayNews   = rayNewsItem   ? cleanNewsItem(rayNewsItem)   : null;
    const echoNews  = echoNewsItem  ? cleanNewsItem(echoNewsItem)  : null;

    console.log('newsLinks scored:', scoredNews.length, '/ raw:', (news as NewsRaw[]).length);

    // ✅ 로그인 사용자만 저장 (RLS 정책과 일치)
    if (userId) {
      void Promise.race([
        saveHistory({
          keyword, question: lastMsg, verdict, totalScore: total, assetType, entryCondition,
          priceAtTime: marketData?.price || '미수급', confidence, rawResponse: aiText,
          marketData, ipAddress, userId,
        }),
        new Promise(r => setTimeout(r, 1000)),
      ]);
    }

    return Response.json({
      reply: finalReply,
      personas: {
        jack: finalJack, lucia: finalLucia, ray: finalRay, echo: finalEcho,
        verdict, confidence, breakdown, positionSizing,
        jackNews, luciaNews, rayNews, echoNews,
      },
      // newsLinks는 personas 내부 jackNews/luciaNews/rayNews/echoNews로 통합
    });

  } catch (e) {
    console.error("❌ 사령부 에러:", e);
    return Response.json({ reply: "사령부 시스템 일시 지연. 잠시 후 재시도하십시오." });
  }
}
