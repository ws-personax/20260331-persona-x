import type { AssetType, Verdict, MarketData, ScoreParams } from './types';

export const safeNum = (val: unknown): number => {
  const n = parseFloat(String(val));
  return isNaN(n) ? 0 : n;
};

export const fmtPrice = (n: number, currency: 'KRW' | 'USD'): string =>
  currency === 'KRW'
    ? Math.round(n).toLocaleString('ko-KR') + '원'
    : '약 $' + Math.round(n).toLocaleString('en-US');

export const DISCLAIMER = `
─────────────────────────
⚠️ PersonaX는 AI 금융 콘텐츠 플랫폼입니다.
제공되는 모든 분석은 참고용 시나리오이며
투자 자문·매매 추천이 아닙니다.
투자 판단과 그에 따른 손익의 책임은
전적으로 투자자 본인에게 있습니다.`;

export const getVolumeInfo = (v: number, av: number, t: AssetType) => {
  if (t === 'US_STOCK' && av > 0) {
    const r = v / av;
    if (r > 2.0) return { label: `거래량 폭증 (평균의 ${r.toFixed(1)}배)`, score: 2, isHigh: true };
    if (r > 1.2) return { label: `거래량 증가 (평균의 ${r.toFixed(1)}배)`, score: 1, isHigh: true };
    if (r < 0.5) return { label: `거래량 저조 (평균의 ${r.toFixed(1)}배)`, score: -1, isHigh: false };
    return { label: '거래량 보통', score: 0, isHigh: false };
  }
  if (t === 'CRYPTO') {
    if (v > 1_000_000_000_000) return { label: '코인 거래대금 폭증', score: 2, isHigh: true };
    if (v < 100_000_000_000)   return { label: '코인 거래대금 저조', score: -1, isHigh: false };
    return { label: '코인 거래대금 보통', score: 0, isHigh: false };
  }
  if (v > 50_000_000) return { label: '거래량 폭증', score: 2, isHigh: true };
  if (v > 10_000_000) return { label: '거래량 증가', score: 1, isHigh: true };
  if (v < 1_000_000)  return { label: '거래량 저조', score: -1, isHigh: false };
  return { label: '거래량 보통', score: 0, isHigh: false };
};

export const getVolatility = (p: number, h: number, l: number, assetType: AssetType = 'US_STOCK') => {
  if (!p) return { label: '변동성 데이터 없음', score: 0 };
  if (h === l || h === 0 || l === 0) return { label: '변동성 측정 불가 (지수/장외)', score: 0 };
  const v = ((h - l) / p) * 100;
  // 코인: 고 15%+ / 중 5~15% / 저 5% 이하
  // 한국주식: 고 4%+ / 중 1.5~4% / 저 1.5% 이하
  // 미국주식: 고 6%+ / 중 2~6% / 저 2% 이하
  let high: number, mid: number;
  if (assetType === 'CRYPTO')            { high = 15; mid = 5;   }
  else if (assetType === 'KOREAN_STOCK') { high = 4;  mid = 1.5; }
  else                                   { high = 6;  mid = 2;   }
  if (v >= high) return { label: `고변동성 (일중 ${v.toFixed(1)}% 진폭)`, score: -2 };
  if (v >= mid)  return { label: `중변동성 (일중 ${v.toFixed(1)}% 진폭)`, score: -1 };
  return { label: `저변동성 (일중 ${v.toFixed(1)}% 진폭)`, score: 0 };
};

export const getPricePos = (p: number, h: number, l: number) => {
  if (h === l || !p) return { label: '가격 위치 확인 불가', score: 0, ratio: 0.5 };
  const pos = (p - l) / (h - l);
  if (pos > 0.8) return { label: `고점 근접 (${(pos*100).toFixed(0)}%)`, score: -2, ratio: pos };
  if (pos < 0.2) return { label: `저점 근접 (${(pos*100).toFixed(0)}%)`, score: 2,  ratio: pos };
  return { label: `중간 구간 (${(pos*100).toFixed(0)}%)`, score: 0, ratio: pos };
};

