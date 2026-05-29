import {
  type QuestionType,
  detectQuestionType,
} from '@/lib/personax/response-guard';

export type DecisionFrame = {
  userQuestion: string;
  questionType: QuestionType;
  directAnswerRequired: boolean;
  criteria: string[];
  redFlags: string[];
  nextAction: string;
};

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

export function buildDecisionFrame(question: string): DecisionFrame {
  const questionType = detectQuestionType(question);
  const defaults = DECISION_FRAME_DEFAULTS[questionType];

  return {
    userQuestion: question,
    questionType,
    directAnswerRequired: questionType !== 'general',
    criteria: defaults.criteria,
    redFlags: defaults.redFlags,
    nextAction: defaults.nextAction,
  };
}
