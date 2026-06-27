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
