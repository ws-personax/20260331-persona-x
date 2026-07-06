import type { ClassifierResult } from '../types';

const INVEST_KEYWORDS = [
  '사도',
  '매수',
  '매도',
  '주식',
  '투자',
  '코인',
  '지금',
  '진입',
  '삼성전자',
  '비트코인',
  'etf',
];

export function classify(lastMessage: string): ClassifierResult {
  const normalized = lastMessage.toLowerCase();
  const isInvest = INVEST_KEYWORDS.some((keyword) => normalized.includes(keyword));
  return { isInvest };
}
