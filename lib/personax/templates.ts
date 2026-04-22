import type { AssetType, Verdict } from './types';

// ─────────────────────────────────────────────
// 조사 헬퍼
// ─────────────────────────────────────────────
export const particle = (label: string): string => {
  const last = label[label.length - 1];
  const code = last.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return '로';
  return (code - 0xAC00) % 28 === 0 ? '로' : '으로';
};

// ✅ 은/는 조사 — 받침 있음 "은", 없음 "는"
export const topicParticle = (label: string): string => {
  if (!label) return '는';
  const last = label[label.length - 1];
  const code = last.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return '는';
  return (code - 0xAC00) % 28 === 0 ? '는' : '은';
};

// ✅ 이/가 조사 — 받침 있음 "이", 없음 "가"
export const subjectParticle = (label: string): string => {
  if (!label) return '가';
  const last = label[label.length - 1];
  const code = last.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return '가';
  return (code - 0xAC00) % 28 === 0 ? '가' : '이';
};

// ─────────────────────────────────────────────
// 잭 템플릿 파라미터
// ─────────────────────────────────────────────
// MarketSituation 타입 (scoring.ts와 동기화)
type MarketSituation =
  | 'accumulation' | 'trending' | 'stalemate'
  | 'drain' | 'panic' | 'exhaustion' | 'normal';

// ✅ 토론 모드 — 긍정/부정 지표 카운트로 결정
export type DiscussMode = 'bull' | 'bear' | 'conflict';

// ✅ 지표 플래그 (route.ts에서 계산)
export interface IndicatorFlags {
  trendUp: boolean;
  trendDown: boolean;
  volUp: boolean;
  volDown: boolean;
  newsPos: boolean;
  newsNeg: boolean;
  priceUp: boolean;
  priceDown: boolean;
  vixHigh: boolean;
}

// ✅ 이전 종목 맥락 (같은 섹터 / 다른 섹터 / 자산군 전환 판단용)
export interface PrevContext {
  prevKeyword: string | null;
  prevSector: string | null;
  currSector: string | null;
  prevIsCrypto: boolean;
  currIsCrypto: boolean;
}

// ✅ 과/와 조사 — 받침 있으면 "과", 없으면 "와"
const withParticle = (label: string): string => {
  if (!label) return '와';
  const last = label[label.length - 1];
  const code = last.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return '와';
  return (code - 0xAC00) % 28 === 0 ? '와' : '과';
};

interface JackParams {
  keyword: string;
  volLabel: string;
  volIsHigh: boolean;
  vixLabel: string;
  vixAvailable: boolean;
  change: number;
  verdict: Verdict;
  prevKeyword?: string | null;
  prevVolIsHigh?: boolean;
  changeRaw?: string | null;
  volRatio?: number | null;
  price?: string | null;
  situation?: MarketSituation;
  // ✅ 추세 맥락
  trendSummary?: string | null;
  trendStrength?: string | null;
  consecutiveDays?: number;
  conflict?: string | null;
  // ✅ 장 미개장
  isMarketClosed?: boolean;
  isBeforeOpen?: boolean;
  isWeekend?: boolean;
  isUSClosed?: boolean;
  assetType?: string;
  // ✅ 거래량 수치
  avgVolume?: number | null;   // 5일 평균 거래량
  rawVolume?: number | null;   // 오늘(당일) 누적 거래량
  currency?: string;           // KRW / USD
  // ✅ 토론 모드 + 지표 플래그
  mode?: DiscussMode;
  flags?: IndicatorFlags;
  // ✅ 지지/돌파 가격 (bearMode 역발상 진입 조건용)
  supportPrice?: string | null;
  breakoutPrice?: string | null;
  // ✅ raw price (bearMode 지지/돌파 레벨 직접 계산용)
  rawPrice?: number | null;
}

// ✅ JACK 매수 표현 로테이션 — 5개
const JACK_BUY_PHRASES = [
  '즉각 진입하십시오',
  '기회의 창이 열렸습니다',
  '지금이 마지막 저점일 수 있습니다',
  '신호가 명확합니다. 행동하십시오',
  '추세가 확인됐습니다. 올라타십시오',
];

