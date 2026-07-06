// Runtime v2 classifier — 이번 PR 범위는 invest 여부 판별만.
import type { ClassifierResult } from '../types';

const INVEST_KEYWORDS = ['사도', '매수', '매도', '주식', '투자', '코인', '지금 사', '진입'];

export function classify(lastMessage: string): ClassifierResult {
  const isInvest = INVEST_KEYWORDS.some((kw) => lastMessage.includes(kw));
  return { isInvest };
}
