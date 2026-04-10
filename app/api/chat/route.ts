import { fetchInvestmentNews } from '@/lib/news';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

// ─── Supabase ─────────────────────────────────────────────
const getSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
};

// ✅ raw_response + clean_response 둘 다 저장 (디버깅 + 분석용)
const saveHistory = async (params: {
  keyword:        string;
  question:       string;
  verdict:        '매수 우위' | '매도 우위' | '관망';
  totalScore:     number;
  assetType:      string;
  entryCondition: string;
  priceAtTime:    string;
  confidence:     number;
  rawResponse:    string;
}): Promise<void> => {
  try {
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.from('user_analysis_history').insert({
      keyword:         params.keyword,
      question:        params.question.slice(0, 200),
      verdict:         params.verdict,
      total_score:     params.totalScore,
      asset_type:      params.assetType,
      entry_condition: params.entryCondition.slice(0, 500),
      price_at_time:   params.priceAtTime,
      confidence:      params.confidence,
      result:          'pending',
      raw_response:    params.rawResponse.slice(0, 5000),       // 디버깅용 원문
      clean_response:  params.rawResponse.replace(/\s+/g, ' ').slice(0, 2000), // 분석용 정제본
      created_at:      new Date().toISOString(),
    });
  } catch { console.warn('⚠️ 히스토리 저장 실패'); }
};

// ─── 1. 타입 및 마스터 데이터 ─────────────────────────────
type AssetType = 'CRYPTO' | 'KOREAN_STOCK' | 'US_STOCK';
type Verdict   = '매수 우위' | '매도 우위' | '관망';

export interface PersonaResponse {
  jack: string; lucia: string; ray: string; echo: string;
  verdict: Verdict; confidence: number; breakdown: string; positionSizing: string;
}

interface MarketData {
  price: string; change: string; high: string; low: string; volume: string;
  rawPrice: number; rawHigh: number; rawLow: number; rawVolume: number; avgVolume: number;
  currency: 'KRW' | 'USD'; source: string;
}

const STOCK_MAP: Record<string, string> = {
  '나스닥': '^IXIC', 'NASDAQ': '^IXIC', 'S&P500': '^GSPC', 'S&P': '^GSPC', '다우': '^DJI',
  '엔비디아': 'NVDA', 'NVDA': 'NVDA', '테슬라': 'TSLA', 'TSLA': 'TSLA',
  '애플': 'AAPL', 'AAPL': 'AAPL', '마이크로소프트': 'MSFT', 'MSFT': 'MSFT',
  '구글': 'GOOGL', 'GOOGL': 'GOOGL', '아마존': 'AMZN', 'AMZN': 'AMZN',
  '메타': 'META', 'META': 'META', '넷플릭스': 'NFLX', 'NFLX': 'NFLX',
  '삼성전자': '005930.KS', 'SK하이닉스': '000660.KS', '현대차': '005380.KS',
  '카카오': '035720.KS', '네이버': '035420.KS', '기아': '000270.KS',
  'LG에너지': '373220.KS', 'POSCO': '005490.KS', '셀트리온': '068270.KS',
  '에코프로': '086520.KQ', '알테오젠': '196170.KQ',
  '코스피': '^KS11', '코스닥': '^KQ11', '한국 증시': '^KS11', '한국증시': '^KS11',
  '비트코인': 'KRW-BTC', 'BTC': 'KRW-BTC', '이더리움': 'KRW-ETH', 'ETH': 'KRW-ETH',
  '리플': 'KRW-XRP', 'XRP': 'KRW-XRP', '솔라나': 'KRW-SOL', 'SOL': 'KRW-SOL',
  '도지': 'KRW-DOGE', 'DOGE': 'KRW-DOGE', 'ADA': 'KRW-ADA', 'BNB': 'KRW-BNB',
};

const CRYPTO_KEYWORDS = new Set([
  '비트코인', 'BTC', '이더리움', 'ETH', '리플', 'XRP', '솔라나', 'SOL', '도지', 'DOGE', 'ADA', 'BNB',
]);

