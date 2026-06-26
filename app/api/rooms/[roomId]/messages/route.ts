import { NextResponse, type NextRequest } from 'next/server';
import { resolveProviderUserIdForRead } from '@/lib/personax/auth';
import { getRoom, getRoomMessages, addRoomMessage } from '@/lib/personax/room-persistence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

  return NextResponse.json({ message }, { status: 201 });
}
