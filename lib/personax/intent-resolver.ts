import {
  detectCategoryV3,
  detectLegacyCategory,
  type CategoryV3,
  type LegacyCategory,
} from '@/lib/personax/classifier';
import {
  detectMarketAsset,
  type DetectedMarketAsset,
} from '@/lib/personax/market-data';
import {
  inferDecisionType,
  type DecisionType,
} from '@/lib/personax/decision-type-map';
import { hasExplicitConnector } from '@/lib/personax/routing-context';

// ✅ route.ts buildFinanceMultiPersonaResponse에서 이동 — 로직 변경 없음
const CONTINUATION_KEYWORDS = [
  '방금', '위 내용', '그럼', '그 경우', '이어서', '아까',
  '그 선택', '두 번째', '앞에서', '계속', '그것', '그거',
  '이전', '아까 말한', '방금 전', '위에서', '그 내용',
  '그 얘기', '그 문제', '그 질문',
];
// ✅ 새 독립 질문 감지 — CONTINUATION_KEYWORDS와 우연히 겹쳐도(예: "되면"≠"그럼")
//   실제로는 새 주제의 조건문/전환 질문인 경우 Round2(이전 답변 재사용)로 빠지지 않도록 강제 차단.
const NEW_TOPIC_PATTERN = /그런데|근데|다른 질문|새로운|별개로|주제를 바꿔서|참고로|~하면 ~할까|되면|된다면|한다면/;

export type IntentRound1Materials = {
  teaRound?: unknown;
  shouldWeakenContext?: boolean;
  categoryV3Changed: boolean;
  decisionTypeChanged: boolean;
  hasExplicitConnector: boolean;
  hasExplicitContinuation: boolean;
  isNewIndependentQuestion: boolean;
  isRound1: boolean;
};

export type ResolvedIntent = {
  legacyCategory: LegacyCategory;
  previousLegacyCategory: LegacyCategory | null;
  categoryV3: CategoryV3;
  previousCategoryV3: CategoryV3 | null;
  decisionType: DecisionType;
  previousDecisionType: DecisionType | null;
  asset: DetectedMarketAsset | null;
  hasExplicitConnector: boolean;
  isRound1Materials: IntentRound1Materials;
  splitNeeded: boolean;
};

export type ResolveIntentInput = {
  lastMessage: string;
  previousUserMessage?: string | null;
  teaRound?: unknown;
  shouldWeakenContext?: boolean;
};

export function resolveIntent(input: ResolveIntentInput): ResolvedIntent {
  const previousUserMessage = input.previousUserMessage || '';
  const legacyCategory = detectLegacyCategory(input.lastMessage);
  const previousLegacyCategory = previousUserMessage
    ? detectLegacyCategory(previousUserMessage)
    : null;
  const categoryV3 = detectCategoryV3(input.lastMessage);
  const previousCategoryV3 = previousUserMessage
    ? detectCategoryV3(previousUserMessage)
    : null;
  const decisionType = inferDecisionType(input.lastMessage, categoryV3);
  const previousDecisionType = previousUserMessage
    ? inferDecisionType(previousUserMessage, previousCategoryV3 ?? undefined)
    : null;

  const _hasExplicitConnector = hasExplicitConnector(input.lastMessage);
  const categoryV3Changed = !!(
    previousCategoryV3 && previousCategoryV3 !== categoryV3
  );
  const decisionTypeChanged = !!(
    previousDecisionType && previousDecisionType !== decisionType
  );
  const isNewIndependentQuestion = NEW_TOPIC_PATTERN.test(input.lastMessage);
  const hasExplicitContinuation =
    !isNewIndependentQuestion &&
    CONTINUATION_KEYWORDS.some(kw => input.lastMessage.includes(kw));
  const isRound1 =
    !input.teaRound ||
    (input.teaRound as number) <= 1 ||
    !!input.shouldWeakenContext ||
    categoryV3Changed ||
    decisionTypeChanged ||
    !hasExplicitContinuation;

  return {
    legacyCategory,
    previousLegacyCategory,
    categoryV3,
    previousCategoryV3,
    decisionType,
    previousDecisionType,
    asset: detectMarketAsset(input.lastMessage),
    hasExplicitConnector: _hasExplicitConnector,
    isRound1Materials: {
      teaRound: input.teaRound,
      shouldWeakenContext: input.shouldWeakenContext,
      categoryV3Changed,
      decisionTypeChanged,
      hasExplicitConnector: _hasExplicitConnector,
      hasExplicitContinuation,
      isNewIndependentQuestion,
      isRound1,
    },
    splitNeeded: false,
  };
}
