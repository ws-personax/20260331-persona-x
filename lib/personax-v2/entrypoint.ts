import { classify } from './classifier/classifier';
import { research } from './research/research-layer';
import { runPersonaEngine } from './personas/persona-engine';
import { runDecisionEngine } from './decision/decision-engine';
import { resolveSpeakerRouteCategory, routeSpeakerResponse } from './speaker/speaker-router';
import type { RuntimeV2Response } from './types';

export async function runRuntimeV2(lastMessage: string): Promise<RuntimeV2Response> {
  const classifierResult = classify(lastMessage);
  const researchResult = await research(lastMessage, classifierResult);
  const personaResults = await runPersonaEngine({
    userQuestion: lastMessage,
    classifierResult,
    researchResult,
  });
  const decisionResult = runDecisionEngine({
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