// ─── 2. 유틸 ─────────────────────────────────────────────
const safeNum = (val: unknown): number => {
  const n = parseFloat(String(val));
  return isNaN(n) ? 0 : n;
};

const fmtPrice = (n: number, currency: 'KRW' | 'USD'): string =>
  currency === 'KRW'
    ? Math.round(n).toLocaleString('ko-KR') + '원'
    : n.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' USD';

// ─── 3. 면책 조항 ─────────────────────────────────────────
const DISCLAIMER = `
─────────────────────────
⚠️ 본 분석은 AI 생성 참고 자료이며 투자 권유가 아닙니다.
⚠️ 최종 투자 판단과 그에 따른 책임은 지휘관님께 있습니다.`;

// ─── 4. 6축 퀀트 엔진 ────────────────────────────────────
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
  if (pos < 0.2) return { label: `저점 근접 (${(pos*100).toFixed(0)}%)`, score: 2, ratio: pos };
  return { label: `중간 구간 (${(pos*100).toFixed(0)}%)`, score: 0, ratio: pos };
};

// ✅ 뉴스 스코어 보정 — 실제 개수로 나눔
const getNewsData = (items: Array<{ title: string; source?: string }>) => {
  if (!items.length) return { avgScore: 0, sentiment: '중립', context: '관련 뉴스 없음' };
  const context = items.slice(0, 3).map((n, i) => `${i + 1}. ${n.title}`).join('\n');
  const count = Math.min(items.length, 3); // ✅ 실제 개수로 나눔
  const score = items.slice(0, 3).reduce((acc, item) => {
    if (/상승|호재|돌파|수익|최고|급등|반등/.test(item.title)) return acc + 1;
    if (/하락|악재|급락|손실|우려|위기|긴장|폭락/.test(item.title)) return acc - 1;
    return acc;
  }, 0) / count;
  return { avgScore: score, sentiment: score > 0 ? '긍정' : score < 0 ? '부정' : '중립', context };
};

interface ScoreParams {
  volScore: number; change: string; newsAvg: number;
  posScore: number; vitScore: number;
  hasData: boolean; newsCount: number;
  volLabel: string; posLabel: string; vixLabel: string; newsSentiment: string;
}

// ✅ verdict 보수적 기준 3점 + confidence 데이터 품질 기반
const calcScores = (p: ScoreParams) => {
  const ch = safeNum(p.change);
  const tr = ch > 0.5 ? 1 : ch < -0.5 ? -1 : 0;
  const ns = Math.round(p.newsAvg * 2);
  const total = p.volScore + tr + ns + p.posScore + p.vitScore;

  // ✅ 보수적 기준: 3점 이상만 매수 승인
  const verdict: Verdict = total >= 3 ? '매수 우위' : total <= -3 ? '매도 우위' : '관망';

  // ✅ confidence = 데이터 품질 기반 (totalScore 영향 최소화)
  const base = 30; // 최소 신뢰도
  let conf = base;
  if (p.hasData)          conf += 30; // 실시간 시세 있음
  if (p.newsCount > 0)    conf += 20; // 뉴스 있음
  if (p.volScore !== 0)   conf += 10; // 거래량 신호 있음
  if (p.newsCount >= 3)   conf += 5;  // 뉴스 3개 이상

  const trendLabel = tr > 0 ? '단기 상승 추세' : tr < 0 ? '단기 하락 추세' : '추세 중립';
  const breakdown  = `${p.volLabel} / ${trendLabel} / 뉴스 ${p.newsSentiment} / ${p.posLabel} / ${p.vixLabel}`;

  return { total, verdict, confidence: Math.min(95, conf), breakdown };
};

const getPositionSizing = (v: Verdict, total: number): string => {
  if (v === '관망')      return '현재 0% (신규 진입 금지)';
  if (v === '매도 우위') return '현재 0% (전량 현금화 검토)';
  return total >= 4 ? '40~50% 적극 매수' : '20~30% 분할 매수';
};

