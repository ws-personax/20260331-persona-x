import { buildEchoDefinition } from '../personas/echo/identity';
import { buildJackDefinition } from '../personas/jack/identity';
import { buildLuciaDefinition } from '../personas/lucia/identity';
import { buildRayDefinition } from '../personas/ray/identity';
import type { PersonaId, PersonaPromptInput } from '../types';

// Terms the PR296 diagnostic brief asked to look for (Korean), plus the English
// equivalents actually used in the identity prompts (the prompts are written in
// English with a "reply in Korean" instruction, so the Korean forms rarely show
// up verbatim in the fixed rule text — the English financial framing is what
// actually drives persona behavior).
const INVESTMENT_TERMS = [
  '투자', '매수', '매도', '진입', '손절', '가격', '거래량', '포트폴리오', '시장', '자산',
  'invest', 'buy', 'sell', 'entering', 'entry', 'price', 'volume', 'portfolio',
  'trading', 'market analyst', 'market data', 'chasing highs', 'stop-loss',
  'opportunity cost', 'research facts', 'asset',
];

// A neutral, non-investment probe: userQuestion carries no financial content,
// and researchResult mirrors exactly what research-layer.ts returns when no
// asset keyword is detected (source: 'none'), so any matched term below comes
// from the persona's fixed identity/role text, not from interpolated question
// or research content.
const DUMMY_INPUT: PersonaPromptInput = {
  userQuestion: '(non-investment diagnostic probe — no financial content)',
  classifierResult: { isInvest: false },
  researchResult: {
    rawFacts: ['No quoted asset was detected from the question.'],
    metadata: {
      source: 'none',
      detectedKeyword: null,
      assetName: null,
      symbol: null,
      matchedKeyword: null,
      questionType: 'general',
      fetchedAt: new Date(0).toISOString(),
    },
  },
};

export interface IdentityTermScan {
  personaId: PersonaId;
  matchedTerms: string[];
}

const DEFINITION_BUILDERS = {
  ray: buildRayDefinition,
  jack: buildJackDefinition,
  lucia: buildLuciaDefinition,
  echo: buildEchoDefinition,
} as const;

export function scanIdentityPromptsForInvestmentTerms(): IdentityTermScan[] {
  return (Object.keys(DEFINITION_BUILDERS) as PersonaId[]).map((personaId) => {
    const definition = DEFINITION_BUILDERS[personaId]();
    const prompt = definition.buildPrompt(DUMMY_INPUT).toLowerCase();
    const matchedTerms = INVESTMENT_TERMS.filter((term) => prompt.includes(term.toLowerCase()));
    return { personaId, matchedTerms };
  });
}
