import { NextResponse, type NextRequest } from 'next/server';
import {
  KAKAO_NEXT_COOKIE,
  KAKAO_SESSION_COOKIE,
  KAKAO_SESSION_MAX_AGE,
  KAKAO_STATE_COOKIE,
  KAKAO_TOKEN_URL,
  KAKAO_USER_URL,
  buildRedirectUri,
  isSafeNextPath,
  signSession,
  type KakaoSession,
} from '@/lib/auth/kakao';

export const runtime = 'nodejs';

function fail(origin: string, reason: string) {
  console.error('[kakao callback]', reason);
  const url = new URL(`${origin}/auth/auth-code-error`);
  url.searchParams.set('reason', 'kakao');
  return NextResponse.redirect(url.toString());
}

export async function GET(req: NextRequest) {
  const clientId = process.env.KAKAO_CLIENT_ID;
  const clientSecret = process.env.KAKAO_CLIENT_SECRET;
  const { origin, searchParams } = new URL(req.url);

  if (!clientId || !clientSecret) return fail(origin, 'env missing');

  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  if (error) return fail(origin, `kakao returned error: ${error}`);
  if (!code || !state) return fail(origin, 'code/state missing');

  const stateCookie = req.cookies.get(KAKAO_STATE_COOKIE)?.value;
  if (!stateCookie || stateCookie !== state) return fail(origin, 'state mismatch');

  const next = isSafeNextPath(req.cookies.get(KAKAO_NEXT_COOKIE)?.value ?? '/');
  const redirectUri = buildRedirectUri(origin);

  // 1) code → access_token
  const tokenRes = await fetch(KAKAO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
    cache: 'no-store',
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => '');
    return fail(origin, `token exchange failed: ${tokenRes.status} ${text}`);
  }
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  const accessToken = tokenJson.access_token;
  if (!accessToken) return fail(origin, 'access_token missing');

  // 2) access_token → user
  const userRes = await fetch(KAKAO_USER_URL, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!userRes.ok) {
    const text = await userRes.text().catch(() => '');
    return fail(origin, `user fetch failed: ${userRes.status} ${text}`);
  }
  const userJson = (await userRes.json()) as {
    id?: number;
    kakao_account?: {
      email?: string;
      profile?: { nickname?: string; profile_image_url?: string };
    };
  };
  if (typeof userJson.id !== 'number') return fail(origin, 'kakao user id missing');

  const session: KakaoSession = {
    id: userJson.id,
    email: userJson.kakao_account?.email ?? null,
    nickname: userJson.kakao_account?.profile?.nickname ?? null,
    profileImage: userJson.kakao_account?.profile?.profile_image_url ?? null,
    iat: Math.floor(Date.now() / 1000),
  };
  const signed = signSession(session);

  const res = NextResponse.redirect(`${origin}${next}`);
  const isProd = process.env.NODE_ENV === 'production';
  res.cookies.set(KAKAO_SESSION_COOKIE, signed, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    maxAge: KAKAO_SESSION_MAX_AGE,
  });
  res.cookies.set(KAKAO_STATE_COOKIE, '', { path: '/', maxAge: 0 });
  res.cookies.set(KAKAO_NEXT_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
