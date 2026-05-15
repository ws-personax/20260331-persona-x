/**
 * Option D — 1차 시장 팩트 패킷 (신규 모듈)
 * 기존 market.ts 는 수정하지 않고 extractKeyword / fetchMarketPrice 만 호출.
 */

import { extractKeyword, fetchMarketPrice, type TrendData } from './market';

/** route.ts 연동 전까지 비활성 */
export const FEATURE_OPTION_D = false;

export type MarketFactPack = {
  keyword: string;
  asOf: string;
  price: string;
  change: string;
  trend: TrendData | null;
  pbr: null;
  per: null;
  missing: string[];
};

const GENERIC_KEYWORD = '시장';

const kstIsoNow = (): string => {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+09:00`;
};

const buildMissing = (trend: TrendData | null | undefined): string[] => {
  const missing: string[] = ['pbr', 'per'];
  if (!trend?.trendContext?.trim()) missing.push('trend');
  return missing;
};

/**
 * 유저 메시지에서 종목 키워드를 뽑고 실시간 시세를 조회해 1차 팩트 패킷을 만든다.
 *
 * @returns 구체 종목·시세가 있으면 MarketFactPack, 없으면 null
 *   - 마지막 유저 메시지 없음
 *   - extractKeyword 가 기본값 '시장' (특정 종목 미인식)
 *   - fetchMarketPrice 실패
 */
export const collectMarketFactPack = async (
  messages: Array<{ role: string; content: string }>,
  _category: string,
): Promise<MarketFactPack | null> => {
  void _category; // Phase 2+ 카테고리별 스킵·보강용

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const lastContent = (lastUser?.content || '').trim();
  if (!lastContent) return null;

  const keyword = extractKeyword(messages);
  if (!keyword || keyword === GENERIC_KEYWORD) return null;

  const market = await fetchMarketPrice(keyword).catch(() => null);
  if (!market) return null;

  const trend = market.trend ?? null;

  return {
    keyword,
    asOf: kstIsoNow(),
    price: market.price,
    change: market.change,
    trend,
    pbr: null,
    per: null,
    missing: buildMissing(trend),
  };
};
