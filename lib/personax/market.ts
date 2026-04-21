import type { MarketData } from './types';

// ✅ MarketData에 trend 필드 보강 (types.ts와 병행)
declare module './types' {
  interface MarketData {
    trend?: TrendData;
  }
}

export const CRYPTO_MAP: Record<string, string> = {
  '비트코인': 'KRW-BTC', 'BTC':  'KRW-BTC',
  '이더리움': 'KRW-ETH', 'ETH':  'KRW-ETH',
  '리플':     'KRW-XRP', 'XRP':  'KRW-XRP',
  '솔라나':   'KRW-SOL', 'SOL':  'KRW-SOL',
  '도지':    'KRW-DOGE', 'DOGE': 'KRW-DOGE',
  '에이다':   'KRW-ADA', 'ADA':  'KRW-ADA',
  '바이낸스': 'KRW-BNB', 'BNB':  'KRW-BNB',
};

export const STOCK_MAP: Record<string, string> = {
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
  '브로드컴': 'AVGO', 'AVGO': 'AVGO', 'Broadcom': 'AVGO',
  '팔란티어': 'PLTR', 'PLTR': 'PLTR',
  '인텔': 'INTC', 'INTC': 'INTC',
  'AMD': 'AMD',
  '오라클': 'ORCL', 'ORCL': 'ORCL',
  '삼성전자': '005930.KS',
  'LG전자': '066570.KS', '엘지전자': '066570.KS',
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
  // ✅ 코스피 ETF
  'KODEX 200': '069500.KS', 'KODEX200': '069500.KS', '코덱스200': '069500.KS',
  'KODEX 레버리지': '122630.KS', 'KODEX레버리지': '122630.KS', '코덱스 레버리지': '122630.KS',
  // ✅ 추가 미국 종목
  '엑손모빌': 'XOM', '엑손모바일': 'XOM', '엑손': 'XOM', 'XOM': 'XOM',
  '존슨앤존슨': 'JNJ', 'JNJ': 'JNJ',
  '비자': 'V', 'VISA': 'V', 'V': 'V',
  '마스터카드': 'MA', 'MA': 'MA',
  '코카콜라': 'KO', 'KO': 'KO',
  '맥도날드': 'MCD', 'MCD': 'MCD',
  '나이키': 'NKE', 'NKE': 'NKE',
  '버크셔해서웨이': 'BRK-B', 'BRK': 'BRK-B',
  '뱅크오브아메리카': 'BAC', 'BAC': 'BAC',
  'JP모건': 'JPM', 'JPM': 'JPM',
  '골드만삭스': 'GS', 'GS': 'GS',
  '화이자': 'PFE', 'PFE': 'PFE',
  '모더나': 'MRNA', 'MRNA': 'MRNA',
  '스타벅스': 'SBUX', 'SBUX': 'SBUX',
  '월마트': 'WMT', 'WMT': 'WMT',
  '쿠팡': 'CPNG', 'CPNG': 'CPNG',
  '우버': 'UBER', 'UBER': 'UBER',
  '에어비앤비': 'ABNB', 'ABNB': 'ABNB',
  '스냅': 'SNAP', 'SNAP': 'SNAP',
  '트위터': 'X', '엑스': 'X',
  '코인베이스': 'COIN', 'COIN': 'COIN',
  '로블록스': 'RBLX', 'RBLX': 'RBLX',
  '리비안': 'RIVN', 'RIVN': 'RIVN',
  '루시드': 'LCID', 'LCID': 'LCID',
};

