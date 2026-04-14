export const CRYPTO_MAP: Record<string, string> = {
  '비트코인': 'KRW-BTC',
  'BTC': 'KRW-BTC',
  '이더리움': 'KRW-ETH',
  'ETH': 'KRW-ETH',
  '리플': 'KRW-XRP',
  'XRP': 'KRW-XRP',
  '솔라나': 'KRW-SOL',
  'SOL': 'KRW-SOL',
  '도지코인': 'KRW-DOGE',
  '도지': 'KRW-DOGE',
  'DOGE': 'KRW-DOGE',
  '에이다': 'KRW-ADA',
  'ADA': 'KRW-ADA',
  '바이낸스코인': 'KRW-BNB',
  '바이낸스': 'KRW-BNB',
  'BNB': 'KRW-BNB',
};

export const STOCK_MAP: Record<string, string> = {
  '나스닥': '^IXIC',
  'NASDAQ': '^IXIC',
  'S&P500': '^GSPC',
  'S&P': '^GSPC',
  'SP500': '^GSPC',
  '다우': '^DJI',
  '다우존스': '^DJI',
  '코스피': '^KS11',
  '코스닥': '^KQ11',

  '삼성전자': '005930.KS',
  'SK하이닉스': '000660.KS',
  'SK 하이닉스': '000660.KS',
  'SK이노베이션': '096770.KS',
  'SK에너지': '096770.KS',
  'SK이노': '096770.KS',
  '현대차': '005380.KS',
  '현대자동차': '005380.KS',
  '기아': '000270.KS',
  '기아차': '000270.KS',
  '네이버': '035420.KS',
  'NAVER': '035420.KS',
  '카카오': '035720.KS',
  'LG에너지솔루션': '373220.KS',
  'LG에너지': '373220.KS',
  '포스코홀딩스': '005490.KS',
  'POSCO': '005490.KS',
  '셀트리온': '068270.KS',
  '에코프로': '086520.KQ',
  '알테오젠': '196170.KQ',
  '에쓰오일': '010950.KS',
  'S-Oil': '010950.KS',
  'S오일': '010950.KS',
  '삼바': '207940.KS',
  '삼성바이오': '207940.KS',
  '마소': 'MSFT',

  '엔비디아': 'NVDA',
  'NVDA': 'NVDA',
  '테슬라': 'TSLA',
  'TSLA': 'TSLA',
  '애플': 'AAPL',
  'AAPL': 'AAPL',
  '마이크로소프트': 'MSFT',
  'MSFT': 'MSFT',
  '구글': 'GOOGL',
  '알파벳': 'GOOGL',
  'GOOGL': 'GOOGL',
  '아마존': 'AMZN',
  'AMZN': 'AMZN',
  '메타': 'META',
  '페이스북': 'META',
  'META': 'META',
  '넷플릭스': 'NFLX',
  'NFLX': 'NFLX',
};

export const KEYWORD_PRIORITY: string[] = [
  '비트코인', 'BTC', '이더리움', 'ETH', '리플', 'XRP', '솔라나', 'SOL',
  '도지코인', '도지', 'DOGE', '에이다', 'ADA', '바이낸스코인', '바이낸스', 'BNB',
  'SK하이닉스', 'SK 하이닉스', 'SK이노베이션', 'SK에너지', 'SK이노',
  '삼성전자', '삼바', '삼성바이오',
  '현대자동차', '현대차', '기아차', '기아',
  'LG에너지솔루션', 'LG에너지', '네이버', 'NAVER', '카카오',
  '포스코홀딩스', 'POSCO', '셀트리온', '에코프로', '알테오젠',
  '에쓰오일', 'S-Oil', 'S오일',
  '마소', '마이크로소프트', 'MSFT',
  '엔비디아', 'NVDA', '테슬라', 'TSLA', '애플', 'AAPL',
  '구글', '알파벳', 'GOOGL', '아마존', 'AMZN', '메타', '페이스북', 'META', '넷플릭스', 'NFLX',
  '코스피', '코스닥', '나스닥', 'NASDAQ', 'S&P500', 'SP500', 'S&P', '다우존스', '다우',
];

const normalizeText = (text: string) => text.replace(/\s+/g, ' ').trim();

export const detectKeyword = (
  input: string | Array<{ role: string; content: string }>,
): string | null => {
  const text = Array.isArray(input) ? input.map(m => m.content).join(' ') : input;
  const normalized = normalizeText(text);
  const compact = normalized.replace(/\s+/g, '');
  const searchPool = `${normalized} ${compact}`;

  for (const keyword of KEYWORD_PRIORITY) {
    const kwCompact = keyword.replace(/\s+/g, '');
    if (searchPool.includes(keyword) || searchPool.includes(kwCompact)) return keyword;
  }

  return null;
};

export const inferCurrency = (keyword: string): 'KRW' | 'USD' => {
  const k = keyword.trim();
  if (CRYPTO_MAP[k] || CRYPTO_MAP[k.toUpperCase()]) return 'KRW';
  const sym = STOCK_MAP[k] || STOCK_MAP[k.toUpperCase()];
  if (!sym) return 'USD';
  if (sym.endsWith('.KS') || sym.endsWith('.KQ') || sym.startsWith('^KS') || sym.startsWith('^KQ')) return 'KRW';
  if (['^IXIC', '^GSPC', '^DJI'].includes(sym)) return 'USD';
  return 'USD';
};