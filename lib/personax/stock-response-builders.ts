import { getSector } from '@/lib/personax/market';
import { safeNum } from '@/lib/personax/scoring';
import type { DiscussMode, IndicatorFlags, PrevContext } from '@/lib/personax/templates';
import { JACK_TAIL, LUCIA_TAIL, RAY_TAIL } from '@/lib/personax/templates';
import { normalizeDetails } from '@/lib/personax/utils';

type StockMarketData = {
  price?: string | null;
  change?: string | null;
  volume?: string | null;
  rawPrice?: number | null;
  rawVolume?: number | null;
  avgVolume?: number | null;
  trend?: {
    ma5?: number | null;
    ma20?: number | null;
    trend5d?: string | null;
    trend20d?: string | null;
  } | null;
};

type VolatilityInfo = {
  label: string;
};

type VolumeInfo = {
  isHigh: boolean;
  label: string;
  score: number;
};

type PricePositionInfo = {
  label: string;
};

type NewsData = {
  sentiment: string;
};

type TrendContextInfo = {
  trendSummary?: string | null;
  trendStrength?: string | null;
};

type StockPersonaText = {
  ray: string;
  jack: string;
  lucia: string;
  echo: string;
};

const SAFE_INVESTMENT_FALLBACK_MARKER = '현재가는 별도 확인이 필요합니다';

function sanitizeInternalMarketDataTerms(text: string): string {
  return text
    .replace(/\bhasMarketData\b/g, '시세 데이터 확인 여부')
    .replace(/\bmarketData\b/g, '시세 데이터')
    .replace(/\bMarketData\b/g, '시세 데이터');
}

function inferAssetLabel(userMessage: string): string {
  if (/비트코인|bitcoin|btc/i.test(userMessage)) return '비트코인';
  if (/이더리움|ethereum|eth/i.test(userMessage)) return '이더리움';
  if (/코인|crypto|암호화폐/i.test(userMessage)) return '코인';
  return '해당 자산';
}

export function normalizeNoMarketDataInvestmentPersonaText(
  personaText: StockPersonaText,
  params: {
    userMessage: string;
    questionType: string;
    hasMarketData?: boolean;
    isInvestmentContext: boolean;
  },
): void {
  personaText.ray = sanitizeInternalMarketDataTerms(personaText.ray);
  personaText.jack = sanitizeInternalMarketDataTerms(personaText.jack);
  personaText.lucia = sanitizeInternalMarketDataTerms(personaText.lucia);
  personaText.echo = sanitizeInternalMarketDataTerms(personaText.echo);

  if (
    !params.isInvestmentContext ||
    params.hasMarketData !== false ||
    (params.questionType !== 'buy_or_wait' && params.questionType !== 'sell_or_hold')
  ) {
    return;
  }

  const values = [personaText.ray, personaText.jack, personaText.lucia, personaText.echo];
  const fallbackCount = values.filter(text => text.includes(SAFE_INVESTMENT_FALLBACK_MARKER)).length;
  if (fallbackCount < 2) return;

  const assetLabel = inferAssetLabel(params.userMessage);
  personaText.ray =
    `${assetLabel} 실시간 시세가 확인되지 않아 하락 종료 시점은 단정할 수 없습니다.\n` +
    '확인할 축은 24시간 거래대금, 하락 속도 둔화, 비트코인 동조 흐름입니다.';
  personaText.jack =
    '날짜를 찍는 예측보다 조건을 정하는 편이 안전합니다.\n' +
    '거래량이 줄면서 하락폭이 둔화되고, 반등 시도가 확인될 때까지는 보수적으로 보겠습니다.';
  personaText.lucia =
    '떨어지는 기간을 맞히려 하기보다 감당 가능한 손실 한도를 먼저 정해야 해요.\n' +
    '불안해서 계속 확인하게 된다면 비중을 줄이는 것도 선택지입니다.';
  personaText.echo =
    '결론: 현재 데이터로는 하락 종료 시점을 단정하지 않습니다.\n' +
    '조건: 실시간 시세와 거래량이 확인되면 지지선과 손절 기준으로 다시 판단하겠습니다.';
}

