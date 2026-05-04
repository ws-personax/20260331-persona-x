import crypto from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import {
  KAKAO_AUTHORIZE_URL,
  KAKAO_NEXT_COOKIE,
  KAKAO_STATE_COOKIE,
  KAKAO_STATE_MAX_AGE,
  buildRedirectUri,
  isSafeNextPath,
} from '@/lib/auth/kakao';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const clientId = process.env.KAKAO_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'KAKAO_CLIENT_ID missing' }, { status: 500 });
  }

  const { origin, searchParams } = new URL(req.url);
  const next = isSafeNextPath(searchParams.get('next'));
  const redirectUri = buildRedirectUri(origin);
  const state = crypto.randomBytes(16).toString('hex');

  const authorize = new URL(KAKAO_AUTHORIZE_URL);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('redirect_uri', redirectUri);
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('scope', 'profile_nickname profile_image');

  const res = NextResponse.redirect(authorize.toString());
  const isProd = process.env.NODE_ENV === 'production';
  res.cookies.set(KAKAO_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    maxAge: KAKAO_STATE_MAX_AGE,
  });
  res.cookies.set(KAKAO_NEXT_COOKIE, next, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    maxAge: KAKAO_STATE_MAX_AGE,
  });
  return res;
}