export const getNewsData = (items: Array<{ title: string; source?: string }>) => {
  if (!items.length) return { avgScore: 0, sentiment: '중립', context: '관련 뉴스 없음' };
  const context = items.slice(0, 3).map((n, i) => `${i + 1}. ${n.title}`).join('\n');
  const count   = Math.min(items.length, 3);
  const score   = items.slice(0, 3).reduce((acc, item) => {
    if (/(상승|호재|돌파|수익|최고|급등|반등|상회|개선|수혜|강세)/.test(item.title)) return acc + 1;
    if (/(하락|악재|급락|손실|우려|위기|긴장|폭락|둔화|하회|긴축|약세)/.test(item.title)) return acc - 1;
    return acc;
  }, 0) / count;
  return { avgScore: score, sentiment: score > 0 ? '긍정' : score < 0 ? '부정' : '중립', context };
};

export const calcScores = (p: ScoreParams) => {
  const ch = safeNum(p.change);
  const tr = ch > 0.5 ? 1 : ch < -0.5 ? -1 : 0;
  const ns = Math.round(p.newsAvg * 2);
  const total = p.volScore + tr + ns + p.posScore + p.vitScore;
  const verdict: Verdict = total >= 3 ? '매수 우위' : total <= -3 ? '매도 우위' : '관망';
  let conf = 55;
  if (p.hasData)        conf += 15;
  if (p.newsCount > 0)  conf += 10;
  if (p.newsCount >= 5) conf += 5;
  if (p.volScore > 0)   conf += 5;
  if (p.volScore >= 2)  conf += 5;
  const newsAndDataAlign = p.hasData && p.newsAvg > 0 && safeNum(p.change) > 0;
  if (newsAndDataAlign) conf += 3;
  const trendLabel = tr > 0 ? '단기 상승 추세' : tr < 0 ? '단기 하락 추세' : '추세 중립';
  const breakdown  = `${p.volLabel} / ${trendLabel} / 뉴스 ${p.newsSentiment} / ${p.posLabel} / ${p.vixLabel}`;
  return { total, verdict, confidence: Math.min(93, conf), breakdown };
};

export const getPositionSizing = (v: Verdict, total: number): string => {
  if (v === '관망')      return '현재 0% (신규 진입 금지)';
  if (v === '매도 우위') return '현재 0% (전량 현금화 검토)';
  return total >= 4 ? '40~50% 적극 매수' : '20~30% 분할 매수';
};

