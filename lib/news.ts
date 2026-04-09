import { NewsItem } from '@/types/news'; // 타입 정의 경로 확인 필요
import { API_TIMEOUT_MS } from '@/lib/constants'; // 15000ms 설정 확인 필요

// 5분간 동일 키워드 뉴스 재사용 (API 쿼타 절약 및 속도 향상)
const cache = new Map<string, { data: NewsItem[]; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000;

/**
 * 타임아웃 기능이 포함된 Fetch 유틸리티
 */
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

/**
 * 네이버 뉴스 API 연동 함수
 */
export async function fetchInvestmentNews(query: string): Promise<NewsItem[]> {
  // 1. 캐시 확인
  const cachedData = cache.get(query);
  if (cachedData && Date.now() - cachedData.timestamp < CACHE_DURATION) {
    return cachedData.data;
  }

  // 2. 환경 변수 금고 확인
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('[JACK SYSTEM] 네이버 API 키가 .env.local에 설정되지 않았습니다.');
    return [];
  }

  try {
    // 3. 네이버 뉴스 검색 API 호출 (최신순 정렬)
    const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=5&sort=date`;
    
    const res = await fetchWithTimeout(url, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      }
    });

    if (!res.ok) {
      console.error('[JACK SYSTEM] 네이버 API 응답 오류:', res.status);
      return [];
    }

    const data = await res.json();
    
    // 4. 데이터 정제 (HTML 태그 제거 및 포맷팅)
    const items: NewsItem[] = (data.items || []).map((a: any) => ({
      title: a.title.replace(/<[^>]*>?/gm, ''), // <b> 태그 등 제거
      source: '네이버 뉴스',
      link: a.originallink || a.link, // 원문 링크 우선
      date: a.pubDate,
      snippet: a.description.replace(/<[^>]*>?/gm, '') // 요약문 태그 제거
    }));

    // 5. 캐시 저장 후 반환
    cache.set(query, { data: items, timestamp: Date.now() });
    return items;

  } catch (error) {
    console.error('[JACK SYSTEM] 뉴스 수급 실패:', error);
    return [];
  }
}