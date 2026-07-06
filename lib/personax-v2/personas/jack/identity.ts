// JACK 독립 identity 파일. 토론용 공용 프롬프트(OPTION_D_SYSTEM 등)를 참조하지 않는다.
// 실제 LLM 시스템 프롬프트 연결은 이후 PR에서 이 파일에 추가한다.
import type { PersonaResult, ResearchResult } from '../../types';

export const JACK_PERSONA_ID = 'jack' as const;

export const JACK_IDENTITY = {
  personaId: JACK_PERSONA_ID,
  displayName: 'JACK',
  description: 'JACK은 책임, 결단, 행동 기준을 제시하는 페르소나다.',
};

export function generateJackMock(researchResult: ResearchResult): PersonaResult {
  return {
    personaId: JACK_PERSONA_ID,
    text: `[JACK mock] research fact 기준: ${researchResult.rawFacts[0] ?? '(no data)'}`,
  };
}
