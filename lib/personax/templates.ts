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

// ─────────────────────────────────────────────
// 잭 템플릿 파라미터
// ─────────────────────────────────────────────
// MarketSituation 타입 (scoring.ts와 동기화)
type MarketSituation =
  | 'accumulation' | 'trending' | 'stalemate'
  | 'drain' | 'panic' | 'exhaustion' | 'normal';

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
  currency?: string;           // KRW / USD
}

// ✅ 잭 상황별 해석 — 모멘텀 이론 + 추세 맥락 통합
// ✅ JACK — 댄 아이브스(Dan Ives) 스타일
// 확신에 찬 기술주 강세론자. 데이터로 말하고 결론은 명확하게.
// "이건 사이클이 아닙니다. 구조적 변화입니다."
const JACK_INTERPRETATIONS: Record<MarketSituation, string> = {
  accumulation: '거래량은 늘었는데 가격이 안 움직인다 — 이건 세력의 조용한 매집 신호입니다. 방향이 터지는 순간, 추세는 빠르게 형성됩니다. 확인 즉시 진입하십시오.',
  trending:     '거래량과 가격이 동시에 오르는 건 구조적 강세의 증거입니다. 단순한 반등이 아닙니다 — 추세에 올라타는 전략이 통계적으로 옳습니다.',
  stalemate:    '거래량은 늘었는데 가격이 안 움직입니다. 매수세와 매도세가 팽팽히 맞서는 교착 구간으로, 어느 한쪽이 지치는 순간 방향이 결정됩니다.',
  drain:        '거래량이 줄고 있습니다. 투자자들이 관심을 잃었다는 신호입니다. 거래량 없이 움직이는 가격은 믿기 어렵습니다.',
  panic:        '급락과 거래량 폭증이 동시에 발생했습니다. 투자자들이 공포에 휩쓸려 팔아치우는 구간입니다. 손절 라인을 먼저 확인하십시오.',
  exhaustion:   '고점 근처에서 거래량이 줄어들고 있습니다. 더 오를 힘이 빠지는 신호입니다. 신규 진입보다 기존 포지션 정리가 우선입니다.',
  normal:       '특이 신호 없는 일반적인 시장 흐름입니다.',
};

