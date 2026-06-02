import {
  removeFuturePersonaReferences,
  sanitizeMarketDataFactLock,
  type PersonaKey,
} from '@/lib/personax/persona-dna';

export type QuestionType =
  | 'continue_or_stop'
  | 'buy_or_wait'
  | 'compare'
  | 'list'
  | 'general';

export type DirectAnswerPersonaKey = 'lucia' | 'jack' | 'ray' | 'echo';

const SAFE_INVESTMENT_FALLBACK =
  '현재가는 별도 확인이 필요합니다. 확인된 시장 데이터 없이 구체적 가격, 지지선, 손절선, 진입 구간을 단정할 수 없습니다. 판단 기준은 실적, 업황, 투자 기간, 감당 가능한 손실 범위입니다.';

const INVESTMENT_QUESTION_PATTERN =
  /사야|살까|살까요|매수|팔아야|매도|보유|관망|투자해도|진입|손절|물타|비중|주식|코인|비트코인|삼성전자|LG전자|엘지전자|종목|현재가|지지선|저항선|수익률|PER|PBR/i;

const LUMP_SUM_ALLOCATION_PATTERN =
  /퇴직금|자산\s*배분|자산배분|노후\s*자금|노후자금|목돈|상속금/;

const UNSAFE_INVESTMENT_ANSWER_PATTERN =
  /(?:\d+(?:[.,]\d+)?\s*(?:원|만원|억원|조원|달러|%|퍼센트|배))|지지선|저항선|손절선|진입|매수|매도|관망입니다|보류입니다|분할 접근입니다|쳐다보지도 마라|지금 들어가라|지금 들어가지 마라/i;

function canUseSafeInvestmentFallback(
  questionType: QuestionType,
  hasMarketData?: boolean,
): boolean {
  return (
    hasMarketData === false &&
    (questionType === 'buy_or_wait' ||
      (questionType as string) === 'sell_or_hold')
  );
}

function shouldSanitizeEchoInvestmentTerms(questionType: QuestionType): boolean {
  return (
    questionType !== 'buy_or_wait' &&
    (questionType as string) !== 'sell_or_hold'
  );
}

function sanitizeEchoInvestmentTerms(answer: string): string {
  return answer
    .replace(/손절선\s*정해놓으셨어요\?/g, '중단 기준 정해놓으셨어요?')
    .replace(/지지선\s*기준/g, '판단 기준')
    .replace(/현재가\s*기준/g, '현재 상황 기준')
    .replace(/손절선/g, '중단 기준')
    .replace(/지지선/g, '판단 기준')
    .replace(/현재가/g, '현재 상황');
}

function sanitizeRayAggressiveTerms(answer: string): string {
  return answer
    .replace(/자살행위/g, '리스크가 매우 큽니다')
    .replace(/말도 안 된다/g, '근거가 약합니다')
    .replace(/미쳤다/g, '현실성이 낮습니다')
    .replace(/바보같은/g, '비효율적인');
}

function sanitizeJackAggressiveTerms(answer: string): string {
  return answer
    .replace(/다 망한다/g, '위험합니다')
    .replace(/멍청한/g, '준비가 부족한');
}

function sanitizeJackAlwaysAggressiveTerms(answer: string): string {
  return answer.replace(/자살행위/g, '리스크가 매우 큽니다');
}

const DIRECT_TRADE_INSTRUCTION_PATTERN =
  /(?:무조건|지금\s*(?:당장)?|즉시|전량)?\s*(?:사세요|사라|매수하세요|매수해라|매수하라|파세요|팔아라|매도하세요|매도해라|매도하라|들어가세요|들어가라)|몰빵|수익\s*보장|손실\s*없음|확실한\s*수익/g;

const PRICE_WITH_WON_BEFORE_PATTERN = /(?:^|[\s,.。])\d{1,3}(?:,\d{3})*원\s*$/;