export const buildEntryCondition = (
  marketData: MarketData | null, posRatio: number, volIsHigh: boolean,
  verdict: Verdict, keyword: string,
): string => {
  const currency = marketData?.currency ?? (keyword ? 'KRW' : 'USD');
  if (!marketData) return `시세 데이터 없음 — 뉴스 확인 후 판단 필요`;
  const { rawHigh, rawLow } = marketData;
  const mid = (rawHigh + rawLow) / 2;
  const volNote = volIsHigh ? ' + 거래량 증가 확인' : '';
  if (verdict === '매도 우위') return [
    `지금 행동: 신규 매수 금지. 보유 시 손절 검토`,
    `매도 조건: ${fmtPrice(rawLow * 0.98, currency)} 이탈 시 전량 정리 (오늘 종가 기준)`,
    `시간 조건: 3일 내 반등 없으면 보유분 50% 축소`,
  ].join('\n');
  if (verdict === '매수 우위') {
    if (posRatio < 0.3) return [
      `지금 행동: 분할 매수 진입 가능 (10~20%)`,
      `추가 매수: ${fmtPrice(rawLow * 0.99, currency)} 이하 하락 시 2차 매수 (오늘~내일 기준)`,
      `돌파 조건: ${fmtPrice(rawHigh, currency)} 돌파${volNote} 시 비중 확대`,
      `시간 조건: 3일 내 반등 미확인 시 관망 전환`,
    ].join('\n');
    if (posRatio <= 0.7) return [
      `지금 행동: 소량 분할 매수 (10~15%)`,
      `매수 조건: ${fmtPrice(rawLow, currency)} 재접근 시 추가 매수 (이번 주 기준)`,
      `매도 조건: ${fmtPrice(rawLow * 0.97, currency)} 이탈 시 손절`,
      `돌파 조건: ${fmtPrice(rawHigh, currency)} 돌파${volNote} 시 비중 확대`,
    ].join('\n');
    return [
      `지금 행동: 고점 추격 자제. 눌림 대기`,
      `매수 조건: ${fmtPrice(mid, currency)} 수준 눌림 시 소량 매수 (3일 내)`,
      `매도 조건: ${fmtPrice(rawLow * 0.97, currency)} 이탈 시 손절`,
      `돌파 조건: ${fmtPrice(rawHigh * 1.03, currency)} 돌파${volNote} 시 목표 (진입가 대비 +3% 이상)`,
    ].join('\n');
  }
  if (posRatio < 0.3) return [
    `지금 행동: 신규 진입 금지 (관망)`,
    `매수 조건: ${fmtPrice(rawLow * 0.98, currency)} 이하 하락 확인 후 소량 진입 (오늘~내일)`,
    `매도 조건: 보유 중이라면 ${fmtPrice(rawLow * 0.96, currency)} 이탈 시 손절`,
    `시간 조건: 3일 내 방향성 미확인 시 재분석`,
  ].join('\n');
  if (posRatio <= 0.7) return [
    `지금 행동: 신규 진입 금지 (관망)`,
    `매수 조건: ${fmtPrice(rawLow, currency)} 근접 + 반등 캔들 확인 시 진입 (이번 주)`,
    `매도 조건: ${fmtPrice(rawLow * 0.97, currency)} 이탈 시 손절`,
    `돌파 조건: ${fmtPrice(rawHigh, currency)} 돌파${volNote} 확인 후 추세 매수`,
  ].join('\n');
  return [
    `지금 행동: 신규 진입 금지 — 고점 구간 (관망)`,
    `매수 조건: ${fmtPrice(mid, currency)} 이하 눌림 확인 후 진입 (3일 내)`,
    `매도 조건: ${fmtPrice(rawLow * 0.97, currency)} 이탈 시 손절`,
    `시간 조건: 이번 주 내 눌림 미발생 시 다음 주 재분석`,
  ].join('\n');
};

export const extractConditionPrices = (entryCondition: string): { buy: string; sell: string } => {
  const lines    = entryCondition.split('\n');
  const buyLine  = lines.find(l => l.includes('매수 조건') || l.includes('추가 매수') || l.includes('돌파 조건'));
  const sellLine = lines.find(l => l.includes('매도 조건') || l.includes('손절') || l.includes('이탈'));
  const extract  = (line?: string): string => {
    if (!line) return '';
    const m = line.match(/([\d,]+(?:\.\d+)?\s?(?:원|USD))/);
    return m ? m[0] : '';
  };
  return { buy: extract(buyLine), sell: extract(sellLine) };
};