export const buildJackText = (p: JackParams): string => {
  // ✅ 충돌 시 JACK이 LUCIA에게 반박 — 장중/장 마감 모두 공통으로 뒤에 부착
  const jackRebuttal = p.conflict === 'conflict_jack_buy'
    ? '\n↳ 루시아의 신중론을 이해하지만, 지금은 기회를 놓치는 것이 더 큰 리스크입니다. 모멘텀 데이터가 명확합니다.'
    : p.conflict === 'conflict_lucia_buy'
      ? '\n↳ 루시아의 역발상을 이해하지만, 떨어지는 칼날을 잡으면 다칩니다. 바닥 확인이 먼저입니다.'
      : '';

  // ✅ 장 미개장/마감 시 — forecastMode (재반박 비활성화, 전망 전용)
  const isKRClosed = p.isMarketClosed;
  const isUSClosed = p.isUSClosed;
  if (isKRClosed || isUSClosed) {
    const isKR = p.assetType === 'KOREAN_STOCK';
    const openTime = isKR ? '09:00' : '23:30';

    // 거래량 기준치 (1.3배 증가)
    const formatVol = (v: number) => {
      if (v >= 100000000) return `${(v / 100000000).toFixed(1)}억주`;
      if (v >= 10000) return `${Math.round(v / 10000).toLocaleString()}만주`;
      return `${v.toLocaleString()}주`;
    };
    const avgVol = p.avgVolume && p.avgVolume > 0 ? p.avgVolume : 0;
    const volTrigger = avgVol > 0 ? `${formatVol(Math.round(avgVol * 1.3))} 이상` : '평소 대비 30% 이상';
    const halfCheckpoint = isKR ? '12시 30분까지' : '개장 후 3시간까지';

    // 긍정/부정 지표 정리 — JACK은 긍정 편향
    const f = p.flags;
    const positives: string[] = [];
    if (f?.trendUp) positives.push('이평선 상승 추세');
    if (f?.newsPos) positives.push('뉴스 긍정');
    if (f?.priceUp) positives.push('시세 상승');
    if (isKR && f?.volUp) positives.push('외국인 수급 유입');
    const negatives: string[] = [];
    if (f?.trendDown) negatives.push('이평선 하락');
    if (f?.newsNeg) negatives.push('뉴스 부정');
    if (f?.priceDown) negatives.push('시세 하락');
    const posText = positives.join(' + ') || '긍정 신호 확인 중';
    const negText = negatives.join(' + ') || '부정 신호 혼재';

    const mode: DiscussMode = p.mode ?? 'conflict';

    let line1: string;
    let line2: string;
    if (mode === 'bull') {
      if (p.isBeforeOpen) {
        line1 = `지휘관님, ${posText} 기준으로 오늘 상승 출발 가능성이 높습니다.`;
        line2 = `${openTime} 개장 후 거래량 ${volTrigger}이면 즉각 진입하십시오.`;
      } else {
        const changePct = p.changeRaw && p.changeRaw !== '0.00'
          ? `${parseFloat(p.changeRaw) >= 0 ? '+' : ''}${p.changeRaw}%`
          : '';
        line1 = `지휘관님, 오늘 ${changePct} 마감 기준 ${posText}로 내일 상승 가능성이 높습니다.`;
        line2 = `내일 ${halfCheckpoint} 거래량 ${volTrigger} 확인 후 진입하십시오.`;
      }
    } else if (mode === 'bear') {
      // ✅ 역발상 강세론자 — 지지/돌파 레벨 제시 후 재진입 조건 명시
      const fmtForecast = (n: number): string =>
        p.currency === 'USD'
          ? `약 $${Math.round(n).toLocaleString('en-US')}`
          : `${Math.round(n).toLocaleString('ko-KR')}원`;
      const bearSupport = p.rawPrice && p.rawPrice > 0
        ? fmtForecast(p.rawPrice * 0.98)
        : (p.supportPrice || '지지선');
      const bearBreakout = p.rawPrice && p.rawPrice > 0
        ? fmtForecast(p.rawPrice * 1.02)
        : (p.breakoutPrice || '반등 기준가');
      const bearL1 = `지휘관님, ${negText} 기준으로 조정 구간입니다.`;
      const bearL2 = `단, 현재가 ${bearSupport} 지지 확인 후`;
      const bearL3 = `${bearBreakout} 돌파 + 거래량 증가 시 즉각 재진입하십시오.`;
      return `${bearL1}\n${bearL2}\n${bearL3}`;
    } else {
      // conflict / 혼재 — 긍정 지표 유무에 따라 표현 차별화
      const line2Body = p.isBeforeOpen
        ? `${openTime} 개장 후 거래량 ${volTrigger} 확인 시 진입을 검토하십시오.`
        : `내일 ${halfCheckpoint} 거래량 ${volTrigger} 확인 후 판단하십시오.`;
      if (positives.length > 0) {
        line1 = p.isBeforeOpen
          ? `지휘관님, ${posText} 기준으로 진입 가능성이 있습니다.`
          : `지휘관님, 오늘 ${posText} 기준으로 진입 가능성이 있습니다.`;
      } else {
        line1 = `지휘관님, 신호 확인 중입니다. 거래량 돌파 대기.`;
      }
      line2 = line2Body;
    }

    // ✅ 재반박 비활성화 — forecastMode
    return `${line1}\n${line2}`;
  }

  // ✅ 긍정 데이터만 선별 (JACK은 긍정 지표 챔피언)
  const flags = p.flags;
  const positives: string[] = [];
  if (flags?.trendUp) positives.push('5일·20일 이평선 상승');
  if (flags?.newsPos) positives.push('뉴스 긍정');
  if (p.assetType === 'KOREAN_STOCK' && flags?.volUp) positives.push('외국인 수급 유입');
  else if (flags?.volUp) positives.push('거래량 증가');
  if (flags?.priceUp) positives.push('시세 상승');
  const positiveText = positives.length > 0 ? positives.join(' + ') : '신호 포착 중';

  // ✅ 거래량 기준 진입 조건 (숫자 포함)
  const jackFormatVol = (v: number): string => {
    if (v >= 100000000) return `${(v / 100000000).toFixed(1)}억주`;
    if (v >= 10000) return `${Math.round(v / 10000).toLocaleString()}만주`;
    return `${v.toLocaleString()}주`;
  };
  const jackAvgVol = p.avgVolume && p.avgVolume > 0 ? p.avgVolume : null;
  const volCondition = jackAvgVol
    ? `거래량 ${jackFormatVol(Math.round(jackAvgVol * 1.3))} 이상 돌파 확인 시`
    : '거래량이 평소 대비 30% 이상 증가할 때';

  // ✅ JACK 매수 표현 로테이션 — 결정론적 시드 (ticker + 분)
  const phraseIdx = getRotationIndex(p.keyword, JACK_BUY_PHRASES.length);
  const buyPhrase = JACK_BUY_PHRASES[phraseIdx];

  // ✅ 시세 방향별 JACK 본문 선택 — "뉴스 긍정 기준으로 진입 가능성" 고정 출력 문제 해결
  //    상승/하락/sideways/급등락에 따라 서로 다른 전술 메시지
  const jackDirection: PriceDirection = flags
    ? determinePriceDirection(flags)
    : 'sideways';
  const jackBodyPool = JACK_BODY_POOL[jackDirection];
  const jackBodyIdx = getRotationIndex(p.keyword, jackBodyPool.length);
  const jackDirectionLine = jackBodyPool[jackBodyIdx];

  const mode: DiscussMode = p.mode ?? 'conflict';
  let line1: string;
  let line2: string;

  if (mode === 'bull') {
    // 긍정 3개 이상 — 강한 매수 권고 (방향 맥락 prefix 추가)
    line1 = `지휘관님, ${p.keyword}${topicParticle(p.keyword)} ${positiveText} — 명백한 매수 우위입니다.`;
    line2 = `${buyPhrase}. ${volCondition} 단계 진입.`;
  } else if (mode === 'conflict') {
    // 갈등 — 시세 방향별 JACK_BODY_POOL 사용 (방향 무시 "진입 가능성" 고정 출력 제거)
    line1 = `지휘관님, ${p.keyword}${topicParticle(p.keyword)} ${jackDirectionLine}.`;
    line2 = `${volCondition} 1차 진입 검토. ${buyPhrase}.`;
  } else {
    // bear — 역발상 강세론자 (조정 속 기회 탐색, 3줄)
    const negatives: string[] = [];
    if (flags?.trendDown) negatives.push('이평선 하락');
    if (flags?.newsNeg) negatives.push('뉴스 부정');
    if (flags?.volDown) negatives.push('거래량 감소');
    if (flags?.priceDown) negatives.push('시세 하락');
    const negText = negatives.join(' + ') || '하락 지표 우세';

    // ✅ 현재가 기준 지지선(-2%) / 돌파 기준가(+2%) 실시간 계산
    const fmtBear = (n: number): string =>
      p.currency === 'USD'
        ? `약 $${Math.round(n).toLocaleString('en-US')}`
        : `${Math.round(n).toLocaleString('ko-KR')}원`;
    const supportLabel = p.rawPrice && p.rawPrice > 0
      ? fmtBear(p.rawPrice * 0.98)
      : (p.supportPrice || '지지선');
    const breakoutLabel = p.rawPrice && p.rawPrice > 0
      ? fmtBear(p.rawPrice * 1.02)
      : (p.breakoutPrice || '반등 기준가');

    const bearL1 = `지휘관님, ${negText} 기준으로 조정 구간입니다.`;
    const bearL2 = `단, 현재가 ${supportLabel} 지지 확인 후`;
    const bearL3 = `${breakoutLabel} 돌파 + 거래량 증가 시 즉각 재진입하십시오.`;
    return `${bearL1}\n${bearL2}\n${bearL3}${jackRebuttal}`;
  }

  return `${line1}\n${line2}${jackRebuttal}`;
};

// ─────────────────────────────────────────────
// 루시아 템플릿 파라미터
// ─────────────────────────────────────────────
interface LuciaParams {
  keyword: string;
  volLabel: string;
  volIsHigh: boolean;
  vixLabel: string;
  vixAvailable: boolean;
  isMarketClosed?: boolean;
  isBeforeOpen?: boolean;
  isWeekend?: boolean;
  isUSClosed?: boolean;
  assetType: AssetType;
  avgVolume?: number | null;
  rawVolume?: number | null;
  changeRaw?: string | null;   // ✅ 등락률
  sentiment: string;
  verdict: Verdict;
  prevKeyword?: string | null;
  situation?: MarketSituation;
  // ✅ 추세 + 충돌
  trendSummary?: string | null;
  trendStrength?: string | null;
  conflict?: string | null;
  jackVerdict?: string | null;  // 잭의 판단 (핑퐁용)
  // ✅ 토론 모드 + 지표 + 이전 종목 맥락
  mode?: DiscussMode;
  flags?: IndicatorFlags;
  prevCtx?: PrevContext;
}

