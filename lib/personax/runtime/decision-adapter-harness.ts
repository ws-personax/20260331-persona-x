import {
  adaptLegacyDecisionSummaryToDecisionResult,
  type LegacyDecisionSummaryLike,
} from '@/lib/personax/runtime/decision-adapter';
import type { DecisionResult } from '@/lib/personax/runtime/runtime-types';

type DecisionAdapterHarnessResult = {
  name: string;
  input: LegacyDecisionSummaryLike;
  output: DecisionResult;
};

const DECISION_ADAPTER_HARNESS_CASES: Array<{
  name: string;
  input: LegacyDecisionSummaryLike;
}> = [
  {
    name: 'complete legacy decision summary',
    input: {
      verdict: '지금은 결론보다 조건을 먼저 확인해야 합니다.',
      reasons: [
        '선택의 비용이 아직 분리되지 않았습니다.',
        '다음 행동을 정하려면 확인할 사실이 남아 있습니다.',
      ],
      nextAction: '오늘 안에 확인할 조건 3가지를 적으세요.',
      confidence: 0.7,
    },
  },
  {
    name: 'minimal legacy decision summary',
    input: {
      verdict: '판단을 보류하고 핵심 기준부터 확인해야 합니다.',
    },
  },
];

export function runDecisionAdapterHarness(): DecisionAdapterHarnessResult[] {
  return DECISION_ADAPTER_HARNESS_CASES.map((item) => ({
    name: item.name,
    input: item.input,
    output: adaptLegacyDecisionSummaryToDecisionResult(item.input),
  }));
}
