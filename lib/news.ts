// lib/news.ts
import { API_TIMEOUT_MS } from '@/lib/constants';

export interface NewsItem {
  title: string;
  source: string;
  link: string;
  date: string;
  snippet: string;
}

// ✅ 뉴스 관련도 필터 — 종목별 관련 키워드 맵
//    Naver 뉴스는 date 정렬 시 관련도가 떨어지는 기사가 섞이므로
//    title에 종목명/별칭/핵심 연관어가 없으면 제외한다.
const NEWS_KEYWORD_ALIASES: Record<string, string[]> = {
  // ─── 한국 주식 ───
  '삼성전자': ['삼성전자', '삼성', '삼전', '갤럭시', '반도체', 'HBM'],
  'LG전자':   ['LG전자', '엘지전자', 'LG'],
  '엘지전자': ['LG전자', '엘지전자', 'LG'],
  'SK하이닉스': ['SK하이닉스', 'SK 하이닉스', '하이닉스', '하닉', 'SK하이', 'HBM'],
  'SK 하이닉스': ['SK하이닉스', 'SK 하이닉스', '하이닉스', '하닉'],
  'KT&G':       ['KT&G', '케이티앤지', '담배', '전자담배'],
  '케이티앤지':  ['KT&G', '케이티앤지', '담배'],
  '현대차':     ['현대차', '현대자동차', '현대모터스', '정의선'],
  '현대자동차': ['현대차', '현대자동차', '현대모터스'],
  '기아':       ['기아', '기아차', '기아자동차'],
  '기아차':     ['기아', '기아차', '기아자동차'],
  '카카오':     ['카카오', '카톡', 'Kakao'],
  '네이버':     ['네이버', 'NAVER', 'Naver'],
  'NAVER':      ['네이버', 'NAVER', 'Naver'],
  '셀트리온':   ['셀트리온'],
  '삼성바이오': ['삼성바이오', '삼바', '삼성바이오로직스'],
  '삼바':       ['삼성바이오', '삼바', '삼성바이오로직스'],
  'LG에너지솔루션': ['LG에너지', '엘지에너지', 'LG에너지솔루션', '배터리'],
  'LG에너지':    ['LG에너지', '엘지에너지', '배터리'],
  'POSCO':       ['POSCO', '포스코'],
  '포스코':      ['POSCO', '포스코'],
  'KB금융':      ['KB금융', 'KB', '국민은행'],
  'KB':          ['KB금융', 'KB'],
  '신한지주':    ['신한지주', '신한', '신한은행', '신한금융'],
  '신한':        ['신한지주', '신한', '신한금융'],
  '에코프로':    ['에코프로'],
  '알테오젠':    ['알테오젠'],
  'SK이노베이션': ['SK이노', 'SK이노베이션', '에쓰케이이노'],
  'SK이노':       ['SK이노', 'SK이노베이션'],
  'S-Oil':  ['S-Oil', 'S오일', '에쓰오일'],
  'S오일':  ['S-Oil', 'S오일', '에쓰오일'],
  '에쓰오일': ['S-Oil', 'S오일', '에쓰오일'],
  'LG화학':   ['LG화학', '엘지화학'],
  '현대모비스': ['현대모비스', '모비스'],

  // ─── 미국 주식 ───
  '테슬라':  ['테슬라', 'Tesla', 'TSLA', '머스크', 'Musk'],
  'TSLA':    ['테슬라', 'Tesla', 'TSLA', '머스크'],
  '엔비디아': ['엔비디아', 'NVIDIA', 'Nvidia', 'NVDA', '젠슨황', 'Jensen'],
  'NVDA':    ['엔비디아', 'NVIDIA', 'NVDA', '젠슨황'],
  '애플':    ['애플', 'Apple', 'AAPL', '아이폰', 'iPhone'],
  'AAPL':    ['애플', 'Apple', 'AAPL', '아이폰'],
  '마이크로소프트': ['마이크로소프트', 'Microsoft', 'MSFT', 'MS'],
  '마소':    ['마이크로소프트', 'Microsoft', 'MSFT', 'MS'],
  'MSFT':    ['마이크로소프트', 'Microsoft', 'MSFT'],
  '구글':    ['구글', 'Google', 'GOOGL', '알파벳', 'Alphabet'],
  '알파벳':  ['구글', 'Google', 'GOOGL', '알파벳'],
  'GOOGL':   ['구글', 'Google', 'GOOGL', '알파벳'],
  '아마존':  ['아마존', 'Amazon', 'AMZN'],
  'AMZN':    ['아마존', 'Amazon', 'AMZN'],
  '메타':    ['메타', 'Meta', 'META', '페이스북', 'Facebook'],
  '페이스북': ['메타', 'Meta', '페이스북'],
  'META':    ['메타', 'Meta', 'META', '페이스북'],
  '넷플릭스': ['넷플릭스', 'Netflix', 'NFLX'],
  'NFLX':    ['넷플릭스', 'Netflix', 'NFLX'],
  '브로드컴': ['브로드컴', 'Broadcom', 'AVGO'],
  'AVGO':    ['브로드컴', 'Broadcom', 'AVGO'],
  'Broadcom': ['브로드컴', 'Broadcom'],
  '팔란티어': ['팔란티어', 'Palantir', 'PLTR'],
  'PLTR':    ['팔란티어', 'Palantir', 'PLTR'],
  '인텔':    ['인텔', 'Intel', 'INTC'],
  'INTC':    ['인텔', 'Intel'],
  'AMD':     ['AMD', '라이젠', 'Ryzen'],
  '오라클':  ['오라클', 'Oracle', 'ORCL'],
  'ORCL':    ['오라클', 'Oracle'],

  // ─── 크립토 ───
  '비트코인': ['비트코인', 'BTC', 'Bitcoin'],
  'BTC':     ['비트코인', 'BTC', 'Bitcoin'],
  '이더리움': ['이더리움', 'ETH', 'Ethereum'],
  'ETH':     ['이더리움', 'ETH', 'Ethereum'],
  '리플':    ['리플', 'XRP', 'Ripple'],
  'XRP':     ['리플', 'XRP', 'Ripple'],
  '솔라나':  ['솔라나', 'SOL', 'Solana'],
  'SOL':     ['솔라나', 'SOL', 'Solana'],
  '도지':    ['도지', 'DOGE', 'Dogecoin'],
  'DOGE':    ['도지', 'DOGE', 'Dogecoin'],
  '에이다':  ['에이다', 'ADA', 'Cardano'],
  'ADA':     ['에이다', 'ADA', 'Cardano'],
  '바이낸스': ['바이낸스', 'BNB', 'Binance'],
  'BNB':     ['바이낸스', 'BNB', 'Binance'],

  // ─── 지수 / 시장 (완화 — 매크로 키워드 허용) ───
  '나스닥':    ['나스닥', 'NASDAQ', 'AI', '반도체', '빅테크', '연준', 'FOMC', '금리', '미 증시', '미국 증시'],
  'NASDAQ':    ['나스닥', 'NASDAQ'],
  '코스피':    ['코스피', 'KOSPI', '증시', '증권', '주식', '환율', '외국인', '개인', '기관'],
  '코스닥':    ['코스닥', 'KOSDAQ', '증시', '중소형주'],
  'S&P500':    ['S&P', 'SP500', 'S&P500', '미국 증시', '미 증시', '연준', 'FOMC'],
  'S&P':       ['S&P', 'SP500', '미국 증시'],
  'SP500':     ['S&P', 'SP500', '미국 증시'],
  '다우':      ['다우', 'DJIA', '미국 증시'],
  '다우존스':  ['다우', '다우존스', 'DJIA'],
  '한국 증시': ['코스피', 'KOSPI', '증시', '증권', '환율', '외국인'],
  '한국증시':  ['코스피', 'KOSPI', '증시', '증권', '환율', '외국인'],
};