export const KEYWORD_PRIORITY: string[] = [
  '비트코인', 'BTC', '이더리움', 'ETH', '리플', 'XRP',
  '솔라나', 'SOL', '도지', 'DOGE', '에이다', 'ADA', '바이낸스', 'BNB',
  'SK이노베이션', 'SK에너지', 'SK이노', 'SK하이닉스', 'SK 하이닉스',
  'LG에너지솔루션', 'LG에너지', 'LG화학',
  'LG전자', '엘지전자',
  '삼성바이오', '삼바', '삼성전자',
  '현대자동차', '현대모비스', '현대차',
  '신한지주', '신한', 'KB금융', 'KB',
  '에쓰오일', 'S-Oil', 'S오일',
  '카카오', '네이버', 'NAVER', '기아차', '기아',
  'POSCO', '포스코', '셀트리온', '에코프로', '알테오젠',
  '엔비디아', 'NVDA', '테슬라', 'TSLA', '애플', 'AAPL',
  '마이크로소프트', '마소', 'MSFT',
  '브로드컴', 'AVGO', 'Broadcom',
  '팔란티어', 'PLTR', '인텔', 'INTC', 'AMD',
  '오라클', 'ORCL',
  '알파벳', '구글', 'GOOGL', '아마존', 'AMZN',
  '페이스북', '메타', 'META', '넷플릭스', 'NFLX',
  '한국 증시', '한국증시', '코스피', '코스닥',
  'S&P500', 'SP500', 'S&P', '다우존스', '다우', '나스닥', 'NASDAQ',
  // ✅ 추가 미국 종목
  '엑손모빌', '엑손모바일', '엑손', 'XOM',
  '존슨앤존슨', 'JNJ', '비자', 'VISA', '마스터카드', 'MA',
  '코카콜라', 'KO', '맥도날드', 'MCD', '나이키', 'NKE',
  'JP모건', 'JPM', '골드만삭스', 'GS', '뱅크오브아메리카', 'BAC',
  '화이자', 'PFE', '모더나', 'MRNA',
  '스타벅스', 'SBUX', '월마트', 'WMT',
  '쿠팡', 'CPNG', '우버', 'UBER', '에어비앤비', 'ABNB',
  '코인베이스', 'COIN', '리비안', 'RIVN',
];

export const MARKET_KEYWORD_MAP: Array<{ patterns: string[]; keyword: string }> = [
  {
    patterns: ['미국 시장', '미국시장', '미국 증시', '미국증시', '뉴욕 증시', '뉴욕증시',
               '월스트리트', '미장', '미국 주식 시장', '미국주식시장', '미국 주식 상황',
               '미국주식상황', '미국장', '미증시'],
    keyword: '나스닥'
  },
  {
    patterns: ['한국 시장', '한국시장', '한국 증시', '한국증시', '국내 시장', '국내시장',
               '코스피 시장', '한국 주식 시장', '한국 주식 상황', '한국주식상황',
               '국내 증시', '국내증시'],
    keyword: '코스피'
  },
];

// ─────────────────────────────────────────────
// ✅ 추세별 추천 종목 매트릭스
// ─────────────────────────────────────────────
export const TREND_PICKS = {
  // 한국 주식
  KOREAN_UP:     { sector: 'IT·반도체·자동차 (상승 추세 수혜 섹터)', stocks: ['삼성전자', 'SK하이닉스', '현대차'] },
  KOREAN_DOWN:   { sector: '바이오·인터넷·2차전지 (역발상 관심 섹터)', stocks: ['셀트리온', '카카오', '에코프로'] },
  KOREAN_NEUTRAL:{ sector: '금융·에너지·통신 (방어주 섹터)', stocks: ['KB금융', '신한지주', 'S오일'] },

  // 미국 주식
  US_UP:         { sector: 'AI·반도체·빅테크 (모멘텀 상위 섹터)', stocks: ['엔비디아', '애플', '브로드컴'] },
  US_DOWN:       { sector: '빅테크·소비재 (저점 관심 섹터)', stocks: ['구글', '아마존', '마이크로소프트'] },
  US_NEUTRAL:    { sector: '배당·금융·헬스케어 (방어주 섹터)', stocks: ['JP모건', '존슨앤존슨', '코카콜라'] },

  // 크립토
  CRYPTO_UP:     { sector: '대형 코인 (비트코인 강세 동조)', stocks: ['비트코인', '이더리움', '솔라나'] },
  CRYPTO_DOWN:   { sector: '안전자산 코인 (하락장 방어)', stocks: ['비트코인', '리플', '에이다'] },
  CRYPTO_NEUTRAL:{ sector: '대형 코인 (방향성 탐색 중)', stocks: ['비트코인', '이더리움', '리플'] },
};

// 추천 질문 감지 키워드
export const RECOMMEND_PATTERNS = [
  '추천', '좋은 종목', '상승률', '주목할', '어떤 종목',
  '뭐가 좋', '뭘 사', '사야 할', '투자할 만한', '유망한',
];

