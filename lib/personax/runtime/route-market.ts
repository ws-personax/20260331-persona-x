/**
 * Route Market — app/api/chat/route.ts에서 이동(move-only, 동작 변경 없음).
 *
 * MARKET_INDEX_SET: 지수/시장 키워드 — 투자 지시 제외 대상.
 * createMarketDataContextResolver: marketDataContext 조회 + 요청 단위 캐시 팩토리
 *   (기존 route.ts의 getOrBuildMarketDataContext 클로저 + marketDataContextCache Map을
 *   그대로 이동 — 요청마다 새 캐시를 갖는 동작 동일하게, 호출부에서 팩토리를 1회 호출).
 * buildLegacyStockDetailResult: 레거시 단일 종목 풀 분석(스코어링 + RAY/JACK/LUCIA/ECHO
 *   페르소나 텍스트 조립) — route.ts의 marketData 조회 이후 ~ saveHistory 이전 블록 전체.
 */
import {
  fmtPrice, DISCLAIMER,
  getVolumeInfo, getVolatility, getPricePos, getNewsData,
  calcScores, getPositionSizing, buildEntryCondition,
  extractConditionPrices, buildDataSourceLabel,
  detectMarketSituation, analyzeTrendContext, determineWatchLevel, detectPersonaConflict,
  safeNum,
} from '@/lib/personax/scoring';
import {
  CRYPTO_MAP, fetchMarketPrice, getSector,
} from '@/lib/personax/market';
import { buildMarketDataPromptContext } from '@/lib/personax/market-data';
import { buildMarketSessionLabels } from '@/lib/personax/market-session-label';
import { buildJackText, buildLuciaText, buildEchoText, ECHO_TAIL } from '@/lib/personax/templates';
import type { DiscussMode, IndicatorFlags, PrevContext } from '@/lib/personax/templates';
import {
  buildFinalRay,
  buildJackDetail,
  buildLuciaDetail,
  buildRayDetail,
  buildStockDetailResponse,
} from '@/lib/personax/stock-response-builders';
import { allocatePersonaNews } from '@/lib/personax/news-allocation';
import type { NewsRaw } from '@/lib/personax/news-allocation';
import { extractKeyword } from '@/lib/personax/market';
import type { MarketData } from '@/lib/personax/types';

// ✅ 지수/시장 키워드 — 투자 지시 제외 대상
export const MARKET_INDEX_SET = new Set([
  '나스닥', 'NASDAQ', 'S&P500', 'S&P', 'SP500',
  '다우', '다우존스', '코스피', '코스닥', '한국 증시', '한국증시',
  '^IXIC', '^GSPC', '^DJI', '^KS11', '^KQ11',
]);

/**
 * marketDataContext 조회 + 요청 단위 캐시 — POST() 핸들러 1회 호출마다 새 Map을 받아
 * 같은 요청 내에서 동일 userMessage에 대한 buildMarketDataPromptContext 중복 호출을 방지.
 */
export function createMarketDataContextResolver() {
  const marketDataContextCache = new Map<string, Promise<string>>();
  const getOrBuildMarketDataContext = async (userMessage: string): Promise<string> => {
    if (!marketDataContextCache.has(userMessage)) {
      marketDataContextCache.set(
        userMessage,
        buildMarketDataPromptContext(userMessage),
      );
    }

    return await marketDataContextCache.get(userMessage) ?? '';
  };
  return { getOrBuildMarketDataContext };
}

/**
 * 레거시 단일 종목 풀 분석 — marketData/nasdaqData/news 조회 이후부터
 * (route.ts의 saveHistory 호출 이전까지) 스코어링 + 페르소나 텍스트 조립 전체.
 * 반환값은 route.ts의 최종 respond() 와 saveHistory() 양쪽에서 사용됨.
 */
