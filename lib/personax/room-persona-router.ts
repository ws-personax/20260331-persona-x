import type { SpeakerKey } from './room-types';

export type RoomPersonaCallResult = {
  persona: SpeakerKey;
};

const PERSONA_PLACEHOLDER: Record<SpeakerKey, string> = {
  jack: '호출되었습니다.\n다음 PR에서 실제 토론 엔진이 연결됩니다.',
  ray: '호출되었습니다.\n다음 PR에서 분석 엔진이 연결됩니다.',
  lucia: '호출되었습니다.\n다음 PR에서 공감 엔진이 연결됩니다.',
  echo: '호출되었습니다.\n다음 PR에서 패턴 엔진이 연결됩니다.',
};

const PERSONA_PATTERN = /@(jack|ray|lucia|echo)\b/i;

export function detectRoomPersonaCall(content: string): RoomPersonaCallResult | null {
  const match = PERSONA_PATTERN.exec(content);
  if (!match) return null;
  return { persona: match[1].toLowerCase() as SpeakerKey };
}

export function getRoomPersonaPlaceholder(persona: SpeakerKey): string {
  return PERSONA_PLACEHOLDER[persona];
}