// 자산군 감지
export const detectAssetClass = (msg: string): 'korean' | 'us' | 'crypto' | null => {
  const m = msg.toLowerCase();
  if (/(한국|국내|코스피|코스닥|삼성|현대|sk|lg)/.test(m)) return 'korean';
  if (/(미국|나스닥|뉴욕|s&p|달러|테슬라|애플|구글|엔비디아)/.test(m)) return 'us';
  if (/(코인|크립토|비트|이더|crypto|bitcoin|btc|eth)/.test(m)) return 'crypto';
  return null;
};

export const inferCurrency = (keyword: string): 'KRW' | 'USD' => {
  if (CRYPTO_MAP[keyword] || CRYPTO_MAP[keyword.toUpperCase()]) return 'KRW';
  const sym = STOCK_MAP[keyword] || STOCK_MAP[keyword.toUpperCase()] || '';
  if (sym.endsWith('.KS') || sym.endsWith('.KQ') || sym.startsWith('^KS') || sym.startsWith('^KQ')) return 'KRW';
  return 'USD';
};

export const extractKeyword = (messages: Array<{ role: string; content: string }>): string => {
  const raw = (messages.at(-1)?.content || "").toLowerCase();
  // ✅ 공백 정규화 — "엘지 전자" → "엘지전자", "SK 하이닉스" → 이미 맵에 있음
  const lastMsg = raw;
  const compactMsg = raw.replace(/\s+/g, ''); // 공백 제거 버전

  for (const t of KEYWORD_PRIORITY) {
    const tLower = t.toLowerCase();
    const tCompact = tLower.replace(/\s+/g, '');
    if (lastMsg.includes(tLower) || compactMsg.includes(tCompact)) return t;
  }
  for (const { patterns, keyword } of MARKET_KEYWORD_MAP) {
    if (patterns.some(p => {
      const pLower = p.toLowerCase();
      const pCompact = pLower.replace(/\s+/g, '');
      return lastMsg.includes(pLower) || compactMsg.includes(pCompact);
    })) return keyword;
  }
  return '시장';
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

const fetchYahooChart = async (symbol: string, range: '1d' | '5d') => {
  const res = await fetchWithTimeout(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`
  );
  if (!res.ok) return null;
  const json = await res.json();
  if (json?.chart?.error) { console.warn('⚠️ Yahoo API error:', json.chart.error); return null; }
  return json?.chart?.result?.[0] || null;
};

// ✅ 추세 계산 — 종가 배열에서 이동평균 및 추세 방향 계산
export interface TrendData {
  ma5: number | null;    // 5일 이동평균
  ma20: number | null;   // 20일 이동평균
  trend5d: '상승' | '하락' | '횡보';  // 5일 추세
  trend20d: '상승' | '하락' | '횡보'; // 20일 추세
  trendContext: string;  // 페르소나용 맥락 문장
  consecutiveDays: number; // 연속 상승/하락 일수 (양수=상승, 음수=하락)
}

const calcTrend = (closes: number[]): TrendData => {
  const valid = closes.filter(v => typeof v === 'number' && Number.isFinite(v) && v > 0);
  if (valid.length < 3) return {
    ma5: null, ma20: null,
    trend5d: '횡보', trend20d: '횡보',
    trendContext: '', consecutiveDays: 0,
  };

  // 이동평균 계산
  const ma5 = valid.length >= 5
    ? valid.slice(-5).reduce((a, b) => a + b, 0) / 5
    : valid.reduce((a, b) => a + b, 0) / valid.length;

  const ma20 = valid.length >= 20
    ? valid.slice(-20).reduce((a, b) => a + b, 0) / 20
    : valid.reduce((a, b) => a + b, 0) / valid.length;

  // 5일 추세: 최근 5일 첫날 대비 마지막날
  const last5 = valid.slice(-5);
  const change5 = last5.length >= 2
    ? ((last5[last5.length - 1] - last5[0]) / last5[0]) * 100
    : 0;
  const trend5d = change5 > 1 ? '상승' : change5 < -1 ? '하락' : '횡보';

  // 20일 추세
  const last20 = valid.slice(-20);
  const change20 = last20.length >= 2
    ? ((last20[last20.length - 1] - last20[0]) / last20[0]) * 100
    : 0;
  const trend20d = change20 > 2 ? '상승' : change20 < -2 ? '하락' : '횡보';

  // 연속 상승/하락 일수 계산
  let consecutiveDays = 0;
  for (let i = valid.length - 1; i > 0; i--) {
    if (valid[i] > valid[i - 1]) {
      if (consecutiveDays >= 0) consecutiveDays++;
      else break;
    } else if (valid[i] < valid[i - 1]) {
      if (consecutiveDays <= 0) consecutiveDays--;
      else break;
    } else break;
  }

  // 페르소나용 맥락 문장 생성
  let trendContext = '';
  const currentPrice = valid[valid.length - 1];
  const aboveMa5 = currentPrice > ma5;
  const aboveMa20 = currentPrice > ma20;

  if (trend5d === '상승' && trend20d === '상승' && aboveMa5 && aboveMa20) {
    trendContext = consecutiveDays >= 5
      ? `${consecutiveDays}거래일 연속 상승 — 5일·20일 이평선 모두 상향 돌파한 강한 상승 추세`
      : `5일·20일 이평선 위에서 상승 추세 — 단기·중기 모두 강세`;
  } else if (trend5d === '상승' && !aboveMa20) {
    trendContext = `5일 기준 반등 중이나 20일 이평선(${Math.round(ma20).toLocaleString()}) 아래 — 단기 반등이나 중기 추세는 미확인`;
  } else if (trend5d === '하락' && trend20d === '하락') {
    trendContext = consecutiveDays <= -3
      ? `${Math.abs(consecutiveDays)}거래일 연속 하락 — 5일·20일 이평선 모두 하향 이탈한 하락 추세`
      : `5일·20일 이평선 아래 하락 추세 — 단기·중기 모두 약세`;
  } else if (trend5d === '하락' && aboveMa20) {
    trendContext = `단기(5일) 조정 중이나 20일 이평선 위 — 중기 상승 추세 내 일시적 눌림 가능성`;
  } else if (trend5d === '횡보' && aboveMa5 && aboveMa20) {
    trendContext = `5일·20일 이평선 위에서 횡보 — 추세 유지 중, 방향성 탐색 구간`;
  } else {
    trendContext = `5일 이평선 ${aboveMa5 ? '위' : '아래'}, 20일 이평선 ${aboveMa20 ? '위' : '아래'} — 방향성 불명확`;
  }

  return { ma5, ma20, trend5d, trend20d, trendContext, consecutiveDays };
};

export const fetchMarketPrice = async (keyword: string): Promise<MarketData | null> => {
  try {
    const cryptoTicker = CRYPTO_MAP[keyword] || CRYPTO_MAP[keyword.toUpperCase()];
    if (cryptoTicker) {
      const res = await fetchWithTimeout(`https://api.upbit.com/v1/ticker?markets=${cryptoTicker}`, 5000);
      if (!res.ok) return null;
      const json = await res.json();
      if (!Array.isArray(json) || !json[0]) return null;
      const d = json[0];
      // ✅ 크립토 5일 추세 — Upbit 일봉 API (타임아웃 2초, 실패 시 기본값)
      let cryptoTrend: TrendData = { ma5: null, ma20: null, trend5d: '횡보', trend20d: '횡보', trendContext: '', consecutiveDays: 0 };
      try {
        const candleRes = await fetchWithTimeout(
          `https://api.upbit.com/v1/candles/days?market=${cryptoTicker}&count=20`,
          2000  // ✅ 타임아웃 2초로 단축 — 실패해도 전체 응답 지연 방지
        );
        if (candleRes.ok) {
          const candles = await candleRes.json();
          if (Array.isArray(candles) && candles.length > 0) {
            const closes = candles
              .map((c: { trade_price: number }) => c.trade_price)
              .filter((v: number) => Number.isFinite(v) && v > 0)
              .reverse();
            cryptoTrend = calcTrend(closes);
          }
        }
      } catch (e) {
        console.warn('⚠️ Upbit 일봉 API 실패 (기본값 사용):', e instanceof Error ? e.message : '');
        // 기본값 유지 — 서비스 중단 없음
      }

      return {
        price: d.trade_price.toLocaleString('ko-KR'), change: (d.signed_change_rate * 100).toFixed(2),
        high: d.high_price.toLocaleString('ko-KR'), low: d.low_price.toLocaleString('ko-KR'),
        volume: `${(d.acc_trade_price_24h / 1_000_000_000).toFixed(0)}억`,
        rawPrice: d.trade_price, rawHigh: d.high_price, rawLow: d.low_price,
        rawVolume: d.acc_trade_price_24h, avgVolume: 0,
        currency: 'KRW', source: 'Upbit 실시간', marketState: 'REGULAR',
        trend: cryptoTrend,
      };
    }

    const symbol = STOCK_MAP[keyword] || STOCK_MAP[keyword.toUpperCase()];
    if (!symbol) return null;

    // ✅ 1mo 제거 — 5d만으로 추세 계산 (응답 속도 개선)
    const [result1d, result5d] = await Promise.all([
      fetchYahooChart(symbol, '1d'),
      fetchYahooChart(symbol, '5d'),
    ]);
    const result1mo = null; // 더 이상 사용 안 함
    if (!result1d) return null;
    const meta = result1d.meta;
    // ✅ 장 개장 전 fallback: regularMarketPrice 없으면 previousClose 사용
    const isKR = symbol.endsWith('.KS') || symbol.endsWith('.KQ') || symbol.startsWith('^KS') || symbol.startsWith('^KQ');
    const marketState = String(meta.marketState || 'UNKNOWN').toUpperCase();
    const fallbackPrice = meta.previousClose || meta.regularMarketPreviousClose || meta.chartPreviousClose || 0;
    const rawMarketPrice = meta.regularMarketPrice || (isKR && fallbackPrice > 0 ? fallbackPrice : null);
    if (!rawMarketPrice) return null;
    const price = rawMarketPrice;

    let change = 0;
    if (typeof meta.regularMarketChangePercent === 'number' && Number.isFinite(meta.regularMarketChangePercent)) {
      change = meta.regularMarketChangePercent;
    } else {
      const prev = meta.previousClose || meta.regularMarketPreviousClose || price;
      change = ((price - prev) / (prev || 1)) * 100;
    }

    if (!isKR && marketState !== 'REGULAR' && result5d) {
      const closes = result5d.indicators?.quote?.[0]?.close || [];
      const validCloses = closes.filter((v: unknown): v is number => typeof v === 'number' && Number.isFinite(v));
      if (validCloses.length >= 2) {
        const lastClose = validCloses[validCloses.length - 1];
        const prevClose = validCloses[validCloses.length - 2];
        if (prevClose) change = ((lastClose - prevClose) / prevClose) * 100;
      }
    }

    let high = meta.regularMarketDayHigh || 0;
    let low  = meta.regularMarketDayLow  || 0;
    if ((!high || !low || high === low) && result5d) {
      const highs  = result5d.indicators?.quote?.[0]?.high  || [];
      const lows   = result5d.indicators?.quote?.[0]?.low   || [];
      const validH = highs.filter((v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
      const validL = lows.filter((v: unknown):  v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
      if (validH.length && validL.length) {
        high = validH[validH.length - 1];
        low  = validL[validL.length - 1];
      }
    }
    if (!high) high = price;
    if (!low)  low  = price;

    // ✅ 추세 계산 — 5d 데이터로 간이 계산 (1mo 제거로 속도 개선)
    const allCloses: number[] = [];
    if (result5d) {
      const d5Closes = result5d.indicators?.quote?.[0]?.close || [];
      allCloses.push(...d5Closes.filter((v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0));
    }
    const trend = calcTrend(allCloses);

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
        ? (meta.regularMarketPrice ? '한국장 (15분 지연)' : '한국장 전일 종가 기준')
        : marketState === 'REGULAR' ? '미국장 실시간' : '미국장 전일 종가 기준',
      // ✅ 추세 데이터
      trend,
    };
  } catch (e) {
    console.error('❌ fetchMarketPrice 오류:', e instanceof Error ? e.message : '');
    return null;
  }
};
