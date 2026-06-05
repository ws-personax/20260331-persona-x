import type { Verdict } from '@/lib/personax/types';
import { DISCLAIMER } from '@/lib/personax/scoring';
import { TREND_PICKS, extractTwoKeywords, getSector } from '@/lib/personax/market';

type MarketDataSnapshot = {
  price?: string | null;
  change?: string | null;
  trend?: {
    trend5d?: string | null;
  } | null;
} | null;

type MarketPriceFetcher = (keyword: string) => Promise<MarketDataSnapshot | undefined>;

type MarketQuickPersonas = {
  jack: string;
  lucia: string;
  ray: string;
  echo: string;
  verdict: Verdict;
  confidence: number;
  breakdown: string;
  positionSizing: string;
  jackNews: null;
  luciaNews: null;
  rayNews: null;
  echoNews: null;
};

export type MarketQuickResponseBody = {
  reply: string;
  personas: MarketQuickPersonas;
};

function buildMarketQuickBody(params: {
  ray: string;
  jack: string;
  lucia: string;
  echo: string;
  verdict?: Verdict;
  confidence: number;
  breakdown: string;
  positionSizing?: string;
}): MarketQuickResponseBody {
  const {
    ray,
    jack,
    lucia,
    echo,
    verdict = '관망',
    confidence,
    breakdown,
    positionSizing = '0%',
  } = params;

  return {
    reply: [ray, jack, lucia, echo].join('\n\n'),
    personas: {
      jack,
      lucia,
      ray,
      echo,
      verdict,
      confidence,
      breakdown,
      positionSizing,
      jackNews: null,
      luciaNews: null,
      rayNews: null,
      echoNews: null,
    },
  };
}

