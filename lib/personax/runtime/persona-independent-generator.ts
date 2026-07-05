/**
 * Persona 독립 호출 공통 함수 (Runtime v1-7).
 *
 * generateLuciaIndependently()에서 검증된 독립 호출 패턴을 personaId 기반으로
 * 일반화한다. 다른 페르소나의 발화, 요약, 인용, 참고자료를 전혀 받지 않고
 * researchLayerOutput만으로 해당 persona 한 명의 발화를 생성한다.
 *
 * 현재는 LUCIA만 이 함수로 연결되어 있다 (stage3-script-generation.ts runSlot()).
 * RAY/JACK/ECHO의 identityGuard/extraRules는 아직 확정하지 않았고, runSlot()에도
 * 연결하지 않는다 — 페르소나별 확정은 이후 개별 PR(v1-8~)에서 진행한다.
 */
import type { CategoryV3 } from '@/lib/personax/classifier';
import { PERSONA_RULE } from '@/lib/personax/prompts/rules';
import type { ResearchLayerOutput } from '@/lib/personax/research-layer';
import type { PersonaId } from '@/lib/personax/runtime/runtime-types';
import {
  callStage3,
  OPTION_D_SYSTEM,
  type ScriptSlotTag,
} from '@/lib/personax/runtime/stage3-script-generation';
import { extractTag } from '@/lib/personax/runtime/stage1-data-collection';
import { TEA_SYSTEM_JACK } from '@/app/api/chat/prompts/tea-jack';
import { TEA_SYSTEM_LUCIA } from '@/app/api/chat/prompts/tea-lucia';
import { TEA_SYSTEM_RAY } from '@/app/api/chat/prompts/tea-ray';
import { TEA_SYSTEM_ECHO } from '@/app/api/chat/prompts/tea-echo';

const PERSONA_ORDER: PersonaId[] = ['ray', 'jack', 'lucia', 'echo'];

const PERSONA_DISPLAY_NAME: Record<PersonaId, string> = {
  ray: 'RAY',
  jack: 'JACK',
  lucia: 'LUCIA',
  echo: 'ECHO',
};

const PERSONA_SYSTEM_PROMPT: Record<PersonaId, string> = {
  ray: TEA_SYSTEM_RAY,
  jack: TEA_SYSTEM_JACK,
  lucia: TEA_SYSTEM_LUCIA,
  echo: TEA_SYSTEM_ECHO,
};

// LUCIA/RAY independent call에서 검증된 identity guard. JACK/ECHO는 아직 미확정 —
// 실제 runSlot 연결 전에 개별 PR에서 정의한다.
const PERSONA_IDENTITY_GUARD: Record<PersonaId, string> = {
  lucia: 'LUCIA는 앞 발화자를 반박하는 사람이 아니라 사용자 감정과 상황을 먼저 해석하는 사람이다.',
  ray: 'RAY는 앞 발화자를 반박하는 사람이 아니라 확인 가능한 데이터와 기준으로 스스로 분석을 시작하는 사람이다.',
  jack: 'JACK은 앞 발화자를 반박하는 사람이 아니라 책임, 결단, 행동 기준을 제시하는 사람이다. 다른 페르소나의 말이 아니라 현재 질문에서 사용자가 피하고 있는 선택 비용을 본다.',
  echo: '',
};

const PERSONA_EXTRA_RULES: Record<PersonaId, string> = {
  lucia: '- 첫 문장은 반드시 사용자 감정 또는 상황 해석으로 시작한다.\n- 데이터/숫자/손절선/지지선보다 그 판단을 앞둔 사람의 불안, 부담, 후회, 상처를 먼저 본다.',
  ray: '- 첫 문장은 반드시 데이터, 숫자, 또는 검증 가능한 기준 언급으로 시작한다.\n- 데이터가 없으면 숫자를 만들어내지 말고 조건표/비교 기준으로 말한다.',
  jack: '- 첫 문장은 반드시 책임, 결단, 행동 기준 중 하나로 시작한다.\n- "RAY가 말한", "LUCIA가 느낀", "ECHO가 정리한"처럼 다른 페르소나를 호명하거나 인용하며 시작하지 않는다.\n- 조언을 길게 늘이지 말고 선택지, 비용, 오늘의 행동 기준을 짧게 압축한다.\n- 투자 질문에서는 매수/매도 지시가 아니라 리스크 기준을 지킬 각오와 중단 조건으로 말한다.',
  echo: '',
};

const buildPersonaIndependentResearchContext = (
  researchLayerOutput: ResearchLayerOutput,
): string => JSON.stringify({
  rawFacts: researchLayerOutput.rawFacts,
  interpretedFacts: researchLayerOutput.interpretedFacts,
  metadata: researchLayerOutput.metadata,
}, null, 2);

export const generatePersonaIndependently = async (params: {
  personaId: PersonaId;
  tag: ScriptSlotTag;
  lastMessage: string;
  legacyCategory: string;
  categoryV3: CategoryV3;
  decisionType: string;
  researchLayerOutput: ResearchLayerOutput;
}): Promise<string> => {
  const {
    personaId,
    tag,
    lastMessage,
    legacyCategory,
    categoryV3,
    decisionType,
    researchLayerOutput,
  } = params;

  const displayName = PERSONA_DISPLAY_NAME[personaId];
  const otherPersonas = PERSONA_ORDER
    .filter((id) => id !== personaId)
    .map((id) => PERSONA_DISPLAY_NAME[id]);
  const identityGuard = PERSONA_IDENTITY_GUARD[personaId];
  const extraRules = PERSONA_EXTRA_RULES[personaId];

  const system = `${PERSONA_SYSTEM_PROMPT[personaId]}

---

## ${displayName} PERSONA_RULE
${PERSONA_RULE[personaId]}

---

${OPTION_D_SYSTEM}`;

  const user = `## PR4-vNext ${displayName} Independent Call
이번 호출은 ${displayName}만 별도로 생성한다.
다른 페르소나(${otherPersonas.join('/')})의 발화, 요약, 인용, 참고자료는 제공되지 않는다.
${identityGuard}

출력 형식:
[${tag}]
{${displayName} 본문만 작성}

- [${tag}] 블록 하나만 출력한다.
- ${otherPersonas.join(', ')}를 언급하거나 호명하지 않는다.
${extraRules}

사용자 질문:
${lastMessage}

분류:
- legacyCategory: ${legacyCategory || '(none)'}
- categoryV3: ${categoryV3}
- decisionType: ${decisionType}

ResearchLayerOutput:
${buildPersonaIndependentResearchContext(researchLayerOutput)}`;

  const raw = await callStage3(system, user);
  let extracted = extractTag(raw, tag) || '';
  if (!extracted.trim()) {
    extracted = extractTag(await callStage3(system, user), tag) || '';
  }
  return extracted;
};
