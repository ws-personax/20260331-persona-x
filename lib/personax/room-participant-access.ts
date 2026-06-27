import type { Room, SpeakerKey } from './room-types';

export type RoomAccessTier = 'free' | 'paid';

const FREE_ROOM_PERSONAS: SpeakerKey[] = ['jack', 'lucia'];
const PAID_ROOM_PERSONAS: SpeakerKey[] = ['jack', 'lucia', 'ray', 'echo'];

const normalize = (value: string) => value.toLowerCase();

export function getRoomAccessTier(room: Pick<Room, 'title' | 'topic'>): RoomAccessTier {
  const marker = normalize(`${room.title} ${room.topic ?? ''}`);
  // 임시 하드코딩: DB의 room_participants 테이블이 생기면 이 판정을 교체한다.
  if (/(유료|paid|premium|pro|프리미엄)/i.test(marker)) return 'paid';
  if (/(무료|free)/i.test(marker)) return 'free';
  return 'free';
}

export function getAllowedRoomPersonas(room: Pick<Room, 'title' | 'topic'>): SpeakerKey[] {
  return getRoomAccessTier(room) === 'paid' ? PAID_ROOM_PERSONAS : FREE_ROOM_PERSONAS;
}

export function isRoomPersonaAllowed(room: Pick<Room, 'title' | 'topic'>, persona: SpeakerKey): boolean {
  return getAllowedRoomPersonas(room).includes(persona);
}

export function buildRoomPersonaBlockedMessage(
  room: Pick<Room, 'title' | 'topic'>,
  persona: SpeakerKey,
): string {
  const allowedPersonas = getAllowedRoomPersonas(room).map((name) => name.toUpperCase()).join(', ');
  return [
    `${persona.toUpperCase()}는 이 채팅방에서 아직 호출할 수 없습니다.`,
    `현재 허용된 참여자: ${allowedPersonas}.`,
    '추후 room_participants 테이블로 교체할 예정입니다.',
  ].join('\n');
}
