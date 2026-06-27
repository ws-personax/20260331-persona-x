import { NextResponse, type NextRequest } from 'next/server';
import { resolveProviderUserIdForRead } from '@/lib/personax/auth';
import { getRoom, getRoomMessages, addRoomMessage } from '@/lib/personax/room-persistence';
import { detectRoomPersonaCall, getRoomPersonaPlaceholder } from '@/lib/personax/room-persona-router';
import { buildRoomPersonaBlockedMessage, isRoomPersonaAllowed } from '@/lib/personax/room-participant-access';
import { callTeaPersona } from '@/lib/personax/tea-llm-caller';
import { TEA_SYSTEM_ECHO } from '@/app/api/chat/prompts/tea-echo';
import { TEA_SYSTEM_JACK } from '@/app/api/chat/prompts/tea-jack';
import { TEA_SYSTEM_LUCIA } from '@/app/api/chat/prompts/tea-lucia';
import { TEA_SYSTEM_RAY } from '@/app/api/chat/prompts/tea-ray';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RoomPersonaKey = 'jack' | 'ray' | 'lucia' | 'echo';

const FREE_ROOM_PERSONAS: RoomPersonaKey[] = ['jack', 'lucia'];
const PAID_ROOM_PERSONAS: RoomPersonaKey[] = ['jack', 'lucia', 'ray', 'echo'];

const getRoomAccessTier = (room: { title: string; topic: string | null }): 'free' | 'paid' => {
  const marker = `${room.title} ${room.topic ?? ''}`.toLowerCase();
  // 임시 하드코딩: 추후 Room Participants 테이블로 교체한다.
  if (/(유료|paid|premium|pro|프리미엄)/i.test(marker)) return 'paid';
  if (/(무료|free)/i.test(marker)) return 'free';
  return 'free';
};

const isRoomPersonaAllowed = (
  room: { title: string; topic: string | null },
  persona: RoomPersonaKey,
): boolean => {
  const allowed = getRoomAccessTier(room) === 'paid' ? PAID_ROOM_PERSONAS : FREE_ROOM_PERSONAS;
  return allowed.includes(persona);
};

const buildRoomPersonaBlockedMessage = (
  room: { title: string; topic: string | null },
  persona: RoomPersonaKey,
): string => {
  const allowed = getRoomAccessTier(room) === 'paid' ? PAID_ROOM_PERSONAS : FREE_ROOM_PERSONAS;
  return [
    `${persona.toUpperCase()}는 이 채팅방에서 아직 호출할 수 없습니다.`,
    `현재 허용된 참여자: ${allowed.map((name) => name.toUpperCase()).join(', ')}.`,
    '추후 Room Participants 테이블이 추가되면 이 규칙으로 교체할 예정입니다.',
  ].join('\n');
};

const getRoomPersonaSystemPrompt = (persona: 'jack' | 'ray' | 'lucia' | 'echo'): string => {
  switch (persona) {
    case 'jack':
      return TEA_SYSTEM_JACK;
    case 'ray':
      return TEA_SYSTEM_RAY;
    case 'lucia':
      return TEA_SYSTEM_LUCIA;
    case 'echo':
      return TEA_SYSTEM_ECHO;
  }
};

export async function GET(
  req: NextRequest,
  { params }: { params: { roomId: string } },
) {
  const providerUserId = await resolveProviderUserIdForRead(req, { includeHeaderFallback: true });
  if (!providerUserId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const room = await getRoom(params.roomId, providerUserId);
  if (!room) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const messages = await getRoomMessages(params.roomId);
  return NextResponse.json({ messages }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { roomId: string } },
) {
  const providerUserId = await resolveProviderUserIdForRead(req, { includeHeaderFallback: false });
  if (!providerUserId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const room = await getRoom(params.roomId, providerUserId);
  if (!room) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  let body: { content?: unknown };
  try {
    body = await req.json() as { content?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }

  const message = await addRoomMessage(params.roomId, 'user', content);
  if (!message) {
    return NextResponse.json({ error: 'failed to save message' }, { status: 500 });
  }

  const personaCall = detectRoomPersonaCall(content);
  if (!personaCall) {
    return NextResponse.json({ message }, { status: 201 });
  }

  if (!isRoomPersonaAllowed(room, personaCall.persona)) {
    const blockedMessage = await addRoomMessage(
      params.roomId,
      'system',
      buildRoomPersonaBlockedMessage(room, personaCall.persona),
    );
    return NextResponse.json(
      { message, personaMessage: blockedMessage ?? undefined, personaBlocked: true },
      { status: 201 },
    );
  }

  const personaSystemPrompt = getRoomPersonaSystemPrompt(personaCall.persona);
  const personaResponse = await callTeaPersona(
    personaCall.persona,
    personaSystemPrompt,
    [{ role: 'user', content }],
  );
  const placeholderContent = personaResponse?.trim() || getRoomPersonaPlaceholder(personaCall.persona);
  const personaMessage = await addRoomMessage(
    params.roomId,
    'persona',
    placeholderContent,
    personaCall.persona,
  );

  return NextResponse.json({ message, personaMessage: personaMessage ?? undefined }, { status: 201 });
}
