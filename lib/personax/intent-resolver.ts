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

export type IntentRound1Materials = {
  teaRound?: unknown;
  shouldWeakenContext?: boolean;
  categoryV3Changed: boolean;
  decisionTypeChanged: boolean;
  hasExplicitContinuation: boolean | null;
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
};

export type ResolveIntentInput = {
  lastMessage: string;
  previousUserMessage?: string | null;
  teaRound?: unknown;
  shouldWeakenContext?: boolean;
  hasExplicitContinuation?: boolean | null;
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

  return {
    legacyCategory,
    previousLegacyCategory,
    categoryV3,
    previousCategoryV3,
    decisionType,
    previousDecisionType,
    asset: detectMarketAsset(input.lastMessage),
    hasExplicitConnector: hasExplicitConnector(input.lastMessage),
    isRound1Materials: {
      teaRound: input.teaRound,
      shouldWeakenContext: input.shouldWeakenContext,
      categoryV3Changed: !!(
        previousCategoryV3 && previousCategoryV3 !== categoryV3
      ),
      decisionTypeChanged: !!(
        previousDecisionType && previousDecisionType !== decisionType
      ),
      hasExplicitContinuation: input.hasExplicitContinuation ?? null,
    },
  };
}
