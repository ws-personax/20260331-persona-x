// Runtime v2 공통 타입. v1(lib/personax/**)과 완전히 분리 — v1 타입을 import하지 않는다.
// 설계 원칙: first/second/third/closer 같은 위치 기반 개념을 쓰지 않고, 모든 데이터를
// personaId 기반으로만 저장·전달·조립한다.

export type PersonaId = 'ray' | 'jack' | 'lucia' | 'echo';

export interface ClassifierResult {
  isInvest: boolean;
}

export interface ResearchResult {
  rawFacts: string[];
  metadata: Record<string, unknown>;
}

// Persona간 원문(raw text) 전달 금지 — 다른 persona를 참조해야 할 때는
// 이 구조 데이터(personaId/stance/keyPoints)만 전달한다. 이번 PR의 mock 단계에서는
// 아직 실제로 다른 persona를 참조하지 않지만, 향후 연결 시에도 이 타입을 넘어서지 않는다.
export interface PersonaStance {
  personaId: PersonaId;
  stance: string;
  keyPoints: string[];
}

export interface PersonaResult {
  personaId: PersonaId;
  text: string;
}

export interface DecisionResult {
  personaResults: PersonaResult[];
}

export interface RuntimeV2Response {
  personaResults: PersonaResult[];
  order: PersonaId[];
}
