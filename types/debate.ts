export interface DebateMessage {
    role: 'Jack' | 'Leo' | 'Soyeon'; 
    content: string;                 
    sentiment: 'Bullish' | 'Bearish' | 'Neutral'; 
  }
  
  export interface DebateResult {
    issueId: string;
    messages: DebateMessage[];
    conclusion: string; 
    suggestedAction?: 'buy' | 'sell' | 'hold' | 'wait'; // ì§€?˜ê??˜ì˜ ?¡ì…˜ ê°€?´ë“œ ì¶”ê?
  }