export const buildJackText = (p: JackParams): string => {

  // ✅ 장 미개장/마감 시 — 전일 기준 평가 + 다음 개장 시 구체적 수치 조건 제시
  const isKRClosed = p.isMarketClosed;
  const isUSClosed = p.isUSClosed;
  if (isKRClosed || isUSClosed) {
    const isKR = p.assetType === 'KOREAN_STOCK';
    const openTime = isKR ? '09:00' : '23:30';
    // ✅ nextSession — 마감 후 당일 밤 미국장 있으면 "오늘 밤"
    const _nowJack = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const _tKST = _nowJack.getUTCHours() * 100 + _nowJack.getUTCMinutes();
    const usOpensTonightJack = !isKR && !p.isBeforeOpen && _tKST < 2330;
    const nextSession = p.isBeforeOpen
      ? (isKR ? '오늘' : '오늘 밤')
      : (isKR ? '내일' : usOpensTonightJack ? '오늘 밤' : '내일 밤');
    // ✅ 요일 정확화 — 월요일 개장 전 = 지난 금요일
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const dayKST = now.getUTCDay(); // 0=일, 1=월
    const isMondayBeforeOpen = isKR && p.isBeforeOpen && dayKST === 1;
    const timeLabel = p.isWeekend
      ? '지난 금요일'
      : isMondayBeforeOpen ? '지난 금요일'
      : p.isBeforeOpen ? '어제' : '오늘';

    const trendEval = p.trendSummary || '추세 중립 — 방향성 미확정';

    // ✅ 거래량 수치 구체화
    const avgVol = p.avgVolume;
    const volUnit = isKR ? '주' : '주';
    const formatVol = (v: number) => {
      if (v >= 100000000) return `${(v / 100000000).toFixed(1)}억${volUnit}`;
      if (v >= 10000) return `${Math.round(v / 10000).toLocaleString()}만${volUnit}`;
      return `${v.toLocaleString()}${volUnit}`;
    };
    const volCondition = avgVol && avgVol > 0
      ? `거래량 ${formatVol(Math.round(avgVol * 1.3))} 이상(5일 평균 ${formatVol(avgVol)} 대비 30% 이상)`
      : '거래량 평소 대비 30% 이상 증가';

    const condAction = p.verdict === '매수 우위'
      ? `${nextSession} ${openTime} 개장 후 가격 상승 + ${volCondition} 동시 확인 시 즉각 진입하십시오.`
      : p.verdict === '매도 우위'
        ? `${nextSession} ${openTime} 개장 후 추가 하락 + ${volCondition} 감소 확인 시 포지션 축소를 검토하십시오.`
        : `${nextSession} ${openTime} 개장 후 가격 +2% 이상 + ${volCondition} 동시 확인할 때까지 대기하십시오.`;
    const statusLabel = p.isWeekend ? '주말 휴장 중입니다' : p.isBeforeOpen ? `장 개장 전(${openTime} 개장)입니다` : '장 마감 후입니다';
    return `지휘관님, ${p.keyword}는 현재 ${statusLabel}. ${timeLabel} 기준 — ${trendEval}. ${condAction}`;
  }

  const contextNote = (p.prevKeyword && p.prevKeyword !== p.keyword)
    ? `앞서 ${p.prevKeyword}에서 ${p.prevVolIsHigh ? '수급 유입' : '수급 제한'}을 확인했으며, `
    : '';

  const changeStr = (p.changeRaw && p.changeRaw !== '0.00')
    ? ` (${parseFloat(p.changeRaw) >= 0 ? '+' : ''}${p.changeRaw}%)`
    : '';
  const volRatioStr = p.volRatio && p.volRatio > 0
    ? ` (평균의 ${p.volRatio.toFixed(1)}배)`
    : '';
  const volSuffix = p.volIsHigh
    ? `${changeStr} 수급 유입이 확대되고 있습니다${volRatioStr}`
    : `${changeStr} 수급 유입이 제한적입니다`;

  // ✅ 상황별 해석 — 투자 이론 근거
  const interpretation = p.situation
    ? JACK_INTERPRETATIONS[p.situation]
    : '';

  // 변동성 해석
  let vixNote = '';
  if (p.vixAvailable && !interpretation) {
    if (p.vixLabel.includes('고변동성')) {
      vixNote = `, ${p.vixLabel} 구간으로 급등락 리스크가 존재합니다`;
    } else if (p.vixLabel.includes('중변동성')) {
      vixNote = `, ${p.vixLabel} 구간이므로 가격 탄력이 확인됩니다`;
    } else {
      vixNote = p.volIsHigh
        ? `, ${p.vixLabel} 구간이나 거래량 증가로 추세 전환 가능성이 있습니다`
        : `, ${p.vixLabel} 구간이므로 추격 매수보다 눌림 대기가 유리합니다`;
    }
  }

  const trend = p.change > 0.5 ? '단기 상승 모멘텀' : p.change < -0.5 ? '단기 하락 추세' : '추세 중립';

  // ✅ 거래량 수치 헬퍼 — 장 중에도 avgVolume 수치 사용
  const jackFormatVol = (v: number): string => {
    if (v >= 100000000) return `${(v / 100000000).toFixed(1)}억주`;
    if (v >= 10000) return `${Math.round(v / 10000).toLocaleString()}만주`;
    return `${v.toLocaleString()}주`;
  };
  const jackAvgVol = p.avgVolume && p.avgVolume > 0 ? p.avgVolume : null;
  const jackVolSignal = jackAvgVol
    ? `(신호 = 가격이 2% 이상 상승하거나 거래량이 ${jackFormatVol(Math.round(jackAvgVol * 1.3))} 이상 증가할 때 — 평소 ${jackFormatVol(jackAvgVol)} 대비 30%)`
    : `(신호 = 가격이 2% 이상 상승하거나 거래량이 평소 대비 30% 이상 증가할 때)`;
  const jackBreakthroughSignal = jackAvgVol
    ? `(돌파 신호 = 가격이 오늘 고점을 넘으면서 거래량이 ${jackFormatVol(Math.round(jackAvgVol * 1.2))} 이상 늘어날 때 — 평소 ${jackFormatVol(jackAvgVol)} 대비 20%)`
    : `(돌파 신호 = 가격이 오늘 고점을 넘으면서 거래량이 평소보다 20% 이상 늘어날 때)`;

  // ✅ 매수/매도 우위에도 avgVolume 기반 거래량 신호 추가
  const jackBuySellVolNote = jackAvgVol
    ? ` 신호 기준: 거래량 ${jackFormatVol(Math.round(jackAvgVol * 1.3))} 이상(5일 평균 ${jackFormatVol(jackAvgVol)} 대비 30%).`
    : '';
  let action = '';
  if (p.verdict === '매수 우위') {
    action = (p.volIsHigh ? `즉각 분할 매수를 검토하십시오.` : `수급 신호 확인 후 진입을 검토하십시오.`) + jackBuySellVolNote;
  } else if (p.verdict === '매도 우위') {
    action = `포지션 축소를 검토하십시오.${jackBuySellVolNote}`;
  } else {
    if (p.volIsHigh) {
      action = `돌파 신호 확인 후 진입하십시오. ${jackBreakthroughSignal}`;
    } else {
      action = `추세 신호 확인 전까지 관망하십시오. ${jackVolSignal}`;
    }
  }

  // ✅ 추세 맥락 — volSuffix 뒤에 마침표를 붙이고 추세 문장은 별도로
  const trendSentence = p.trendSummary ? ` ${p.trendSummary}.` : '';

  // 충돌 상황 처리
  const conflictNote = p.conflict === 'conflict_jack_buy'
    ? ' 루시아는 과열을 경고하겠지만, 모멘텀 관점에서는 추세를 따르는 것이 맞습니다.'
    : '';

  if (interpretation && interpretation !== JACK_INTERPRETATIONS.normal) {
    return `지휘관님, ${contextNote}${p.keyword}는 ${p.volLabel}${particle(p.volLabel)} ${volSuffix}.${trendSentence} ${interpretation}${conflictNote} ${trend} 구간으로 ${action}`;
  }

  // ✅ volSuffix 뒤 마침표 → 추세 문장 → vixNote → 구간 판단
  return `지휘관님, ${contextNote}${p.keyword}는 ${p.volLabel}${particle(p.volLabel)} ${volSuffix}.${trendSentence}${vixNote ? ' ' + vixNote + '.' : ''} ${conflictNote}${trend} 구간으로 ${action}`;
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
  assetType?: string;
  avgVolume?: number | null;
  sentiment: string;
  verdict: Verdict;
  assetType: AssetType;
  prevKeyword?: string | null;
  situation?: MarketSituation;
  // ✅ 추세 + 충돌
  trendSummary?: string | null;
  trendStrength?: string | null;
  conflict?: string | null;
  jackVerdict?: string | null;  // 잭의 판단 (핑퐁용)
}