export const parsePriceToNumber = (text: string): number | null => {
  if (!text) return null;
  const cleaned = text.replace(/,/g, '').replace(/\s/g, '');
  const m = cleaned.match(/([\d.]+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
};

// ─────────────────────────────────────────────
// ✅ 시장 상황 감지 — 6가지 패턴 분류
// ─────────────────────────────────────────────
export type MarketSituation =
  | 'accumulation'   // 매집 초기: 거래량↑ + 저변동성 + 가격중립
  | 'trending'       // 추세 추종: 거래량폭증 + 가격상승
  | 'stalemate'      // 교착 구간: 거래량증가 + 저변동성 + 가격정체
  | 'drain'          // 수급 이탈: 거래량저조 + 저변동성
  | 'panic'          // 패닉 셀: 거래량폭증 + 고변동성 + 가격하락
  | 'exhaustion'     // 과열 둔화: 거래량감소 + 중변동성 + 고점근접
  | 'normal';        // 일반

export const detectMarketSituation = (params: {
  volScore: number;
  volIsHigh: boolean;
  vixLabel: string;
  change: number;
  posLabel: string;
}): MarketSituation => {
  const { volScore, volIsHigh, vixLabel, change, posLabel } = params;
  const isHighVol   = vixLabel.includes('고변동성');
  const isMidVol    = vixLabel.includes('중변동성');
  const isLowVol    = vixLabel.includes('저변동성');
  const isNearHigh  = posLabel.includes('고점');
  const isRising    = change > 0.5;
  const isFalling   = change < -0.5;
  const isFlat      = Math.abs(change) <= 0.5;

  // 패닉 셀: 거래량 폭증 + 고변동성 + 하락
  if (volScore >= 2 && isHighVol && isFalling) return 'panic';

  // 추세 추종: 거래량 폭증 + 상승
  if (volScore >= 2 && isRising) return 'trending';

  // 교착 구간: 거래량 증가인데 가격이 안 움직임 (매수·매도 균형)
  if (volIsHigh && isLowVol && isFlat) return 'stalemate';

  // 매집 초기: 거래량 증가 + 저변동성 + 중간 구간
  if (volScore >= 1 && isLowVol && !isNearHigh) return 'accumulation';

  // 과열 둔화: 고점 근접 + 중변동성
  if (isNearHigh && isMidVol) return 'exhaustion';

  // 수급 이탈: 거래량 저조
  if (volScore <= -1) return 'drain';

  return 'normal';
};

// ─────────────────────────────────────────────
// ✅ 추세 맥락 판단 — 5일/20일 이평선 기반
// ─────────────────────────────────────────────
export interface TrendContext {
  trendStrength: 'strong_up' | 'weak_up' | 'neutral' | 'weak_down' | 'strong_down';
  trendSummary: string;   // 페르소나용 요약
  consecutiveDays: number;
}

export const analyzeTrendContext = (trend: {
  trend5d: string;
  trend20d: string;
  consecutiveDays: number;
  trendContext: string;
} | undefined): TrendContext => {
  if (!trend) return {
    trendStrength: 'neutral',
    trendSummary: '',
    consecutiveDays: 0,
  };

  const { trend5d, trend20d, consecutiveDays, trendContext } = trend;

  let trendStrength: TrendContext['trendStrength'];
  if (trend5d === '상승' && trend20d === '상승') trendStrength = 'strong_up';
  else if (trend5d === '상승' && trend20d !== '상승') trendStrength = 'weak_up';
  else if (trend5d === '하락' && trend20d === '하락') trendStrength = 'strong_down';
  else if (trend5d === '하락' && trend20d !== '하락') trendStrength = 'weak_down';
  else trendStrength = 'neutral';

  return { trendStrength, trendSummary: trendContext, consecutiveDays };
};

// ─────────────────────────────────────────────
// ✅ 에코 관망 세분화 — 3단계
// ─────────────────────────────────────────────
export type WatchLevel = 'strong' | 'neutral' | 'weak';

export const determineWatchLevel = (params: {
  confidence: number;
  trendStrength: TrendContext['trendStrength'];
  sentiment: string;
  volScore: number;
}): WatchLevel => {
  const { confidence, trendStrength, sentiment, volScore } = params;

  // 강한 관망: 하락 추세 + 부정 뉴스 + 낮은 신뢰도
  if (
    trendStrength === 'strong_down' ||
    (sentiment === '부정' && confidence < 75) ||
    (volScore <= -1 && trendStrength === 'weak_down')
  ) return 'strong';

  // 약한 관망: 상승 추세인데 종합 신호는 관망 (곧 매수 신호 나올 수 있음)
  if (
    trendStrength === 'strong_up' ||
    (trendStrength === 'weak_up' && confidence >= 75) ||
    (volScore >= 1 && sentiment !== '부정')
  ) return 'weak';

  return 'neutral';
};

// ─────────────────────────────────────────────
// ✅ 페르소나 충돌 감지
// ─────────────────────────────────────────────
export type PersonaConflict = 'agree_buy' | 'agree_sell' | 'agree_wait' | 'conflict_jack_buy' | 'conflict_lucia_buy' | 'mixed';

export const detectPersonaConflict = (params: {
  trendStrength: TrendContext['trendStrength'];
  sentiment: string;
  volScore: number;
  situation: MarketSituation;
  verdict?: Verdict;
}): PersonaConflict => {
  const { trendStrength, sentiment, volScore, situation, verdict } = params;

  const trendUp   = trendStrength === 'strong_up' || trendStrength === 'weak_up';
  const trendDown = trendStrength === 'strong_down' || trendStrength === 'weak_down';

  // ✅ 잭(모멘텀) — 추세만 맞으면 bullish (거래량 확인은 LUCIA 불일치 조건으로 이동)
  const jackBullish = trendUp;
  const jackBearish = trendDown;

  // ✅ 루시아(역발상·신중론)
  //    bullish(역발상 매수): 기존 패닉 역발상 + verdict가 관망인데 추세는 상승인 경우도 포함
  const luciaBullishOriginal = sentiment === '부정' && situation === 'panic';
  const luciaBullishContrarian = verdict === '관망' && trendUp; // 시장은 주춤하지만 추세는 살아있음
  const luciaBullish = luciaBullishOriginal || luciaBullishContrarian;

  //    bearish(신중론·경계): 거래량이 약하거나 뉴스가 확인되지 않으면 LUCIA는 신중
  //    - 기존: 긍정 sentiment + exhaustion/trending (과열 경계)
  //    - 확장: 거래량 보통/감소(volScore < 1) 또는 뉴스 중립/부정일 때 경계
  const luciaBearishOverheat = sentiment === '긍정' && (situation === 'exhaustion' || situation === 'trending');
  const luciaBearishUnconfirmed = volScore < 1 || sentiment !== '긍정';
  const luciaBearish = luciaBearishOverheat || luciaBearishUnconfirmed;

  // ✅ 충돌 우선순위
  //    conflict_jack_buy: JACK은 추세로 진입하려 하고 LUCIA는 확인 신호 부족으로 신중
  //    conflict_lucia_buy: JACK 하락 경계 + LUCIA 역발상, 또는 관망 verdict + 상승 추세
  if (jackBullish && luciaBearish) return 'conflict_jack_buy';
  if (jackBearish && luciaBullishOriginal) return 'conflict_lucia_buy';
  if (verdict === '관망' && trendUp && !jackBearish) return 'conflict_lucia_buy'; // 추세 상승인데 관망 → LUCIA 역발상 기회

  if (jackBullish && !luciaBearish) return 'agree_buy';
  if (jackBearish && !luciaBullish) return 'agree_sell';
  return 'mixed';
};

export const buildDataSourceLabel = (assetType: AssetType, marketData: MarketData | null, newsCount: number): string => {
  if (!marketData) {
    const newsSource = newsCount > 0 ? `뉴스: 최신 ${newsCount}건 반영` : '뉴스: 수급 없음';
    return `📡 데이터 출처 — 시세: 미수급 | ${newsSource}`;
  }
  const state = (marketData.marketState || '').toUpperCase();
  const isRegular = state === 'REGULAR';
  const priceSource = assetType === 'CRYPTO'
    ? '시세: Upbit 실시간 ✅'
    : assetType === 'KOREAN_STOCK'
      ? (isRegular ? '시세: 한국장 실시간 ✅' : '시세: 한국장 (약 15분 지연) ⚠️')
      : (isRegular ? '시세: 미국장 실시간 ✅' : '시세: 미국장 전일 종가 기준 ⚠️');
  const newsSource = newsCount > 0 ? `뉴스: 최신 ${newsCount}건 반영` : '뉴스: 수급 없음';
  return `📡 데이터 출처 — ${priceSource} | ${newsSource}`;
};
