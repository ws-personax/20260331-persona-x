import type { PersonaId } from '../types';

const DEFAULT_ORDER: PersonaId[] = ['ray', 'jack', 'lucia', 'echo'];

export function routeSpeakerOrder(): PersonaId[] {
  return DEFAULT_ORDER;
}