// ─────────────────────────────────────────────
// ✅ 시세 방향 분류 + 결정론적 로테이션 시드
// ─────────────────────────────────────────────
// 🔍 진단 메모 (수정 4): "quote는 로테이션 되는데 body는 고정" 원인
//   - quote/body 모두 기존에 Math.floor(Date.now() / 1000) % length 사용 → 구조상 rotation은 작동 중.
//   - 그런데 body가 "같아 보이는" 이유는 (1) pool이 direction 무관하게 동일 카테고리(lowVol_neutral 등)에
//     몰려 있어 종목 방향이 달라도 같은 풀에서 뽑혔고 (2) 초 단위 랜덤이라 사용자가 방향 차이를
//     인지하기 어려웠기 때문. 즉 "배열 인덱스가 0에 고정"이 아니라 "배열 자체가 방향 무시"였던 것.
//   - 수정: pool을 direction별로 분리하고 시드를 (ticker + minute) 결정론으로 교체.

export type PriceDirection =
  | 'rising_weak_volume'
  | 'falling_weak_volume'
  | 'sideways'
  | 'high_volatility_up'
  | 'high_volatility_down';

// ✅ 시세 방향 판정 — flags 기반 (change는 flags.priceUp/Down에 이미 반영됨)
export const determinePriceDirection = (flags: IndicatorFlags): PriceDirection => {
  if (flags.vixHigh) {
    if (flags.priceUp || flags.trendUp) return 'high_volatility_up';
    if (flags.priceDown || flags.trendDown) return 'high_volatility_down';
  }
  const isRising = flags.priceUp || flags.trendUp;
  const isFalling = flags.priceDown || flags.trendDown;
  if (isRising && !isFalling) return 'rising_weak_volume';
  if (isFalling && !isRising) return 'falling_weak_volume';
  return 'sideways';
};

// ✅ 결정론적 로테이션 인덱스 — (ticker + 분 단위 시간) 시드
//   - 같은 종목을 1분 안에 재질의 → 동일 문구 (예측 가능)
//   - 1분 경과 후 재질의 → 다른 문구 (시간 경과에 따른 자연스러운 변화)
//   - 다른 종목 동시 질의 → 서로 다른 문구 (ticker hash 차이)
export const getRotationIndex = (ticker: string, arrayLength: number): number => {
  if (arrayLength <= 0) return 0;
  const minute = Math.floor(Date.now() / 60000);
  const hash = (ticker || '').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return (hash + minute) % arrayLength;
};

// ✅ LUCIA 비유 풀 — 시세 방향별로 분기 (각 3개 이상 로테이션)
const LUCIA_METAPHORS: Record<PriceDirection, string[]> = {
  rising_weak_volume: [
    '뼈대 없이 올라가는 건물 같아요',
    '바람 없이 떠오른 연 같아요',
    '받침돌 없는 탑 같아요',
  ],
  falling_weak_volume: [
    '안개 속 비탈길 같아요',
    '브레이크 없이 내려가는 차 같아요',
    '바닥을 확인 못 한 계단 같아요',
  ],
  sideways: [
    '태풍의 눈 속에 있는 것 같아요',
    '바람 한 점 없는 한여름 오후처럼 움직임이 없어요',
    '출발 신호를 기다리는 단거리 선수 같아요',
  ],
  high_volatility_up: [
    '안전벨트 없이 탄 롤러코스터 같아요',
    '높은 파도 위에 선 서퍼 같아요',
    '세일 첫날 오픈런처럼 모두가 달려드는 분위기예요',
  ],
  high_volatility_down: [
    '태풍 속으로 나선 항해 같아요',
    '번개 치는 하늘 아래 우산 하나 든 모습 같아요',
    '갑자기 불이 났을 때 모두가 출구로 달려가는 상황이에요',
  ],
};

// ✅ JACK 본문 풀 — 시세 방향별로 분기 (긍정 편향은 유지하되 방향에 맞는 전술 제시)
const JACK_BODY_POOL: Record<PriceDirection, string[]> = {
  rising_weak_volume: [
    '상승세이나 거래량 부진입니다. 돌파 확인 전까지 진입 보류하십시오',
    '추세는 살아있으나 수급이 약합니다. 거래량 동반 돌파 시 진입하십시오',
    '이평선은 우상향이나 거래량이 따라오지 않습니다. 수급 유입 대기',
  ],
  falling_weak_volume: [
    '하락세이나 매도 압력도 약합니다. 반등 신호 전까지 관망하십시오',
    '바닥 확인이 우선입니다. 거래량 동반 반등 시 재평가하십시오',
    '조정 구간입니다. 지지 확인 후 재진입 검토하십시오',
  ],
  sideways: [
    '방향성 부재 구간입니다. 돌파 방향 확인 후 추종하십시오',
    '교착 구간입니다. 한 방향 확정 전까지 신규 진입을 보류하십시오',
    '관망 구간입니다. 트리거 가격 이탈/돌파 시 대응하십시오',
  ],
  high_volatility_up: [
    '급등 국면입니다. 조정 대기 또는 분할 진입을 검토하십시오',
    '과열 구간입니다. 추격 매수보다 눌림 대기가 유리합니다',
    '상승 가속 국면입니다. 분할 진입으로 리스크를 분산하십시오',
  ],
  high_volatility_down: [
    '급락 국면입니다. 하방 압력 해소 전까지 진입 금지입니다',
    '패닉 구간입니다. 바닥 캔들 확인 후 역발상 진입을 검토하십시오',
    '매도 가속 국면입니다. 포지션 축소 후 현금 보유를 권고합니다',
  ],
};

// ✅ 방향별 비유 선택 — getRotationIndex 기반 (ticker + minute 결정론)
const pickMetaphor = (direction: PriceDirection, keyword: string): string => {
  const pool = LUCIA_METAPHORS[direction];
  const idx = getRotationIndex(keyword, pool.length);
  return pool[idx];
};

