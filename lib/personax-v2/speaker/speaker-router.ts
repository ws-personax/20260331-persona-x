// Runtime v2 speaker router — personaId 기반 표시 순서만 반환한다.
// first/second/third/closer 같은 위치 기반 개념은 사용하지 않는다.
import type { PersonaId } from '../types';

const DEFAULT_ORDER: PersonaId[] = ['ray', 'jack', 'lucia', 'echo'];

export function routeSpeakerOrder(): PersonaId[] {
  return DEFAULT_ORDER;
}
