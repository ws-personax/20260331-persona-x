import { NextResponse, type NextRequest } from 'next/server';
import { resolveProviderUserIdForRead } from '@/lib/personax/auth';
import { getRooms, createRoom } from '@/lib/personax/room-persistence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const providerUserId = await resolveProviderUserIdForRead(req, { includeHeaderFallback: true });
  if (!providerUserId) {
    return NextResponse.json(
      { rooms: [], error: 'unauthenticated' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const rooms = await getRooms(providerUserId);
  return NextResponse.json({ rooms }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const providerUserId = await resolveProviderUserIdForRead(req, { includeHeaderFallback: false });
  if (!providerUserId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: { title?: unknown; topic?: unknown };
  try {
    body = await req.json() as { title?: unknown; topic?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  const topic = typeof body.topic === 'string' ? body.topic.trim() : undefined;

  const room = await createRoom(providerUserId, title, topic);
  if (!room) {
    return NextResponse.json({ error: 'failed to create room' }, { status: 500 });
  }

  return NextResponse.json({ room }, { status: 201 });
}