export async function tryBuildMarketQuickResponse(params: {
  lastMsg: string;
  keyword: string;
  fetchMarketPrice: MarketPriceFetcher;
}): Promise<MarketQuickResponseBody | null> {
  const { lastMsg, keyword, fetchMarketPrice } = params;

  const isMarketMood = lastMsg.includes('사도 되는 분위기') || lastMsg.includes('사도 되는 분위기야');
  const isCoinDecision = lastMsg.includes('매수 vs 관망') || lastMsg.includes('결론만');
  const isForeignerPick = lastMsg.includes('외국인이 사는 종목') || lastMsg.includes('따라가도 되는');
  const isSectorTiming = lastMsg.includes('강한 섹터') && (lastMsg.includes('타이밍') || lastMsg.includes('진입'));
  const isVolumeFake = lastMsg.includes('거래량 갑자기') || lastMsg.includes('진짜야 페이크야') || lastMsg.includes('진짜 신호야 페이크');
  const isPortfolio = lastMsg.includes('100만원') || (lastMsg.includes('비중') && lastMsg.includes('나눠'));
  const isTrendStrategy = lastMsg.includes('추세추종') || lastMsg.includes('역추세');
  const isDecoupling = (lastMsg.includes('나스닥') && lastMsg.includes('코스피') && lastMsg.includes('따로')) || lastMsg.includes('디커플링');
  const isStopLoss = lastMsg.includes('손절 어디야') || (lastMsg.includes('손절') && lastMsg.includes('들어가면'));
  const isNextDayStrategy = lastMsg.includes('내일 전략') || lastMsg.includes('장 결과') || lastMsg.includes('어제 장') || (lastMsg.includes('오늘') && lastMsg.includes('결과'));
  const isOpeningVolume = lastMsg.includes('장 초반') || lastMsg.includes('초반 30분') || (lastMsg.includes('개장') && lastMsg.includes('거래량'));
  const isFirstStock = lastMsg.includes('첫 번째로 봐야') || lastMsg.includes('장 열리면') || (lastMsg.includes('개장') && lastMsg.includes('종목'));

  const comparePair = extractTwoKeywords(lastMsg);
  if (comparePair) {
    const sector1 = getSector(comparePair.first);
    const sector2 = getSector(comparePair.second);
    if (sector1 && sector2 && sector1 === sector2) {
      const [a, b] = await Promise.all([
        fetchMarketPrice(comparePair.first).catch(() => null),
        fetchMarketPrice(comparePair.second).catch(() => null),
      ]);
      const chA = parseFloat(a?.change || '0');
      const chB = parseFloat(b?.change || '0');
      const strong = chA > chB ? comparePair.first : comparePair.second;
      const weak = chA > chB ? comparePair.second : comparePair.first;
      const strongCh = chA > chB ? chA : chB;
      const weakCh = chA > chB ? chB : chA;
      const gap = Math.abs(chA - chB);
      const isDivergent = gap >= 1.0;
      const sign = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(2);

      const conclusion = isDivergent
        ? `같은 ${sector1}인데 ${strong}은 강세, ${weak}는 약세 — 종목 선별이 중요한 구간입니다`
        : `같은 ${sector1} — ${comparePair.first}/${comparePair.second} 동조화 흐름, 섹터 공통 요인 중심으로 판단하십시오`;

      const ray = `같은 섹터 비교 — ${sector1}
${comparePair.first}: ${a?.price || '-'} (${sign(chA)}%)
${comparePair.second}: ${b?.price || '-'} (${sign(chB)}%)
격차: ${gap.toFixed(2)}%p → ${isDivergent ? '종목 분산(디버전스) — 개별 이슈 가능성' : '섹터 동조화 — 공통 모멘텀'}`;

      const jack = `지휘관님, ${sector1} 섹터 내 ${comparePair.first} vs ${comparePair.second} 비교 분석입니다.
${strong} ${sign(strongCh)}% / ${weak} ${sign(weakCh)}% — 격차 ${gap.toFixed(2)}%p.
${isDivergent
  ? `${strong} 쪽으로 수급이 쏠리는 구간입니다. 섹터 전체가 아닌 개별 종목 선별이 성과를 좌우합니다.`
  : `두 종목이 함께 ${chA > 0 && chB > 0 ? '상승' : chA < 0 && chB < 0 ? '하락' : '횡보'}하고 있어 섹터 공통 이슈가 지배적입니다. 어느 한 종목만 고집할 필요는 없습니다.`}`;

      const lucia = `소장님, ${sector1} 업종에서 같은 날 ${comparePair.first}는 ${sign(chA)}%, ${comparePair.second}는 ${sign(chB)}% 움직였어요. ${isDivergent
        ? `같은 업종인데 한 종목이 눈에 띄게 강하다면 섹터 이슈가 아니라 개별 회사 이슈예요. 강한 쪽(${strong})을 따라가되 과열 아닌지 꼭 확인하세요.`
        : `두 종목이 비슷하게 움직이면 섹터 공통 뉴스나 업황 변화를 먼저 살펴봐야 해요. 개별 선택보다 섹터 비중 결정이 먼저입니다.`}`;

      const echo = `결론: 🟡 ${conclusion}
컨플루언스 신호 강도: ${isDivergent ? '보통 (종목 선별)' : '낮음 (동조화)'}
${sign(chA) === sign(chB) && chA * chB > 0 ? '✅' : '⚠️'} 섹터 동조 여부: ${chA * chB > 0 ? '동조' : '분화'}
⚠️ 격차: ${gap.toFixed(2)}%p
조건: ${isDivergent ? `${strong} 중심으로 10% 선진입 검토 — ${weak} 반등 전까지 비중 분리` : `섹터 비중 결정 후 두 종목 동일 비중 분산`}
비중: 신규 진입 시 투자금의 10%로 시작하십시오.

📡 데이터 출처 — 실시간 시장 데이터

${DISCLAIMER}`;

      return buildMarketQuickBody({ ray, jack, lucia, echo, confidence: 80, breakdown: `같은 섹터 비교(${sector1})` });
    }
  }

  if (keyword && keyword !== '시장') return null;

  if (isOpeningVolume) {
    const usData = await fetchMarketPrice('나스닥').catch(() => null);
    const usChange = parseFloat(usData?.change || '0');
    const usTrend = usChange > 0.5 ? '상승' : usChange < -0.5 ? '하락' : '보합';
    const jack = `지휘관님, 개장 초반 30분 거래량 판단 기준입니다.\n\n✅ 매수 신호: 전일 대비 거래량 +30% 이상 + 가격 상승 동반\n⚠️ 주의 신호: 거래량 증가인데 가격 제자리 (교착 구간)\n❌ 회피 신호: 거래량 감소 + 갭하락 동시 출현\n\n나스닥 어제 ${usTrend} 마감(${usChange >= 0 ? '+' : ''}${usChange.toFixed(2)}%) 기준, 오늘 개장 초반 ${usTrend === '상승' ? '매수세 유입 가능성이 높습니다' : usTrend === '하락' ? '매도세 주의가 필요합니다' : '방향성 확인이 필요합니다'}.`;
    const lucia = `소장님, 개장 초반 30분은 그날 장의 분위기를 결정해요. 거래량이 평소보다 많으면서 가격도 올라가면 좋은 신호예요. 반대로 거래량만 많고 가격이 안 움직이면 세력이 물량 소화 중일 수 있어요. 서두르지 말고 15~30분 지켜본 후 진입하세요.`;
    const ray = `개장 초반 거래량 판단 기준 데이터입니다.\n\n✅ 강한 신호: 거래량 전일 대비 +30% + 가격 +0.5% 이상 동반\n⚠️ 약한 신호: 거래량 +10~30% + 가격 횡보\n❌ 페이크: 거래량 급증 + 가격 변동 없음\n\n나스닥 전일 ${usChange >= 0 ? '+' : ''}${usChange.toFixed(2)}% 기준 오늘 한국장 연동 가능성 ${usTrend === '상승' ? '높음' : usTrend === '하락' ? '하락 주의' : '중립'}입니다.`;
    const echo = `결론: 개장 초반 30분 거래량 판단 기준 제공 완료\n\n핵심 공식: 거래량 +30% 이상 + 가격 동반 상승 = 진입 신호\n나스닥 전일 ${usTrend} 마감 → 오늘 개장 초반 ${usTrend === '상승' ? '상승 모멘텀 유지 여부를 확인하십시오' : usTrend === '하락' ? '갭하락 주의 — 관망을 권고합니다' : '방향성 확인 후 진입하십시오'}\n\n조건: 분석할 종목명을 입력하시면 개별 거래량 신호를 즉각 판단합니다.\n\n📡 데이터 출처 — 나스닥 전일 종가 기준\n\n${DISCLAIMER}`;
    return buildMarketQuickBody({ ray, jack, lucia, echo, confidence: 78, breakdown: '개장 초반 거래량' });
  }

  if (isFirstStock) {
    const [usData, krData] = await Promise.all([
      fetchMarketPrice('나스닥').catch(() => null),
      fetchMarketPrice('코스피').catch(() => null),
    ]);
    const usChange = parseFloat(usData?.change || '0');
    const krChange = parseFloat(krData?.change || '0');
    const overallTrend = (usChange + krChange) > 0.5 ? '상승' : (usChange + krChange) < -0.5 ? '하락' : '보합';
    const jack = `지휘관님, 오늘 개장 첫 번째 종목 선택 기준입니다.\n\n나스닥 ${usChange >= 0 ? '+' : ''}${usChange.toFixed(2)}% / 코스피 ${krChange >= 0 ? '+' : ''}${krChange.toFixed(2)}% 기준\n\n${overallTrend === '상승' ? '✅ 상승 장세 — 전일 강했던 섹터(IT·반도체) 첫 번째 확인 권고' : overallTrend === '하락' ? '⚠️ 하락 장세 — 방어적 접근. 첫 종목 진입보다 시장 확인 우선' : '🟡 보합 장세 — 거래량 터진 종목 위주로 선별 접근'}\n\n종목명을 입력하시면 즉각 개별 분석을 개시합니다.`;
    const lucia = `소장님, 장 열리자마자 바로 들어가는 건 위험해요. 첫 15분은 '관찰 시간'이에요. ${overallTrend === '상승' ? '오늘은 분위기가 좋으니 거래량 터지는 종목을 찾아보세요.' : overallTrend === '하락' ? '오늘은 조심하는 날이에요. 급하게 들어가지 말고 반등 신호 확인 후 움직이세요.' : '오늘은 방향이 불확실해요. 확실한 신호 나올 때까지 기다리는 게 맞아요.'}`;
    const ray = `시장 데이터 기준입니다.\n나스닥: ${usData?.price || '-'} (${usChange >= 0 ? '+' : ''}${usChange.toFixed(2)}%)\n코스피: ${krData?.price || '-'} (${krChange >= 0 ? '+' : ''}${krChange.toFixed(2)}%)\n\n종합 추세: ${overallTrend === '상승' ? '상승 — IT·반도체 섹터 우선 확인 권고' : overallTrend === '하락' ? '하락 — 방어적 접근, 관망 비중 확대 권고' : '보합 — 거래량 신호 확인 후 선별 진입 권고'}\n\n분석할 종목명을 입력하시면 즉각 데이터를 제공합니다.`;
    const echo = `결론: 오늘 개장 첫 종목 전략 제공 완료\n\n시장 추세: ${overallTrend === '상승' ? '🟢 상승 — IT·반도체 섹터 우선' : overallTrend === '하락' ? '🔴 하락 — 관망 우선, 반등 신호 대기' : '🟡 보합 — 거래량 신호 확인 후 진입'}\n나스닥 ${usChange >= 0 ? '+' : ''}${usChange.toFixed(2)}% / 코스피 ${krChange >= 0 ? '+' : ''}${krChange.toFixed(2)}%\n\n조건: 종목명을 입력하시면 즉각 개별 분석을 개시합니다.\n비중: 시장 방향 확인 전 0% 유지하십시오.\n\n📡 데이터 출처 — 전일 종가 기준\n\n${DISCLAIMER}`;
    return buildMarketQuickBody({ ray, jack, lucia, echo, confidence: 75, breakdown: '개장 첫 종목' });
  }

  if (isNextDayStrategy) {
    const nowKST2 = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const hourKST = nowKST2.getUTCHours();
    const minKST = nowKST2.getUTCMinutes();
    const timeKST2 = hourKST * 100 + minKST;
    const isBeforeOpen2 = timeKST2 < 900;
    const dayLabel = isBeforeOpen2 ? '어제' : '오늘';
    const nextLabel = isBeforeOpen2 ? '오늘' : '내일';

    const [krData, usData] = await Promise.all([
      fetchMarketPrice('코스피').catch(() => null),
      fetchMarketPrice('나스닥').catch(() => null),
    ]);
    const krChange = parseFloat(krData?.change || '0');
    const usChange = parseFloat(usData?.change || '0');
    const descChange = (ch: number) => {
      if (ch > 1.5) return `강세 마감 (+${ch.toFixed(2)}%)`;
      if (ch > 0.3) return `상승 마감 (+${ch.toFixed(2)}%)`;
      if (ch >= -0.1 && ch <= 0.1) return `보합 마감 (${ch.toFixed(2)}%)`;
      if (ch >= -0.3) return `약보합 마감 (${ch.toFixed(2)}%)`;
      if (ch >= -1.5) return `하락 마감 (${ch.toFixed(2)}%)`;
      return `급락 마감 (${ch.toFixed(2)}%)`;
    };
    const krResult = descChange(krChange);
    const usResult = descChange(usChange);
    const nextSignal = (krChange + usChange) > 1
      ? `${nextLabel} 상승 모멘텀 유지 가능성 높음`
      : (krChange + usChange) < -1
      ? `${nextLabel} 하락 압력 주의 필요`
      : `${nextLabel} 방향성 불확실 — 개장 초 거래량 확인 필요`;

    const jack = `지휘관님, ${dayLabel} 장 결과 브리핑입니다.\n\n코스피: ${krData?.price || '-'} ${krResult}\n나스닥: ${usData?.price || '-'} ${usResult}\n\n${nextLabel} 전략: ${nextSignal}. 개장 초 30분 거래량이 핵심 신호입니다.`;
    const lucia = isBeforeOpen2
      ? `소장님, ${dayLabel} 흐름을 보면 ${krChange >= 0 ? '코스피가 버텨줬어요. 오늘 개장 초반을 잘 지켜봐요.' : '코스피가 좀 흔들렸네요. 오늘 개장 초반 반등 신호가 있는지 확인하세요.'} 무리하지 말고 신호 확인 후 움직이세요.`
      : `소장님, 오늘 하루 수고하셨어요. ${krChange >= 0 ? '오늘 코스피가 버텨줬네요. 내일도 이 흐름이 이어질지 개장 초반을 지켜봐요.' : '오늘 좀 힘들었죠. 하지만 하락도 내일의 기회가 될 수 있어요.'} 무리하지 말고 신호 확인 후 움직이세요.`;
    const ray = `${dayLabel} 종가 기준 데이터입니다.\n코스피: ${krData?.price || '-'} (${krChange >= 0 ? '+' : ''}${krChange.toFixed(2)}%) — ${descChange(krChange)}\n나스닥: ${usData?.price || '-'} (${usChange >= 0 ? '+' : ''}${usChange.toFixed(2)}%) — ${descChange(usChange)}\n\n${nextLabel} 핵심 지표: 개장 초 30분 거래량 + 외국인 수급 방향을 확인하십시오.`;
    const echo = `결론: ${dayLabel} 장 분석 완료 — ${nextSignal}\n\n📊 ${dayLabel} 장 요약:\n코스피: ${krData?.price || '-'} ${krResult}\n나스닥: ${usData?.price || '-'} ${usResult}\n\n${nextLabel} 전략: ${nextSignal}\n조건: 개장 초 거래량 +30% 이상 확인 시 방향성 신뢰 가능\n비중: 신호 확인 전 0% 유지하십시오.\n\n📡 데이터 출처 — 시세: 전일 종가 기준\n\n${DISCLAIMER}`;
    return buildMarketQuickBody({ ray, jack, lucia, echo, confidence: 75, breakdown: '장 결과 분석' });
  }

  if (isMarketMood) {
    const [krData, usData] = await Promise.all([
      fetchMarketPrice('코스피').catch(() => null),
      fetchMarketPrice('나스닥').catch(() => null),
    ]);
    const nowMood = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const dayMood = nowMood.getUTCDay();
    const timeMood = nowMood.getUTCHours() * 100 + nowMood.getUTCMinutes();
    const isWknd = dayMood === 0 || dayMood === 6;
    const krOpen = !isWknd && timeMood >= 900 && timeMood < 1530;
    const krBefore = !isWknd && timeMood < 900;
    const usOpen = !isWknd && (timeMood >= 2330 || timeMood < 600);
    const krStatus = isWknd ? '주말 휴장' : krBefore ? '개장 전' : krOpen ? '장 중' : '장 마감';
    const usStatus = isWknd ? '주말 휴장' : usOpen ? '장 중' : timeMood < 2330 ? `오늘 밤 23:30 개장 예정` : '장 마감';

    const krChange = parseFloat(krData?.change || '0');
    const usChange = parseFloat(usData?.change || '0');
    const krMood = krChange > 0.5 ? '상승 중' : krChange < -0.5 ? '하락 중' : '횡보';
    const usMood = usChange > 0.5 ? '강세' : usChange < -0.5 ? '약세' : '보합';
    const krSignal = krOpen && krChange > 0.3 ? '🟢 진입 검토' : krBefore ? '🟡 개장 후 확인' : '🟡 신호 대기';
    const usSignal = usOpen && usChange > 0.5 ? '🟢 진입 검토' : !usOpen ? '🟡 개장 대기' : '🟡 신호 대기';

    const jack = `지휘관님, 현재 시장 분위기 보고드립니다.
한국(코스피): ${krData?.price || '-'} (${krChange >= 0 ? '+' : ''}${krChange.toFixed(2)}%) — ${krStatus} ${krSignal}
미국(나스닥): ${usData?.price || '-'} (${usChange >= 0 ? '+' : ''}${usChange.toFixed(2)}%) — ${usStatus} ${usSignal}`;

    const luciaMsg = isWknd
      ? '주말이라 시장은 쉬고 있어요. 다음 주 전략을 미리 준비하는 게 맞습니다.'
      : krOpen && !usOpen
        ? `한국장은 ${krMood} 중이에요. 미국장은 ${usStatus}이라 지금은 한국 종목에 집중하세요.`
        : !krOpen && usOpen
          ? `미국장이 ${usMood} 중이에요. 한국장은 ${krStatus}이에요.`
          : krMood === '상승 중' && usMood === '강세'
            ? '양쪽 다 올라가고 있어요. 하지만 모두가 낙관할 때가 가장 위험한 법이에요.'
            : '지금은 리스크 관리가 먼저예요.';
    const lucia = `소장님, ${luciaMsg}`;

    const ray = `코스피 ${krData?.price || '-'} (${krChange >= 0 ? '+' : ''}${krChange.toFixed(2)}%) [${krStatus}] / 나스닥 ${usData?.price || '-'} (${usChange >= 0 ? '+' : ''}${usChange.toFixed(2)}%) [${usStatus}]
한국장: ${krSignal} / 미국장: ${usSignal}`;

    const echo = `결론: ${krSignal === '🟢 진입 검토' || usSignal === '🟢 진입 검토' ? '🟡 일부 시장 진입 가능 — 개별 종목 확인 후 결정하십시오' : '⚪ 대기 — 개장 신호 확인 전까지 현금 유지하십시오'}
한국: ${krStatus} (${krMood}) / 미국: ${usStatus} (${usMood})
종목 분석을 원하시면 종목명을 입력하십시오.

📡 데이터 출처 — 실시간 시장 데이터

${DISCLAIMER}`;

    return buildMarketQuickBody({ ray, jack, lucia, echo, confidence: 80, breakdown: '시장 분위기' });
  }

  if (isCoinDecision) {
    const [btcData, ethData] = await Promise.all([
      fetchMarketPrice('비트코인').catch(() => null),
      fetchMarketPrice('이더리움').catch(() => null),
    ]);
    const btcChange = parseFloat(btcData?.change || '0');
    const ethChange = parseFloat(ethData?.change || '0');
    const btcSignal = btcChange > 1 ? '🟢 매수 검토' : btcChange < -1 ? '🔴 관망' : '🟡 조건 대기';
    const ethSignal = ethChange > 1 ? '🟢 매수 검토' : ethChange < -1 ? '🔴 관망' : '🟡 조건 대기';

    const jack = `지휘관님, 코인 현황 보고드립니다.
비트코인: ${btcData?.price || '-'} (${btcChange >= 0 ? '+' : ''}${btcChange.toFixed(2)}%) ${btcSignal}
이더리움: ${ethData?.price || '-'} (${ethChange >= 0 ? '+' : ''}${ethChange.toFixed(2)}%) ${ethSignal}`;
    const lucia = `소장님, ${btcChange > 1 ? '지금 분위기가 좋긴 한데, 코인은 언제든 급변할 수 있어요. 분할 매수로 리스크를 나누세요.' : '지금은 관망이 맞아요. 거래량이 확인될 때까지 기다리는 것이 맞습니다.'}`;
    const ray = `비트코인 ${btcData?.price || '-'} (${btcChange >= 0 ? '+' : ''}${btcChange.toFixed(2)}%) / 이더리움 ${ethData?.price || '-'} (${ethChange >= 0 ? '+' : ''}${ethChange.toFixed(2)}%)
코인 시장은 나스닥과 독립적으로 움직이는 경우가 많습니다.`;
    const echo = `결론: ${btcSignal === '🟢 매수 검토' ? '🟡 소량 분할 진입 검토 — 비트코인 기준 5~10% 먼저 진입하십시오' : '⚪ 관망 — 거래량 증가 신호 확인 전까지 대기하십시오'}
비트코인 ${btcSignal} / 이더리움 ${ethSignal}

📡 데이터 출처 — Upbit 실시간

${DISCLAIMER}`;

    return buildMarketQuickBody({ ray, jack, lucia, echo, confidence: 80, breakdown: '코인 결론' });
  }

  if (isPortfolio) {
    const [krData, usData, btcData] = await Promise.all([
      fetchMarketPrice('코스피').catch(() => null),
      fetchMarketPrice('나스닥').catch(() => null),
      fetchMarketPrice('비트코인').catch(() => null),
    ]);
    const krChange = parseFloat(krData?.change || '0');
    const usChange = parseFloat(usData?.change || '0');
    const btcChange = parseFloat(btcData?.change || '0');
    const krWeight = krChange > 0.5 ? 30 : 20;
    const usWeight = usChange > 0.5 ? 40 : 30;
    const btcWeight = btcChange > 1 ? 10 : 5;
    const cashWeight = 100 - krWeight - usWeight - btcWeight;

    const jack = `지휘관님, 현재 시장 기준 100만원 배분 전략입니다.
한국주식: ${krWeight}만원 (${krWeight}%) — ${krChange >= 0 ? '상승' : '하락'} 추세
미국주식: ${usWeight}만원 (${usWeight}%) — ${usChange >= 0 ? '강세' : '약세'}
코인: ${btcWeight}만원 (${btcWeight}%) — 소량 분산
현금: ${cashWeight}만원 (${cashWeight}%) — 신호 대기`;
    const lucia = `소장님, 지금처럼 불확실할 때는 현금 비중을 높게 가져가는 게 맞아요. ${cashWeight}만원은 신호가 올 때 바로 쓸 수 있는 실탄입니다.`;
    const ray = `현재 추세 기반 배분: 한국 ${krWeight}% / 미국 ${usWeight}% / 코인 ${btcWeight}% / 현금 ${cashWeight}%
시장 변동성에 따라 비중 조정이 필요합니다.`;
    const echo = `결론: 100만원 기준 배분 완료
한국주식 ${krWeight}만원 / 미국주식 ${usWeight}만원 / 코인 ${btcWeight}만원 / 현금 ${cashWeight}만원
각 자산 개별 분석을 원하시면 종목명을 입력하십시오.

📡 데이터 출처 — 실시간 추세 기반

${DISCLAIMER}`;

    return buildMarketQuickBody({ ray, jack, lucia, echo, confidence: 75, breakdown: '포트폴리오' });
  }

  if (isTrendStrategy) {
    const usData = await fetchMarketPrice('나스닥').catch(() => null);
    const usChange = parseFloat(usData?.change || '0');
    const isTrendFavorable = usChange > 0.5;

    const jack = `지휘관님, 현재 나스닥 ${usChange >= 0 ? '+' : ''}${usChange.toFixed(2)}% 기준 전략 분석입니다.
${isTrendFavorable ? '추세추종 유리 — 모멘텀이 살아있는 구간입니다. 5일·20일 이평선 정배열 종목을 추종하십시오.' : '역추세 유리 — 하락 과정에서 반등 구간을 노리는 것이 유리합니다. 과매도 종목을 탐색하십시오.'}`;
    const lucia = `소장님, ${isTrendFavorable ? '지금 모두가 올라타고 싶어하는 구간이에요. FOMO에 휩쓸리지 말고, 추세가 확인된 종목만 소량 진입하세요.' : '지금은 역추세 전략이 맞긴 한데, 바닥을 잡으려다 손가락이 잘릴 수 있어요. 반등 신호 확인 후 진입하세요.'}`;
    const ray = `나스닥 ${usData?.price || '-'} (${usChange >= 0 ? '+' : ''}${usChange.toFixed(2)}%)
추세 판단: ${isTrendFavorable ? '정배열 구간 — 추세추종 전략 유효' : '역배열 구간 — 역추세 전략 검토'}
통계적으로 추세추종은 상승장에서, 역추세는 횡보/하락장에서 유효합니다.`;
    const echo = `결론: ${isTrendFavorable ? '🟢 추세추종 유리 — 모멘텀 강한 종목 진입 검토' : '🟡 역추세 검토 — 과매도 종목 반등 대기'}
전략: ${isTrendFavorable ? '이평선 정배열 + 거래량 증가 종목 추종' : '5일 이평선 이하 과매도 + 거래량 회복 신호 대기'}
관심 종목명을 입력하시면 즉각 분석을 개시합니다.

📡 데이터 출처 — 나스닥 실시간

${DISCLAIMER}`;

    return buildMarketQuickBody({ ray, jack, lucia, echo, confidence: 80, breakdown: '전략 분석' });
  }

  if (isDecoupling) {
    const [krData, usData] = await Promise.all([
      fetchMarketPrice('코스피').catch(() => null),
      fetchMarketPrice('나스닥').catch(() => null),
    ]);
    const krChange = parseFloat(krData?.change || '0');
    const usChange = parseFloat(usData?.change || '0');
    const diff = Math.abs(usChange - krChange);
    const isDecouplingNow = diff > 1.0;

    const jack = `지휘관님, 나스닥 vs 코스피 디커플링 분석입니다.
나스닥: ${usChange >= 0 ? '+' : ''}${usChange.toFixed(2)}% / 코스피: ${krChange >= 0 ? '+' : ''}${krChange.toFixed(2)}%
격차: ${diff.toFixed(2)}%p → ${isDecouplingNow ? '디커플링 구간 — 미국 중심 전략 유효' : '커플링 구간 — 연동 추세 유지 중'}`;
    const lucia = `소장님, ${isDecouplingNow ? `나스닥과 코스피가 ${diff.toFixed(1)}%p 차이로 따로 움직이고 있어요. 이럴 때는 미국 주식 비중을 높이는 게 맞습니다.` : '지금은 두 시장이 비슷하게 움직이고 있어요. 미국 흐름을 따라가는 전략이 유효합니다.'}`;
    const ray = `나스닥 ${usChange >= 0 ? '+' : ''}${usChange.toFixed(2)}% / 코스피 ${krChange >= 0 ? '+' : ''}${krChange.toFixed(2)}%
상관관계: ${isDecouplingNow ? `디커플링 (격차 ${diff.toFixed(2)}%p)` : `커플링 (격차 ${diff.toFixed(2)}%p 이내)`}`;
    const echo = `결론: ${isDecouplingNow ? '🟡 디커플링 — 미국 주식 중심 전략 권고' : '⚪ 커플링 — 양 시장 동조화 유지'}
나스닥 ${usChange >= 0 ? '+' : ''}${usChange.toFixed(2)}% vs 코스피 ${krChange >= 0 ? '+' : ''}${krChange.toFixed(2)}%
${isDecouplingNow ? '미국 개별 종목 분석을 요청하십시오.' : '한국/미국 모두 비슷한 전략이 유효합니다.'}

📡 데이터 출처 — 실시간 시장 데이터

${DISCLAIMER}`;

    return buildMarketQuickBody({ ray, jack, lucia, echo, confidence: 82, breakdown: '디커플링 분석' });
  }

  if (isStopLoss) {
    const jack = `지휘관님, 손절 위치는 종목마다 다릅니다. 종목명을 입력하시면 즉각 손절가를 계산해 드립니다.\n\n일반 원칙: 진입가 대비 -3~5% 구간이 표준 손절 기준입니다.\n예) 삼성전자 215,000원 진입 → 손절 208,550원 (-3%)`;
    const lucia = `소장님, 손절을 미리 정해두는 게 가장 중요한 투자 습관이에요. 종목명을 말씀해 주시면 에코가 구체적인 손절가를 알려드릴 거예요.`;
    const ray = `손절 기준 공식: 진입가 × (1 - 손절율)\n예) 진입가 100,000원, 손절율 3% → 손절가 97,000원\n종목명 입력 시 실제 진입가 기준 손절가를 계산합니다.`;
    const echo = `결론: 손절 계산을 위해 종목명이 필요합니다.\n종목명을 입력하시면 즉각 손절가를 제시합니다.\n\n${DISCLAIMER}`;
    return buildMarketQuickBody({ ray, jack, lucia, echo, confidence: 70, breakdown: '손절 안내' });
  }

  if (isForeignerPick) {
    const picks = TREND_PICKS['KOREAN_UP'] || { stocks: ['삼성전자', 'SK하이닉스', '현대차'], sector: 'IT·반도체·자동차' };
    const [d0, d1, d2] = await Promise.all(picks.stocks.map((s: string) => fetchMarketPrice(s).catch(() => null)));
    const stocksWithData = picks.stocks.map((s: string, i: number) => {
      const d = [d0, d1, d2][i];
      const ch = parseFloat(d?.change || '0');
      const signal = ch > 0.5 ? '🟢 외국인 수급 유입' : ch < -0.5 ? '🔴 수급 이탈' : '🟡 관망';
      return `${s}: ${d?.price || '-'} (${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%) ${signal}`;
    }).join('\n');
    const jack = `지휘관님, 외국인 수급 기준 주목 종목 브리핑입니다.\n\n${stocksWithData}\n\n수급 유입 확인된 종목부터 개별 분석을 시작하십시오.`;
    const lucia = `소장님, 외국인이 사는 종목을 따라가는 건 좋은 전략이에요. 하지만 외국인도 틀릴 수 있어요. 수급 유입 + 거래량 증가가 동시에 확인될 때만 따라가세요.`;
    const ray = `외국인 수급 기준 브리핑:\n${stocksWithData}\n외국인 순매수 TOP 데이터는 실시간 지원 예정입니다.`;
    const echo = `결론: 외국인 수급 브리핑 완료\n${stocksWithData}\n종목명을 입력하시면 즉각 상세 분석을 개시합니다.\n\n📡 데이터 출처 — 실시간 수급 데이터\n\n${DISCLAIMER}`;
    return buildMarketQuickBody({ ray, jack, lucia, echo, confidence: 75, breakdown: '외국인 수급' });
  }

  if (isSectorTiming) {
    const nasdaqData2 = await fetchMarketPrice('나스닥').catch(() => null);
    const trend2 = nasdaqData2?.trend?.trend5d || '상승';
    const trendKey2 = trend2 === '상승' ? 'US_UP' : trend2 === '하락' ? 'US_DOWN' : 'US_NEUTRAL';
    const picks2 = TREND_PICKS[trendKey2 as keyof typeof TREND_PICKS];
    const [d0, d1, d2] = await Promise.all(picks2.stocks.map((s: string) => fetchMarketPrice(s).catch(() => null)));
    const briefings2 = picks2.stocks.map((s: string, i: number) => {
      const d = [d0, d1, d2][i];
      const ch = parseFloat(d?.change || '0');
      const signal = ch > 1 ? '🟢 진입 검토' : ch < -1 ? '🔴 관망' : '🟡 조건 대기';
      return `${s}: ${d?.price || '-'} (${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%) ${signal}`;
    }).join('\n');
    const jack = `지휘관님, 현재 가장 강한 섹터는 ${picks2.sector}입니다.\n\n${briefings2}\n\n진입 검토 종목부터 분석을 시작하십시오.`;
    const lucia = `소장님, 강한 섹터라도 모든 종목이 좋은 건 아니에요. 🟢 신호가 뜬 종목만 진입 검토하세요.`;
    const ray = `강한 섹터: ${picks2.sector}\n\n${briefings2}\n개별 종목 분석 요청 시 상세 수치를 제공합니다.`;
    const echo = `결론: 강한 섹터 브리핑 완료 — ${picks2.sector}\n\n${briefings2}\n종목명을 입력하시면 즉각 상세 분석을 개시합니다.\n\n📡 데이터 출처 — 실시간 추세 기반\n\n${DISCLAIMER}`;
    return buildMarketQuickBody({ ray, jack, lucia, echo, confidence: 78, breakdown: '섹터 분석' });
  }

  if (isVolumeFake) {
    const jack = `지휘관님, 거래량 급증의 진짜 신호 vs 페이크 구분 기준입니다.\n\n✅ 진짜 신호: 거래량 증가 + 가격 동반 상승 + 이평선 돌파\n❌ 페이크: 거래량 증가인데 가격 제자리 (교착 구간) / 거래량 폭증 후 가격 급락 (패닉 셀)\n\n분석 원하는 종목명을 입력하시면 즉각 판단합니다.`;
    const lucia = `소장님, 거래량이 터졌다고 무조건 올라타면 안 돼요. 가격이 같이 올라가고 있는지 꼭 확인하세요. 거래량만 많고 가격이 안 움직이면 세력이 물량 소화 중일 수 있어요.`;
    const ray = `거래량 급증 판단 기준:\n✅ 진짜: 거래량 +30% 이상 + 가격 +1% 이상 동반\n❌ 페이크: 거래량 +30% 이상이지만 가격 ±0.5% 이내\n분석할 종목명을 입력하시면 실제 데이터로 판단합니다.`;
    const echo = `결론: 거래량 급증 판단 기준 제공 완료\n진짜 신호 = 거래량 +30% + 가격 +1% 동반\n페이크 = 거래량만 급증, 가격 정체\n\n조건: 종목명을 입력하시면 즉각 판단을 개시합니다.\n\n📡 데이터 출처 — 실시간 거래량 기준\n\n${DISCLAIMER}`;
    return buildMarketQuickBody({ ray, jack, lucia, echo, confidence: 80, breakdown: '거래량 분석' });
  }

  return null;
}
