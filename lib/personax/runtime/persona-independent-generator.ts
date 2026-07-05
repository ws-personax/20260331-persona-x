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

// LUCIA independent call에서 검증된 identity guard. RAY/JACK/ECHO는 아직 미확정 —
// 실제 runSlot 연결 전에 개별 PR에서 정의한다.
const PERSONA_IDENTITY_GUARD: Record<PersonaId, string> = {
  lucia: 'LUCIA는 앞 발화자를 반박하는 사람이 아니라 사용자 감정과 상황을 먼저 해석하는 사람이다.',
  ray: '',
  jack: '',
  echo: '',
};

const PERSONA_EXTRA_RULES: Record<PersonaId, string> = {
  lucia: '- 첫 문장은 반드시 사용자 감정 또는 상황 해석으로 시작한다.\n- 데이터/숫자/손절선/지지선보다 그 판단을 앞둔 사람의 불안, 부담, 후회, 상처를 먼저 본다.',
  ray: '',
  jack: '',
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
