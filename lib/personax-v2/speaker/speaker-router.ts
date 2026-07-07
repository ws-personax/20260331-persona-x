import type {
  ClassifierResult,
  DecisionSummary,
  PersonaDisplayOrder,
  PersonaId,
  PersonaResult,
  RoutedPersonaResponse,
} from '../types';

export type SpeakerRouteCategory = 'invest' | 'knowledge' | 'emotional' | 'action' | 'principle' | 'default';

interface SpeakerRouteInput {
  category: SpeakerRouteCategory;
  personaResults: PersonaResult[];
  decisionSummary: DecisionSummary;
}

const DEFAULT_ORDER: PersonaDisplayOrder = ['jack', 'lucia', 'ray', 'echo'];

const CATEGORY_DISPLAY_ORDER: Record<SpeakerRouteCategory, PersonaDisplayOrder> = {
  invest: ['ray', 'jack', 'lucia', 'echo'],
  knowledge: ['ray', 'echo', 'lucia', 'jack'],
  emotional: ['lucia', 'echo', 'jack', 'ray'],
  action: ['jack', 'ray', 'lucia', 'echo'],
  principle: ['echo', 'jack', 'lucia', 'ray'],
  default: DEFAULT_ORDER,
};

export function resolveSpeakerRouteCategory(
  userQuestion: string,
  classifierResult: ClassifierResult,
): SpeakerRouteCategory {
  if (classifierResult.isInvest) return 'invest';
  if (/(감정|불안|힘들|싫|시기|외롭|우울|화가|상처|남편|관계)/.test(userQuestion)) return 'emotional';
  if (/(기준|원칙|좋은|배우자|성공|행복|자유|의미)/.test(userQuestion)) return 'principle';
  if (/(해야|할까요|먼저|창업|재취업|이직|결정|선택)/.test(userQuestion)) return 'action';
  if (/(무엇|뭔가|왜|정확히|설명|개념|금리|인플레이션)/.test(userQuestion)) return 'knowledge';
  return 'default';
}

export function getDisplayOrder(category: SpeakerRouteCategory = 'default'): PersonaDisplayOrder {
  return CATEGORY_DISPLAY_ORDER[category];
}

export function routeSpeakerResponse(input: SpeakerRouteInput): RoutedPersonaResponse {
  const personas = input.personaResults.reduce<Partial<Record<PersonaId, string>>>((acc, result) => {
    acc[result.personaId] = result.text;
    return acc;
  }, {});

  const existingPersonaIds = new Set(input.personaResults.map((result) => result.personaId));
  const preferredOrder = getDisplayOrder(input.category);
  const order = preferredOrder.filter((personaId) => existingPersonaIds.has(personaId));
  const missingPersonaIds = preferredOrder.filter((personaId) => !existingPersonaIds.has(personaId));

  return {
    order,
    personas,
    decisionSummary: input.decisionSummary,
    missingPersonaIds,
  };
}

export function routeSpeakerOrder(category: SpeakerRouteCategory = 'default'): PersonaDisplayOrder {
  return getDisplayOrder(category);
}
