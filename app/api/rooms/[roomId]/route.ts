import { NextResponse, type NextRequest } from 'next/server';
import { resolveProviderUserIdForRead } from '@/lib/personax/auth';
import { getRoom } from '@/lib/personax/room-persistence';

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

  return NextResponse.json({ room }, { headers: { 'Cache-Control': 'no-store' } });
}