const INVESTMENT_RISK_REPLACEMENTS: Array<[RegExp, string]> = [
  [/52주\s*(?:최고가|최저가|신고가|신저가|고가|저가)\s*\d{1,3}(?:,\d{3})*원?/g, '가격 범위 데이터'],
  [/\bPER\b[^,.。\n]*/gi, '추가 밸류에이션 데이터는 별도 확인이 필요합니다'],
  [/\bPBR\b[^,.。\n]*/gi, '추가 밸류에이션 데이터는 별도 확인이 필요합니다'],
  [/영업이익[^,.。\n]*/g, '추가 실적 데이터는 별도 확인이 필요합니다'],
  [/시가총액[^,.。\n]*/g, '추가 규모 데이터는 별도 확인이 필요합니다'],
  [/\b\d+(?:\.\d+)?[MK](?:,\d{3}원(?:에서|대비|부근)?)?(?:으로|로|이|가|은|는|을|를)?/gi, ''],
  [/외국인\s*순매수[^,.。\n]*/g, '추가 수급 데이터는 별도 확인이 필요합니다'],
  [/기관\s*순매수[^,.。\n]*/g, '추가 수급 데이터는 별도 확인이 필요합니다'],
  [/(?:(?:역대|연중)\s*)?(?:최고가|최저가|신고가|신저가)\s*\d{1,3}(?:,\d{3})*원?/g, '가격 범위 데이터'],
  [/[\d,.]+\s*(?:달러|USD)[^,.。\n]*/gi, '추가 달러 기준 데이터는 별도 확인이 필요합니다'],
  [/(?:달러|USD)[^,.。\n]*/gi, '추가 달러 기준 데이터는 별도 확인이 필요합니다'],
  [/(?:지난\s*)?7일[^,.。\n]*/g, '추가 기간별 수익률 데이터는 별도 확인이 필요합니다'],
  [/(?:지난\s*)?(?:1개월|한\s*달|달)[^,.。\n]*/g, '추가 기간별 수익률 데이터는 별도 확인이 필요합니다'],
  [/(?:지난\s*)?1년[^,.。\n]*/g, '추가 기간별 수익률 데이터는 별도 확인이 필요합니다'],
  [/9개월\s*변동성[^,.。\n]*/g, '추가 변동성 데이터는 별도 확인이 필요합니다'],
  [/연중\s*(?:최고|최저)(?:가)?[^.。\n]*/g, '추가 변동성 데이터는 별도 확인이 필요합니다'],
  [/HBM4E?|7세대|완판/g, '추가 제품 데이터는 별도 확인이 필요합니다'],
  [/진입/g, '판단'],
  [/들어가면\s*바로\s*물린다/g, '섣부른 판단은 위험할 수 있습니다'],
  [/들어가면\s*물린다/g, '섣부른 판단은 위험할 수 있습니다'],
  [/들어가지\s*않는\s*게\s*맞다/g, '기준 없이 판단하지 않는 편이 안전합니다'],
  [/기준\s*없이\s*들어가지\s*마(?:라)?/g, '기준 없이 판단하지 않는 편이 안전합니다'],
  [/들어가지\s*마(?:라)?/g, '기준 없이 판단하지 않는 편이 안전합니다'],
  [/들어가면\s*된다/g, '판단 기준으로 삼을 수 있습니다'],
  [/들어올\s*자격(?:은|이)?\s*없다/g, '기준 없이 판단하지 않는 편이 안전합니다'],
  [/시작도\s*하지\s*마라/g, '기준 없이 판단하지 않는 편이 안전합니다'],
  [/차트\s*보지\s*마라/g, '단기 움직임만 보고 판단하지 않는 편이 안전합니다'],
  [/쳐다보지도\s*마(?:라)?/g, '기준 없이 판단하지 않는 편이 안전합니다'],
  [/분할\s*매수/g, '분할 접근 여부'],
  [/추격\s*매수/g, '추격 판단'],
  [/관망\s*유지해라/g, '추가 확인이 필요합니다'],
  [/손절해라/g, '리스크 기준을 먼저 정해야 합니다'],
  [/물타라/g, '추가 자금 투입은 신중히 검토해야 합니다'],
  [/비중\s*늘려라|비중\s*줄여라/g, '비중 조정 여부는 투자 기간과 리스크 감내 범위에 따라 달라집니다'],
  [/던질|던진다는|던진다|던져야|던져라|던지(?:는|면|고|자|지|라|세요|십시오|겠다는)?/g, '정리할'],
  [/도망칠\s*각오/g, '정리할 기준'],
  [/판단하지\s*마라/g, '판단하지 않는 편이 안전합니다'],
  [/들어가는/g, '판단하는'],
  [/물린/g, '손실을 본'],
  [/버티실\s*겁니까/g, '유지할 기준이 있으신가요'],
  [/지키실\s*겁니까/g, '유지할 기준이 있으신가요'],
  [/확인해라/g, '확인하는 편이 안전합니다'],
  [/확인하세요/g, '확인하는 편이 안전합니다'],
];

function replaceUnpricedRiskTerms(text: string): string {
  return text
    .replace(/손절선/g, (match, offset, source) => (
      PRICE_WITH_WON_BEFORE_PATTERN.test(source.slice(0, offset)) ? match : '리스크 기준'
    ))
    .replace(/지지선|저항선/g, (match, offset, source) => (
      PRICE_WITH_WON_BEFORE_PATTERN.test(source.slice(0, offset)) ? match : '가격 기준'
    ));
}