export const buildLuciaText = (p: LuciaParams): string => {
  // ✅ LUCIA가 JACK에게 반박 — 장중/장 마감 모두 공통으로 뒤에 부착
  const luciaRebuttal = p.conflict === 'conflict_jack_buy'
    ? '\n↳ 잭 소장님, 거래량이 말해주고 있어요. 숫자가 아직 확신을 주지 않아요. 서두르면 꼭 물려요.'
    : p.conflict === 'conflict_lucia_buy'
      ? '\n↳ 잭 소장님의 신중함을 이해해요. 하지만 공포가 최고의 매수 기회였던 역사를 잊지 마세요.'
      : '';

  // ✅ 장 미개장/마감 시 — forecastMode (재반박 비활성화)
  if (p.isMarketClosed || p.isUSClosed) {
    const isKR = p.assetType === 'KOREAN_STOCK';
    const openTime = isKR ? '09:00' : '23:30';

    const f = p.flags;
    // ✅ 시세 방향별 비유 선택 — 상승/하락/sideways/급등락에 따라 다른 풀
    const direction: PriceDirection = f
      ? determinePriceDirection(f)
      : (p.assetType === 'CRYPTO' ? 'high_volatility_down' : 'sideways');
    const metaphor = pickMetaphor(direction, p.keyword);

    const negatives: string[] = [];
    if (f?.volDown) negatives.push('거래량 저조');
    if (f?.vixHigh) negatives.push('변동성 위험');
    if (f?.trendDown) negatives.push('이평선 하락');
    if (f?.newsNeg) negatives.push('뉴스 부정');
    const negText = negatives.join(' + ');

    const mode: DiscussMode = p.mode ?? 'conflict';

    let line1: string;
    let line2: string;
    // ✅ 최근 흐름(어제 거래량) 인지 문장 — isBeforeOpen 대기 안내 전용
    const hasPrevVolData = !!(p.rawVolume && p.rawVolume > 0);
    const isKRForecast = p.assetType === 'KOREAN_STOCK';
    const volCheckLabel = isKRForecast ? '12시 30분까지' : '02:30(개장 3시간)까지';
    const historyAwareLine = hasPrevVolData
      ? '어제도 거래량이 저조했어요. 오늘 개장 후 첫 캔들 방향이 중요해요.'
      : `개장 후 거래량이 살아나는지 ${volCheckLabel} 확인해보세요.`;

    if (mode === 'bear') {
      const head = negText ? `${negText} 기준으로` : '부정 신호 누적으로';
      line1 = p.isBeforeOpen
        ? `소장님, ${head} 마치 ${metaphor}.`
        : `소장님, 오늘 흐름도 약했어요 — 마치 ${metaphor}.`;
      line2 = p.isBeforeOpen
        ? historyAwareLine
        : `내일 개장 후 반등 확인 전까지 진입은 미루세요.`;
    } else if (mode === 'bull') {
      // 흐름은 좋아 보여도 FOMO 경고
      line1 = p.isBeforeOpen
        ? `소장님, 지표는 긍정적이에요. 하지만 FOMO에 휩쓸리지 마세요.`
        : `소장님, 오늘 흐름은 좋았어요. 하지만 과열 구간은 늘 되돌림이 있어요.`;
      line2 = p.isBeforeOpen
        ? `${openTime} 개장 후 거래량 확인 후 진입하세요.`
        : `내일 개장 후 거래량이 따라주는지 확인한 뒤 움직이세요.`;
    } else {
      const head = negText ? `${negText}가 있어요.` : `방향이 아직 확정되지 않았어요.`;
      line1 = p.isBeforeOpen
        ? `소장님, ${head} 마치 ${metaphor}.`
        : `소장님, 오늘 마감 후에도 ${head.replace(/이 있어요\.|가 있어요\.$/, '')}. 마치 ${metaphor}.`;
      line2 = p.isBeforeOpen
        ? historyAwareLine
        : `내일 방향이 확인되기 전까지 신규 진입은 보류하세요.`;
    }

    // ✅ 재반박 비활성화 — forecastMode
    return `${line1}\n${line2}`;
  }


  // ✅ 이전 종목 맥락 커넥터
  let connector = '';
  if (p.prevCtx && p.prevCtx.prevKeyword && p.prevCtx.prevKeyword !== p.keyword) {
    const ctx = p.prevCtx;
    if (ctx.prevIsCrypto && !ctx.currIsCrypto) {
      connector = '코인과 달리 주식은, ';
    } else if (!ctx.prevIsCrypto && ctx.currIsCrypto) {
      connector = '주식과 달리 코인은 변동성이 훨씬 커요. ';
    } else if (ctx.prevSector && ctx.currSector && ctx.prevSector === ctx.currSector) {
      connector = `${ctx.prevKeyword}${withParticle(ctx.prevKeyword)} 마찬가지로, `;
    } else {
      connector = `${ctx.prevKeyword}${withParticle(ctx.prevKeyword)} 달리, `;
    }
  }

  // ✅ 부정 데이터만 선별 (LUCIA는 부정 지표 챔피언)
  const flags = p.flags;
  const negatives: string[] = [];
  if (flags?.volDown) negatives.push('거래량 저조');
  if (flags?.vixHigh) negatives.push('변동성 위험');
  if (flags?.trendDown) negatives.push('이평선 하락');
  if (flags?.newsNeg) negatives.push('뉴스 부정');

  // ✅ 시세 방향별 비유 선택 — rising/falling/sideways/high_volatility_up/down
  //    삼성전자 -1.37% + 거래량 0.47 같은 케이스 → falling_weak_volume 풀만 선택
  const direction: PriceDirection = flags
    ? determinePriceDirection(flags)
    : (p.assetType === 'CRYPTO' ? 'high_volatility_down' : 'sideways');
  const metaphor = pickMetaphor(direction, p.keyword);

  const mode: DiscussMode = p.mode ?? 'conflict';
  let line1: string;
  let line2: string;

  if (mode === 'bear') {
    // 부정 3개 이상 — 감정 경고 + 역발상 힌트 (JACK의 냉정한 데이터와 온도 차이)
    line1 = `소장님, ${connector}마치 ${metaphor}. 지금은 현금이 맞아요.`;
    line2 = `하지만 모두가 포기할 때가 오히려 기회일 수 있어요. 조금만 더 지켜봐요.`;
  } else if (mode === 'conflict') {
    // 갈등 — 부정 데이터 강조하며 신중론
    const negText = negatives.length > 0 ? `${negatives.join(' + ')} 때문에 ` : '';
    line1 = `소장님, ${connector}마치 ${metaphor}.`;
    line2 = `${negText}겉은 좋아 보여도 속은 아직 확인이 필요해요.`;
  } else {
    // bull — FOMO 경고 (짧게)
    line1 = `소장님, ${connector}${p.keyword}${topicParticle(p.keyword)} 지금 많은 신호가 긍정적이지만,`;
    line2 = `FOMO(나만 뒤처진다는 두려움)에 빠지지 마세요. 과열 구간에서는 더 신중해야 해요.`;
  }

  return `${line1}\n${line2}${luciaRebuttal}`;
};

// ─────────────────────────────────────────────
// ✅ 에코 템플릿 — situation × verdict 조합별 통찰
// ─────────────────────────────────────────────
interface EchoParams {
  keyword: string;
  situation: MarketSituation;
  verdict: Verdict;
  confidence: number;
  confidenceBasis: string;
  volLabel: string;
  condSummary: string;
  positionSizing: string;
  echoBiasNote: string;
  changeRaw: string;
  nasdaqChange: string;
  buyPrice: string;
  sellPrice: string;
  volScore: number;
  sentiment: string;
  assetType: string;
  // ✅ 추가
  watchLevel?: string;       // strong/neutral/weak
  trendStrength?: string;    // 추세 강도
  trendSummary?: string;     // 추세 요약
  conflict?: string;         // 페르소나 충돌
  consecutiveDays?: number;  // 연속 상승/하락 일수
  // ✅ 진입 조건 구체화용
  rawPrice?: number | null;
  avgVolume?: number | null;
  currency?: 'KRW' | 'USD';
  // ✅ Confluence Score — 4지표 일치 여부 (이평선/거래량/뉴스/시세)
  volIsHigh?: boolean;
  hasMarketData?: boolean;
  rawVolume?: number | null;
  // ✅ 토론 모드 + 지표 플래그 (conflict 시 ECHO 질문용)
  mode?: DiscussMode;
  flags?: IndicatorFlags;
  // ✅ 시간대 (forecastMode 분기용)
  isForecast?: boolean;
  isBeforeOpen?: boolean;
}

