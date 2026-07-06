// ECHO 독립 identity 파일. 토론용 공용 프롬프트(OPTION_D_SYSTEM 등)를 참조하지 않는다.
// 실제 LLM 시스템 프롬프트 연결은 이후 PR에서 이 파일에 추가한다.
import type { PersonaResult, ResearchResult } from '../../types';

export const ECHO_PERSONA_ID = 'echo' as const;

export const ECHO_IDENTITY = {
  personaId: ECHO_PERSONA_ID,
  displayName: 'ECHO',
  description: 'ECHO는 반복되는 질문 방식과 결정 구조를 드러내는 페르소나다.',
};

export function generateEchoMock(researchResult: ResearchResult): PersonaResult {
  return {
    personaId: ECHO_PERSONA_ID,
    text: `[ECHO mock] research fact 기준: ${researchResult.rawFacts[0] ?? '(no data)'}`,
  };
}