function removeDirectTradeInstructions(answer: string): string {
  const cleaned = replaceUnpricedRiskTerms(INVESTMENT_RISK_REPLACEMENTS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    answer.replace(DIRECT_TRADE_INSTRUCTION_PATTERN, ''),
  ));

  const result = cleaned
    .replace(
      /추가\s+[^,.。!?\n]*데이터는 별도 확인이 필요합니다[^,.。!?\n]*/g,
      '',
    )
    .replace(/필요합니다[,.。]?\s*\d+(?:\.\d+)?[A-Za-z가-힣%]*/g, '필요합니다')
    .replace(/필요합니다[,.。]?\s*\d{1,3}(?:,\d{3})*원/g, '필요합니다')
    .replace(/필요합니다[,.。]\d+원/g, '필요합니다')
    .replace(/(^|[^\d])\.\d+[MK]\b/gi, '$1')
    .replace(/(^|[^\d]),\d{3}원(?:에서|대비|부근)?/g, '$1')
    .replace(/\b[MK],\d{3}원(?:에서|대비|부근)?/gi, '')
    .replace(/추가\s+추가/g, '추가')
    .replace(/필요합니다[,.。]\s*필요합니다/g, '필요합니다')
    .replace(/(?:리스크 기준|가격 기준|가격 변동 기준)\s+기준/g, '$1')
    .replace(/기준\s+기준/g, '기준')
    .replace(/가격 범위 데이터\s+(?:대비|부근)/g, '가격 범위 데이터 기준')
    .replace(/수급 데이터(?:에서|대비|부근)?/g, '수급 데이터')
    .replace(/거래량은\s*(?:으로|로)\s*/g, '거래량은 ')
    .replace(/평균\s*거래량인\s*대비/g, '평균 거래량 대비')
    .replace(/\s+([,.。])/g, '$1')
    .replace(/([,.。]){2,}/g, '$1')
    .replace(/,\s*(?=\n|$)/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => !/^[.。!！?？,，;；:\-\s]*$/.test(line))
    .filter((line) => !/^(?:원|KRW|USD|달러)$/.test(line))
    .join('\n');
  console.log('[guard-debug] removeDirectTradeInstructions', {
    beforeLength: answer.length,
    cleanedLength: cleaned.length,
    afterLength: result.length,
    lengthDelta: result.length - answer.length,
    beforeHasPriceLikeNumber: /\d{1,3}(,\d{3})+/.test(answer),
    afterHasPriceLikeNumber: /\d{1,3}(,\d{3})+/.test(result),
    beforeSample: answer.slice(0, 300),
    afterSample: result.slice(0, 300),
  });
  return result;
}

export function detectQuestionType(question: string): QuestionType {
  if (/계속\s*만나|계속할|헤어|그만해야|그만\s*만나|끊어야|손절해야|이혼/.test(question)) {
    return 'continue_or_stop';
  }

  if (LUMP_SUM_ALLOCATION_PATTERN.test(question)) {
    return 'general';
  }

  if (INVESTMENT_QUESTION_PATTERN.test(question)) {
    return 'buy_or_wait';
  }

  if (/vs|VS|비교|중\s*뭐|둘\s*중|어느\s*쪽|A\s*\/\s*B|A와\s*B/.test(question)) {
    return 'compare';
  }

  if (/3가지|\d+\s*가지|목록|리스트|추천|정리|답변/.test(question)) {
    return 'list';
  }

  return 'general';
}

export function sanitizeInvestmentAnswer(answer: string, question: string): string {
  if (!INVESTMENT_QUESTION_PATTERN.test(question)) {
    return answer;
  }

  if (!UNSAFE_INVESTMENT_ANSWER_PATTERN.test(answer)) {
    return answer;
  }

  return SAFE_INVESTMENT_FALLBACK;
}

function sanitizeInvestmentAnswerByType(
  answer: string,
  questionType: QuestionType,
  hasMarketData?: boolean,
): string {
  if (!canUseSafeInvestmentFallback(questionType, hasMarketData)) {
    return answer;
  }

  if (!UNSAFE_INVESTMENT_ANSWER_PATTERN.test(answer)) {
    return answer;
  }

  return SAFE_INVESTMENT_FALLBACK;
}

export function hasDirectAnswer(
  answer: string,
  questionType: QuestionType,
): boolean {
  switch (questionType) {
    case 'continue_or_stop':
      return /마음의 안전감|반복 패턴|계속할 조건|멈춰야 할 신호|반복 행동|관계를 재평가|상황을 재평가/.test(answer);
    case 'buy_or_wait':
      return (
        /현재가는 별도 확인이 필요합니다|확인된 시장 데이터 없이는 구체적 가격 판단을 할 수 없습니다|판단 기준은 실적, 업황, 투자 기간, 감당 가능한 손실 범위입니다/.test(answer) &&
        !UNSAFE_INVESTMENT_ANSWER_PATTERN.test(answer)
      );
    case 'compare':
      return /비교|우선|선택|기준|조건/.test(answer);
    case 'list':
      return /(?:^|\n)\s*(?:\d+\.|- )|첫째|둘째|셋째/.test(answer);
    case 'general':
      return true;
  }
}

