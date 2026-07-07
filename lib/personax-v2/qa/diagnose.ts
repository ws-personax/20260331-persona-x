import { classify } from '../classifier/classifier';
import { research } from '../research/research-layer';
import { runRuntimeV2 } from '../entrypoint';
import { buildEchoDefinition } from '../personas/echo/identity';
import { buildJackDefinition } from '../personas/jack/identity';
import { buildLuciaDefinition } from '../personas/lucia/identity';
import { buildRayDefinition } from '../personas/ray/identity';
import type { DecisionSummary, PersonaDisplayOrder, PersonaId, PersonaOutputContract, ResearchResult } from '../types';
import { checkContractLabelsPresent } from './checks';
import { scanIdentityPromptsForInvestmentTerms } from './identity-scan';

// The 4 non-investment questions PR295 flagged as refused/label-incomplete.
export const NON_INVEST_DIAGNOSTIC_QUESTIONS = [
  '누군가 나를 시기할 때 어떻게 해야 할까요?',
  '요즘 아무것도 하기 싫습니다',
  '인플레이션이 정확히 뭔가요?',
  '좋은 배우자를 고르는 기준은 무엇인가요?',
];

const OUTPUT_CONTRACTS: Record<PersonaId, PersonaOutputContract> = {
  ray: buildRayDefinition().outputContract,
  jack: buildJackDefinition().outputContract,
  lucia: buildLuciaDefinition().outputContract,
  echo: buildEchoDefinition().outputContract,
};

// Heuristic only — used to flag likely refusal/scope-deflection language for the
// report, not to gate or alter runtime behavior in any way.
const REFUSAL_PATTERN =
  /역할\s*(범위|밖)|제\s*전문\s*영역|분석할\s*수\s*없|답변할\s*수\s*없|관련이\s*없으므로|제\s*역할이\s*아닙니다|scope|designed\s*to/i;

export interface PersonaDiagnosticOutcome {
  personaId: PersonaId;
  mode: 'live' | 'fallback';
  text: string;
  missingContractLabels: string[];
  looksLikeRefusal: boolean;
}

export interface QuestionDiagnostic {
  question: string;
  classifierIsInvest: boolean;
  researchSummary: {
    source: ResearchResult['metadata']['source'];
    detectedKeyword: string | null;
    assetName: string | null;
    symbol: string | null;
    matchedKeyword: string | null;
    questionType: ResearchResult['metadata']['questionType'];
    rawFacts: string[];
  };
  decisionSummary: DecisionSummary;
  routedOrder: PersonaDisplayOrder;
  routedMissingPersonaIds: PersonaId[];
  personaOutcomes: PersonaDiagnosticOutcome[];
}

export async function diagnoseQuestion(question: string): Promise<QuestionDiagnostic> {
  const classifierResult = classify(question);
  const researchResult = await research(question, classifierResult);
  const { personaResults, decisionSummary, routed } = await runRuntimeV2(question);

  const personaOutcomes: PersonaDiagnosticOutcome[] = personaResults.map((result) => {
    const contract = OUTPUT_CONTRACTS[result.personaId];
    return {
      personaId: result.personaId,
      mode: result.mode,
      text: result.text,
      missingContractLabels: checkContractLabelsPresent(result.text, contract),
      looksLikeRefusal: REFUSAL_PATTERN.test(result.text),
    };
  });

  return {
    question,
    classifierIsInvest: classifierResult.isInvest,
    researchSummary: {
      source: researchResult.metadata.source,
      detectedKeyword: researchResult.metadata.detectedKeyword,
      assetName: researchResult.metadata.assetName,
      symbol: researchResult.metadata.symbol,
      matchedKeyword: researchResult.metadata.matchedKeyword,
      questionType: researchResult.metadata.questionType,
      rawFacts: researchResult.rawFacts,
    },
    decisionSummary,
    routedOrder: routed.order,
    routedMissingPersonaIds: routed.missingPersonaIds,
    personaOutcomes,
  };
}

export async function diagnoseNonInvestQuestions(
  questions: string[] = NON_INVEST_DIAGNOSTIC_QUESTIONS,
): Promise<QuestionDiagnostic[]> {
  const results: QuestionDiagnostic[] = [];
  for (const question of questions) {
    results.push(await diagnoseQuestion(question));
  }
  return results;
}

export function formatDiagnosticReport(diagnostics: QuestionDiagnostic[]): string {
  const lines: string[] = [];
  const identityScan = scanIdentityPromptsForInvestmentTerms();

  lines.push('# Identity prompt investment-term scan (fixed rule text only, non-investment probe input)');
  for (const scan of identityScan) {
    lines.push(
      `- ${scan.personaId.toUpperCase()}: ${scan.matchedTerms.length ? scan.matchedTerms.join(', ') : '(none found)'}`,
    );
  }
  lines.push('');

  for (const diag of diagnostics) {
    lines.push('='.repeat(80));
    lines.push(`QUESTION: ${diag.question}`);
    lines.push(`classifier.isInvest = ${diag.classifierIsInvest}`);
    lines.push(`research.metadata = ${JSON.stringify(diag.researchSummary)}`);
    lines.push(`routedOrder = ${diag.routedOrder.join(' -> ')}`);
    if (diag.routedMissingPersonaIds.length > 0) {
      lines.push(`routedMissingPersonaIds = ${diag.routedMissingPersonaIds.join(', ')}`);
    }
    lines.push(`decisionSummary = ${JSON.stringify(diag.decisionSummary)}`);

    for (const outcome of diag.personaOutcomes) {
      lines.push(`  --- ${outcome.personaId.toUpperCase()} (mode=${outcome.mode}) looksLikeRefusal=${outcome.looksLikeRefusal} ---`);
      lines.push(`  ${outcome.text}`);
      if (outcome.missingContractLabels.length > 0) {
        lines.push(`  MISSING CONTRACT LABELS: ${outcome.missingContractLabels.join(', ')}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}