// ─── 5. position 기반 진입 조건 생성 ─────────────────────
const buildEntryCondition = (
  marketData: MarketData | null,
  posRatio: number,
  volIsHigh: boolean,
  verdict: Verdict,
): string => {
  if (!marketData) return '시세 데이터 없음 — 뉴스 확인 후 판단 필요';

  const { rawHigh, rawLow, currency } = marketData;
  const mid     = (rawHigh + rawLow) / 2;
  const volNote = volIsHigh ? ' + 거래량 증가 확인' : '';

  if (verdict === '매도 우위') {
    return [
      `지금 행동: 신규 매수 금지. 보유 시 손절 검토`,
      `매도 조건: ${fmtPrice(rawLow * 0.98, currency)} 이탈 시 전량 정리 (오늘 종가 기준)`,
      `시간 조건: 3일 내 반등 없으면 보유분 50% 축소`,
    ].join('\n');
  }

  if (verdict === '매수 우위') {
    if (posRatio < 0.3) {
      return [
        `지금 행동: 분할 매수 진입 가능 (10~20%)`,
        `추가 매수: ${fmtPrice(rawLow * 0.99, currency)} 이하 하락 시 2차 매수 (오늘~내일 기준)`,
        `돌파 조건: ${fmtPrice(rawHigh, currency)} 돌파${volNote} 시 비중 확대`,
        `시간 조건: 3일 내 반등 미확인 시 관망 전환`,
      ].join('\n');
    }
    if (posRatio <= 0.7) {
      return [
        `지금 행동: 소량 분할 매수 (10~15%)`,
        `매수 조건: ${fmtPrice(rawLow, currency)} 재접근 시 추가 매수 (이번 주 기준)`,
        `매도 조건: ${fmtPrice(rawLow * 0.97, currency)} 이탈 시 손절`,
        `돌파 조건: ${fmtPrice(rawHigh, currency)} 돌파${volNote} 시 비중 확대`,
      ].join('\n');
    }
    return [
      `지금 행동: 고점 추격 자제. 눌림 대기`,
      `매수 조건: ${fmtPrice(mid, currency)} 수준 눌림 시 소량 매수 (3일 내)`,
      `매도 조건: ${fmtPrice(rawLow * 0.97, currency)} 이탈 시 손절`,
      `돌파 조건: ${fmtPrice(rawHigh * 1.01, currency)} 돌파${volNote} 시 추세 편승`,
    ].join('\n');
  }

  // 관망
  if (posRatio < 0.3) {
    return [
      `지금 행동: 신규 진입 금지 (관망)`,
      `매수 조건: ${fmtPrice(rawLow * 0.98, currency)} 이하 하락 확인 후 소량 진입 (오늘~내일)`,
      `매도 조건: 보유 중이라면 ${fmtPrice(rawLow * 0.96, currency)} 이탈 시 손절`,
      `시간 조건: 3일 내 방향성 미확인 시 재분석`,
    ].join('\n');
  }
  if (posRatio <= 0.7) {
    return [
      `지금 행동: 신규 진입 금지 (관망)`,
      `매수 조건: ${fmtPrice(rawLow, currency)} 근접 + 반등 캔들 확인 시 진입 (이번 주)`,
      `매도 조건: ${fmtPrice(rawLow * 0.97, currency)} 이탈 시 손절`,
      `돌파 조건: ${fmtPrice(rawHigh, currency)} 돌파${volNote} 확인 후 추세 매수`,
    ].join('\n');
  }
  return [
    `지금 행동: 신규 진입 금지 — 고점 구간 (관망)`,
    `매수 조건: ${fmtPrice(mid, currency)} 이하 눌림 확인 후 진입 (3일 내)`,
    `매도 조건: ${fmtPrice(rawLow * 0.97, currency)} 이탈 시 손절`,
    `시간 조건: 이번 주 내 눌림 미발생 시 다음 주 재분석`,
  ].join('\n');
};