const DIRECT_ANSWER_FALLBACKS: Record<
  Exclude<QuestionType, 'general'>,
  Record<DirectAnswerPersonaKey, string>
> = {
  continue_or_stop: {
    lucia: '지금은 마음의 안전감을 먼저 확인해야 합니다. 이 관계가 편안함을 주는지, 반복해서 작아지게 만드는지부터 봐야 합니다.',
    jack: '말보다 반복 행동을 기준으로 보셔야 합니다. 상대의 상황보다 대응 태도를 봐야 합니다.',
    ray: '관계 지속 여부는 반복 패턴으로 봐야 합니다. 약속 이행, 갈등 후 회복, 존중의 일관성이 판단 기준입니다.',
    echo: '계속할 조건과 멈춰야 할 신호를 분리해야 합니다. 감정이 아니라 반복되는 구조를 봐야 합니다.',
  },
  buy_or_wait: {
    lucia: SAFE_INVESTMENT_FALLBACK,
    jack: SAFE_INVESTMENT_FALLBACK,
    ray: SAFE_INVESTMENT_FALLBACK,
    echo: SAFE_INVESTMENT_FALLBACK,
  },
  compare: {
    lucia: '조건부 비교입니다. 마음이 오래 버틸 수 있는 선택지와 현실 비용이 작은 선택지를 나눠 봐야 합니다.',
    jack: '먼저 기준을 하나로 잡아야 합니다. 지금 당장 실행 가능한 쪽과 리스크가 작은 쪽을 분리해서 보셔야 합니다.',
    ray: '조건부 비교입니다. 비용, 기간, 실패 확률, 회복 가능성을 같은 기준으로 놓고 봐야 합니다.',
    echo: '조건부 선택입니다. 기준만 나열하지 말고 우선순위를 정해야 합니다.',
  },
  list: {
    lucia: '1. 마음의 부담\n2. 관계의 변화\n3. 현실 비용',
    jack: '1. 돈 문제\n2. 시간 문제\n3. 실행 문제',
    ray: '1. 현재 조건\n2. 리스크\n3. 다음 행동',
    echo: '1. 핵심 쟁점\n2. 판단 기준\n3. 오늘 할 일',
  },
};

export function buildDirectAnswerFallback(
  questionType: QuestionType,
  persona?: DirectAnswerPersonaKey,
): string {
  if (questionType === 'general' || !persona) {
    return '';
  }

  return DIRECT_ANSWER_FALLBACKS[questionType][persona] ?? '';
}

export function applyResponseGuard(
  personaText: Record<string, string>,
  questionType: QuestionType,
  hasMarketData?: boolean,
): void {
  for (const key of Object.keys(personaText)) {
    const answer = personaText[key];
    if (!answer?.trim()) {
      continue;
    }

    personaText[key] = removeFuturePersonaReferences(
      key as PersonaKey,
      answer,
    );

    if (key === 'echo' && shouldSanitizeEchoInvestmentTerms(questionType)) {
      personaText[key] = sanitizeEchoInvestmentTerms(personaText[key]);
    }

    if (key === 'ray') {
      personaText[key] = sanitizeRayAggressiveTerms(personaText[key]);
    }

    if (key === 'jack') {
      personaText[key] = sanitizeJackAlwaysAggressiveTerms(personaText[key]);
    }

    if (key === 'jack' && shouldSanitizeEchoInvestmentTerms(questionType)) {
      personaText[key] = sanitizeJackAggressiveTerms(personaText[key]);
    }

    if (hasMarketData === true && questionType === 'buy_or_wait') {
      const factLockedAnswer = sanitizeMarketDataFactLock(personaText[key], true);
      personaText[key] = removeDirectTradeInstructions(factLockedAnswer);
      continue;
    }

    const sanitizedAnswer = sanitizeInvestmentAnswerByType(
      answer,
      questionType,
      hasMarketData,
    );
    if (sanitizedAnswer !== answer) {
      personaText[key] = sanitizedAnswer;
      continue;
    }

    if (!hasDirectAnswer(personaText[key], questionType)) {
      if (
        questionType === 'buy_or_wait' &&
        !canUseSafeInvestmentFallback(questionType, hasMarketData)
      ) {
        continue;
      }

      const fallback = buildDirectAnswerFallback(
        questionType,
        key as DirectAnswerPersonaKey,
      );
      if (fallback) {
        personaText[key] = `${fallback}\n\n${personaText[key]}`;
      }
    }
  }
}