// ✅ ECHO — 하워드 막스(Howard Marks) 스타일
// 리스크 우선, 냉정한 결론. "지금 시장의 낙관론은 2등급 사고입니다."
// 상황 × 판단 조합별 통찰 문장 (관망 세분화 포함)
// {buy}, {sell}, {change}, {nasdaq}, {keyword}, {days} 는 실제 수치로 치환됨
// watchLevel: strong(강한관망) / neutral(중립관망) / weak(약한관망)
const ECHO_INSIGHTS: Partial<Record<string, string>> = {

  // 교착 구간 — 거래량 증가인데 가격 정체
  'stalemate_관망':
    '거래량은 늘었는데 가격이 {change}%에 그쳤습니다 — 매수·매도 세력이 팽팽히 맞서는 교착 구간입니다. {buy} 돌파로 매도 벽 소화 확인 시 진입하십시오. 그 전까지는 관망이 맞습니다.',
  'stalemate_매수 우위':
    '거래량 증가 + 가격 정체는 매집 완료 직전 신호일 수 있습니다. {buy} 돌파 + 거래량 지속 확인 시 1차 진입하십시오. 손절은 {sell} 기준입니다.',

  // 매집 초기 — 수급 유입 + 저변동성
  'accumulation_관망':
    '수급은 유입되는데 가격이 {change}%로 반응이 없습니다 — 세력 매집 초기 신호로 해석됩니다. 방향성 확정 전까지 관망하되, {buy} 돌파 시 즉각 대응하십시오.',
  'accumulation_매수 우위':
    '수급 유입 + 저변동성 조합은 상승 직전 압축 구간입니다. {buy}에서 1차 진입(10~15%), 추세 확인 후 2차 확대하십시오. 손절은 {sell}입니다.',

  // 추세 추종 — 수급·가격 동반 상승
  'trending_매수 우위':
    '수급·가격 동반 상승 — 정배열 구간(5일·20일 이평선이 나란히 우상향하는 구조, 상승 추세가 지속될 가능성이 높은 상태)으로 나스닥 {nasdaq}%와 동조화됩니다. 1차 {buy} 진입(10~15%), 추세 유지 확인 후 2차 확대하십시오. 손절 {sell} 이탈 시 전량 정리.',
  'trending_관망':
    '거래량 폭증에도 불구하고 종합 신호가 관망을 가리킵니다. {buy} 돌파 + 나스닥 {nasdaq}% 이상 유지 시 진입 검토하십시오.',

  // 수급 이탈 — 거래량 저조
  'drain_관망':
    '거래량 저조 — 수급 이탈 구간입니다. {change}%의 가격 움직임은 신뢰하기 어렵습니다. 거래량이 회복되고 {buy} 조건이 충족될 때까지 신규 진입을 금지하십시오.',
  'drain_매도 우위':
    '수급 이탈 + 하락 — 보유 포지션 50% 즉시 축소하십시오. 잔여분은 {sell} 이탈 시 전량 정리하십시오.',

  // 패닉 셀 — 거래량 폭증 + 급락
  'panic_매도 우위':
    '거래량 폭증과 급락 동시 발생 — 감정적 투매 구간입니다. {sell} 이탈 시 전량 정리하십시오. 역발상 진입은 반드시 바닥 캔들 확인 후 시도하십시오.',
  'panic_관망':
    '패닉 셀 구간이나 종합 신호는 관망입니다. {sell} 지지 확인 후 소량 진입을 검토하십시오. 성급한 역발상은 금지합니다.',

  // 과열 둔화 — 고점 + 거래량 감소
  'exhaustion_관망':
    '고점 근접 + 거래량 둔화 — 상승 에너지 소진 신호입니다. 신규 진입보다 {sell} 기준 기존 포지션 익절 검토가 우선입니다. 추격 매수는 금지하십시오.',
  'exhaustion_매도 우위':
    '고점 과열 + 매도 신호 — 포지션 50% 즉시 축소하십시오. {sell} 이탈 확인 시 전량 정리하십시오.',

  // 일반 — 특이 신호 없음
  'normal_관망':
    '특이 신호 없는 관망 구간입니다. {buy} 돌파 + 거래량 증가 확인 시 진입을 검토하십시오. 그 전까지 신규 진입을 금지하십시오.',
  'normal_매수 우위':
    '복합 신호 기준 매수 우위입니다. {buy}에서 1차 진입(10~15%), {sell} 손절 설정 후 추세 확인하십시오.',
};