export async function buildLegacyStockDetailResult(params: {
  keyword: string;
  marketData: MarketData | null;
  nasdaqData: MarketData | null;
  news: NewsRaw[];
  currency: 'KRW' | 'USD';
  positionContext?: string;
  messages: Array<{ role?: string; content?: string }>;
}): Promise<{
  finalReply: string;
  finalRayOut: string;
  finalJackOut: string;
  finalLuciaOut: string;
  finalEchoOut: string;
  rayDetailsOut: string | null;
  jackDetailsOut: string | null;
  luciaDetailsOut: string | null;
  echoDetailsOut: string | null;
  verdict: import('@/lib/personax/types').Verdict;
  confidence: number;
  breakdown: string;
  positionSizing: string;
  jackNews: unknown;
  luciaNews: unknown;
  rayNews: unknown;
  echoNews: unknown;
  total: number;
  assetType: 'CRYPTO' | 'KOREAN_STOCK' | 'US_STOCK';
  entryCondition: string;
  volIsHigh: boolean;
}> {
  const { keyword, marketData, nasdaqData, news, currency, positionContext, messages } = params;

  const isCrypto  = !!(CRYPTO_MAP[keyword] || CRYPTO_MAP[keyword.toUpperCase()]);
  const assetType = isCrypto ? 'CRYPTO' : currency === 'KRW' ? 'KOREAN_STOCK' : 'US_STOCK';

  const {
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
  } = buildMarketSessionLabels({ assetType, isCrypto });

  const vol   = getVolumeInfo(marketData?.rawVolume || 0, marketData?.avgVolume || 0, assetType as 'CRYPTO' | 'KOREAN_STOCK' | 'US_STOCK');
  const vix   = getVolatility(marketData?.rawPrice || 0, marketData?.rawHigh || 0, marketData?.rawLow || 0, assetType as 'CRYPTO' | 'KOREAN_STOCK' | 'US_STOCK');
  const pos   = getPricePos(marketData?.rawPrice || 0, marketData?.rawHigh || 0, marketData?.rawLow || 0);
  const nData = getNewsData(news as Array<{ title: string; source?: string }>);

  const { total, verdict, confidence, breakdown } = calcScores({
    volScore: vol.score, change: marketData?.change || '0', newsAvg: nData.avgScore,
    posScore: pos.score, vitScore: vix.score, hasData: !!marketData, newsCount: news.length,
    volLabel: vol.label, posLabel: pos.label, vixLabel: vix.label, newsSentiment: nData.sentiment,
  });

  const positionSizing  = getPositionSizing(verdict, total);
  const dataSourceLabel = buildDataSourceLabel(assetType as 'CRYPTO' | 'KOREAN_STOCK' | 'US_STOCK', marketData, news.length);
  const entryCondition  = buildEntryCondition(marketData, pos.ratio, vol.isHigh, verdict, keyword);
  const { buy: buyPrice, sell: sellPrice } = extractConditionPrices(entryCondition);
  const condSummary = [buyPrice && `관심 구간(${buyPrice})`, sellPrice && `리스크 기준선(${sellPrice})`]
    .filter(Boolean).join(' / ') || '시장 상황 주시';

  const confidenceBasis = [
    marketData ? `시세(${marketData.source})` : null,
    news.length > 0 ? `뉴스 ${news.length}건(${nData.sentiment})` : null,
    vol.isHigh ? '거래량 신호' : null,
  ].filter(Boolean).join(' + ') || '데이터 제한적';

  // ─── 이전 종목 맥락 추출 ───
  const prevUserMsg = messages.slice(-3, -1).find((m: { role?: string }) => m.role === 'user')?.content || '';
  const prevKeyword = prevUserMsg ? extractKeyword([{ role: 'user', content: prevUserMsg }]) : null;
  const prevVolIsHigh = vol.isHigh; // 이전 종목의 vol은 현재 세션에서 알 수 없으므로 현재 기준 사용

  // ─── B안: 잭/루시아 코드 직접 조립 ───
  const vixAvailable = !vix.label.includes('없음') && !vix.label.includes('불가') && !vix.label.includes('집계');

  // ✅ 시장 상황 감지
  const situation = detectMarketSituation({
    volScore: vol.score,
    volIsHigh: vol.isHigh,
    vixLabel: vix.label,
    change: safeNum(marketData?.change || '0'),
    posLabel: pos.label,
  });

  // ✅ 추세 맥락 분석 (5일/20일 이평선)
  const trendCtx = analyzeTrendContext(marketData?.trend);

  // ✅ JACK/LUCIA용 trendSummary — 오늘 등락률 부착
  //    +1% 이상: 강한 상승 마감 / +0.3~1%: 소폭 상승 마감 / -0.3~+0.3%: 방향성 없는 횡보
  //    -1~-0.3%: 소폭 하락 마감 / -1% 이하: 강한 하락 마감
  const changeForTrend = marketData?.change ? parseFloat(marketData.change) : NaN;
  const closeDescTrend = !Number.isFinite(changeForTrend)
    ? '마감'
    : changeForTrend >= 1   ? '강한 상승 마감'
    : changeForTrend >= 0.3 ? '소폭 상승 마감'
    : changeForTrend > -0.3 ? '방향성 없는 횡보'
    : changeForTrend > -1   ? '소폭 하락 마감'
    :                          '강한 하락 마감';
  const trendSummaryWithChange = (trendCtx.trendSummary && !Number.isNaN(changeForTrend))
    ? `${trendCtx.trendSummary}, 오늘 ${changeForTrend >= 0 ? '+' : ''}${changeForTrend.toFixed(2)}% ${closeDescTrend}`
    : (trendCtx.trendSummary || null);

  // ✅ 관망 세분화
  const watchLevel = verdict === '관망' ? determineWatchLevel({
    confidence,
    trendStrength: trendCtx.trendStrength,
    sentiment: nData.sentiment,
    volScore: vol.score,
  }) : undefined;

  // ✅ 페르소나 충돌 감지 — verdict도 전달해 조건 확대
  const conflict = detectPersonaConflict({
    trendStrength: trendCtx.trendStrength,
    sentiment: nData.sentiment,
    volScore: vol.score,
    situation,
    verdict,
  });

  // ✅ 지표 카운트로 토론 모드 결정 (bull/bear/conflict)
  const changeMode = safeNum(marketData?.change || '0');
  const rawVolMode = marketData?.rawVolume && marketData.rawVolume > 0 ? marketData.rawVolume : 0;
  const avgVolMode = marketData?.avgVolume && marketData.avgVolume > 0 ? marketData.avgVolume : 0;
  const flags: IndicatorFlags = {
    trendUp:   trendCtx.trendStrength === 'strong_up'   || trendCtx.trendStrength === 'weak_up',
    trendDown: trendCtx.trendStrength === 'strong_down' || trendCtx.trendStrength === 'weak_down',
    volUp:     rawVolMode > 0 && avgVolMode > 0 && rawVolMode > avgVolMode * 1.1,
    volDown:   rawVolMode > 0 && avgVolMode > 0 && rawVolMode < avgVolMode * 0.9,
    newsPos:   nData.sentiment === '긍정',
    newsNeg:   nData.sentiment === '부정',
    priceUp:   changeMode > 0.5,
    priceDown: changeMode < -0.5,
    vixHigh:   vix.label.includes('고변동성'),
  };
  const bullCount = [flags.trendUp, flags.volUp, flags.newsPos, flags.priceUp].filter(Boolean).length;
  const bearCount = [flags.trendDown, flags.volDown, flags.newsNeg, flags.priceDown].filter(Boolean).length;
  const discussMode: DiscussMode =
    bullCount >= 3 ? 'bull' :
    bearCount >= 3 ? 'bear' :
    'conflict';

  // ✅ 이전 종목 맥락 (섹터/자산군 비교용) — RAY 섹터 비교 한 줄 + LUCIA 자산군 구분에 사용
  const prevIsCryptoKeyword = (k: string) =>
    ['비트코인','이더리움','리플','솔라나','도지','에이다','바이낸스','BTC','ETH','XRP','SOL','DOGE','ADA','BNB'].includes(k);
  const hasPrevCtx = !!(prevKeyword && prevKeyword !== '시장' && prevKeyword !== keyword);

  // ✅ 이전 종목 change% 수급 — 같은 섹터일 때 RAY 비교 줄 생성에 필요
  //    실패 시 null (조건 미충족 → 비교 줄 생략)
  let prevChangePercent: number | null = null;
  if (hasPrevCtx && prevKeyword) {
    try {
      const prevMd = await fetchMarketPrice(prevKeyword);
      const parsed = prevMd?.change ? parseFloat(prevMd.change) : NaN;
      if (Number.isFinite(parsed)) prevChangePercent = parsed;
    } catch {
      // noop — prevChangePercent null 유지
    }
  }

  const prevCtx: PrevContext | undefined = hasPrevCtx && prevKeyword
    ? {
        prevKeyword,
        prevSector: getSector(prevKeyword) ?? null,
        currSector: getSector(keyword) ?? null,
        prevIsCrypto: prevIsCryptoKeyword(prevKeyword),
        currIsCrypto: assetType === 'CRYPTO',
        prevChangePercent,
        prevDisplayName: prevKeyword,
      }
    : undefined;

  // ✅ 주말일 때 volLabel에 휴장 안내 추가
  const volLabelWithWeekend = isKRClosed && assetType === 'KOREAN_STOCK'
    ? vol.label + (isWeekend
        ? ' (주말 휴장 중 — 지난 주 데이터 기준)'
        : isKRBeforeOpen
          ? ' (장 개장 전 — 전일 데이터 기준)'
          : ' (장 마감 후 — 오늘 종가 기준)')
    : vol.label;

  const finalJack = marketData
    ? buildJackText({
        keyword,
        volLabel: volLabelWithWeekend,
        volIsHigh: vol.isHigh,
        vixLabel: vix.label,
        vixAvailable,
        change: safeNum(marketData.change),
        verdict,
        // ✅ 같은 자산군일 때만 맥락 연결 (코인→주식 같은 어색한 연결 방지)
        prevKeyword: (() => {
          if (!prevKeyword || prevKeyword === '시장' || prevKeyword === keyword) return null;
          // 이전 종목의 자산군 확인
          const prevIsCrypto = ['비트코인','이더리움','리플','솔라나','도지','에이다','바이낸스','BTC','ETH','XRP','SOL','DOGE','ADA','BNB'].includes(prevKeyword);
          const currIsCrypto = assetType === 'CRYPTO';
          const prevIsKorean = prevKeyword.endsWith('.KS') || ['삼성전자','현대차','엘지전자','LG전자','코스피','코스닥','SK하이닉스','카카오','네이버','셀트리온','기아','현대자동차'].includes(prevKeyword);
          const currIsKorean = assetType === 'KOREAN_STOCK';
          // 같은 자산군이거나 둘 다 주식(한국+미국)이면 연결 허용
          if (prevIsCrypto !== currIsCrypto) return null; // 코인↔주식 연결 금지
          return prevKeyword;
        })(),
        prevVolIsHigh,
        changeRaw: marketData.change,
        volRatio: vol.label.includes('배') ? parseFloat(vol.label.match(/([\d.]+)배/)?.[1] || '0') : null,
        price: marketData.price,
        situation,
        trendSummary: trendSummaryWithChange,
        trendStrength: trendCtx.trendStrength,
        consecutiveDays: trendCtx.consecutiveDays,
        conflict,
        // ✅ 장 미개장 파라미터
        isMarketClosed: isKRClosed && assetType === 'KOREAN_STOCK',
        isBeforeOpen: isKRBeforeOpen,
        isWeekend,
        isUSClosed: isUSClosed && assetType === 'US_STOCK',
        assetType,
        avgVolume: marketData?.avgVolume ?? null,
        rawVolume: marketData?.rawVolume ?? null,
        currency,
        mode: discussMode,
        flags,
        supportPrice: sellPrice || null,
        breakoutPrice: buyPrice || null,
        rawPrice: marketData?.rawPrice ?? null,
      })
    : `지휘관님, ${keyword} 시세 미수급으로 추세 판단이 제한됩니다. 뉴스 확인 후 신호 포착 시 진입을 검토하십시오.`;

  const finalLucia = marketData
    ? buildLuciaText({
        keyword,
        volLabel: volLabelWithWeekend,
        volIsHigh: vol.isHigh,
        vixLabel: vix.label,
        vixAvailable,
        sentiment: nData.sentiment,
        verdict,
        assetType: assetType as 'CRYPTO' | 'KOREAN_STOCK' | 'US_STOCK',
        // ✅ 같은 자산군일 때만 맥락 연결
        prevKeyword: (() => {
          if (!prevKeyword || prevKeyword === '시장' || prevKeyword === keyword) return null;
          const prevIsCrypto = ['비트코인','이더리움','리플','솔라나','도지','에이다','바이낸스','BTC','ETH','XRP','SOL','DOGE','ADA','BNB'].includes(prevKeyword);
          const currIsCrypto = assetType === 'CRYPTO';
          if (prevIsCrypto !== currIsCrypto) return null;
          return prevKeyword;
        })(),
        situation,
        // ✅ LUCIA는 오프너에서 이미 등락률을 표시하므로 trendSummary는 원본 유지 (중복 방지)
        trendSummary: trendCtx.trendSummary || null,
        trendStrength: trendCtx.trendStrength,
        conflict,
        jackVerdict: verdict,
        // ✅ 장 미개장 파라미터
        isMarketClosed: isKRClosed && assetType === 'KOREAN_STOCK',
        isBeforeOpen: isKRBeforeOpen,
        isWeekend,
        isUSClosed: isUSClosed && assetType === 'US_STOCK',
        avgVolume: marketData?.avgVolume ?? null,
        rawVolume: marketData?.rawVolume ?? null,
        changeRaw: marketData?.change ?? null,
        mode: discussMode,
        flags,
        prevCtx,
      })
    : `하지만 소장님, 데이터조차 없는 지금은 마치 재료 없이 요리하는 것과 같아요. 충분한 정보가 확인될 때까지 기다리는 것이 맞습니다.`;
  let profitRateNote = '';
  if (positionContext && marketData) {
    const avgPriceMatch = positionContext.match(/(?:평단가?|매수가|취득가|평균가)[:\s]*([\d,.]+)/);
    if (avgPriceMatch) {
      const avgPrice = parseFloat(avgPriceMatch[1].replace(/,/g, ''));
      if (avgPrice > 0) {
        const rate = ((marketData.rawPrice - avgPrice) / avgPrice * 100).toFixed(2);
        const sign = parseFloat(rate) >= 0 ? '+' : '';
        profitRateNote = `\n현재 수익률: ${sign}${rate}% (평단 ${fmtPrice(avgPrice, currency)} → 현재 ${marketData.price})`;
      }
    }
  }

  const positionNote = positionContext
    ? `\n[유저 포지션]\n${positionContext}${profitRateNote}\n→ 에코는 이 포지션 기준으로 손절/홀딩/추가매수 중 하나를 명확히 권고하라.`
    : `\n[포지션 없음] 에코는 절대로 평단가/보유수량/수익률을 지어내지 마십시오. 신규 진입 기준으로만 판단하십시오.`;

  const currencyRule = currency === 'KRW'
    ? '\n[화폐 규칙] 모든 가격은 반드시 원화(원, KRW) 표기. USD 표기 절대 금지.'
    : '\n[화폐 규칙] 모든 가격은 USD로 표기하라.';

  const noDataNote = !marketData
    ? `\n[주의] ${keyword} 실시간 시세 미지원. 뉴스와 거시 데이터 기반으로만 분석하라.`
    : '';

  const watchConditionRule = verdict === '관망' ? `
[관망 강제 규칙 — 절대 위반 금지]
1. 숫자가 포함된 매수 조건 (구체적 가격 또는 %)
2. 숫자가 포함된 매도/손절 조건
3. 명확한 시간 조건 (3일 내, 이번 주 등)
절대 금지: "근접", "가능성", "검토", "추후", "상황 지켜보기"
` : '';

  const rayAdaptability = !marketData ? '판단 보류' : confidence >= 80 && vol.isHigh ? '높음' : confidence >= 70 ? '보통' : '낮음';
  // ✅ echoBiasNote — positionSizing와 충돌 방지
  // 관망/매도 우위(비중 0%)일 때는 진입 지시 금지
  const echoBiasNote = (verdict === '관망' || verdict === '매도 우위')
    ? '신규 진입을 보류하십시오'
    : rayAdaptability === '높음' ? '단계적으로 진입하십시오'
    : rayAdaptability === '보통' ? '소량 분할 진입을 검토하십시오'
    : '진입을 보류하십시오';

  // ✅ 히스토리 — 이전 종목 맥락 연결용으로만 사용

  // ─── ✅ 레이: 완전 템플릿화 (Gemini 배제) ───
  // ✅ USD 가격 간소화 표기 — "380.56" → "약 $381"
  // ✅ 지수(코스피/나스닥/S&P500/다우 등)는 통화 단위 대신 "pt" 표기
  const isMarketIndexKeyword = MARKET_INDEX_SET.has(keyword);
  const rayPriceDisplay = marketData
    ? (isMarketIndexKeyword
        ? `${marketData.price}pt`
        : currency === 'USD' && marketData.rawPrice
          ? `약 $${Math.round(marketData.rawPrice).toLocaleString('en-US')}`
          : `${marketData.price}${currency === 'KRW' ? '원' : ''}`)
    : '미지원';

  // ✅ RAY — 중립 팩트 3줄 (시세 / 거래량 / 변동성). 이평선·뉴스는 언급하지 않음.
  const finalRay = buildFinalRay({
    keyword,
    marketData,
    assetType,
    vix,
    rayPriceDisplay,
    rayTimeNote,
    prevCtx,
  });

  // ─── ✅ Gemini 완전 제거 — 에코 템플릿 직접 사용 ───
  // ✅ 지수/시장 키워드 감지 — 투자 지시 대신 시장 해석으로 전환
  const isMarketIndex = MARKET_INDEX_SET.has(keyword);

  let finalEcho: string;
  let finalEchoDetails: string | null = null;

  if (isMarketIndex) {
    const marketTrendDesc = trendCtx.trendSummary
      ? trendCtx.trendSummary
      : `${keyword} 현재 ${marketData?.price || '데이터 없음'} (${safeNum(marketData?.change)}%)`;

    const isKRIndex = keyword === '코스피' || keyword === '코스닥' || keyword.includes('한국');
    const isSP500 = keyword === 'S&P500' || keyword === 'SP500' || keyword === 'S&P';
    const isDow = keyword === '다우' || keyword === '다우존스';

    // ✅ ETF 실시간 데이터 — 지수별 매핑
    //   코스피/코스닥 → KODEX 200, KODEX 레버리지
    //   S&P500       → SPY, VOO, IVV
    //   다우존스     → DIA
    //   나스닥(기본) → QQQ, TQQQ
    let etfLine = '';
    try {
      if (isKRIndex) {
        const [k200, klev] = await Promise.all([
          fetchMarketPrice('KODEX 200').catch(() => null),
          fetchMarketPrice('KODEX 레버리지').catch(() => null),
        ]);
        const k200ch = parseFloat(k200?.change || '0');
        const klevch = parseFloat(klev?.change || '0');
        etfLine = `📊 코스피 ETF 현황:\nKODEX 200: ${k200?.price || '-'}원 (${k200ch >= 0 ? '+' : ''}${k200ch.toFixed(2)}%) ${k200ch > 0 ? '🟢' : k200ch < 0 ? '🔴' : '🟡'}\nKODEX 레버리지: ${klev?.price || '-'}원 (${klevch >= 0 ? '+' : ''}${klevch.toFixed(2)}%) ${klevch > 0 ? '🟢' : klevch < 0 ? '🔴' : '🟡'} ⚠️ 2배 레버리지`;
      } else if (isSP500) {
        const [spy, voo, ivv] = await Promise.all([
          fetchMarketPrice('SPY').catch(() => null),
          fetchMarketPrice('VOO').catch(() => null),
          fetchMarketPrice('IVV').catch(() => null),
        ]);
        const spych = parseFloat(spy?.change || '0');
        const vooch = parseFloat(voo?.change || '0');
        const ivvch = parseFloat(ivv?.change || '0');
        etfLine = `📊 S&P500 ETF 현황 (ETF로 직접 투자 가능):\nSPY (SPDR): $${spy?.price || '-'} (${spych >= 0 ? '+' : ''}${spych.toFixed(2)}%) ${spych > 0 ? '🟢' : spych < 0 ? '🔴' : '🟡'}\nVOO (Vanguard): $${voo?.price || '-'} (${vooch >= 0 ? '+' : ''}${vooch.toFixed(2)}%) ${vooch > 0 ? '🟢' : vooch < 0 ? '🔴' : '🟡'}\nIVV (iShares): $${ivv?.price || '-'} (${ivvch >= 0 ? '+' : ''}${ivvch.toFixed(2)}%) ${ivvch > 0 ? '🟢' : ivvch < 0 ? '🔴' : '🟡'}`;
      } else if (isDow) {
        const dia = await fetchMarketPrice('DIA').catch(() => null);
        const diach = parseFloat(dia?.change || '0');
        etfLine = `📊 다우존스 ETF 현황 (ETF로 직접 투자 가능):\nDIA (SPDR Dow Jones): $${dia?.price || '-'} (${diach >= 0 ? '+' : ''}${diach.toFixed(2)}%) ${diach > 0 ? '🟢' : diach < 0 ? '🔴' : '🟡'}`;
      } else {
        // 나스닥 ETF
        const [qqq, tqqq] = await Promise.all([
          fetchMarketPrice('QQQ').catch(() => null),
          fetchMarketPrice('TQQQ').catch(() => null),
        ]);
        const qqqch = parseFloat(qqq?.change || '0');
        const tqqqch = parseFloat(tqqq?.change || '0');
        etfLine = `📊 나스닥 ETF 현황 (ETF로 직접 투자 가능):\nQQQ (나스닥100): $${qqq?.price || '-'} (${qqqch >= 0 ? '+' : ''}${qqqch.toFixed(2)}%) ${qqqch > 0 ? '🟢' : qqqch < 0 ? '🔴' : '🟡'}\nTQQQ (3배 레버리지): $${tqqq?.price || '-'} (${tqqqch >= 0 ? '+' : ''}${tqqqch.toFixed(2)}%) ${tqqqch > 0 ? '🟢' : tqqqch < 0 ? '🔴' : '🟡'} ⚠️ 고위험`;
      }
    } catch { etfLine = ''; }

    const sectorHint = isKRIndex
      ? '관심 섹터: IT·반도체(삼성전자, SK하이닉스), 자동차(현대차, 기아), 금융(KB금융, 신한지주)'
      : '관심 섹터: AI·반도체(엔비디아, 브로드컴), 빅테크(애플, 마이크로소프트), 소비재(아마존)';

    const verdictLabel = verdict === '매수 우위'
      ? '시장 전반 강세 — ETF 또는 개별 종목 진입 검토 가능합니다'
      : verdict === '매도 우위'
        ? '시장 전반 약세 — 인버스 ETF 또는 현금 보유를 권고합니다'
        : '시장 방향성 탐색 중 — 개별 종목 선별 접근을 권고합니다';

    const indexEcho = [
      `결론: ${verdictLabel} (신뢰도 ${confidence}%)`,
      `근거: ${marketTrendDesc} / ${vol.label} / 뉴스 ${nData.sentiment}`,
      `지금: ${etfLine.trim()}`,
      `섹터: ${sectorHint}`,
      `조건: ETF 투자 또는 종목명을 입력하시면 개별 분석을 즉시 개시합니다.`,
    ].join('\n');

    // ✅ ECHO 답변 마지막 — 관심 연결 문장 부착
    finalEcho = `${indexEcho}\n\n${dataSourceLabel}${DISCLAIMER}${ECHO_TAIL}`;

  } else {
    const echoBuilt = buildEchoText({
      keyword,
      situation,
      verdict,
      confidence,
      confidenceBasis,
      volLabel: vol.label,
      condSummary,
      positionSizing,
      echoBiasNote,
      changeRaw: marketData?.change || '0.00',
      nasdaqChange: safeNum(nasdaqData?.change).toFixed(2),
      buyPrice,
      sellPrice,
      volScore: vol.score,
      sentiment: nData.sentiment,
      assetType,
      watchLevel,
      trendStrength: trendCtx.trendStrength,
      trendSummary: trendCtx.trendSummary || undefined,
      conflict,
      consecutiveDays: trendCtx.consecutiveDays,
      // ✅ 진입 조건 구체화용 데이터
      rawPrice: marketData?.rawPrice ?? null,
      avgVolume: marketData?.avgVolume ?? null,
      rawVolume: marketData?.rawVolume ?? null,
      currency,
      // ✅ Confluence Score용 (이평선/거래량/뉴스/시세 일치 판단)
      volIsHigh: vol.isHigh,
      hasMarketData: !!marketData,
      // ✅ 토론 모드 + 지표 플래그 (ECHO 질문용)
      mode: discussMode,
      flags,
      // ✅ 시간대 — forecastMode 분기
      isForecast: (isKRClosed && assetType === 'KOREAN_STOCK') || (isUSClosed && assetType === 'US_STOCK'),
      isBeforeOpen: isKRBeforeOpen || (assetType === 'US_STOCK' && !isWeekend && timeKST < 2330 && timeKST >= 600),
      // ✅ details 3블록 구조용 — 이평선/뉴스 현황
      ma5: marketData?.trend?.ma5 ?? null,
      ma20: marketData?.trend?.ma20 ?? null,
      newsCount: news.length,
    });
    // ✅ ECHO 1 (summary): 즉시 표시 — 결론/조건/행동 3줄 + 답변 마지막 관심 연결 문장
    // ✅ ECHO 2 (details): 별도 버블 — confluence + 근거 + 지금 + 조건 + 비중 + dataSource + disclaimer
    finalEcho = echoBuilt.summary + ECHO_TAIL;
    finalEchoDetails = `${echoBuilt.details}\n\n${dataSourceLabel}${marketClosedNote}${DISCLAIMER}`;
  }

  // ─── RAY/JACK/LUCIA 자세히 보기 상세 ───
  const finalRayDetails = marketData && !isMarketIndex
    ? buildRayDetail({ keyword, marketData, currency, assetType, vix, prevCtx })
    : null;
  const finalJackDetails = marketData && !isMarketIndex
    ? buildJackDetail({ trendCtx, vol, nData, newsCount: news.length, flags, discussMode, conflict, verdict })
    : null;
  const finalLuciaDetails = marketData && !isMarketIndex
    ? buildLuciaDetail({ keyword, marketData, vix, vol, pos, nData, newsCount: news.length, flags, discussMode, conflict, verdict })
    : null;

  const {
    finalRayOut,
    finalJackOut,
    finalLuciaOut,
    finalEchoOut,
    finalReply,
    echoDetailsOut,
    rayDetailsOut,
    jackDetailsOut,
    luciaDetailsOut,
  } = buildStockDetailResponse({
    finalRay,
    finalJack,
    finalLucia,
    finalEcho,
    finalEchoDetails,
    finalRayDetails,
    finalJackDetails,
    finalLuciaDetails,
    discussMode,
  });

  const { rayNews, jackNews, luciaNews, echoNews } = allocatePersonaNews(news);

  return {
    finalReply,
    finalRayOut,
    finalJackOut,
    finalLuciaOut,
    finalEchoOut,
    rayDetailsOut,
    jackDetailsOut,
    luciaDetailsOut,
    echoDetailsOut,
    verdict,
    confidence,
    breakdown,
    positionSizing,
    jackNews,
    luciaNews,
    rayNews,
    echoNews,
    total,
    assetType: assetType as 'CRYPTO' | 'KOREAN_STOCK' | 'US_STOCK',
    entryCondition,
    volIsHigh: vol.isHigh,
  };
}