const getRelatedTerms = (query: string): string[] => {
  const q = (query || '').trim();
  if (!q) return [];
  if (NEWS_KEYWORD_ALIASES[q]) return NEWS_KEYWORD_ALIASES[q];
  const upper = q.toUpperCase();
  for (const [k, v] of Object.entries(NEWS_KEYWORD_ALIASES)) {
    if (k.toUpperCase() === upper) return v;
  }
  return [q]; // 맵에 없는 키워드는 쿼리 자체로만 필터
};

const cache = new Map<string, { data: NewsItem[]; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000;

async function fetchWithTimeout(url: string, options: RequestInit, timeout = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

export async function fetchInvestmentNews(query: string): Promise<NewsItem[]> {
  const cachedData = cache.get(query);
  if (cachedData && Date.now() - cachedData.timestamp < CACHE_DURATION) {
    return cachedData.data;
  }

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('[News] 네이버 API 키가 설정되지 않았습니다.');
    return [];
  }

  try {
    const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=10&sort=date`;

    const res = await fetchWithTimeout(url, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
    });

    if (!res.ok) {
      console.error('[News] 네이버 API 응답 오류:', res.status);
      return [];
    }

    const data = await res.json();

    const rawItems: NewsItem[] = (data.items || []).map((a: {
      title: string;
      description?: string;
      originallink?: string;
      link: string;
      pubDate: string;
    }) => ({
      title: a.title.replace(/<[^>]*>?/gm, ''),
      source: '네이버 뉴스',
      link: a.originallink || a.link || "#",
      date: a.pubDate,
      snippet: (a.description || '').replace(/<[^>]*>?/gm, ''),
    }));

    // ✅ 관련도 필터 — 제목에 종목명/별칭 중 하나가 포함되어야 통과
    //   Naver date 정렬은 관련도가 낮은 기사를 섞기 때문에 종목 무관 기사가 노출되는 문제 차단.
    const relatedTerms = getRelatedTerms(query);
    const items: NewsItem[] = relatedTerms.length > 0
      ? rawItems.filter(n => {
          const titleLower = (n.title || '').toLowerCase();
          return relatedTerms.some(term => titleLower.includes(term.toLowerCase()));
        })
      : rawItems;

    console.log(`[News] query="${query}" raw=${rawItems.length} filtered=${items.length}`);

    cache.set(query, { data: items, timestamp: Date.now() });
    return items;
  } catch (error) {
    console.error('[News] 뉴스 수급 실패:', error);
    return [];
  }
}