export function buildFinalRay(params: {
  keyword: string;
  marketData: StockMarketData | null;
  assetType: string;
  vix: VolatilityInfo;
  rayPriceDisplay: string;
  rayTimeNote?: string;
  prevCtx?: PrevContext;
}): string {
  const { keyword, marketData, assetType, vix, rayPriceDisplay, rayTimeNote, prevCtx } = params;
  const closedNote = rayTimeNote ? rayTimeNote : '';
  const rayChangeNum = safeNum(marketData?.change);
  const changeStr = marketData?.change
    ? ` (${rayChangeNum >= 0 ? '+' : ''}${rayChangeNum.toFixed(2)}%)`
    : '';
  const rayFmtVol = (v: number): string => {
    if (v >= 100000000) return `${(v / 100000000).toFixed(1)}억주`;
    if (v >= 10000) return `${Math.round(v / 10000).toLocaleString()}만주`;
    return `${v.toLocaleString()}주`;
  };
  const rayRawVol = marketData?.rawVolume && marketData.rawVolume >= 1000 ? marketData.rawVolume : null;
  const rayAvgVol = marketData?.avgVolume && marketData.avgVolume >= 1000 ? marketData.avgVolume : null;

  let volLine: string;
  if (assetType === 'CRYPTO') {
    volLine = marketData?.volume ? `24시간 거래량 ${marketData.volume}` : '24시간 거래량 미수급';
  } else if (rayRawVol && rayAvgVol) {
    const delta = rayRawVol > rayAvgVol * 1.1 ? '증가' : rayRawVol < rayAvgVol * 0.9 ? '저조' : '보통';
    volLine = `거래량 ${rayFmtVol(rayRawVol)} (5일 평균 ${rayFmtVol(rayAvgVol)}, ${delta})`;
  } else if (rayRawVol) {
    volLine = `거래량 ${rayFmtVol(rayRawVol)}`;
  } else {
    volLine = '거래량 데이터 미수급';
  }

  const line1 = `${keyword} ${rayPriceDisplay}${changeStr}${closedNote}`;
  const line2 = volLine;
  const line3 = vix.label;

  let sectorCompareLine = '';
  const currSectorForCompare = getSector(keyword) ?? null;
  const prevSectorForCompare = prevCtx?.prevSector ?? null;
  if (
    prevCtx &&
    prevCtx.prevKeyword &&
    prevCtx.prevKeyword !== keyword &&
    prevSectorForCompare &&
    currSectorForCompare &&
    prevSectorForCompare === currSectorForCompare &&
    prevCtx.prevChangePercent !== null &&
    prevCtx.prevChangePercent !== undefined &&
    Number.isFinite(rayChangeNum)
  ) {
    const delta = rayChangeNum - prevCtx.prevChangePercent;
    const judgment = delta > 1.0 ? '상대적 강세' : delta < -1.0 ? '상대적 약세' : '유사한 흐름';
    const prevChangeStr = `${prevCtx.prevChangePercent >= 0 ? '+' : ''}${prevCtx.prevChangePercent.toFixed(2)}%`;
    const candidate = `같은 ${currSectorForCompare} 섹터, ${prevCtx.prevDisplayName || prevCtx.prevKeyword}(${prevChangeStr}) 대비 ${judgment}.`;
    if (candidate.length <= 35) sectorCompareLine = candidate;
  }

  return [line1, line2, line3, sectorCompareLine].filter(Boolean).join('\n');
}

