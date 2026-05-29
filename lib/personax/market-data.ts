import { CRYPTO_MAP, STOCK_MAP, fetchMarketPrice } from './market';
import type { MarketData } from './types';

export type PersonaXAssetType =
  | 'korean_stock'
  | 'global_stock'
  | 'crypto'
  | 'real_estate'
  | 'fx'
  | 'rate'
  | 'commodity'
  | 'unknown';

export type MarketDataSource =
  | 'upbit'
  | 'yahoo-chart'
  | 'existing-fetchMarketPrice'
  | 'no-adapter';

export interface DetectedMarketAsset {
  assetType: PersonaXAssetType;
  query: string;
  lookupKey: string;
  name: string;
  symbol?: string;
  alternateSymbol?: string;
  market?: 'KRX' | 'NASDAQ' | 'NYSE' | 'AMEX' | 'UPBIT' | 'FX' | 'RATE' | 'COMMODITY' | 'REAL_ESTATE';
  isEtf?: boolean;
}

type EnrichedMarketData = MarketData & {
  name: string;
  symbol?: string;
  fetchedAt: string;
};

export interface PersonaXMarketData {
  asset: DetectedMarketAsset;
  source: MarketDataSource;
  asOf: string;
  data: EnrichedMarketData;
  allowedNumbers: {
    price: string;
    change: string;
    high: string;
    low: string;
    volume: string;
    rawPrice: number;
    rawHigh: number;
    rawLow: number;
    rawVolume: number;
    avgVolume: number;
  };
}

type MarketDataAdapter = (asset: DetectedMarketAsset) => Promise<PersonaXMarketData | null>;

const INVESTMENT_ASSET_PATTERN =
  /주식|종목|ETF|펀드|코인|비트코인|이더리움|BTC|ETH|KRW-BTC|환율|원달러|달러|금리|채권|원자재|금\b|은\b|원유|유가|부동산|아파트|집값|매수|매도|투자|수익|손실|포트폴리오|삼성전자|삼전|005930|테슬라|애플|엔비디아|나스닥|S&P500|SPY|QQQ/i;

const ETF_SYMBOLS = new Set(['SPY', 'VOO', 'IVV', 'QQQ', 'TQQQ', 'SQQQ', 'DIA']);

const normalizeQuestion = (question: string): string => question.trim();

const detectKnownAsset = (question: string): DetectedMarketAsset | null => {
  if (/삼성전자|삼전|005930(?:\.KS)?/i.test(question)) {
    return {
      assetType: 'korean_stock',
      query: '삼성전자',
      lookupKey: '삼성전자',
      name: '삼성전자',
      symbol: '005930.KS',
      alternateSymbol: '005930',
      market: 'KRX',
    };
  }

  if (/비트코인|BTC|KRW-BTC/i.test(question)) {
    return {
      assetType: 'crypto',
      query: '비트코인',
      lookupKey: 'BTC',
      name: '비트코인',
      symbol: 'KRW-BTC',
      alternateSymbol: 'BTC',
      market: 'UPBIT',
    };
  }

  return null;
};

const findMappedAsset = (question: string): DetectedMarketAsset | null => {
  const q = normalizeQuestion(question);
  const upper = q.toUpperCase();
  const candidates = [
    ...Object.keys(STOCK_MAP).map((name) => ({ name, symbol: STOCK_MAP[name], kind: 'stock' as const })),
    ...Object.keys(CRYPTO_MAP).map((name) => ({ name, symbol: CRYPTO_MAP[name], kind: 'crypto' as const })),
  ].sort((a, b) => b.name.length - a.name.length);

  const matched = candidates.find(({ name, symbol }) => (
    !!name && (upper.includes(name.toUpperCase()) || upper.includes(symbol.toUpperCase()))
  ));

  if (!matched) return null;

  if (matched.kind === 'crypto') {
    return {
      assetType: 'crypto',
      query: matched.name,
      lookupKey: matched.name,
      name: matched.name,
      symbol: matched.symbol,
      alternateSymbol: matched.name.toUpperCase() === 'BTC' ? 'BTC' : undefined,
      market: 'UPBIT',
    };
  }

  const symbol = matched.symbol;
  const isKorean = /\.K[QS]$|\^KS|\^KQ/.test(symbol);
  const isEtf = ETF_SYMBOLS.has(symbol) || /ETF|KODEX|TIGER|ACE|SOL|ARIRANG|HANARO/i.test(matched.name);

  return {
    assetType: isKorean ? 'korean_stock' : 'global_stock',
    query: matched.name,
    lookupKey: matched.name,
    name: matched.name,
    symbol,
    alternateSymbol: symbol === '005930.KS' ? '005930' : undefined,
    market: isKorean ? 'KRX' : 'NASDAQ',
    isEtf,
  };
};

