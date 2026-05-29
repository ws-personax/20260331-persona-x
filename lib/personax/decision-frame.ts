import {
  type QuestionType,
  detectQuestionType,
} from '@/lib/personax/response-guard';

export type DecisionFrame = {
  userQuestion: string;
  questionType: QuestionType;
  conflictLevel: ConflictLevel;
  directAnswerRequired: boolean;
  criteria: string[];
  redFlags: string[];
  nextAction: string;
};

export type ConflictLevel = 'low' | 'medium' | 'high';

const DECISION_FRAME_DEFAULTS: Record<
  QuestionType,
  Pick<DecisionFrame, 'criteria' | 'redFlags' | 'nextAction'>
> = {
  continue_or_stop: {
    criteria: [
      '나를 존중하는가',
      '관계가 일관적인가',
      '대화로 개선 가능한가',
    ],
    redFlags: [
      '반복적 무시',
      '회피',
      '말과 행동 불일치',
    ],
    nextAction: '2주 관찰 기준 정하기',
  },
  buy_or_wait: {
    criteria: [
      '손절선이 있는가',
      '장기/단기 목적이 구분되어 있는가',
      '리스크를 감당할 수 있는가',
    ],
    redFlags: [
      '기준 없는 진입',
      '공포 매수',
      '손절선 없음',
    ],
    nextAction: '손절선 먼저 정하기',
  },
  compare: {
    criteria: [
      '현재 재무 상태',
      '리스크 감당 가능성',
      '5년 후 목표',
    ],
    redFlags: [
      '준비 없는 창업',
      '감정적 결정',
      '현실 비용 무시',
    ],
    nextAction: '3개월 준비 기간 설정',
  },
  list: {
    criteria: [
      '핵심 항목을 빠짐없이 나눴는가',
      '우선순위가 있는가',
      '실행 가능한가',
    ],
    redFlags: [
      '두루뭉술한 설명',
      '목록 없이 감상만 말함',
      '결론 없는 나열',
    ],
    nextAction: '핵심 항목을 먼저 3개로 정리하기',
  },
  general: {
    criteria: [
      '질문 의도를 정확히 파악했는가',
      '불필요하게 장황하지 않은가',
    ],
    redFlags: [
      '질문과 무관한 답변',
      '결론 없는 설명',
    ],
    nextAction: '질문 의도를 한 문장으로 정리하기',
  },
};

const CONFLICT_LEVEL_BY_TYPE: Record<QuestionType, ConflictLevel> = {
  continue_or_stop: 'low',
  buy_or_wait: 'high',
  compare: 'medium',
  list: 'low',
  general: 'low',
};

const REQUIRED_BY_TYPE: Record<QuestionType, string[]> = {
  continue_or_stop: [
    '계속 / 중단 / 조건부 계속 중 하나를 명확히 제시',
    '계속 만날 조건과 멈춰야 할 신호를 구분',
    '오늘 할 일 1개',
  ],
  buy_or_wait: [
    '매수 / 보류 / 관망 / 분할 접근 중 하나를 명확히 제시',
    '손절선 또는 리스크 기준 포함',
    '오늘 할 일 1개',
  ],
  compare: [
    'A/B 중 하나 또는 우선순위를 명확히 제시',
    '선택 근거 2개',
    '오늘 할 일 1개',
  ],
  list: [
    '번호 목록으로 핵심 항목 제시',
    '가능하면 3개 항목으로 정리',
    '각 항목에 짧은 설명 포함',
  ],
  general: [
    '질문 의도를 한 문장으로 정리',
    '불필요하게 장황하지 않게 답변',
  ],
};

const OUTPUT_RULES_BY_TYPE: Record<QuestionType, string[]> = {
  continue_or_stop: [
    '첫 문장은 반드시 "계속", "중단", "조건부 계속" 중 하나로 시작한다.',
    '"계속할 조건"과 "멈춰야 할 신호"를 분리해서 말한다.',
    '선택 없이 감정 해석이나 기준 나열로 시작하지 않는다.',
  ],
  buy_or_wait: [
    '첫 문장은 반드시 "매수", "보류", "관망", "분할 접근" 중 하나로 시작한다.',
    '투자 조언은 단정하지 말고 판단 기준과 리스크를 함께 제시한다.',
    '손절선 또는 리스크 기준 없이 방향만 말하지 않는다.',
    '확인된 marketData에 포함된 숫자만 사용한다.',
    'marketData가 없으면 구체적 가격, 시가총액, PER, 거래량, 수익률을 만들지 않는다.',
    '불확실하면 "현재가는 별도 확인이 필요합니다"라고 말한다.',
  ],
  compare: [
    '첫 문장에 반드시 A 또는 B 중 하나를 선택한다.',
    '정보가 부족하면 "조건부로 A/B"라고 명시한다.',
    '선택 없이 기준만 나열하지 않는다.',
  ],
  list: [
    '첫 응답에 반드시 "1.", "2.", "3." 번호 목록을 포함한다.',
    '산문형 감정 해석으로 시작하지 않는다.',
    '질문이 "3가지"면 정확히 3개를 제시한다.',
  ],
  general: [
    '첫 문장에서 질문 의도를 정리한다.',
    '불필요한 배경 설명으로 길게 시작하지 않는다.',
  ],
};

const buildList = (items: string[]): string =>
  items.map((item) => `* ${item}`).join('\n');

export function buildDecisionFrame(question: string): DecisionFrame {
  const questionType = detectQuestionType(question);
  const defaults = DECISION_FRAME_DEFAULTS[questionType];

  return {
    userQuestion: question,
    questionType,
    conflictLevel: CONFLICT_LEVEL_BY_TYPE[questionType],
    directAnswerRequired: questionType !== 'general',
    criteria: defaults.criteria,
    redFlags: defaults.redFlags,
    nextAction: defaults.nextAction,
  };
}

export function buildDecisionSummary(frame: DecisionFrame): string {
  return `[Decision Frame]
질문 유형: ${frame.questionType}
충돌 강도: ${frame.conflictLevel}

반드시 포함할 것:

${buildList(REQUIRED_BY_TYPE[frame.questionType])}

출력 규칙:

${buildList(OUTPUT_RULES_BY_TYPE[frame.questionType])}

판단 기준:

${buildList(frame.criteria)}

위험 신호:

${buildList(frame.redFlags)}

오늘 할 일:

* ${frame.nextAction}`;
}