// 비유 풀 — 상황별 (비슷한 표현 반복 방지)
// ✅ 비유 풀 확장 — 7개 이상으로 반복 방지
const LUCIA_METAPHORS = {
  highVol_bull: [
    '인기 맛집에 손님이 갑자기 몰려든 것처럼 과열된 분위기예요',
    '인기 가수 콘서트 직전에 팬들이 한꺼번에 몰려드는 것처럼 들뜬 상태예요',
    '중요한 경기 막판에 관중이 열광하는 것과 같아요',
    '마라톤 결승선 앞에서 갑자기 모두가 스퍼트를 올리는 상황이에요',
    '세일 첫날 오픈런처럼 모두가 한꺼번에 달려드는 분위기예요',
  ],
  highVol_bear: [
    '갑자기 불이 났을 때 모두가 출구로 달려가는 상황이에요',
    '폐점 세일에 사람들이 몰리듯 패닉이 번지고 있어요',
    '갑작스러운 소나기에 모두가 처마 밑으로 뛰어드는 것 같아요',
  ],
  lowVol_neutral: [
    '손님 없는 텅 빈 시장처럼 조용한 상태예요',
    '쉬는 날 아무도 없는 운동장처럼 적막해요',
    '재료가 준비됐는데 요리사가 아직 오지 않은 주방 같아요',
    '개막을 앞두고 관중이 아직 입장하지 않은 경기장 같아요',
    '바람 한 점 없는 한여름 오후처럼 움직임이 없어요',
  ],
  midVol: [
    '경기 전 워밍업 중인 선수들처럼 아직 본격적인 움직임이 나오지 않았어요',
    '손님은 있는데 주방이 아직 준비 중인 식당 같아요',
    '출발 신호를 기다리는 단거리 선수들처럼 긴장감은 있지만 아직 출발 전이에요',
    '구름은 잔뜩 끼었는데 아직 비가 오지 않는 흐린 날씨 같아요',
  ],
};

