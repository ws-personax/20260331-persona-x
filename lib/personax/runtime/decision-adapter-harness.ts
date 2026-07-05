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
  {
    name: 'invest legacy decision summary',
    input: {
      verdict: 'Investment decisions should start from risk criteria, not price impulse.',
      reasons: [
        'The entry condition is still unclear.',
        'Loss tolerance must be separated from expected upside.',
      ],
      nextAction: 'Write one risk limit and one confirmation condition before acting.',
      confidence: 0.62,
    },
  },
  {
    name: 'emotional legacy decision summary',
    input: {
      verdict: 'The first decision is whether the person can carry this choice emotionally.',
      reasons: [
        'The emotional cost is part of the decision, not a side issue.',
        'Recovery capacity changes what action is realistic today.',
      ],
      nextAction: 'Name the feeling that would make this decision hardest to hold.',
      confidence: 0.68,
    },
  },
  {
    name: 'action legacy decision summary',
    input: {
      verdict: 'This needs one small action before a final commitment.',
      reasons: [
        'The question is blocked by execution uncertainty.',
        'A short test can reduce the cost of choosing wrong.',
      ],
      nextAction: 'Set one action that can be completed within 24 hours.',
      confidence: 0.74,
    },
  },
  {
    name: 'knowledge legacy decision summary',
    input: {
      verdict: 'The concept must be narrowed before it can be applied.',
      reasons: [
        'The same word can mean different things across contexts.',
        'A usable explanation depends on which frame is being asked.',
      ],
      nextAction: 'Choose one frame and restate the question in that frame.',
      confidence: 0.59,
    },
  },
  {
    name: 'relationship legacy decision summary',
    input: {
      verdict: 'The repeated boundary issue matters more than a single incident.',
      reasons: [
        'The pattern is more reliable than the latest apology.',
        'A relationship decision needs both behavior change and emotional cost.',
      ],
      nextAction: 'Record one boundary and one observable change to check next time.',
      confidence: 0.66,
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
