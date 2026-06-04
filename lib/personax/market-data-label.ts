type MarketDataContextBuilder = (userMessage: string) => Promise<string>;
type MarketGuardQuestionType = string;

export const hasMarketDataForGuard = async (
  userMessage: string,
  questionType: MarketGuardQuestionType,
  getOrBuildMarketDataContext: MarketDataContextBuilder,
): Promise<boolean> => {
  if (questionType !== 'buy_or_wait') {
    return false;
  }

  const marketDataPromptContext = await getOrBuildMarketDataContext(userMessage);
  return marketDataPromptContext?.includes('"price"') ?? false;
};

export const getMarketDataSourceLabelForGuard = async (
  userMessage: string,
  questionType: MarketGuardQuestionType,
  getOrBuildMarketDataContext: MarketDataContextBuilder,
): Promise<string> => {
  if (questionType !== 'buy_or_wait') {
    return '';
  }

  const marketDataPromptContext = await getOrBuildMarketDataContext(userMessage);
  if (!marketDataPromptContext?.includes('"price"')) {
    return '';
  }

  const source =
    marketDataPromptContext.match(/"source":\s*"([^"]+)"/)?.[1] ?? '';
  return source ? `데이터 출처: ${source}` : '';
};

export const appendMarketDataSourceLabel = (
  personaText: Record<string, string>,
  sourceLabel: string,
): void => {
  if (!sourceLabel || Object.values(personaText).some((text) => text?.includes('데이터 출처:'))) {
    return;
  }

  const targetKey = personaText.echo ? 'echo' : Object.keys(personaText).find((key) => personaText[key]);
  if (!targetKey) {
    return;
  }

  personaText[targetKey] = `${personaText[targetKey].trimEnd()}\n\n${sourceLabel}`;
};
