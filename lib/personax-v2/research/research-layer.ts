import { extractKeyword, fetchMarketPrice } from '@/lib/personax/market';
import type { ClassifierResult, ResearchResult } from '../types';

const nowIso = (): string => new Date().toISOString();

export async function research(
  userQuestion: string,
  classifierResult: ClassifierResult,
): Promise<ResearchResult> {
  const detectedKeyword = extractKeyword([{ role: 'user', content: userQuestion }]);
  const keyword = detectedKeyword === '시장' ? null : detectedKeyword;

  if (!keyword) {
    return {
      rawFacts: ['No quoted asset was detected from the question.'],
      metadata: {
        source: 'none',
        detectedKeyword: null,
        questionType: classifierResult.isInvest ? 'invest' : 'general',
        fetchedAt: nowIso(),
      },
    };
  }

  const marketData = await fetchMarketPrice(keyword).catch(() => null);
  if (!marketData) {
    return {
      rawFacts: [`Asset detected: ${keyword}`, 'Market data fetch did not return a quote.'],
      metadata: {
        source: 'fetch_failed',
        detectedKeyword: keyword,
        questionType: classifierResult.isInvest ? 'invest' : 'general',
        fetchedAt: nowIso(),
        error: {
          code: 'market_data_unavailable',
          message: `Unable to fetch quote for ${keyword}.`,
        },
      },
    };
  }

  return {
    rawFacts: [
      `Asset: ${keyword}`,
      `Price: ${marketData.price} ${marketData.currency}`,
      `Change: ${marketData.change}%`,
      `High: ${marketData.high}`,
      `Low: ${marketData.low}`,
      `Volume: ${marketData.volume}`,
      `Market state: ${marketData.marketState}`,
      `Quote source: ${marketData.source}`,
    ],
    metadata: {
      source: 'market',
      detectedKeyword: keyword,
      questionType: classifierResult.isInvest ? 'invest' : 'general',
      fetchedAt: nowIso(),
      marketData: {
        price: marketData.price,
        change: marketData.change,
        high: marketData.high,
        low: marketData.low,
        volume: marketData.volume,
        currency: marketData.currency,
        marketState: marketData.marketState,
        source: marketData.source,
      },
    },
  };
}
