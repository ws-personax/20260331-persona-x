import { classify } from '../classifier/classifier';
import { research } from '../research/research-layer';
import { runRuntimeV2 } from '../entrypoint';
import { PERSONA_V2_FALLBACK_TEXT } from '../personas/shared/llm';
import { buildEchoDefinition } from '../personas/echo/identity';
import { buildJackDefinition } from '../personas/jack/identity';
import { buildLuciaDefinition } from '../personas/lucia/identity';
import { buildRayDefinition } from '../personas/ray/identity';
import type { PersonaId, PersonaOutputContract } from '../types';
import { QA_SAMPLES, type QaSample } from './samples';
import {
  checkContractLabelsPresent,
  checkEchoNotComforting,
  checkFallbackDuplicated,
  checkJackTooGeneric,
  checkLuciaNotJudgmental,
  checkNoOtherPersonaMentioned,
  checkRayFabricatedNumbers,
  countStandardLanguageOverlap,
} from './checks';

const OUTPUT_CONTRACTS: Record<PersonaId, PersonaOutputContract> = {
  ray: buildRayDefinition().outputContract,
  jack: buildJackDefinition().outputContract,
  lucia: buildLuciaDefinition().outputContract,
  echo: buildEchoDefinition().outputContract,
};

export interface PersonaQaFinding {
  personaId: PersonaId;
  mode: 'live' | 'fallback';
  text: string;
  missingContractLabels: string[];
  mentionsOtherPersona: string[];
  echoComfortingFlag: boolean;
  luciaJudgmentalFlag: boolean;
  jackTooGenericFlag: boolean;
  rayFabricatedNumberFlag: boolean;
}

export interface SampleQaResult {
  sample: QaSample;
  hasMarketData: boolean;
  detectedKeyword: string | null;
  personaFindings: PersonaQaFinding[];
  fallbackDuplicated: boolean;
  standardLanguageOverlap: PersonaId[];
}

export async function runQaSample(sample: QaSample): Promise<SampleQaResult> {
  const classifierResult = classify(sample.question);
  const researchResult = await research(sample.question, classifierResult);
  const hasMarketData = researchResult.metadata.source === 'market';

  const { personaResults } = await runRuntimeV2(sample.question);

  const personaFindings: PersonaQaFinding[] = personaResults.map((result) => {
    const contract = OUTPUT_CONTRACTS[result.personaId];

    return {
      personaId: result.personaId,
      mode: result.mode,
      text: result.text,
      missingContractLabels: checkContractLabelsPresent(result.text, contract),
      mentionsOtherPersona: checkNoOtherPersonaMentioned(result.personaId, result.text),
      echoComfortingFlag: result.personaId === 'echo' && checkEchoNotComforting(result.text),
      luciaJudgmentalFlag: result.personaId === 'lucia' && checkLuciaNotJudgmental(result.text),
      jackTooGenericFlag: result.personaId === 'jack' && checkJackTooGeneric(result.text),
      rayFabricatedNumberFlag: result.personaId === 'ray' && checkRayFabricatedNumbers(result.text, hasMarketData),
    };
  });

  return {
    sample,
    hasMarketData,
    detectedKeyword: researchResult.metadata.detectedKeyword,
    personaFindings,
    fallbackDuplicated: checkFallbackDuplicated(personaResults, PERSONA_V2_FALLBACK_TEXT),
    standardLanguageOverlap: countStandardLanguageOverlap(personaResults),
  };
}

export async function runQaSuite(samples: QaSample[] = QA_SAMPLES): Promise<SampleQaResult[]> {
  const results: SampleQaResult[] = [];
  for (const sample of samples) {
    results.push(await runQaSample(sample));
  }
  return results;
}

export function formatQaReport(results: SampleQaResult[]): string {
  const lines: string[] = [];

  for (const result of results) {
    lines.push('='.repeat(80));
    lines.push(`[${result.sample.category}] ${result.sample.id}: ${result.sample.question}`);
    lines.push(`  detectedKeyword=${result.detectedKeyword ?? 'none'} hasMarketData=${result.hasMarketData}`);

    for (const finding of result.personaFindings) {
      lines.push(`  --- ${finding.personaId.toUpperCase()} (mode=${finding.mode}) ---`);
      lines.push(`  ${finding.text}`);

      const warnings: string[] = [];
      if (finding.missingContractLabels.length > 0) {
        warnings.push(`missing contract labels: ${finding.missingContractLabels.join(', ')}`);
      }
      if (finding.mentionsOtherPersona.length > 0) {
        warnings.push(`mentions other persona: ${finding.mentionsOtherPersona.join(', ')}`);
      }
      if (finding.echoComfortingFlag) warnings.push('ECHO reads as comforting (LUCIA-like)');
      if (finding.luciaJudgmentalFlag) warnings.push('LUCIA reads as a verdict-giving judge');
      if (finding.jackTooGenericFlag) warnings.push('JACK collapsed into a short generic line');
      if (finding.rayFabricatedNumberFlag) warnings.push('RAY may have fabricated a number without market data');

      if (warnings.length > 0) {
        lines.push(`    WARNING: ${warnings.join(' | ')}`);
      }
    }

    if (result.fallbackDuplicated) {
      lines.push('  WARNING: fallback text duplicated across more than one persona');
    }
    if (result.standardLanguageOverlap.length >= 3) {
      lines.push(
        `  WARNING: ${result.standardLanguageOverlap.length} personas converge on "set a standard" language (${result.standardLanguageOverlap.join(', ')})`,
      );
    }

    lines.push('');
  }

  return lines.join('\n');
}
