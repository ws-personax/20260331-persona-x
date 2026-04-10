// app/api/keywords/route.ts
// ChatWindow가 이 API를 호출해서 종목 목록을 자동으로 가져옵니다.
// 이제 종목 추가는 route.ts 의 STOCK_MAP 한 곳만 수정하면 됩니다.

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

export async function GET() {
  const keywords = Object.keys(STOCK_MAP);
  return Response.json({ keywords });
}
