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
  // 미국 지수
  '나스닥': '^IXIC',
  'NASDAQ': '^IXIC',
  'S&P500': '^GSPC',
  'S&P': '^GSPC',
  'SP500': '^GSPC',
  '다우': '^DJI',
  '다우존스': '^DJI',
  // 한국 지수
  '코스피': '^KS11',
  '코스닥': '^KQ11',
  '한국 증시': '^KS11',
  '한국증시': '^KS11',
  '한국 주식': '^KS11',
  '한국주식': '^KS11',
  '한국 주식 시장': '^KS11',
  '한국주식시장': '^KS11',
  '코스피 지수': '^KS11',
  // 한국 종목
  '삼성전자': '005930.KS',
  'SK하이닉스': '000660.KS',
  'SK 하이닉스': '000660.KS',
  'SK이노베이션': '096770.KS',
  'SK에너지': '096770.KS',
  'SK이노': '096770.KS',
  '현대차': '005380.KS',
  '현대자동차': '005380.KS',
  '현대모비스': '012330.KS',
  '기아': '000270.KS',
  '기아차': '000270.KS',
  '네이버': '035420.KS',
  'NAVER': '035420.KS',
  '카카오': '035720.KS',
  'LG에너지솔루션': '373220.KS',
  'LG에너지': '373220.KS',
  'LG화학': '051910.KS',
  '포스코홀딩스': '005490.KS',
  'POSCO': '005490.KS',
  '포스코': '005490.KS',
  '셀트리온': '068270.KS',
  '에코프로': '086520.KQ',
  '알테오젠': '196170.KQ',
  '에쓰오일': '010950.KS',
  'S-Oil': '010950.KS',
  'S오일': '010950.KS',
  '삼바': '207940.KS',
  '삼성바이오': '207940.KS',
  'KB금융': '105560.KS',
  'KB': '105560.KS',
  '신한지주': '055550.KS',
  '신한': '055550.KS',
  // 미국 종목
  '엔비디아': 'NVDA',
  'NVDA': 'NVDA',
  '테슬라': 'TSLA',
  'TSLA': 'TSLA',
  '애플': 'AAPL',
  'AAPL': 'AAPL',
  '마이크로소프트': 'MSFT',
  'MSFT': 'MSFT',
  '마소': 'MSFT',
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
  // 코인
  '비트코인', 'BTC', '이더리움', 'ETH', '리플', 'XRP', '솔라나', 'SOL',
  '도지코인', '도지', 'DOGE', '에이다', 'ADA', '바이낸스코인', '바이낸스', 'BNB',
  // 한국 종목 (긴 이름 먼저)
  'SK이노베이션', 'SK에너지', 'SK이노', 'SK하이닉스', 'SK 하이닉스',
  'LG에너지솔루션', 'LG에너지', 'LG화학',
  '삼성바이오', '삼바', '삼성전자',
  '현대자동차', '현대모비스', '현대차',
  '신한지주', '신한', 'KB금융', 'KB',
  '에쓰오일', 'S-Oil', 'S오일',
  '포스코홀딩스', 'POSCO', '포스코',
  '카카오', '네이버', 'NAVER',
  '기아차', '기아',
  '셀트리온', '에코프로', '알테오젠',
  // 미국 종목
  '마이크로소프트', '마소', 'MSFT',
  '엔비디아', 'NVDA',
  '테슬라', 'TSLA',
  '애플', 'AAPL',
  '알파벳', '구글', 'GOOGL',
  '아마존', 'AMZN',
  '페이스북', '메타', 'META',
  '넷플릭스', 'NFLX',
  // 지수
  '한국 주식 시장', '한국주식시장', '한국 주식', '한국주식', '코스피 지수',
  '한국 증시', '한국증시', '코스피', '코스닥',
  'S&P500', 'SP500', 'S&P', '다우존스', '다우', '나스닥', 'NASDAQ',
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
  const sym = STOCK_MAP[k] || STOCK_MAP[k.toUpperCase()] || '';
  if (!sym) return 'USD';
  if (
    sym.endsWith('.KS') || sym.endsWith('.KQ') ||
    sym.startsWith('^KS') || sym.startsWith('^KQ')
  ) return 'KRW';
  return 'USD';
};