export function buildRayDetail(params: {
  keyword: string;
  marketData: StockMarketData | null;
  currency: string;
  assetType: string;
  vix: VolatilityInfo;
  prevCtx?: PrevContext;
}): string | null {
  const { keyword, marketData, currency, assetType, vix, prevCtx } = params;
  if (!marketData) return null;

  const fmtPx = (n: number) =>
    currency === 'KRW' ? `${Math.round(n).toLocaleString('ko-KR')}원` : `$${n.toFixed(2)}`;
  const fmtVol = (v: number): string => {
    if (v >= 100000000) return `${(v / 100000000).toFixed(1)}억주`;
    if (v >= 10000) return `${Math.round(v / 10000).toLocaleString()}만주`;
    return `${v.toLocaleString()}주`;
  };

  const rayLines: string[] = [];
  const trend = marketData.trend;
  const curPrice = marketData.rawPrice;
  if (trend?.ma5 && trend?.ma20 && curPrice) {
    const ma5Dir = curPrice > trend.ma5 ? '현재가 위' : '현재가 아래';
    const ma20Dir = curPrice > trend.ma20 ? '현재가 위' : '현재가 아래';
    rayLines.push('📊 이평선 상세');
    rayLines.push(`  5일선: ${fmtPx(trend.ma5)} (${ma5Dir}, ${trend.trend5d})`);
    rayLines.push(`  20일선: ${fmtPx(trend.ma20)} (${ma20Dir}, ${trend.trend20d})`);
  }
  if (assetType !== 'CRYPTO') {
    const rv = marketData.rawVolume;
    const av = marketData.avgVolume;
    if (rv && av && rv > 0 && av > 0) {
      const ratioPct = Math.round((rv / av) * 100);
      if (rayLines.length) rayLines.push('');
      rayLines.push('📊 거래량 상세');
      rayLines.push(`  오늘: ${fmtVol(rv)} / 5일 평균: ${fmtVol(av)}`);
      rayLines.push(`  평균 대비: ${ratioPct}%`);
    }
  } else if (marketData.volume) {
    if (rayLines.length) rayLines.push('');
    rayLines.push('📊 거래량 상세');
    rayLines.push(`  24시간 거래대금: ${marketData.volume}`);
  }
  const ampMatch = vix.label.match(/([\d.]+)%\s*진폭/);
  if (ampMatch) {
    const amp = parseFloat(ampMatch[1]);
    const meaning =
      amp < 2 ? '저변동성 — 방향성 약함'
      : amp < 4 ? '중변동성 — 일반적 수준'
      : '고변동성 — 급등락 주의';
    if (rayLines.length) rayLines.push('');
    rayLines.push('📈 변동성 의미');
    rayLines.push(`  일중 ${amp.toFixed(1)}% 진폭 — ${meaning}`);
  }
  if (
    prevCtx?.prevSector &&
    getSector(keyword) === prevCtx.prevSector &&
    prevCtx.prevChangePercent !== null &&
    prevCtx.prevChangePercent !== undefined &&
    Number.isFinite(parseFloat(marketData.change || ''))
  ) {
    const curCh = parseFloat(marketData.change || '');
    const delta = curCh - prevCtx.prevChangePercent;
    const judgment = delta > 1.0 ? '상대적 강세' : delta < -1.0 ? '상대적 약세' : '유사한 흐름';
    const prevStr = `${prevCtx.prevChangePercent >= 0 ? '+' : ''}${prevCtx.prevChangePercent.toFixed(2)}%`;
    const deltaStr = `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%p`;
    if (rayLines.length) rayLines.push('');
    rayLines.push('📊 섹터 비교');
    rayLines.push(`  ${prevCtx.prevDisplayName || prevCtx.prevKeyword}(${prevStr}) 대비 ${judgment} (Δ ${deltaStr})`);
  }

  return rayLines.length > 0 ? rayLines.join('\n') : null;
}

export function buildJackDetail(params: {
  trendCtx: TrendContextInfo;
  vol: VolumeInfo;
  nData: NewsData;
  newsCount: number;
  flags: IndicatorFlags;
  discussMode: DiscussMode;
  conflict: string;
  verdict: string;
}): string {
  const { trendCtx, vol, nData, newsCount, flags, discussMode, conflict, verdict } = params;
  const maComment = trendCtx.trendSummary
    || (trendCtx.trendStrength === 'strong_up' ? '단기·중기 모두 상승 추세'
      : trendCtx.trendStrength === 'weak_up' ? '단기 상승, 중기 미확인'
      : trendCtx.trendStrength === 'strong_down' ? '단기·중기 모두 하락 추세'
      : trendCtx.trendStrength === 'weak_down' ? '단기 조정, 중기 지지선 주시'
      : '이평선 방향성 불명확');
  const volComment = vol.isHigh
    ? `${vol.label} — 세력 개입 가능성`
    : vol.score < 0
      ? `${vol.label} — 관심도 약화`
      : `${vol.label} — 특이 신호 없음`;
  const newsComment = nData.sentiment === '긍정'
    ? `호재성 뉴스 ${newsCount}건 — 우호적 분위기`
    : nData.sentiment === '부정'
      ? `악재성 뉴스 ${newsCount}건 — 경계 분위기`
      : `뉴스 ${newsCount}건 (중립) — 명확한 촉매 부재`;
  const jackDirection: 'bull' | 'bear' | 'sideways' | 'high_volatility_up' | 'high_volatility_down' =
    flags.vixHigh && flags.priceUp ? 'high_volatility_up'
    : flags.vixHigh && flags.priceDown ? 'high_volatility_down'
    : discussMode === 'bull' ? 'bull'
    : discussMode === 'bear' ? 'bear'
    : 'sideways';
  const scenario =
    jackDirection === 'bull' ? '상승 추세 유지 중. 거래량 동반 여부가 핵심 확인 포인트.'
    : jackDirection === 'bear' ? '하락 압력 우세. 리스크 기준선 이탈 여부 모니터링 필요.'
    : jackDirection === 'high_volatility_up' ? '단기 급등 구간. 되돌림 가능성 열어두는 것이 합리적.'
    : jackDirection === 'high_volatility_down' ? '단기 급락 구간. 추가 하락 여부 확인 전 접근 신중.'
    : '방향성 부재 구간. 돌파 또는 이탈 방향 확인이 우선.';
  const risk = conflict === 'conflict_jack_buy'
    ? '확인 신호 부재 — 거래량·뉴스 한 축 확인 전 충분한 확인 후 판단 권장'
    : conflict === 'conflict_lucia_buy'
      ? '하락 속 역발상 위험 — 바닥 확인 전 진입은 칼날 잡기'
      : verdict === '관망'
        ? '지표 혼조 — 억지 진입 시 손익비 악화'
        : flags.vixHigh
          ? '고변동성 구간 — 분할 접근으로 평단 관리'
          : '시장 급변 시 리스크 기준선 이탈 여부 모니터링 권장';

  return [
    '✅ 진입 근거 항목별',
    `  이평선: ${maComment}`,
    `  거래량: ${volComment}`,
    `  뉴스: ${newsComment}`,
    '',
    '핵심 시나리오',
    `  ${scenario}`,
    '',
    '⚠️ 주의 리스크',
    `  ${risk}`,
  ].join('\n');
}

