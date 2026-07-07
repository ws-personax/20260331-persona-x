import { extractKeyword, fetchMarketPrice, STOCK_MAP, CRYPTO_MAP } from '@/lib/personax/market';
import type { ClassifierResult, ResearchResult } from '../types';
import { resolveOverrideAsset } from './asset-map';
import { fetchKoreanStockQuote } from './stock-quote';

const nowIso = (): string => new Date().toISOString();

function resolveDisplaySymbol(keyword: string): string | null {
  return (
    STOCK_MAP[keyword] ||
    STOCK_MAP[keyword.toUpperCase()] ||
    CRYPTO_MAP[keyword] ||
    CRYPTO_MAP[keyword.toUpperCase()] ||
    null
  );
}

export async function research(
  userQuestion: string,
  classifierResult: ClassifierResult,
): Promise<ResearchResult> {
  const questionType = classifierResult.isInvest ? 'invest' : 'general';

  // Disambiguation override checked first (e.g. 카카오뱅크 vs 카카오) so a
  // substring match never lets the more specific asset fall back to the wrong one.
  const override = resolveOverrideAsset(userQuestion);
  if (override) {
    const marketData = await fetchKoreanStockQuote(override.symbol).catch(() => null);

    if (!marketData) {
      return {
        rawFacts: [`Asset detected: ${override.assetName}`, 'Market data fetch did not return a quote.'],
        metadata: {
          source: 'fetch_failed',
          detectedKeyword: override.assetName,
          assetName: override.assetName,
          symbol: override.symbol,
          matchedKeyword: override.matchedKeyword,
          questionType,
          fetchedAt: nowIso(),
          error: {
            code: 'market_data_unavailable',
            message: `Unable to fetch quote for ${override.assetName}.`,
          },
        },
      };
    }

    return {
      rawFacts: [
        `Asset: ${override.assetName}`,
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
        detectedKeyword: override.assetName,
        assetName: override.assetName,
        symbol: override.symbol,
        matchedKeyword: override.matchedKeyword,
        questionType,
        fetchedAt: nowIso(),
        marketData,
      },
    };
  }

  const detectedKeyword = extractKeyword([{ role: 'user', content: userQuestion }]);
  const keyword = detectedKeyword === '시장' ? null : detectedKeyword;

  if (!keyword) {
    return {
      rawFacts: ['No specific external lookup target was detected from the question.'],
      metadata: {
        source: 'none',
        detectedKeyword: null,
        assetName: null,
        symbol: null,
        matchedKeyword: null,
        questionType,
        fetchedAt: nowIso(),
      },
    };
  }

  const symbol = resolveDisplaySymbol(keyword);
  const marketData = await fetchMarketPrice(keyword).catch(() => null);
  if (!marketData) {
    return {
      rawFacts: [`Asset detected: ${keyword}`, 'Market data fetch did not return a quote.'],
      metadata: {
        source: 'fetch_failed',
        detectedKeyword: keyword,
        assetName: keyword,
        symbol,
        matchedKeyword: keyword,
        questionType,
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
      assetName: keyword,
      symbol,
      matchedKeyword: keyword,
      questionType,
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
