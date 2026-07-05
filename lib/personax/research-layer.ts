/**
 * Research Layer contract (vNext step 1).
 *
 * This module only defines and wraps existing research outputs. It does not
 * change collection, interpretation, QA, or Persona Layer delivery behavior.
 */

export interface ResearchLayerOutput {
  rawFacts: {
    marketDataPromptContext: string;
    dataPack: string;
  };
  interpretedFacts: {
    marketDataDerivedContext: string | null;
    stage1Interpretation: string | null;
  };
  metadata: {
    schemaVersion: 'research-layer-output/v1';
    sources: Array<'marketDataPromptContext' | 'dataPack'>;
    hasMarketDataPromptContext: boolean;
    hasDataPack: boolean;
  };
}

export function wrapResearchLayerOutput(params: {
  marketDataPromptContext: string;
  dataPack: string;
}): ResearchLayerOutput {
  const marketDataPromptContext = params.marketDataPromptContext ?? '';
  const dataPack = params.dataPack ?? '';

  return {
    rawFacts: {
      marketDataPromptContext,
      dataPack,
    },
    interpretedFacts: {
      marketDataDerivedContext: marketDataPromptContext.includes('"derived"')
        ? marketDataPromptContext
        : null,
      stage1Interpretation: dataPack.trim() ? dataPack : null,
    },
    metadata: {
      schemaVersion: 'research-layer-output/v1',
      sources: [
        ...(marketDataPromptContext ? ['marketDataPromptContext' as const] : []),
        ...(dataPack ? ['dataPack' as const] : []),
      ],
      hasMarketDataPromptContext: Boolean(marketDataPromptContext),
      hasDataPack: Boolean(dataPack),
    },
  };
}