export function detectMarketAsset(question: string): DetectedMarketAsset | null {
  const q = normalizeQuestion(question);
  if (!q || !INVESTMENT_ASSET_PATTERN.test(q)) return null;

  const known = detectKnownAsset(q);
  if (known) return known;

  const mapped = findMappedAsset(q);
  if (mapped) return mapped;

  if (/부동산|아파트|집값|전세|월세|상가|오피스텔|재건축|청약/.test(q)) {
    return { assetType: 'real_estate', query: q, lookupKey: q, name: '부동산', market: 'REAL_ESTATE' };
  }

  if (/환율|원달러|달러\/원|USD\/KRW|엔화|유로|달러/.test(q)) {
    return { assetType: 'fx', query: q, lookupKey: q, name: '환율', market: 'FX' };
  }

  if (/금리|기준금리|국채|채권|연준|Fed|은행채/.test(q)) {
    return { assetType: 'rate', query: q, lookupKey: q, name: '금리', market: 'RATE' };
  }

  if (/원자재|금\b|은\b|구리|원유|유가|WTI|브렌트|천연가스/.test(q)) {
    return { assetType: 'commodity', query: q, lookupKey: q, name: '원자재', market: 'COMMODITY' };
  }

  return { assetType: 'unknown', query: q, lookupKey: q, name: '알 수 없는 투자 자산' };
}

const toPersonaXMarketData = (
  asset: DetectedMarketAsset,
  data: MarketData,
): PersonaXMarketData => {
  const fetchedAt = new Date().toISOString();
  const enrichedData: EnrichedMarketData = {
    ...data,
    name: asset.name,
    symbol: asset.symbol,
    fetchedAt,
  };

  return {
    asset,
    source: asset.assetType === 'crypto'
      ? 'upbit'
      : asset.assetType === 'korean_stock' || asset.assetType === 'global_stock'
        ? 'yahoo-chart'
        : 'existing-fetchMarketPrice',
    asOf: fetchedAt,
    data: enrichedData,
    allowedNumbers: {
      price: data.price,
      change: data.change,
      high: data.high,
      low: data.low,
      volume: data.volume,
      rawPrice: data.rawPrice,
      rawHigh: data.rawHigh,
      rawLow: data.rawLow,
      rawVolume: data.rawVolume,
      avgVolume: data.avgVolume,
    },
  };
};

const fetchMappedMarketData: MarketDataAdapter = async (asset) => {
  if (!asset.lookupKey || !['korean_stock', 'global_stock', 'crypto'].includes(asset.assetType)) {
    return null;
  }

  const data = await fetchMarketPrice(asset.lookupKey).catch(() => null);
  return data ? toPersonaXMarketData(asset, data) : null;
};

const nullAdapter: MarketDataAdapter = async () => null;

const MARKET_DATA_ADAPTERS: Record<PersonaXAssetType, MarketDataAdapter> = {
  korean_stock: fetchMappedMarketData,
  global_stock: fetchMappedMarketData,
  crypto: fetchMappedMarketData,
  real_estate: nullAdapter,
  fx: nullAdapter,
  rate: nullAdapter,
  commodity: nullAdapter,
  unknown: nullAdapter,
};

export async function fetchPersonaXMarketData(
  asset: DetectedMarketAsset,
): Promise<PersonaXMarketData | null> {
  return MARKET_DATA_ADAPTERS[asset.assetType](asset);
}

export async function buildMarketDataPromptContext(question: string): Promise<string> {
  const asset = detectMarketAsset(question);
  if (!asset) return '';

  const marketData = await fetchPersonaXMarketData(asset);

  if (!marketData) {
    return `## Market Data
assetType: ${asset.assetType}
detectedAsset: ${asset.name}
query: ${asset.query}
lookupKey: ${asset.lookupKey}
symbol: ${asset.symbol ?? 'unknown'}
alternateSymbol: ${asset.alternateSymbol ?? 'none'}
isEtf: ${asset.isEtf ? 'true' : 'false'}
marketData: null

확인 가능한 데이터가 필요합니다.
RAY must not create or infer any price, PER, PBR, volume, market cap, 52-week high/low, return rate, support, resistance, stop-loss, entry, buy, or sell numbers.
RAY must say: "확인 가능한 데이터가 필요합니다. 확인된 marketData 없이는 숫자 분석을 하지 않겠습니다. 판단 기준은 실적, 업황, 투자 기간, 감당 가능한 손실 범위입니다."`;
  }

  return `## Market Data
assetType: ${asset.assetType}
detectedAsset: ${asset.name}
query: ${asset.query}
lookupKey: ${asset.lookupKey}
symbol: ${asset.symbol ?? 'unknown'}
isEtf: ${asset.isEtf ? 'true' : 'false'}
marketData:
${JSON.stringify({
  price: marketData.data.price,
  currency: marketData.data.currency,
  source: marketData.data.source,
  change: marketData.data.change,
  name: marketData.data.name,
  symbol: marketData.data.symbol,
  fetchedAt: marketData.data.fetchedAt,
}, null, 2)}

RAY may use only numeric values present in this Market Data block. LLM memory, estimates, or old numbers are forbidden.`;
}