const pickMetaphor = (key: keyof typeof LUCIA_METAPHORS, keyword: string): string => {
  const pool = LUCIA_METAPHORS[key];
  // 키워드 해시로 인덱스 선택 → 같은 종목은 항상 같은 비유 (일관성)
  const idx = keyword.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % pool.length;
  return pool[idx];
};

export const buildLuciaText = (p: LuciaParams): string => {

  // ✅ 장 미개장/마감 시 — 전일 흐름 + 근거 + 구체적 수치 제시
  if (p.isMarketClosed || p.isUSClosed) {
    const isKR = p.assetType === 'KOREAN_STOCK';
    const openTime = isKR ? '09:00' : '23:30';
    // ✅ nextSession 정확화 — 마감 후 당일 밤 장이 있는 경우 처리
    const now2 = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const hourKST2 = now2.getUTCHours();
    const minKST2 = now2.getUTCMinutes();
    const timeKST2 = hourKST2 * 100 + minKST2;
    // 미국장: KST 23:30 개장 — 마감 후(06:00~23:29) 중 23:30 이전이면 "오늘 밤"
    const usOpensSameDay = !isKR && !p.isBeforeOpen && timeKST2 < 2330;
    const nextSession = p.isBeforeOpen
      ? (isKR ? '오늘' : '오늘 밤')
      : (isKR ? '내일' : usOpensSameDay ? '오늘 밤' : '내일 밤');

    // ✅ 요일 정확화 — 월요일 개장 전 = 지난 금요일
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const dayKST = now.getUTCDay();
    const isMondayBeforeOpen = isKR && p.isBeforeOpen && dayKST === 1;
    const timeLabel = p.isWeekend ? '지난 금요일'
      : isMondayBeforeOpen ? '지난 금요일'
      : p.isBeforeOpen ? '어제' : '오늘';

    // ✅ 근거 포함한 방향 판단
    const trendBasis = p.trendSummary
      ? `(${p.trendSummary} 기준)`
      : '';
    const trendFeeling = p.trendSummary
      ? p.trendSummary.includes('상승') ? `위쪽을 향하고 있어요 ${trendBasis}`
        : p.trendSummary.includes('하락') ? `아래쪽으로 기울어 있어요 ${trendBasis}`
        : `아직 방향이 확정되지 않았어요 ${trendBasis}`
      : '아직 방향이 확정되지 않았어요';

    // ✅ 거래량 수치 구체화
    const avgVol = p.avgVolume;
    const formatVol = (v: number) => {
      if (v >= 100000000) return `${(v / 100000000).toFixed(1)}억주`;
      if (v >= 10000) return `${Math.round(v / 10000).toLocaleString()}만주`;
      return `${v.toLocaleString()}주`;
    };
    const volThresholdStr = avgVol && avgVol > 0
      ? `약 ${formatVol(Math.round(avgVol * 1.3))}(평소 ${formatVol(avgVol)} 대비 30% 이상)`
      : '평소 대비 30% 이상';

    const statusLabel = p.isWeekend ? '주말이에요'
      : p.isBeforeOpen ? '장이 열리기 전이에요'
      : '오늘 장이 끝났어요';

    const openAdvice = p.verdict === '매수 우위'
      ? `${nextSession} ${openTime} 개장 후 첫 30분 거래량이 ${volThresholdStr}을 넘어서면 상승 신호예요. 그 전까지는 기다리는 게 맞습니다.`
      : p.verdict === '매도 우위'
        ? `${nextSession} ${openTime} 개장 후 반등이 나오더라도 거래량이 ${volThresholdStr}에 못 미치면 속임수일 수 있어요. 신중하게 접근하세요.`
        : `${nextSession} ${openTime} 개장 후 첫 30분 거래량이 ${volThresholdStr}을 넘는지 꼭 확인해 주세요. 그게 오늘 방향을 결정합니다.`;

    return `소장님, 지금은 ${statusLabel}. ${timeLabel} 흐름을 보면 ${p.keyword}는 ${trendFeeling}. ${openAdvice}`;
  }


  const contextNote = (p.prevKeyword && p.prevKeyword !== p.keyword)
    ? `아까 ${p.prevKeyword}도 비슷했는데, `
    : '';

  // ✅ 데이터 근거 문장 — 진폭(변동성)과 등락률이 다른 지표임을 명확히
  const dataNote = p.vixAvailable
    ? `${p.vixLabel}(오늘 가격이 움직인 폭)에 ${p.volLabel}이라는 건`
    : `${p.volLabel}이라는 건`;

  // 비유 선택
  let metaphorKey: keyof typeof LUCIA_METAPHORS;
  if (p.volIsHigh && p.verdict === '매수 우위') metaphorKey = 'highVol_bull';
  else if (p.volIsHigh && p.verdict === '매도 우위') metaphorKey = 'highVol_bear';
  else if (p.vixLabel.includes('중변동성')) metaphorKey = 'midVol';
  else metaphorKey = 'lowVol_neutral';

  const metaphor = pickMetaphor(metaphorKey, p.keyword);

  // ✅ 루시아 상황별 해석 — 행동경제학 + 쉬운 언어 + 핑퐁 구조
  // ✅ LUCIA — 캐시 우드(Cathie Wood) 스타일
// 파괴적 혁신 신봉, 감성적 낙관론자. "시장이 틀렸어요. 5년 후를 보세요."
const LUCIA_THEORIES: Partial<Record<MarketSituation, string>> = {
    accumulation: '가격이 안 움직이는데 누군가 열심히 사고 있다는 건, 스프링처럼 힘이 압축되는 구간이에요. 시장은 종종 기회를 숨겨두죠. 방향이 확인될 때까지 기다리는 게 맞습니다.',
    trending:     '지금 모두가 올라타고 싶어 하는 구간이에요. 심리학에서 말하는 FOMO(나만 뒤처지는 것 같은 두려움)가 극대화된 상태입니다. 이럴 때일수록 오히려 냉정하게 판단해야 해요.',
    stalemate:    '사려는 사람과 팔려는 사람이 비슷하게 맞서고 있어요. 줄다리기처럼 한쪽이 지치면 급격히 쏠리는 게 시장입니다. 오늘 고점을 돌파하거나 저점 아래로 내려가면 방향이 정해진 겁니다. 그때 에코의 조건을 확인하고 결정하는 것이 맞습니다.',
    drain:        '아무도 관심 없는 시장이에요. 투자 심리학에서 "소외 효과"라고, 모두가 외면할 때 오히려 기회가 만들어지는 경우가 많아요. 거래량이 다시 늘어나기 시작하면 그게 관심이 돌아오는 신호입니다. 그때 다시 살펴보는 것이 맞습니다.',
    // drain 반복 방지용 추가 표현 (루시아 텍스트 생성 시 키워드별 다르게)
    drain2:       '지금은 시장이 숨을 고르는 구간이에요. 워런 버핏이 말했듯 "썰물이 빠져야 누가 수영복을 안 입었는지 알 수 있다"고 했죠. 거래량이 회복될 때까지 현금을 지키는 것이 맞습니다.',
    drain3:       '관심 없는 종목이 오히려 기회인 경우가 많아요. 하지만 지금은 그 기회가 왔다는 신호가 없습니다. 거래량이 늘어날 때까지 기다리는 것이 맞습니다.',
    panic:        '공포가 극단까지 간 구간이에요. 역발상 투자의 대가 워런 버핏이 말했듯 "남들이 두려워할 때 탐욕스러워져라"는 말이 있지만, 떨어지는 칼날을 잡으면 다칩니다. 바닥 확인 후 접근하는 것이 맞습니다.',
    exhaustion:   '고점 근처에서 거래량이 줄어드는 건 상승 동력이 소진됐다는 신호예요. 모두가 낙관적일 때가 가장 위험한 순간이라는 걸 기억하세요.',
  };

  // ✅ 비-drain 상황에도 avgVolume 기반 거래량 수치 추가
  const luciaTheoryFmtVol = (v: number): string => {
    if (v >= 100000000) return `${(v / 100000000).toFixed(1)}억주`;
    if (v >= 10000) return `${Math.round(v / 10000).toLocaleString()}만주`;
    return `${v.toLocaleString()}주`;
  };
  const luciaTheoryAvg = p.avgVolume && p.avgVolume > 0 ? p.avgVolume : null;
  const luciaTheoryVolNote = luciaTheoryAvg
    ? ` 거래량이 ${luciaTheoryFmtVol(Math.round(luciaTheoryAvg * 1.3))}을 넘는지 꼭 확인하세요(평소 ${luciaTheoryFmtVol(luciaTheoryAvg)} 대비 30%).`
    : '';

  let theory = '';
  if (p.situation && p.situation === 'drain') {
    // ✅ drain 상황 — 소외 효과 반복 방지 (키워드별 다른 표현)
    const drainPhrases = [
      '아무도 관심 없는 시장이에요. 투자 심리학에서 "소외 효과"라고, 모두가 외면할 때 오히려 기회가 만들어지는 경우가 많아요. 거래량이 다시 늘어나기 시작하면 그게 관심이 돌아오는 신호입니다.',
      '지금은 시장이 숨을 고르는 구간이에요. 거래량이 회복되기 전까지는 진입을 서두르지 않는 것이 맞습니다.',
      '관심 없는 종목이 오히려 기회인 경우가 많아요. 하지만 지금은 그 신호가 아직 오지 않았어요. 거래량이 늘어날 때 다시 살펴보는 것이 맞습니다.',
    ];
    const idx = p.keyword.split('').reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0) % drainPhrases.length;
    // ✅ 수치 추가
    const luciaFmtVol = (v: number): string => {
      if (v >= 100000000) return `${(v / 100000000).toFixed(1)}억주`;
      if (v >= 10000) return `${Math.round(v / 10000).toLocaleString()}만주`;
      return `${v.toLocaleString()}주`;
    };
    const luciaAvg = p.avgVolume && p.avgVolume > 0 ? p.avgVolume : null;
    const luciaVolSignalNote = luciaAvg
      ? ` 거래량이 평소(${luciaFmtVol(luciaAvg)})에서 ${luciaFmtVol(Math.round(luciaAvg * 1.3))} 이상으로 늘어나면 그게 신호입니다.`
      : ' 거래량이 평소 대비 30% 이상 늘어나면 그게 신호입니다.';
    theory = drainPhrases[idx] + luciaVolSignalNote;
  } else if (p.situation && LUCIA_THEORIES[p.situation]) {
    theory = LUCIA_THEORIES[p.situation]! + luciaTheoryVolNote;
  } else if (p.volIsHigh && p.verdict === '매수 우위') {
    theory = (p.sentiment === '긍정'
      ? '군중이 낙관할 때가 가장 위험한 법이에요. 이런 패턴은 단기 급등 후 되돌림이 잦으니 신중하게 접근하는 것이 맞습니다.'
      : '과열 구간에서는 역발상이 필요해요. 신중하게 접근하는 것이 맞습니다.') + luciaTheoryVolNote;
  } else if (p.verdict === '매도 우위') {
    theory = '공포가 번질 때는 손실 확대를 막는 것이 우선이에요. 포지션 정리를 검토하는 것이 맞습니다.' + luciaTheoryVolNote;
  } else if (p.sentiment === '부정') {
    theory = '뉴스까지 부정적이니 이중 경계 구간이에요. 군중이 두려워할 때가 오히려 기회일 수 있지만, 지금은 신중하게 접근하는 것이 맞습니다.' + luciaTheoryVolNote;
  } else {
    theory = luciaTheoryAvg
      ? `군중이 안심할 때가 오히려 위험하니 신중하게 접근하는 것이 맞습니다. 방향이 확인되려면 가격이 1% 이상 움직이거나 거래량이 ${luciaTheoryFmtVol(Math.round(luciaTheoryAvg * 1.3))} 이상으로 늘어나야 합니다(평소 ${luciaTheoryFmtVol(luciaTheoryAvg)} 대비 30%).`
      : '군중이 안심할 때가 오히려 위험하니 신중하게 접근하는 것이 맞습니다. 방향이 확인되려면 가격이 1% 이상 움직이거나 거래량이 평소보다 크게 늘어나야 합니다.';
  }

  // ✅ 추세 맥락 반영
  const trendNote = p.trendSummary
    ? ` 참고로 ${p.trendSummary}.`
    : '';

  // ✅ 핑퐁 구조 — 잭의 판단을 언급하며 반론
  let pingpong = '';
  if (p.conflict === 'conflict_jack_buy' && p.jackVerdict) {
    pingpong = ` 소장님(잭)은 모멘텀을 보고 있지만, 제 눈엔 지금 시장이 너무 달궈진 것 같아요.`;
  } else if (p.conflict === 'conflict_lucia_buy') {
    pingpong = ` 소장님(잭)은 조심하자고 하시지만, 공포가 극단일 때가 오히려 역발상 기회일 수 있어요.`;
  }

  // ✅ "하지만" 제거 — 루시아 고유 시작 방식
  // 추세 중복 제거 — 루시아는 심리/역발상만, 추세는 잭/레이가 담당
  const luciaOpener = contextNote
    ? `소장님, ${contextNote}`
    : `소장님, `;

  return `${luciaOpener}${dataNote} 마치 ${metaphor}.${pingpong} ${theory}`;
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

