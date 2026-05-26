// ✅ 한국 증시 휴장일 (KRX 기준 — 연도 무관 MM-DD 셋)
//   "지난 금요일" 하드코딩 제거를 위한 동적 거래일 계산 지원.
//   대체공휴일/임시공휴일은 별도 추가 필요 (현 시점 최소 셋만 유지).
const KR_MARKET_HOLIDAYS_MMDD: ReadonlySet<string> = new Set([
  '01-01', // 신정
  '03-01', // 삼일절
  '05-01', // 근로자의 날
  '05-05', // 어린이날
  '06-06', // 현충일
  '08-15', // 광복절
  '10-03', // 개천절
  '10-09', // 한글날
  '12-25', // 성탄절
  '12-31', // 연말 휴장
]);

// d 는 KST 오프셋이 적용된 Date 라고 가정 (getUTC* 사용)
export const isKRMarketHoliday = (d: Date): boolean => {
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return KR_MARKET_HOLIDAYS_MMDD.has(`${mm}-${dd}`);
};

export const isKRNonTradingDay = (d: Date): boolean => {
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6 || isKRMarketHoliday(d);
};

// startD(포함)부터 거꾸로 거래일을 찾음. 연휴/장기 휴장 안전 마진 14일.
export const findPrevKRTradingDay = (startD: Date): Date => {
  const d = new Date(startD.getTime());
  for (let i = 0; i < 14; i++) {
    if (!isKRNonTradingDay(d)) return d;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d;
};

// US 마지막 거래일(주말만 회피, US 공휴일은 별도 미반영 — 최소 범위)
export const findPrevWeekday = (startD: Date): Date => {
  const d = new Date(startD.getTime());
  for (let i = 0; i < 7; i++) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) return d;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d;
};

export const formatKRDateLabel = (d: Date): string =>
  `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
