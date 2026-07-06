export type AssetKind = 'stock' | 'crypto';

export interface AssetMappingEntry {
  assetName: string;
  symbol: string;
  kind: AssetKind;
  patterns: string[];
}

export interface ResolvedAsset {
  assetName: string;
  symbol: string;
  kind: AssetKind;
  matchedKeyword: string;
}

// Array order is match priority. More specific (longer) keywords must come first
// so a substring like "카카오" cannot swallow "카카오뱅크".
export const ASSET_OVERRIDE_MAP: AssetMappingEntry[] = [
  {
    assetName: '카카오뱅크',
    symbol: '323410.KS',
    kind: 'stock',
    patterns: ['카카오뱅크', 'kakao bank', 'kakaobank', '323410'],
  },
  {
    assetName: '카카오',
    symbol: '035720.KS',
    kind: 'stock',
    patterns: ['카카오', 'kakao'],
  },
];

export function resolveOverrideAsset(question: string): ResolvedAsset | null {
  const normalized = question.toLowerCase();
  const compact = normalized.replace(/\s+/g, '');

  for (const entry of ASSET_OVERRIDE_MAP) {
    for (const pattern of entry.patterns) {
      const patternLower = pattern.toLowerCase();
      const patternCompact = patternLower.replace(/\s+/g, '');
      if (normalized.includes(patternLower) || compact.includes(patternCompact)) {
        return {
          assetName: entry.assetName,
          symbol: entry.symbol,
          kind: entry.kind,
          matchedKeyword: pattern,
        };
      }
    }
  }

  return null;
}