export function buildLuciaDetail(params: {
  keyword: string;
  marketData: StockMarketData;
  vix: VolatilityInfo;
  vol: VolumeInfo;
  pos: PricePositionInfo;
  nData: NewsData;
  newsCount: number;
  flags: IndicatorFlags;
  discussMode: DiscussMode;
  conflict: string;
  verdict: string;
}): string {
  const { keyword, marketData, vix, vol, pos, nData, newsCount, flags, discussMode, conflict, verdict } = params;
  const luciaWarning = conflict === 'conflict_jack_buy'
    ? `${keyword} 추세는 살아있지만 확인 신호(거래량·뉴스)가 약해요. 군중이 기회라 부를 때가 가장 위험할 수 있어요.`
    : conflict === 'conflict_lucia_buy'
      ? `하락 속 역발상 기회가 보이지만 바닥 확인이 먼저예요. 떨어지는 칼날은 잡지 마세요.`
      : verdict === '매도 우위'
        ? `하방 압력이 누적되고 있어요. 손실을 줄이는 것이 곧 수익이에요.`
        : verdict === '관망'
          ? `지표가 엇갈려요. 확실하지 않을 땐 현금도 포지션이에요.`
          : `강세 흐름에서도 과열·되돌림 가능성은 상존해요. 분할 접근이 안전해요.`;
  const riskIndicators: string[] = [];
  if (vix.label.includes('고변동성') || vix.label.includes('중변동성')) {
    riskIndicators.push(`변동성: ${vix.label}`);
  }
  if (nData.sentiment === '부정' && newsCount > 0) {
    riskIndicators.push(`악재 뉴스 ${newsCount}건 — 추가 악재 주시`);
  }
  if (pos.label.includes('고점')) {
    riskIndicators.push(`${pos.label} — 되돌림 구간 경계`);
  } else if (pos.label.includes('저점')) {
    riskIndicators.push(`${pos.label} — 반등 전 추가 하락 여지`);
  }
  if (flags.priceDown) {
    riskIndicators.push(`오늘 ${marketData.change}% 하락`);
  }
  if (vol.isHigh && (discussMode === 'bear' || verdict === '매도 우위')) {
    riskIndicators.push('거래량 급증 + 하락 = 매도 압력');
  }
  if (riskIndicators.length === 0) {
    riskIndicators.push('경고 등급 리스크 지표 없음 — 기본 리스크 관리 유지');
  }
  const emotionalGuard = verdict === '매수 우위'
    ? 'FOMO로 뒤늦게 올라타면 고점에서 물릴 수 있어요.'
    : verdict === '매도 우위'
      ? '공포로 바닥 투매는 반등을 놓쳐요. 리스크 관리 규칙은 지키되 감정은 거르세요.'
      : '조급함이 가장 큰 리스크예요. 조건 충족 전까지는 관찰 권장.';

  return [
    '⚠️ 경고 근거 상세',
    `  ${luciaWarning}`,
    '',
    '📊 리스크 지표',
    ...riskIndicators.slice(0, 3).map(s => `  • ${s}`),
    '',
    '💡 감정적 판단 경계',
    `  ${emotionalGuard}`,
  ].join('\n');
}

