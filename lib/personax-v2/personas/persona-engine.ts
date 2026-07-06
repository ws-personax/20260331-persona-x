// Runtime v2 persona engine — 4개 persona를 독립적으로 실행한다.
// persona끼리 원문(raw text)을 전달하지 않는다 — 각 persona는 researchResult만 받는다.
// 이번 PR은 실제 LLM 호출을 연결하지 않고 personaId별 mock 결과만 반환한다.
import type { PersonaResult, ResearchResult } from '../types';
import { generateRayMock } from './ray/identity';
import { generateJackMock } from './jack/identity';
import { generateLuciaMock } from './lucia/identity';
import { generateEchoMock } from './echo/identity';

export async function runPersonaEngine(researchResult: ResearchResult): Promise<PersonaResult[]> {
  return [
    generateRayMock(researchResult),
    generateJackMock(researchResult),
    generateLuciaMock(researchResult),
    generateEchoMock(researchResult),
  ];
}
