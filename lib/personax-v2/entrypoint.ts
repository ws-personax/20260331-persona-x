// Runtime v2 진입점 — classifier → research → persona-engine → decision → speaker 순으로 연결한다.
// v1(lib/personax/**, app/api/chat/route.ts의 기존 로직)과 완전히 분리되어 있으며,
// 이번 PR에서는 실제 LLM 호출 없이 mock 파이프라인 동작만 확인한다.
import { classify } from './classifier/classifier';
import { research } from './research/research-layer';
import { runPersonaEngine } from './personas/persona-engine';
import { runDecisionEngine } from './decision/decision-engine';
import { routeSpeakerOrder } from './speaker/speaker-router';
import type { RuntimeV2Response } from './types';

export async function runRuntimeV2(lastMessage: string): Promise<RuntimeV2Response> {
  const classifierResult = classify(lastMessage);
  const researchResult = await research(classifierResult);
  const personaResults = await runPersonaEngine(researchResult);
  const decisionResult = runDecisionEngine(personaResults);
  const order = routeSpeakerOrder();

  return {
    personaResults: decisionResult.personaResults,
    order,
  };
}