// ✅ entryCondition에서 매수/매도 조건 숫자만 안전하게 추출
const extractConditionPrices = (entryCondition: string): { buy: string; sell: string } => {
  const lines = entryCondition.split('\n');
  const buyLine  = lines.find(l => l.includes('매수 조건') || l.includes('추가 매수') || l.includes('돌파 조건'));
  const sellLine = lines.find(l => l.includes('매도 조건') || l.includes('손절') || l.includes('이탈'));
  const extract  = (line?: string) => {
    if (!line) return '';
    const m = line.match(/[\d,]+(?:\.\d+)?(?:원| USD)?/);
    return m ? m[0] : '';
  };
  return { buy: extract(buyLine), sell: extract(sellLine) };
};

// ─── 6. 데이터 출처 레이블 ────────────────────────────────
const buildDataSourceLabel = (
  assetType: AssetType, marketData: MarketData | null, newsCount: number,
): string => {
  const priceSource = !marketData ? '시세: 미수급'
    : assetType === 'CRYPTO' ? '시세: Upbit 실시간 ✅'
    : '시세: Yahoo Finance (약 15분 지연) ⚠️';
  const newsSource = newsCount > 0 ? `뉴스: 최신 ${newsCount}건 반영` : '뉴스: 수급 없음';
  return `📡 데이터 출처 — ${priceSource} | ${newsSource}`;
};

// ─── 7. 데이터 수급 엔진 ─────────────────────────────────
const fetchWithTimeout = async (url: string, ms = 7000) => {
  const ctrl = new AbortController();
  const id   = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    clearTimeout(id);
    return res;
  } catch (e) { clearTimeout(id); throw e; }
};

const fetchMarketPrice = async (keyword: string): Promise<MarketData | null> => {
  try {
    const isCrypto = CRYPTO_KEYWORDS.has(keyword) || CRYPTO_KEYWORDS.has(keyword.toUpperCase());
    if (isCrypto) {
      const tickerMap: Record<string, string> = {
        '비트코인':'KRW-BTC','BTC':'KRW-BTC','이더리움':'KRW-ETH','ETH':'KRW-ETH',
        '리플':'KRW-XRP','XRP':'KRW-XRP','솔라나':'KRW-SOL','SOL':'KRW-SOL',
        '도지':'KRW-DOGE','DOGE':'KRW-DOGE','ADA':'KRW-ADA','BNB':'KRW-BNB',
      };
      const ticker = tickerMap[keyword] || tickerMap[keyword.toUpperCase()];
      if (!ticker) return null;
      const res = await fetchWithTimeout(`https://api.upbit.com/v1/ticker?markets=${ticker}`, 5000);
      const d   = (await res.json())[0];
      return {
        price: d.trade_price.toLocaleString('ko-KR'),
        change: (d.signed_change_rate * 100).toFixed(2),
        high: d.high_price.toLocaleString('ko-KR'),
        low:  d.low_price.toLocaleString('ko-KR'),
        volume: `${(d.acc_trade_price_24h / 1_000_000_000).toFixed(0)}억`,
        rawPrice: d.trade_price, rawHigh: d.high_price, rawLow: d.low_price,
        rawVolume: d.acc_trade_price_24h, avgVolume: 0,
        currency: 'KRW', source: 'Upbit 실시간',
      };
    } else {
      const symbol = STOCK_MAP[keyword] || STOCK_MAP[keyword.toUpperCase()];
      if (!symbol) return null;
      const res  = await fetchWithTimeout(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
      );
      const meta = (await res.json())?.chart?.result?.[0]?.meta;
      if (!meta?.regularMarketPrice) return null;
      const isKR  = symbol.endsWith('.KS') || symbol.endsWith('.KQ') || symbol.startsWith('^KS') || symbol.startsWith('^KQ');
      const price = meta.regularMarketPrice;
      const prev  = meta.previousClose || price;
      return {
        price: isKR ? Math.round(price).toLocaleString('ko-KR') : price.toLocaleString('en-US', { minimumFractionDigits: 2 }),
        change: ((price - prev) / (prev || 1) * 100).toFixed(2),
        high:   (meta.regularMarketDayHigh || price).toLocaleString(),
        low:    (meta.regularMarketDayLow  || price).toLocaleString(),
        volume: `${((meta.regularMarketVolume || 0) / 1_000_000).toFixed(1)}M`,
        rawPrice: price, rawHigh: meta.regularMarketDayHigh || price,
        rawLow: meta.regularMarketDayLow || price, rawVolume: meta.regularMarketVolume || 0,
        avgVolume: meta.averageDailyVolume3Month || 0,
        currency: isKR ? 'KRW' : 'USD', source: 'Yahoo Finance (15분 지연)',
      };
    }
  } catch { return null; }
};

