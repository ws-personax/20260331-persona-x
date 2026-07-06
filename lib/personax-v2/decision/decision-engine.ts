// Runtime v2 decision engine — 이번 PR 범위는 4명 결과를 그대로 취합하는 것까지만.
// 품질 판단/재구성 로직은 이후 PR에서 추가한다.
import type { DecisionResult, PersonaResult } from '../types';

export function runDecisionEngine(personaResults: PersonaResult[]): DecisionResult {
  return { personaResults };
}
