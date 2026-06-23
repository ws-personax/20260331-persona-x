import {
  detectCategoryV3,
  detectLegacyCategory,
} from '../lib/personax/classifier';
import { inferDecisionType } from '../lib/personax/decision-type-map';
import { resolveIntent } from '../lib/personax/intent-resolver';

const QUESTION_SETS = {
  Knowledge: [
    '행복이란 뭔가요?',
    '중산층 기준이 뭐예요?',
    '인플레이션이 왜 생기나요?',
    '워런 버핏 투자 철학이 뭐예요?',
  ],
  Relationship: [
    '누군가 저를 시기하는 것 같습니다.',
    '직장 동료가 저를 계속 견제합니다.',
    '오래된 친구와 거리를 둬야 할까요?',
    '이 사람 계속 만나도 될까요?',
  ],
  Market: [
    '코인은 언제쯤 상승할까?',
    '비트코인은 언제쯤 상승할까?',
    '미국 CPI가 예상보다 낮게 나오면 증시는?',
    '유가가 급등하면 한국 증시는?',
  ],
} as const;

type QuestionGroup = keyof typeof QUESTION_SETS;

const rows = (Object.entries(QUESTION_SETS) as Array<[
  QuestionGroup,
  readonly string[],
]>).flatMap(([group, questions]) =>
  questions.map((question) => {
    const legacyCategory = detectLegacyCategory(question);
    const categoryV3 = detectCategoryV3(question);
    const decisionType = inferDecisionType(question, categoryV3);
    const intent = resolveIntent({ lastMessage: question });

    return {
      group,
      question,
      legacyCategory,
      categoryV3,
      decisionType,
      asset: intent.asset?.assetType ?? '',
    };
  }),
);

console.table(rows);