// ─── 8. 키워드 추출 ──────────────────────────────────────
const extractKeyword = (messages: Array<{ role: string; content: string }>): string => {
  // ✅ 마지막 메시지에서만 추출 — 과거 컨텍스트 재사용 금지
  const lastMsg = messages.at(-1)?.content || "";
  for (const t in STOCK_MAP) { if (lastMsg.includes(t)) return t; }
  return '시장';
};

// ─── 9. 파싱 엔진 ─────────────────────────────────────────
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

  const jackRaw  = extract('JACK',  'LUCIA');
  const luciaRaw = extract('LUCIA', 'RAY');
  const rayRaw   = extract('RAY',   'ECHO');
  const echoRaw  = extract('ECHO',  null);

  // ✅ 잭 200자 강제 제한 — 루시아/레이 토큰 확보
  const truncate = (t: string, limit: number) => {
    if (t.length <= limit) return t;
    const cut = t.slice(0, limit);
    const last = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('다'), cut.lastIndexOf('요'));
    return last > limit * 0.6 ? cut.slice(0, last + 1) : cut + '...';
  };

  return {
    jack:  truncate(jackRaw, 200),
    lucia: luciaRaw,
    ray:   rayRaw,
    echo:  echoRaw,
  };
};

// ─── 10. 메인 핸들러 ─────────────────────────────────────
export async function POST(req: Request) {
  try {
    const { messages, positionContext } = await req.json();
    const lastMsg = messages.at(-1)?.content || "";
    const keyword = extractKeyword(messages);

    const [marketData, nasdaqData, news] = await Promise.all([
      fetchMarketPrice(keyword),
      fetchMarketPrice('나스닥').catch(() => null),
      fetchInvestmentNews(keyword).catch(() => []),
    ]);

    const sym = STOCK_MAP[keyword] || '';
    const assetType: AssetType =
      CRYPTO_KEYWORDS.has(keyword) ? 'CRYPTO' :
      (sym.endsWith('.KS') || sym.endsWith('.KQ') || sym.startsWith('^KS') || sym.startsWith('^KQ'))
        ? 'KOREAN_STOCK' : 'US_STOCK';

    const vol   = getVolumeInfo(marketData?.rawVolume || 0, marketData?.avgVolume || 0, assetType);
    const vix   = getVolatility(marketData?.rawPrice  || 0, marketData?.rawHigh   || 0, marketData?.rawLow || 0);
    const pos   = getPricePos(marketData?.rawPrice    || 0, marketData?.rawHigh   || 0, marketData?.rawLow || 0);
    const nData = getNewsData(news as Array<{ title: string; source?: string }>);

    const { total, verdict, confidence, breakdown } = calcScores({
      volScore: vol.score, change: marketData?.change || '0', newsAvg: nData.avgScore,
      posScore: pos.score, vitScore: vix.score,
      hasData: !!marketData, newsCount: news.length,
      volLabel: vol.label, posLabel: pos.label, vixLabel: vix.label, newsSentiment: nData.sentiment,
    });

    const positionSizing  = getPositionSizing(verdict, total);
    const dataSourceLabel = buildDataSourceLabel(assetType, marketData, news.length);
    const entryCondition  = buildEntryCondition(marketData, pos.ratio, vol.isHigh, verdict);

    // ✅ entryCondition에서 숫자만 안전하게 추출
    const { buy: buyPrice, sell: sellPrice } = extractConditionPrices(entryCondition);
    const condSummary = [buyPrice && `매수(${buyPrice})`, sellPrice && `손절(${sellPrice})`]
      .filter(Boolean).join(' / ') || '시장 상황 주시';

    // ✅ confidenceBasis — 데이터 품질 기반, 공백 방지
    const confidenceBasis = [
      marketData ? `시세(${marketData.source})` : null,
      news.length > 0 ? `뉴스 ${news.length}건(${nData.sentiment})` : null,
      vol.isHigh ? '거래량 신호' : null,
    ].filter(Boolean).join(' + ') || '데이터 제한적';

    const noDataNote = !marketData
      ? `\n[주의] ${keyword} 실시간 시세 미지원. 뉴스와 거시 데이터 기반으로만 분석하라.`
      : '';

    // ✅ 포지션 수익률 자동 계산
    let profitRateNote = '';
    if (positionContext && marketData) {
      const avgPriceMatch = positionContext.match(/평단가[:\s]+([\d,.]+)/);
      if (avgPriceMatch) {
        const avgPrice = parseFloat(avgPriceMatch[1].replace(/,/g, ''));
        if (avgPrice > 0) {
          const rate = ((marketData.rawPrice - avgPrice) / avgPrice * 100).toFixed(2);
          const sign = parseFloat(rate) >= 0 ? '+' : '';
          profitRateNote = `\n현재 수익률: ${sign}${rate}% (평단 ${fmtPrice(avgPrice, marketData.currency)} → 현재 ${marketData.price})`;
        }
      }
    }

    const positionNote = positionContext
      ? `\n[유저 포지션]\n${positionContext}${profitRateNote}\n→ 에코는 이 포지션 기준으로 손절/홀딩/추가매수 중 하나를 명확히 권고하라.`
      : '';

    const rawHistory = messages.slice(-7, -1)
      .filter((m: { role: string; content: string }) => m.role && m.content);
    const dedupedHistory = rawHistory.filter(
      (m: { role: string }, i: number, arr: Array<{ role: string }>) =>
        i === 0 || m.role !== arr[i - 1].role
    );

    // ✅ 관망 강제 규칙
    const watchConditionRule = verdict === '관망' ? `
[관망 강제 규칙 — 절대 위반 금지]
1. 숫자가 포함된 매수 조건 (구체적 가격 또는 %)
2. 숫자가 포함된 매도/손절 조건
3. 명확한 시간 조건 (3일 내, 이번 주 등)
절대 금지: "근접", "가능성", "검토", "추후", "상황 지켜보기"
` : '';

    const prompt = `
[절대 규칙]
1. 반드시 [JACK],[LUCIA],[RAY],[ECHO] 4개 태그 모두 출력.
2. 태그는 새 줄 맨 앞에 단독 위치.
3. 마크다운 완전 금지.
4. [LUCIA][RAY] 절대 생략 금지.
${watchConditionRule}${noDataNote}${positionNote}

[실시간 데이터]
- 분석 대상: ${keyword} | 가격: ${marketData?.price || '미지원'} (${safeNum(marketData?.change)}%)
- 나스닥: ${safeNum(nasdaqData?.change)}%
- 시장 신호: ${breakdown}
- 최신 뉴스:
${nData.context}

[퀀트 판단] 결론: ${verdict} | 신뢰도: ${confidence}% | 포지션: ${positionSizing}

[JACK] — 강세 근거만. 리스크 언급 금지. 반드시 2문장.
문장1: ${keyword} ${marketData?.price || '?'} 기준 상승 근거 1가지 + 수치.
문장2: 구체적 매수 액션 1가지.

[LUCIA] — 리스크만. 기회 언급 금지. 반드시 2문장.
문장1: "하지만 소장님, ~"으로 시작. 하락 리스크 1가지.
문장2: 손절 또는 회피 근거 1가지.

[RAY] — 숫자와 데이터만. 의견 금지. 반드시 2문장.
문장1: 긍정 지표 1가지 (수치 포함).
문장2: 부정 지표 1가지 (수치 포함).

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
          generationConfig: { maxOutputTokens: 4000, temperature: 0.4 },
          safetySettings: [
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          ],
        }),
      }
    );

    if (!res.ok) throw new Error(`Gemini API 오류: ${res.status}`);

    const aiText = (await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const p = parseChainedPersonas(aiText);

    // ✅ 파싱 실패 감지
    if (!p.jack || !p.lucia || !p.ray || !p.echo) {
      console.warn('⚠️ 파싱 실패:', { jack: !!p.jack, lucia: !!p.lucia, ray: !!p.ray, echo: !!p.echo });
      console.warn('원문 앞 300자:', aiText.slice(0, 300));
    }

    // ✅ 각 페르소나 fallback
    const jackFallback  = `${keyword} ${marketData?.price || ''} 기준, ${breakdown}. 현재 ${verdict} 구간 판단.`;
    const luciaFallback = `신뢰도 ${confidence}%(${confidenceBasis}) 수준. ${positionSizing} 기준으로 신중한 접근 권장.`;
    const rayFallback   = [
      `긍정: ${nData.sentiment === '긍정' ? '뉴스 긍정 흐름' : vol.isHigh ? '거래량 증가' : '저변동성 안정'} / ${vol.label}`,
      `부정: ${pos.ratio > 0.7 ? '고점 근접 추격 위험' : pos.ratio < 0.3 ? '저점 반등 불확실' : '추세 중립 방향성 미확인'}`,
    ].join('\n');

    // ✅ echo validation — 결론+비중 포함 여부 확인
    const isValidEcho = p.echo && p.echo.includes('결론:') && p.echo.includes('비중:');
    const echoContent = isValidEcho ? p.echo! : [
      `결론: ${verdict} (신뢰도 ${confidence}% — ${confidenceBasis} 기반)`,
      `근거: ${breakdown}`,
      `지금: ${entryCondition.split('\n')[0]?.split(':')[1]?.trim() || '시장 주시'}`,
      `조건: ${condSummary}`,
      `비중: ${positionSizing}`,
    ].join('\n');

    const echoWithMeta = `${echoContent}\n\n${dataSourceLabel}${DISCLAIMER}`;

    // ✅ 히스토리 저장 — raw_response + clean_response 포함
    void Promise.race([
      saveHistory({
        keyword,
        question:       lastMsg,
        verdict,
        totalScore:     total,
        assetType,
        entryCondition,
        priceAtTime:    marketData?.price || '미수급',
        confidence,
        rawResponse:    aiText,
      }),
      new Promise(r => setTimeout(r, 1000)),
    ]);

    console.log(
      `✅ ${keyword}(${assetType}) | ${verdict}(${total}점) | 신뢰도:${confidence}% | ` +
      `pos:${pos.ratio.toFixed(2)} vol:${vol.isHigh?'↑':'-'} | ` +
      `jack:${p.jack?'✅':'❌'} lucia:${p.lucia?'✅':'❌'} ` +
      `ray:${p.ray?'✅':'❌'} echo:${isValidEcho?'✅':'fallback'}`
    );

    return Response.json({
      reply: aiText + `\n\n${dataSourceLabel}` + DISCLAIMER,
      personas: {
        jack:  p.jack  || jackFallback,
        lucia: (p.lucia && p.lucia.length > 15) ? p.lucia : luciaFallback,
        ray:   (p.ray  && p.ray.length  > 15) ? p.ray  : rayFallback,
        echo:  echoWithMeta,
        verdict, confidence, breakdown, positionSizing,
      },
    });

  } catch (e) {
    console.error("❌ 사령부 에러:", e);
    return Response.json({ reply: "사령부 시스템 일시 지연. 잠시 후 재시도하십시오." });
  }
}
