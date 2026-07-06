// RAY 독립 identity 파일. 토론용 공용 프롬프트(OPTION_D_SYSTEM 등)를 참조하지 않는다.
// 실제 LLM 시스템 프롬프트 연결은 이후 PR에서 이 파일에 추가한다.
import type { PersonaResult, ResearchResult } from '../../types';

export const RAY_PERSONA_ID = 'ray' as const;

export const RAY_IDENTITY = {
  personaId: RAY_PERSONA_ID,
  displayName: 'RAY',
  description: 'RAY는 확인 가능한 데이터와 기준으로 분석하는 페르소나다.',
};

export function generateRayMock(researchResult: ResearchResult): PersonaResult {
  return {
    personaId: RAY_PERSONA_ID,
    text: `[RAY mock] research fact 기준: ${researchResult.rawFacts[0] ?? '(no data)'}`,
  };
}
