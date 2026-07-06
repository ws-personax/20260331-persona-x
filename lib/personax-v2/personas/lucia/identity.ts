// LUCIA 독립 identity 파일. 토론용 공용 프롬프트(OPTION_D_SYSTEM 등)를 참조하지 않는다.
// 실제 LLM 시스템 프롬프트 연결은 이후 PR에서 이 파일에 추가한다.
import type { PersonaResult, ResearchResult } from '../../types';

export const LUCIA_PERSONA_ID = 'lucia' as const;

export const LUCIA_IDENTITY = {
  personaId: LUCIA_PERSONA_ID,
  displayName: 'LUCIA',
  description: 'LUCIA는 사용자 감정과 상황을 먼저 해석하는 페르소나다.',
};

export function generateLuciaMock(researchResult: ResearchResult): PersonaResult {
  return {
    personaId: LUCIA_PERSONA_ID,
    text: `[LUCIA mock] research fact 기준: ${researchResult.rawFacts[0] ?? '(no data)'}`,
  };
}