export function buildStockDetailResponse(params: {
  finalRay: string;
  finalJack: string;
  finalLucia: string;
  finalEcho: string;
  finalEchoDetails: string | null;
  finalRayDetails: string | null;
  finalJackDetails: string | null;
  finalLuciaDetails: string | null;
  discussMode: DiscussMode;
}): {
  finalRayOut: string;
  finalJackOut: string;
  finalLuciaOut: string;
  finalEchoOut: string;
  finalReply: string;
  echoDetailsOut: string | null;
  rayDetailsOut: string | null;
  jackDetailsOut: string | null;
  luciaDetailsOut: string | null;
} {
  const JACK_BULLISH = [
    '이건 사이클이 아닙니다 — 구조적 변화입니다.',
    '강세장은 비관 속에서 태어납니다.',
    '추세는 친구라는 말이 있어요.',
    '모멘텀이 살아있는 구간이에요.',
    '기회는 준비된 자에게만 옵니다.',
    '지금이 마지막 저점일 수 있습니다.',
    '시장은 용기 있는 자의 편입니다.',
    '데이터가 말하는 방향을 참고해볼 수 있어요. 감정은 한 발 떨어뜨려두는 게 도움이 돼요.',
    '망설임이 가장 큰 리스크입니다.',
    '추세에 올라타는 것이 통계적으로 유리한 흐름이에요.',
  ];
  const JACK_BEARISH = [
    '데이터가 경고를 보내는 구간이에요.',
    '후퇴도 전략입니다. 재진입 기회는 반드시 옵니다.',
    '현금도 포지션입니다.',
    '살아남아야 다음 기회가 있습니다.',
    '손실을 줄이는 것이 첫 번째 임무입니다.',
    '시장에 맞서는 흐름은 부담이 커요.',
    '바닥 확인이 먼저입니다.',
    '떨어지는 칼날은 피하는 게 일반적인 원칙이에요.',
    '지지선 흐름을 살펴보는 것도 도움이 돼요.',
    '재진입 기회는 반드시 옵니다.',
  ];
  const rayMbtiPhrases = [
    '데이터는 거짓말하지 않습니다. 해석이 거짓말할 뿐.',
    '가설은 많습니다 — 확률로 승부합니다.',
    '신호와 소음을 구분하는 것이 핵심입니다.',
    '역사는 반복됩니다. 패턴을 보십시오.',
    '분산이 유일한 무료 점심입니다.',
    '과거 데이터가 미래를 완벽히 예측하지는 않지만, 무시하면 더 위험합니다.',
    '감정이 아닌 확률로 판단하십시오.',
    '시장은 단기적으로 투표기계, 장기적으로 저울입니다.',
  ];

  const jackMbtiPool = params.discussMode === 'bear' ? JACK_BEARISH : JACK_BULLISH;
  const mbtiIdx = Math.floor(Date.now() / 1000) % 10;
  const rayRotIdx = Math.floor(Date.now() / 1000) % rayMbtiPhrases.length;

  const finalJackOut = params.finalJack + '\n— ' + jackMbtiPool[mbtiIdx] + JACK_TAIL;
  const finalLuciaOut = params.finalLucia + LUCIA_TAIL;
  const finalRayOut = params.finalRay + '\n— ' + rayMbtiPhrases[rayRotIdx] + RAY_TAIL;
  const finalReply = [finalRayOut, finalJackOut, finalLuciaOut, params.finalEcho].filter(Boolean).join('\n\n');
  let finalEchoOut = params.finalEcho;
  const stockAllText = finalJackOut + finalLuciaOut + finalRayOut + params.finalEcho;
  if (!stockAllText.includes('손절선') && !stockAllText.includes('지지선')) {
    finalEchoOut = params.finalEcho.trimEnd().replace(/[?。！!]$/, '') + '\n손절선 정해놓으셨어요?';
  }

  return {
    finalRayOut,
    finalJackOut,
    finalLuciaOut,
    finalEchoOut,
    finalReply,
    echoDetailsOut: normalizeDetails(params.finalEchoDetails),
    rayDetailsOut: normalizeDetails(params.finalRayDetails),
    jackDetailsOut: normalizeDetails(params.finalJackDetails),
    luciaDetailsOut: normalizeDetails(params.finalLuciaDetails),
  };
}
