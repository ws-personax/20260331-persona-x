import { classify } from './classifier/classifier';
import { research } from './research/research-layer';
import { runPersonaEngine } from './personas/persona-engine';
import { runDecisionEngine } from './decision/decision-engine';
import { routeSpeakerOrder } from './speaker/speaker-router';
import type { RuntimeV2Response } from './types';

export async function runRuntimeV2(lastMessage: string): Promise<RuntimeV2Response> {
  const classifierResult = classify(lastMessage);
  const researchResult = await research(lastMessage, classifierResult);
  const personaResults = await runPersonaEngine({
    userQuestion: lastMessage,
    classifierResult,
    researchResult,
  });
  const decisionResult = runDecisionEngine(personaResults);
  const order = routeSpeakerOrder();

  return {
    personaResults: decisionResult.personaResults,
    order,
  };
}
