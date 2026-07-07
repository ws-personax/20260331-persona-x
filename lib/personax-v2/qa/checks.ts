import type { PersonaId, PersonaOutputContract, PersonaResult } from '../types';

const DISPLAY_NAMES: Record<PersonaId, string> = {
  ray: 'RAY',
  jack: 'JACK',
  lucia: 'LUCIA',
  echo: 'ECHO',
};

// Output contract adherence — every section label the persona is contracted to
// use must appear in its own text.
export function checkContractLabelsPresent(text: string, contract: PersonaOutputContract): string[] {
  return contract.sections.filter((section) => !hasSectionStartLabel(text, section.label)).map((section) => section.label);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasSectionStartLabel(text: string, label: string): boolean {
  const sectionStartPattern = new RegExp(`(?:^|\\n)\\s*${escapeRegExp(label)}\\s*[:：]`, 'm');
  return sectionStartPattern.test(text);
}

// No persona should call out another persona by name or reference the team structure.
export function checkNoOtherPersonaMentioned(personaId: PersonaId, text: string): string[] {
  const upperText = text.toUpperCase();
  return (Object.entries(DISPLAY_NAMES) as Array<[PersonaId, string]>)
    .filter(([id]) => id !== personaId)
    .map(([, name]) => name)
    .filter((name) => upperText.includes(name));
}

const REASSURANCE_PATTERNS = [/괜찮/, /잘\s*하고\s*있/, /걱정\s*하지\s*마/, /힘내/, /잘될\s*거/, /토닥/];

// ECHO reads behavior patterns; it should not slide into LUCIA's comforting register.
export function checkEchoNotComforting(text: string): boolean {
  return REASSURANCE_PATTERNS.some((pattern) => pattern.test(text));
}

const JUDGMENT_PATTERNS = [/정답은/, /결론적으로/, /당신은\s*틀렸/, /그것은\s*옳지\s*않/, /해야만\s*합니다/];

// LUCIA interprets emotion; it should not hand down a verdict like a judge/analyst.
export function checkLuciaNotJudgmental(text: string): boolean {
  return JUDGMENT_PATTERNS.some((pattern) => pattern.test(text));
}

function countSentences(text: string): number {
  return text.split(/(?<=[.!?다요])\s+/).map((s) => s.trim()).filter(Boolean).length;
}

// JACK should keep explaining the cost of each choice, not collapse into a short generic line.
export function checkJackTooGeneric(text: string): boolean {
  return countSentences(text) < 3 || text.trim().length < 80;
}

const FABRICATED_NUMBER_PATTERN = /\d[\d,]*\s?(원|%|퍼센트|달러|\$|배|억|만원|포인트)/;

// Without market data, RAY should not manufacture prices, percentages, or other quantitative facts.
export function checkRayFabricatedNumbers(text: string, hasMarketData: boolean): boolean {
  return !hasMarketData && FABRICATED_NUMBER_PATTERN.test(text);
}

// More than one persona returning the exact same fallback text signals the
// shared fallback string leaking into multiple slots instead of a single source of truth.
export function checkFallbackDuplicated(results: PersonaResult[], fallbackText: string): boolean {
  return results.filter((result) => result.text === fallbackText).length > 1;
}

// A crude convergence signal: how many personas' answers share the same
// generic "set a standard" language, which would mean they collapsed onto one voice.
const STANDARD_LANGUAGE_PATTERN = /기준을?\s*(세우|정하)/;

export function countStandardLanguageOverlap(results: PersonaResult[]): PersonaId[] {
  return results.filter((result) => STANDARD_LANGUAGE_PATTERN.test(result.text)).map((result) => result.personaId);
}
