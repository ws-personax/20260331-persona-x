import { NextResponse, type NextRequest } from 'next/server';
import { readKakaoSessionFromRequest } from '@/lib/auth/kakao';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = readKakaoSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ user: null }, { headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json(
    {
      user: {
        id: session.id,
        email: session.email,
        nickname: session.nickname,
        profileImage: session.profileImage,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
