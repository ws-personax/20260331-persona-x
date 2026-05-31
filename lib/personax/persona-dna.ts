export const PERSONA_TIMELINE = ['ray', 'jack', 'lucia', 'echo'] as const;

export type PersonaKey = typeof PERSONA_TIMELINE[number];

export const PERSONA_DNA = {
  lucia: {
    role: '감정·관계',
    mustAvoid: ['PBR', 'PER', '손절선', '지지선', '52주'],
    tone: '따뜻하지만 질척이지 않게',
  },
  ray: {
    role: '데이터·분석',
    mustAvoid: ['마음이 아프다', '괜찮아요', '위로'],
    tone: '차분하고 조건 중심',
  },
  jack: {
    role: '실행·결단',
    mustAvoid: ['놈', '버려라', '끊어라', '미련 없이'],
    tone: '직설적이지만 공격 금지',
  },
  echo: {
    role: '구조·원칙',
    mustAvoid: ['기분이 어떠세요', '마음이 아프다'],
    tone: '결론을 닫는 역할',
  },
} as const;

export const MARKET_DATA_FACT_LOCK = {
  rule: '주입된 marketData 숫자 외 가격/비율/지표 생성 금지',
  allowedSources: ['marketData.price', 'marketData.change', 'marketData.source'],
  forbidden: [
    '52주 고가',
    '52주 저가',
    'PER',
    'PBR',
    '영업이익',
    '시가총액',
    '거래량',
    '외국인 순매수',
    '기관 순매수',
    '달러 기준 가격',
    '역대 최고가',
    '7일 수익률',
    '1개월 수익률',
    '1년 수익률',
    'HBM4',
    'HBM4E',
    '7세대',
    '완판',
  ],
} as const;

const PERSONA_DISPLAY_NAMES: Record<PersonaKey, string[]> = {
  ray: ['RAY', '레이'],
  jack: ['JACK', '잭'],
  lucia: ['LUCIA', '루시아'],
  echo: ['ECHO', '에코'],
};

const FUTURE_REFERENCE_FALLBACKS: Record<PersonaKey, string> = {
  ray: '다른 관점에서',
  jack: '다른 관점에서',
  lucia: '다른 관점에서',
  echo: '구조적으로 보면',
};

const FACT_LOCK_SENTENCE_PATTERN =
  /52주\s*(?:최고가|최저가|고가|저가)|\bPER\b|\bPBR\b|영업이익|시가총액|거래량|외국인\s*순매수|기관\s*순매수|(?:달러|USD)\s*(?:기준\s*)?(?:가격|선|수준)?|역대\s*최고가|(?:지난\s*)?7일\s*(?:동안|수익률|하락|상승)?|(?:지난\s*)?(?:1개월|한\s*달|달)\s*(?:대비|수익률|하락|상승)?|(?:지난\s*)?1년\s*(?:동안|수익률|하락|상승)?|9개월\s*변동성|연중\s*최저|HBM4E?|7세대|완판/i;

const splitFactClauses = (sentence: string): string[] => (
  sentence
    .split(/,\s*|\s+및\s+|\s+그리고\s+|\s+하지만\s+|\s+며\s+|\s+하고\s+/)
    .map((clause) => clause.trim())
    .filter(Boolean)
);

export function getAllowedReferencedPersonas(persona: PersonaKey): PersonaKey[] {
  const index = PERSONA_TIMELINE.indexOf(persona);
  return index <= 0 ? [] : [...PERSONA_TIMELINE.slice(0, index)];
}

export function removeFuturePersonaReferences(
  persona: PersonaKey,
  text: string,
): string {
  const index = PERSONA_TIMELINE.indexOf(persona);
  const futurePersonas = PERSONA_TIMELINE.slice(index + 1);

  return futurePersonas.reduce((current, futurePersona) => {
    const fallback = FUTURE_REFERENCE_FALLBACKS[futurePersona];

    return PERSONA_DISPLAY_NAMES[futurePersona].reduce((next, name) => {
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      return next
        .replace(new RegExp(`${escapedName}\\s*,\\s*`, 'g'), '')
        .replace(new RegExp(`${escapedName}\\s*(?:가|이)\\s*말한`, 'g'), fallback)
        .replace(new RegExp(`${escapedName}\\s*(?:가|이)\\s*정리한`, 'g'), '구조적으로 보면')
        .replace(new RegExp(`${escapedName}\\s*(?:는|은|가|이|도|의)`, 'g'), fallback)
        .replace(new RegExp(escapedName, 'g'), '');
    }, current);
  }, text).replace(/[ \t]{2,}/g, ' ').trim();
}

export function sanitizeMarketDataFactLock(
  text: string,
  hasMarketData: boolean,
): string {
  if (!hasMarketData) {
    return text;
  }

  const sentences = text
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const safeSentences = sentences
    .map((sentence) => {
      if (sentence.includes('데이터 출처:') || !FACT_LOCK_SENTENCE_PATTERN.test(sentence)) {
        return sentence;
      }

      const safeClauses = splitFactClauses(sentence).filter((clause) => (
        !FACT_LOCK_SENTENCE_PATTERN.test(clause)
      ));

      return safeClauses.join('. ');
    })
    .filter(Boolean);

  if (safeSentences.length === sentences.length) {
    console.log('[guard-debug] sanitizeMarketDataFactLock unchanged', {
      regex: FACT_LOCK_SENTENCE_PATTERN.source,
      beforeLength: text.length,
      afterLength: text.length,
      lengthDelta: 0,
      beforeHasPriceLikeNumber: /\d{1,3}(,\d{3})+/.test(text),
      afterHasPriceLikeNumber: /\d{1,3}(,\d{3})+/.test(text),
      beforeSample: text.slice(0, 300),
      afterSample: text.slice(0, 300),
    });
    return text;
  }

  if (safeSentences.length === 0) {
    const fallback = '추가 실적·수급 데이터는 별도 확인이 필요합니다.';
    console.log('[guard-debug] sanitizeMarketDataFactLock removed all', {
      regex: FACT_LOCK_SENTENCE_PATTERN.source,
      beforeLength: text.length,
      afterLength: fallback.length,
      lengthDelta: fallback.length - text.length,
      beforeHasPriceLikeNumber: /\d{1,3}(,\d{3})+/.test(text),
      afterHasPriceLikeNumber: /\d{1,3}(,\d{3})+/.test(fallback),
      beforeSample: text.slice(0, 300),
      afterSample: fallback.slice(0, 300),
    });
    return fallback;
  }

  const result = safeSentences.join('\n');
  console.log('[guard-debug] sanitizeMarketDataFactLock changed', {
    regex: FACT_LOCK_SENTENCE_PATTERN.source,
    beforeLength: text.length,
    afterLength: result.length,
    lengthDelta: result.length - text.length,
    beforeHasPriceLikeNumber: /\d{1,3}(,\d{3})+/.test(text),
    afterHasPriceLikeNumber: /\d{1,3}(,\d{3})+/.test(result),
    beforeSample: text.slice(0, 300),
    afterSample: result.slice(0, 300),
  });
  return result;
}