export const buildEchoText = (p: EchoParams): string => {
  const key = `${p.situation}_${p.verdict}`;
  let insightTemplate = ECHO_INSIGHTS[key] || ECHO_INSIGHTS[`normal_${p.verdict}`] || '';

  // ✅ 관망 세분화 — watchLevel에 따라 다른 메시지
  if (p.verdict === '관망' && p.watchLevel) {
    if (p.watchLevel === 'strong') {
      insightTemplate = `지금은 진입하면 안 됩니다. ${p.trendSummary ? p.trendSummary + '. ' : ''}${p.sellPrice} 아래로 내려가면 손실이 커집니다. 현금을 지키는 것이 최선입니다.`;
    } else if (p.watchLevel === 'weak') {
      // ✅ 다양한 표현으로 반복 방지 — 키워드 해시 기반 선택
      const weakPhrases = [
        `신호가 거의 만들어지고 있습니다. {buy} 돌파 확인 시 투자금의 10%만 먼저 진입하십시오. 오늘 종가 기준으로 확인 후 결정하십시오.`,
        `조금만 더 기다리십시오. {buy} 위로 올라서면서 거래량이 늘어날 때가 진입 시점입니다. 투자금의 10%만 먼저 매수하십시오.`,
        `진입 조건이 가까워지고 있습니다. {buy} 돌파 + 거래량 증가 동시 확인 시 투자금의 10%로 시작하십시오.`,
        `준비 구간입니다. {buy}을 오늘 종가에서 돌파하면 투자금의 10%만 선취매하십시오. 서두르지 마십시오.`,
      ];
      const phraseIdx = p.keyword.split('').reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0) % weakPhrases.length;
      insightTemplate = `${p.trendSummary ? p.trendSummary + '. ' : ''}${weakPhrases[phraseIdx]}`;
    } else {
      // neutral
      insightTemplate = `아직 신호가 없습니다. ${p.trendSummary ? p.trendSummary + '. ' : ''}{buy} 돌파 + 거래량 증가를 동시에 확인할 때까지 기다리십시오.`;
    }
  }

  // 실제 수치 치환
  const days = p.consecutiveDays ? Math.abs(p.consecutiveDays).toString() : '';
  const insight = insightTemplate
    .replace(/{buy}/g, p.buyPrice || p.condSummary.split('/')[0]?.trim() || '매수 조건')
    .replace(/{sell}/g, p.sellPrice || p.condSummary.split('/')[1]?.trim() || '손절가')
    .replace(/{change}/g, p.changeRaw !== '0.00' ? `${parseFloat(p.changeRaw) >= 0 ? '+' : ''}${p.changeRaw}` : '0')
    .replace(/{nasdaq}/g, p.nasdaqChange !== '0' ? `${parseFloat(p.nasdaqChange) >= 0 ? '+' : ''}${p.nasdaqChange}` : '0')
    .replace(/{keyword}/g, p.keyword)
    .replace(/{days}/g, days);

  // ✅ 충돌 상황 에코 처리
  let conflictNote = '';
  if (p.conflict === 'conflict_jack_buy') {
    conflictNote = ' 잭은 모멘텀을, 루시아는 과열을 경고합니다. 두 신호가 충돌할 때는 포지션을 줄이는 것이 포트폴리오 이론의 정석입니다(리스크를 분산해 손실을 줄이는 원칙).';
  } else if (p.conflict === 'conflict_lucia_buy') {
    conflictNote = ' 잭은 하락을 경고하고 루시아는 역발상 기회를 말합니다. 두 신호 충돌 시 절반만 진입하고 나머지는 확인 후 결정하십시오.';
  }

  // ✅ 시간 개념 추가 — 매수 우위일 때
  let timeNote = '';
  if (p.verdict === '매수 우위') {
    timeNote = ` 오늘 종가(장 마감) 기준으로 ${p.buyPrice} 위에 있으면 진입하십시오. 내일 오전 시초가가 ${p.buyPrice} 아래로 열리면 추가 매수는 보류하십시오.`;
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
          : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const buyTrigger = p.rawPrice && p.rawPrice > 0
        ? echoFmtPrice(p.rawPrice * 1.02)
        : (p.buyPrice || '매수 조건');
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

  const line1 = `결론: ${verdictEmoji} ${verdictText} (신뢰도 ${p.confidence}% — ${p.confidenceBasis})`;
  const line2 = `근거: ${p.trendSummary ? p.trendSummary + ' / ' : ''}${p.volLabel} / 뉴스 ${p.sentiment} 신호 종합${conflictNote}`;
  const line3 = `지금: ${insight}${timeNote}`;
  const line4 = `조건: ${p.condSummary}`;
  // ✅ 에코 line5 — 단계별 행동 경로 (구체적 수치 포함)
  let line5 = '';
  if (p.verdict === '매수 우위') {
    const buy1 = p.buyPrice || '매수 조건';
    const sell1 = p.sellPrice || '손절가';
    // 강한 모멘텀이면 더 적극적 비중
    if ((p.trendStrength === 'strong_up') && p.volScore >= 2) {
      line5 = `비중: 지금 바로 투자금의 20%를 먼저 매수하십시오. 3거래일 후 ${buy1} 유지 확인 시 추가 10% 매수하십시오. ${sell1} 이탈 시 전량 정리하십시오.`;
    } else {
      line5 = `비중: 지금 바로 투자금의 10%만 먼저 매수하십시오(예: 100만원이면 10만원). 3거래일 후 ${buy1} 유지 확인 시 추가 10% 매수하십시오. ${sell1} 이탈 시 전량 정리하십시오.`;
    }
  } else if (p.verdict === '매도 우위') {
    const sell1 = p.sellPrice || '손절가';
    line5 = `비중: 보유 중이라면 지금 즉시 50% 정리하십시오. ${sell1} 이탈 확인 시 나머지 전량 정리하십시오. 신규 매수는 절대 금지입니다.`;
  } else if (p.watchLevel === 'weak') {
    const buy1 = p.buyPrice || '매수 조건';
    const sell1 = p.sellPrice || '손절가';
    line5 = `비중: 아직 0%이지만 준비하십시오. ${buy1} 돌파 + 거래량 증가 동시 확인 시 → 10% 진입. 3거래일 유지 확인 시 → 추가 10%. ${sell1} 이탈 시 → 전량 정리.`;
  } else if (p.watchLevel === 'strong') {
    line5 = `비중: 현재 0%를 유지하십시오. 지금 진입하면 손실 위험이 큽니다. 시장이 안정될 때까지 현금을 지키는 것이 최선입니다.`;
  } else {
    // neutral 관망
    const buy1 = p.buyPrice || '매수 조건';
    line5 = `비중: 현재 0%입니다. ${buy1} 돌파 + 거래량 증가를 동시에 확인한 후 10%씩 단계적으로 진입하십시오.`;
  }

  return [line1, line2, line3, line4, line5].join('\n');
};