export const buildEchoText = (p: EchoParams): { summary: string; details: string } => {
  const key = `${p.situation}_${p.verdict}`;
  let insightTemplate = ECHO_INSIGHTS[key] || ECHO_INSIGHTS[`normal_${p.verdict}`] || '';

  // ✅ 매수 조건 가격 정규화 — 현재가보다 낮으면 현재가 × 1.02로 강제 (오류 방지)
  //    buildEntryCondition에서 rawLow*0.98 같은 "낮은 가격"이 buyPrice로 들어올 수 있어,
  //    현재가보다 낮은 매수 조건이 표시되는 오류를 차단한다.
  const effectiveBuyPrice: string = (() => {
    const cur = p.currency || 'KRW';
    const fmt = (n: number): string =>
      cur === 'KRW'
        ? `${Math.round(n).toLocaleString('ko-KR')}원`
        : `약 $${Math.round(n).toLocaleString('en-US')}`;
    if (!p.rawPrice || p.rawPrice <= 0) return p.buyPrice || '';
    const fallback = fmt(p.rawPrice * 1.02);
    if (!p.buyPrice) return fallback;
    const parsed = parseFloat(p.buyPrice.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    if (parsed < p.rawPrice) return fallback;
    return p.buyPrice;
  })();

  // ✅ 관망 세분화 — watchLevel에 따라 다른 메시지
  if (p.verdict === '관망' && p.watchLevel) {
    if (p.watchLevel === 'strong') {
      insightTemplate = `지금은 진입하면 안 됩니다. ${p.trendSummary ? p.trendSummary + '. ' : ''}${p.sellPrice} 아래로 내려가면 손실이 커집니다. 현금을 지키는 것이 최선입니다.`;
    } else if (p.watchLevel === 'weak') {
      // ✅ 미국 주식은 즉각 진입 불가 — 다음 날 종가 확인 후 검토
      const entryClause = p.assetType === 'US_STOCK'
        ? '다음 날 미국장 종가 확인 후 진입을 검토하십시오'
        : '즉각 10% 진입하십시오';
      // ✅ 다양한 표현으로 반복 방지 — 키워드 해시 기반 선택
      const weakPhrases = [
        `신호가 거의 만들어지고 있습니다. {buy} 돌파 확인 시 투자금의 10%만 먼저 진입하십시오. 매수 조건 동시 충족 시 ${entryClause}.`,
        `조금만 더 기다리십시오. {buy} 위로 올라서면서 거래량이 늘어날 때가 진입 시점입니다. 투자금의 10%만 먼저 매수하십시오.`,
        `진입 조건이 가까워지고 있습니다. {buy} 돌파 + 거래량 증가 동시 확인 시 투자금의 10%로 시작하십시오.`,
        `준비 구간입니다. {buy}을 오늘 종가에서 돌파하면 투자금의 10%만 선취매하십시오. 서두르지 마십시오.`,
      ];
      // ✅ 결정론적 로테이션 — ticker + 분 단위 시드 (getRotationIndex 공통 사용)
      const phraseIdx = getRotationIndex(p.keyword, weakPhrases.length);
      insightTemplate = `${p.trendSummary ? p.trendSummary + '. ' : ''}${weakPhrases[phraseIdx]}`;
    } else {
      // neutral
      insightTemplate = `아직 신호가 없습니다. ${p.trendSummary ? p.trendSummary + '. ' : ''}{buy} 돌파 + 거래량 증가를 동시에 확인할 때까지 기다리십시오.`;
    }
  }

  // 실제 수치 치환
  const days = p.consecutiveDays ? Math.abs(p.consecutiveDays).toString() : '';
  const insight = insightTemplate
    .replace(/{buy}/g, effectiveBuyPrice || p.condSummary.split('/')[0]?.trim() || '매수 조건')
    .replace(/{sell}/g, p.sellPrice || p.condSummary.split('/')[1]?.trim() || '손절가')
    .replace(/{change}/g, p.changeRaw !== '0.00' ? `${parseFloat(p.changeRaw) >= 0 ? '+' : ''}${p.changeRaw}` : '0')
    .replace(/{nasdaq}/g, p.nasdaqChange !== '0' ? `${parseFloat(p.nasdaqChange) >= 0 ? '+' : ''}${p.nasdaqChange}` : '0')
    .replace(/{keyword}/g, p.keyword)
    .replace(/{days}/g, days);

  // ✅ 충돌 상황 에코 처리 — 기존 line2 꼬리말 (Confluence 뒤 토론 블록과 분리)
  let conflictNote = '';
  if (p.conflict === 'conflict_jack_buy') {
    conflictNote = ' 잭은 모멘텀을, 루시아는 과열을 경고합니다. 두 신호가 충돌할 때는 포지션을 줄이는 것이 포트폴리오 이론의 정석입니다(리스크를 분산해 손실을 줄이는 원칙).';
  } else if (p.conflict === 'conflict_lucia_buy') {
    conflictNote = ' 잭은 하락을 경고하고 루시아는 역발상 기회를 말합니다. 두 신호 충돌 시 절반만 진입하고 나머지는 확인 후 결정하십시오.';
  }

  // ✅ ⚔️ 참모진 토론 블록 — 충돌 시에만 표시 (JACK/LUCIA 발언은 각자 말풍선에서)
  //    ECHO는 충돌 감지 사실과 판단만 제시
  let debateBlock = '';
  if (p.conflict === 'conflict_jack_buy' || p.conflict === 'conflict_lucia_buy') {
    let echoJudgement: string;
    if (p.verdict === '매수 우위') {
      echoJudgement = p.conflict === 'conflict_jack_buy'
        ? 'JACK 채택 — 모멘텀 신호 강세, 단 LUCIA 경고 반영해 분할 진입'
        : 'LUCIA 채택 — 역발상 기회, 단 바닥 확인 후 소량 선진입';
    } else if (p.verdict === '매도 우위') {
      echoJudgement = p.conflict === 'conflict_jack_buy'
        ? 'LUCIA 채택 — 과열 경고 우선, 포지션 축소 권고'
        : 'JACK 채택 — 하락 신호 우선, 손절 라인 확인 권고';
    } else {
      echoJudgement = '중재 — 양 신호 충돌 구간, 신규 진입 보류 후 방향 확정 대기';
    }
    debateBlock = [
      `⚔️ 참모진 의견 충돌 감지`,
      `  → ECHO 판단: ${echoJudgement}`,
    ].join('\n');
  }

  // ✅ 시간 개념 추가 — 매수 우위일 때
  let timeNote = '';
  if (p.verdict === '매수 우위') {
    timeNote = ` 오늘 종가(장 마감) 기준으로 ${effectiveBuyPrice} 위에 있으면 진입하십시오. 내일 오전 시초가가 ${effectiveBuyPrice} 아래로 열리면 추가 매수는 보류하십시오.`;
  }

  // ✅ 에코 결론 5단계 강제 분기
  // verdict × trendStrength × volScore × situation 조합으로 상황별 차별화
  let verdictText: string;
  let verdictEmoji: string;

  if (p.verdict === '매수 우위') {
    // 강한 매수 vs 일반 매수
    if ((p.trendStrength === 'strong_up' || p.trendStrength === 'weak_up') && p.volScore >= 2) {
      verdictText = '즉시 진입을 권고합니다 — 강한 모멘텀 확인';
      verdictEmoji = '🟢';
    } else if (p.situation === 'trending') {
      verdictText = '단계적 진입을 권고합니다 — 추세 추종 구간';
      verdictEmoji = '🟢';
    } else {
      verdictText = '소량 분할 진입을 권고합니다 — 신호 확인 필요';
      verdictEmoji = '🟡';
    }
  } else if (p.verdict === '매도 우위') {
    // 강한 매도 vs 일반 매도
    if (p.situation === 'panic' || p.trendStrength === 'strong_down') {
      verdictText = '즉시 포지션 정리를 권고합니다 — 패닉 구간 리스크';
      verdictEmoji = '🔴';
    } else {
      verdictText = '포지션 축소를 권고합니다 — 하락 신호 감지';
      verdictEmoji = '🔴';
    }
  } else {
    // 관망 3단계
    if (p.watchLevel === 'strong') {
      verdictText = '신규 진입을 금지합니다 — 하락 리스크 구간';
      verdictEmoji = '🔴';
    } else if (p.watchLevel === 'weak') {
      // ✅ 진입 조건 구체화 — 현재가/매수가/거래량 수치 명시
      const echoFmtVol = (v: number): string => {
        if (v >= 100000000) return `${(v / 100000000).toFixed(1)}억주`;
        if (v >= 10000) return `${Math.round(v / 10000).toLocaleString()}만주`;
        return `${v.toLocaleString()}주`;
      };
      const echoCur = p.currency || 'KRW';
      const echoFmtPrice = (n: number): string =>
        echoCur === 'KRW'
          ? `${Math.round(n).toLocaleString('ko-KR')}원`
          : `약 $${Math.round(n).toLocaleString('en-US')}`;
      const buyTrigger = p.rawPrice && p.rawPrice > 0
        ? echoFmtPrice(p.rawPrice * 1.02)
        : (effectiveBuyPrice || '매수 조건');
      const volTrigger = p.avgVolume && p.avgVolume > 0
        ? `${echoFmtVol(Math.round(p.avgVolume * 1.3))} 이상(평균 ${echoFmtVol(p.avgVolume)} 대비 30%)`
        : '평소 대비 30% 이상';
      const concreteCondition = p.rawPrice && p.rawPrice > 0
        ? ` — 현재가 ${echoFmtPrice(p.rawPrice)} 기준 매수 조건: ${buyTrigger}(+2%) 돌파 + 거래량 ${volTrigger} 동시 확인`
        : '';

      // 약한 관망도 상황별로 다르게
      if (p.situation === 'accumulation') {
        verdictText = `매집 초기 감지 — 소량 선진입 검토 가능합니다${concreteCondition}`;
        verdictEmoji = '🟡';
      } else if (p.trendStrength === 'strong_up' || p.trendStrength === 'weak_up') {
        verdictText = `진입 조건 임박 — 신호 포착 즉시 대응하십시오${concreteCondition}`;
        verdictEmoji = '🟡';
      } else {
        verdictText = `준비 구간 — 조건 충족 시 진입 준비하십시오${concreteCondition}`;
        verdictEmoji = '🟡';
      }
    } else {
      // neutral 관망도 상황별로
      if (p.situation === 'stalemate') {
        verdictText = '교착 구간 대기 — 돌파 방향 확인 후 진입하십시오';
        verdictEmoji = '⚪';
      } else if (p.situation === 'drain') {
        verdictText = '수급 이탈 구간 — 거래량 회복 확인 전까지 대기하십시오';
        verdictEmoji = '⚪';
      } else if (p.situation === 'exhaustion') {
        verdictText = '과열 둔화 구간 — 신규 진입 자제, 익절 검토하십시오';
        verdictEmoji = '🟡';
      } else {
        verdictText = '조건부 대기 — 신호 확인 후 진입하십시오';
        verdictEmoji = '⚪';
      }
    }
  }

  // ✅ summary용 짧은 결론 라벨 (verdictText 안의 부가 설명은 제거)
  const verdictShort =
    p.verdict === '매수 우위'
      ? ((p.trendStrength === 'strong_up' || p.trendStrength === 'weak_up') && p.volScore >= 2)
        ? '즉시 진입'
        : p.situation === 'trending'
          ? '단계적 진입'
          : '소량 분할 진입'
      : p.verdict === '매도 우위'
        ? (p.situation === 'panic' || p.trendStrength === 'strong_down')
          ? '즉시 정리'
          : '포지션 축소'
        : p.watchLevel === 'strong'
          ? '신규 진입 금지'
          : p.watchLevel === 'weak'
            ? '진입 준비 — 조건 충족 대기'
            : '관망';

  // ✅ Confluence Score — 4지표 일치 체크
  const trendPass  = p.trendStrength === 'strong_up' || p.trendStrength === 'weak_up';
  const newsPass   = p.sentiment === '긍정';
  const newsWarn   = p.sentiment === '중립';
  const pricePass  = !!p.hasMarketData;

  // ✅ 거래량 판정 — RAY와 동일 기준: rawVolume vs avgVolume 직접 비교
  //    있을 때: >1.1배 증가, 0.9~1.1배 보통, <0.9배 감소
  //    없을 때: vol.isHigh fallback
  let volumePass: boolean;
  let volumeIcon: string;
  let volumeText: string;
  if (p.rawVolume && p.rawVolume > 0 && p.avgVolume && p.avgVolume > 0) {
    if (p.rawVolume > p.avgVolume * 1.1) {
      volumePass = true;
      volumeIcon = '✅';
      volumeText = '거래량 증가';
    } else if (p.rawVolume >= p.avgVolume * 0.9) {
      volumePass = false;
      volumeIcon = '⚠️';
      volumeText = '거래량 보통';
    } else {
      volumePass = false;
      volumeIcon = '⚠️';
      volumeText = '거래량 감소';
    }
  } else {
    volumePass = !!p.volIsHigh;
    volumeIcon = volumePass ? '✅' : '⚠️';
    volumeText = volumePass ? '거래량 증가' : '거래량 평이';
  }

  const trendIcon  = trendPass ? '✅' : '⚠️';
  const newsIcon   = newsPass ? '✅' : newsWarn ? '⚠️' : '❌';
  const priceIcon  = pricePass ? '✅' : '⚠️';

  const passCount = [trendPass, volumePass, newsPass, pricePass].filter(Boolean).length;
  const strengthLabel = passCount >= 4 ? '높음' : passCount === 3 ? '보통' : '낮음';

  // ✅ trendStrength 기반 서술 — 5일/20일 이평선 위치 + 방향성 표기
  const trendText =
    p.trendStrength === 'strong_up'
      ? '5일·20일 이평선 위 상승 추세'
      : p.trendStrength === 'strong_down'
        ? '5일·20일 이평선 아래 하락 추세'
        : p.trendStrength === 'weak_up'
          ? '5일 이평선 위, 20일 이평선 아래 — 방향성 혼재'
          : p.trendStrength === 'weak_down'
            ? '5일 이평선 아래, 20일 이평선 위 — 방향성 혼재'
            : '이평선 방향 혼재';
  const newsText   = `뉴스 ${p.sentiment}`;
  const priceText  = pricePass ? '시세 안정' : '시세 미수급';

  const confluenceBlock = [
    `컨플루언스 신호 강도: ${strengthLabel} (${passCount}/4 지표 일치)`,
    `${trendIcon} ${trendText}`,
    `${volumeIcon} ${volumeText}`,
    `${newsIcon} ${newsText}`,
    `${priceIcon} ${priceText}`,
  ].join('\n');
  // ✅ 뉴스 언급 제거 — 각 페르소나의 뉴스 칩에서 확인
  const line2 = `근거: ${p.trendSummary ? p.trendSummary + ' / ' : ''}${p.volLabel}${conflictNote}`;
  const line3 = `지금: ${insight}${timeNote}`;
  // ✅ ECHO 2 (details) 조건 매수가 — ECHO 1 trigger와 동일하게 effectiveBuyPrice 사용
  //    기존: p.condSummary는 route.ts에서 extractConditionPrices로 뽑은 raw buyPrice(예: rawLow*0.98)
  //    수정: effectiveBuyPrice(rawPrice*1.02) 기준으로 재구성 → ECHO 1/2 매수가 통일
  const rebuiltCondSummary = [
    effectiveBuyPrice && `매수(${effectiveBuyPrice})`,
    p.sellPrice && `손절(${p.sellPrice})`,
  ].filter(Boolean).join(' / ') || p.condSummary || '시장 상황 주시';
  const line4 = `조건: ${rebuiltCondSummary}`;
  // ✅ 거래량 기준 — ECHO 1/2 통일 (avgVolume × 1.3) — line5와 trigger에서 재사용
  const triggerFmtVol = (v: number): string => {
    if (v >= 100000000) return `${(v / 100000000).toFixed(1)}억주`;
    if (v >= 10000) return `${Math.round(v / 10000).toLocaleString()}만주`;
    return `${v.toLocaleString()}주`;
  };
  const volNumberLabel = p.avgVolume && p.avgVolume > 0
    ? `거래량 ${triggerFmtVol(Math.round(p.avgVolume * 1.3))} 이상`
    : '거래량 평소 대비 30% 이상';
  const volThresholdLabel = volNumberLabel;

  // ✅ 에코 line5 — 단계별 행동 경로 (코인은 비중 절반, 손절 -7% 명시)
  const isCryptoLine5 = p.assetType === 'CRYPTO';
  const firstEntryPct = isCryptoLine5 ? 5 : 10;
  const aggressiveEntryPct = isCryptoLine5 ? 10 : 20;
  const addEntryPct = isCryptoLine5 ? 3 : 10;
  const cryptoStopNote = isCryptoLine5 ? ' (코인 권장 손절 -7% 기준)' : '';

  let line5 = '';
  if (p.verdict === '매수 우위') {
    const buy1 = effectiveBuyPrice || '매수 조건';
    const sell1 = p.sellPrice || '손절가';
    if ((p.trendStrength === 'strong_up') && p.volScore >= 2) {
      line5 = `비중: 지금 바로 투자금의 ${aggressiveEntryPct}%를 먼저 매수하십시오. 3거래일 후 ${buy1} 유지 확인 시 추가 ${addEntryPct}% 매수하십시오. ${sell1} 이탈 시 전량 정리하십시오.${cryptoStopNote}`;
    } else {
      line5 = `비중: 지금 바로 투자금의 ${firstEntryPct}%만 먼저 매수하십시오. 3거래일 후 ${buy1} 유지 확인 시 추가 ${addEntryPct}% 매수하십시오. ${sell1} 이탈 시 전량 정리하십시오.${cryptoStopNote}`;
    }
  } else if (p.verdict === '매도 우위') {
    const sell1 = p.sellPrice || '손절가';
    line5 = `비중: 보유 중이라면 지금 즉시 50% 정리하십시오. ${sell1} 이탈 확인 시 나머지 전량 정리하십시오. 신규 매수는 절대 금지입니다.${cryptoStopNote}`;
  } else if (p.watchLevel === 'weak') {
    const buy1 = effectiveBuyPrice || '매수 조건';
    const sell1 = p.sellPrice || '손절가';
    line5 = `비중: 아직 0%이지만 준비하십시오. ${buy1} 돌파 + ${volThresholdLabel} 동시 확인 시 → ${firstEntryPct}% 진입하십시오. 3거래일 유지 확인 시 → 추가 ${addEntryPct}% 진입하십시오. ${sell1} 이탈 시 → 전량 정리하십시오.${cryptoStopNote}`;
  } else if (p.watchLevel === 'strong') {
    line5 = `비중: 현재 0%를 유지하십시오. 지금 진입하면 손실 위험이 큽니다. 시장이 안정될 때까지 현금을 지키는 것이 최선입니다.`;
  } else {
    const buy1 = effectiveBuyPrice || '매수 조건';
    line5 = `비중: 현재 0%입니다. ${buy1} 돌파 + ${volThresholdLabel}을 동시에 확인한 후 ${firstEntryPct}%씩 단계적으로 진입하십시오.${cryptoStopNote}`;
  }

  // ✅ 2단 분리
  //    summary: 모드별 결론(conflict 시 ECHO 질문 포함) — 즉시 표시
  //    details: 기존 Confluence + 근거 + 지금 + 조건 + 비중 — 별도 버블

  // 📍 조건 — 검증된 진입/정리 트리거 (volNumberLabel은 상단에서 재사용)
  const trigger = (p.verdict === '매도 우위')
    ? `${p.sellPrice || '손절가'} 이탈 시 정리`
    : `${effectiveBuyPrice || '매수 조건'} 돌파 + ${volNumberLabel}`;

  // 📍 행동 — 한 줄 (코인은 더 보수적 비중)
  const isCrypto = p.assetType === 'CRYPTO';
  const actionShort =
    p.verdict === '매수 우위'
      ? isCrypto
        ? '투자금의 5~10%만 진입 (코인 변동성). 손절 -7%.'
        : ((p.trendStrength === 'strong_up' || p.trendStrength === 'weak_up') && p.volScore >= 2)
          ? '투자금의 20% 선진입, 유지 확인 시 추가 10%.'
          : '투자금의 10% 선진입, 유지 확인 시 추가 10%.'
      : p.verdict === '매도 우위'
        ? '보유분 50% 즉시 정리, 손절 이탈 시 전량.'
        : p.watchLevel === 'strong'
          ? '현금 유지. 지금 진입하면 손실 위험이 큽니다.'
          : p.watchLevel === 'weak'
            ? isCrypto ? '조건 충족 시 5% 선진입 준비.' : '조건 충족 시 10% 선진입 준비.'
            : isCrypto ? '신호 확인 후 5%씩 단계 진입.' : '신호 확인 후 10%씩 단계 진입.';

  // ✅ 모드별 결론 결정
  const mode: DiscussMode = p.mode ?? 'conflict';
  let modeEmoji: string;
  let modeVerdict: string;
  if (mode === 'bull') {
    modeEmoji = '🟢'; modeVerdict = '진입';
  } else if (mode === 'bear') {
    modeEmoji = '🔴'; modeVerdict = '관망';
  } else {
    modeEmoji = '🟡'; modeVerdict = '조건부';
  }

  // ✅ ECHO 질문 (conflict 모드 + 장 중일 때만) — forecastMode에서는 비활성화
  // 충돌 유형별 3가지씩 로테이션 — getRotationIndex(ticker, length) 공통 시드 사용
  //   - ticker + 분 단위 결정론 → 같은 종목 1분 내 재요청은 동일, 1분 경과 후 다른 문구
  //   - LUCIA/JACK 본문과 동일한 시드 로직으로 일관성 확보
  let echoQuestion = '';
  let jackRebuttalLine = '';
  let luciaRebuttalLine = '';
  if (mode === 'conflict' && p.flags && !p.isForecast) {
    const f = p.flags;

    // 충돌 유형 선택 (이평선+뉴스 vs 거래량 / 일반 충돌)
    const isTrendVsVol = f.trendUp && f.newsPos && f.volDown;
    const questionPool: string[] = isTrendVsVol
      ? [
          '⚔️ 잭은 이평선+뉴스를, 루시아는 거래량을 근거로 합니다. 거래량 저조에도 진입할 가치가 있습니까?',
          '⚔️ 추세는 살아있지만 거래량이 침묵합니다. 신호를 믿어야 합니까?',
          '⚔️ 이평선이 긍정적이나 거래량이 동의하지 않습니다. 어느 쪽이 맞습니까?',
        ]
      : [
          '⚔️ 잭과 루시아의 신호가 충돌합니다. 어느 쪽을 우선해야 합니까?',
          '⚔️ 참모진 의견이 갈렸습니다. 지휘관님의 판단이 필요합니다.',
          '⚔️ 두 신호가 상반됩니다. 어느 쪽이 더 신뢰할 수 있습니까?',
        ];

    // ✅ 결정론적 로테이션 — getRotationIndex (ticker + 분 시드) 공통 사용
    //    같은 종목 1분 내 재질의 → 동일 질문 / 1분 경과 후 → 다른 질문
    const safeIdx = getRotationIndex(p.keyword, questionPool.length);
    echoQuestion = questionPool[safeIdx];

    // 🔍 진단 로그 — Vercel 서버 로그에서 로테이션 실제 작동 여부 확인 가능
    console.log(`[ECHO 질문 로테이션] keyword=${p.keyword} type=${isTrendVsVol ? 'trendVsVol' : 'general'} idx=${safeIdx}/${questionPool.length - 1} question="${echoQuestion.slice(0, 30)}..."`);

    // ✅ JACK/LUCIA 재답변 — ECHO 질문 뒤 1줄씩 (conflict 유형별 차별화)
    if (p.conflict === 'conflict_jack_buy') {
      jackRebuttalLine = '→ 잭: 모멘텀이 명확합니다. 거래량만 뒤따르면 즉각 진입하십시오.';
      luciaRebuttalLine = '→ 루시아: 거래량이 침묵해요. 서두르면 꼭 물려요. 확인이 먼저예요.';
    } else if (p.conflict === 'conflict_lucia_buy') {
      jackRebuttalLine = '→ 잭: 떨어지는 칼날은 잡지 마십시오. 지지 확인이 먼저입니다.';
      luciaRebuttalLine = '→ 루시아: 공포가 최고의 매수 기회였어요. 분할로 접근하세요.';
    } else {
      jackRebuttalLine = '→ 잭: 긍정 신호가 살아있습니다. 거래량 돌파 시 진입하십시오.';
      luciaRebuttalLine = '→ 루시아: 지표가 혼재돼요. 거래량이 따라줄 때 움직이세요.';
    }
  }

  const summaryParts: string[] = [];
  if (echoQuestion) {
    summaryParts.push(echoQuestion);
    if (jackRebuttalLine) summaryParts.push(jackRebuttalLine);
    if (luciaRebuttalLine) summaryParts.push(luciaRebuttalLine);
  }

  if (p.isForecast) {
    // ✅ forecastMode — 시간 조건 명시 + 잭/루시아 종합 요약
    const isKR = p.assetType === 'KOREAN_STOCK';
    const openTime = isKR ? '09:00' : '23:30';
    const halfCheckpoint = isKR ? '12시 30분까지' : '02:30(개장 3시간)까지';
    const forecastCondition = p.isBeforeOpen
      ? `${openTime} 개장 후 ${halfCheckpoint} ${trigger}`
      : `내일 ${halfCheckpoint} ${trigger}`;
    const forecastAction = mode === 'bull'
      ? '조건 충족 시 10% 진입 → 잭의 상승 전망 + 루시아의 거래량 조건 채택'
      : mode === 'bear'
        ? '신규 진입 보류 → 잭의 하락 전망 + 루시아의 리스크 경고 채택'
        : '조건 충족 시 10% 진입 → 잭의 긍정 신호 + 루시아의 거래량 조건 동시 확인';
    summaryParts.push(`📍 결론: ${modeEmoji} ${modeVerdict} (${verdictShort})`);
    summaryParts.push(`📍 조건: ${forecastCondition}`);
    summaryParts.push(`📍 행동: ${forecastAction}`);
  } else {
    summaryParts.push(`📍 결론: ${modeEmoji} ${modeVerdict} (${verdictShort})`);
    summaryParts.push(`📍 조건: ${trigger}`);
    summaryParts.push(`📍 행동: ${actionShort}`);
  }
  const summary = summaryParts.join('\n');

  // ✅ details는 상세 맥락을 보존 (verdictText 원문 + confluence + 근거/지금/조건/비중)
  // ✅ ECHO 1/2 이모지 통일 — modeEmoji(bull=🟢, bear=🔴, conflict=🟡) 사용
  //    verdictText는 상세 설명으로 유지
  const detailHeader = `결론: ${modeEmoji} ${verdictText}`;
  const detailParts: string[] = [detailHeader, confluenceBlock];
  if (debateBlock) detailParts.push(debateBlock);
  detailParts.push(line2, line3, line4, line5);
  const details = detailParts.join('\n');

  return { summary, details };
};
