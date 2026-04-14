// lib/news.ts
import { API_TIMEOUT_MS } from '@/lib/constants';

export interface NewsItem {
  title: string;
  source: string;
  link: string;
  date: string;
  snippet: string;
}

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

    const items: NewsItem[] = (data.items || []).map((a: {
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

    cache.set(query, { data: items, timestamp: Date.now() });
    return items;
  } catch (error) {
    console.error('[News] 뉴스 수급 실패:', error);
    return [];
  }
}