import { NextResponse, type NextRequest } from 'next/server';
import { KAKAO_SESSION_COOKIE } from '@/lib/auth/kakao';

export const runtime = 'nodejs';

function clearAndRespond(req: NextRequest, redirect: boolean) {
  const { origin, searchParams } = new URL(req.url);
  let next = searchParams.get('next') ?? '/';
  if (!next.startsWith('/') || next.startsWith('//')) next = '/';

  const res = redirect
    ? NextResponse.redirect(`${origin}${next}`)
    : NextResponse.json({ ok: true });
  res.cookies.set(KAKAO_SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}

export async function POST(req: NextRequest) {
  return clearAndRespond(req, false);
}

export async function GET(req: NextRequest) {
  return clearAndRespond(req, true);
}
