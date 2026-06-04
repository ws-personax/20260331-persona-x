import {
  findPrevKRTradingDay,
  findPrevWeekday,
  formatKRDateLabel,
  isKRMarketHoliday,
} from '@/lib/personax/calendar';

type AssetType = 'CRYPTO' | 'KOREAN_STOCK' | 'US_STOCK';

export const buildMarketSessionLabels = (params: {
  assetType: AssetType;
  isCrypto: boolean;
}): {
  nowKST: Date;
  timeKST: number;
  isWeekend: boolean;
  isKRNonTradingToday: boolean;
  isKRBeforeOpen: boolean;
  isKRAfterClose: boolean;
  isKRClosed: boolean;
  isUSClosed: boolean;
  lastKRTradingLabel: string;
  marketClosedNote: string;
  rayTimeNote: string;
} => {
  // ✅ 장 미개장 감지 — 한국시간 기준
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const dayKST = nowKST.getUTCDay(); // 0=일, 6=토
  const hourKST = nowKST.getUTCHours();
  const minuteKST = nowKST.getUTCMinutes();
  const timeKST = hourKST * 100 + minuteKST; // 예: 0815 = 오전 8시 15분

  // 한국장: 평일 09:00~15:30 (KST), 주말/공휴일 휴장
  // ✅ 마감 시간 명시: 1530 = 15시 30분. 15:29:59까지 장중, 15:30:00부터 마감
  const KR_OPEN  = 900;
  const KR_CLOSE = 1530;
  const isWeekend = (params.assetType !== 'CRYPTO') && (dayKST === 0 || dayKST === 6);
  const isKRHolidayToday = params.assetType !== 'CRYPTO' && isKRMarketHoliday(nowKST);
  const isKRNonTradingToday = isWeekend || isKRHolidayToday;
  const isKRBeforeOpen = params.assetType === 'KOREAN_STOCK' && !isKRNonTradingToday && timeKST < KR_OPEN;
  const isKRAfterClose = params.assetType === 'KOREAN_STOCK' && !isKRNonTradingToday && timeKST >= KR_CLOSE;
  const isKRClosed = isKRNonTradingToday || isKRBeforeOpen || isKRAfterClose;

  // ✅ 마지막 거래일 라벨 ("M월 D일") — 주말/공휴일/개장 전 분기에서 사용
  //    - 비거래일(주말/공휴일): 오늘 직전 거래일
  //    - 평일 개장 전: 어제 직전 거래일 (월요일 개장 전이면 지난 금요일)
  const lastKRTradingDate = (() => {
    if (isKRNonTradingToday) return findPrevKRTradingDay(nowKST);
    const prev = new Date(nowKST.getTime());
    prev.setUTCDate(prev.getUTCDate() - 1);
    return findPrevKRTradingDay(prev);
  })();
  const lastKRTradingLabel = formatKRDateLabel(lastKRTradingDate);

  // 미국장: 평일 23:30~06:00 KST (서머타임 기준)
  const isUSClosed = params.assetType === 'US_STOCK' && !params.isCrypto &&
    (isWeekend || (timeKST >= 600 && timeKST < 2330));

  const marketClosedNote = isKRClosed && params.assetType === 'KOREAN_STOCK'
    ? isKRNonTradingToday
      ? `\n⚠️ ${isWeekend ? '주말 휴장' : '공휴일 휴장'} 중 — ${lastKRTradingLabel} 종가 기준 분석입니다.`
      : isKRBeforeOpen
        ? `\n⚠️ 장 개장 전(09:00 개장) — ${lastKRTradingLabel} 종가 기준 분석입니다.`
        : `\n⚠️ 장 마감 후 — 오늘 종가 기준 분석입니다.`
    : '';

  // ✅ 장 미개장 시 레이도 기준 날짜 표시 — 주말/공휴일 동적 계산 (KR은 KR 휴장일 반영, US는 주말만)
  const rayTimeNote = (() => {
    if (isKRClosed && params.assetType === 'KOREAN_STOCK') {
      return ` (${isKRNonTradingToday || isKRBeforeOpen ? `${lastKRTradingLabel} 종가` : '오늘 종가'} 기준)`;
    }
    if (isUSClosed && params.assetType === 'US_STOCK') {
      const lastUSLabel = formatKRDateLabel(findPrevWeekday(nowKST));
      return ` (${isWeekend ? `${lastUSLabel} 종가` : '오늘 종가'} 기준)`;
    }
    return '';
  })();

  return {
    nowKST,
    timeKST,
    isWeekend,
    isKRNonTradingToday,
    isKRBeforeOpen,
    isKRAfterClose,
    isKRClosed,
    isUSClosed,
    lastKRTradingLabel,
    marketClosedNote,
    rayTimeNote,
  };
};
