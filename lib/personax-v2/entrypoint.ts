import { classify } from './classifier/classifier';
import { research } from './research/research-layer';
import { runPersonaEngine } from './personas/persona-engine';
import { runDecisionEngine } from './decision/decision-engine';
import { normalizePersonaResultLabels } from './output-contract/label-normalizer';
import { resolveSpeakerRouteCategory, routeSpeakerResponse } from './speaker/speaker-router';
import { extractStanceCard } from './debate/stance-extractor';
import { runDebateLayer } from './debate/debate-layer';
import { buildDecisionSummaryFromDebate } from './debate/decision-summary-adapter';
import type { DecisionResult, PersonaResult, RuntimeV2Response, TikitakaLevel } from './types';

// tikitakaLevel defaults to 'weak' so every existing caller (app/api/chat/route.ts,
// qa/run-qa.ts, qa/diagnose.ts) keeps today's behavior unchanged unless it
// explicitly opts into 'strong'. No live classifier decides this yet — see
// docs/tikitaka-level.md §8 (real-time level detection is a separate PR).
export async function runRuntimeV2(
  lastMessage: string,
  tikitakaLevel: TikitakaLevel = 'weak',
): Promise<RuntimeV2Response> {
  const classifierResult = classify(lastMessage);
  const researchResult = await research(lastMessage, classifierResult);
  const rawPersonaResults = await runPersonaEngine({
    userQuestion: lastMessage,
    classifierResult,
    researchResult,
  });
  const personaResults = normalizePersonaResultLabels(rawPersonaResults);

  const decisionResult: DecisionResult =
    tikitakaLevel === 'strong'
      ? buildStrongDecisionResult(lastMessage, personaResults)
      : runDecisionEngine({
          userQuestion: lastMessage,
          classifierResult,
          personaResults,
        });

  const speakerCategory = resolveSpeakerRouteCategory(lastMessage, classifierResult);
  const routed = routeSpeakerResponse({
    category: speakerCategory,
    personaResults: decisionResult.personaResults,
    decisionSummary: decisionResult.decisionSummary,
  });

  return {
    personaResults: decisionResult.personaResults,
    decisionSummary: decisionResult.decisionSummary,
    order: routed.order,
    routed,
  };
}

// strong path: each Persona's own normalized text -> its own StanceCard
// (PR310) -> Debate Layer sees only StanceCard[], never raw Persona text
// (PR312) -> DecisionSummary adapter (PR313). Persona results themselves
// flow through unchanged, same as the weak path, so speaker-router's input
// shape does not depend on tikitakaLevel.
function buildStrongDecisionResult(userQuestion: string, personaResults: PersonaResult[]): DecisionResult {
  const stanceCards = personaResults.map((result) => extractStanceCard(result.personaId, result.text));
  const debateOutput = runDebateLayer({
    userQuestion,
    tikitakaLevel: 'strong',
    stanceCards,
  });

  return {
    personaResults,
    decisionSummary: buildDecisionSummaryFromDebate(debateOutput),
  };
}
