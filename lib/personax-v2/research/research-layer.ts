// Runtime v2 research layer — 이번 PR에서는 실제 조회 없이 mock 데이터만 반환한다.
// 실제 데이터 연결은 이후 PR에서 진행한다.
import type { ClassifierResult, ResearchResult } from '../types';

export async function research(classifierResult: ClassifierResult): Promise<ResearchResult> {
  return {
    rawFacts: classifierResult.isInvest
      ? ['mock: invest-related question']
      : ['mock: general question'],
    metadata: { source: 'mock', isInvest: classifierResult.isInvest },
  };
}
