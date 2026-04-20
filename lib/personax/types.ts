export type AssetType = 'CRYPTO' | 'KOREAN_STOCK' | 'US_STOCK';
export type Verdict   = '매수 우위' | '매도 우위' | '관망';

export interface PersonaResponse {
  jack: string; lucia: string; ray: string; echo: string;
  verdict: Verdict; confidence: number; breakdown: string; positionSizing: string;
}

export interface MarketData {
  price: string; change: string; high: string; low: string; volume: string;
  rawPrice: number; rawHigh: number; rawLow: number; rawVolume: number; avgVolume: number;
  currency: 'KRW' | 'USD'; source: string; marketState?: string;
}

export interface ScoreParams {
  volScore: number; change: string; newsAvg: number;
  posScore: number; vitScore: number;
  hasData: boolean; newsCount: number;
  volLabel: string; posLabel: string; vixLabel: string; newsSentiment: string;
}
