import crypto from 'node:crypto';
import type { NextRequest } from 'next/server';

export const KAKAO_AUTHORIZE_URL = 'https://kauth.kakao.com/oauth/authorize';
export const KAKAO_TOKEN_URL = 'https://kauth.kakao.com/oauth/token';
export const KAKAO_USER_URL = 'https://kapi.kakao.com/v2/user/me';
export const KAKAO_LOGOUT_URL = 'https://kapi.kakao.com/v1/user/logout';

export const KAKAO_STATE_COOKIE = 'px_kakao_state';
export const KAKAO_NEXT_COOKIE = 'px_kakao_next';
export const KAKAO_SESSION_COOKIE = 'px_kakao_session';

export const KAKAO_STATE_MAX_AGE = 60 * 5;          // 5 min
export const KAKAO_SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type KakaoSession = {
  id: number;
  email?: string | null;
  nickname?: string | null;
  profileImage?: string | null;
  iat: number; // issued-at (sec)
};

function getSigningSecret(): string {
  const secret = process.env.KAKAO_CLIENT_SECRET;
  if (!secret) throw new Error('KAKAO_CLIENT_SECRET is not configured');
  return secret;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str: string): Buffer {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export function signSession(payload: KakaoSession): string {
  const body = b64urlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  const mac = crypto.createHmac('sha256', getSigningSecret()).update(body).digest();
  return `${body}.${b64urlEncode(mac)}`;
}

export function verifySession(token: string | undefined): KakaoSession | null {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', getSigningSecret()).update(body).digest();
  let actual: Buffer;
  try {
    actual = b64urlDecode(sig);
  } catch {
    return null;
  }
  if (actual.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const json = JSON.parse(b64urlDecode(body).toString('utf8')) as KakaoSession;
    if (typeof json.id !== 'number') return null;
    return json;
  } catch {
    return null;
  }
}

export function readKakaoSessionFromRequest(req: NextRequest): KakaoSession | null {
  const token = req.cookies.get(KAKAO_SESSION_COOKIE)?.value;
  return verifySession(token);
}

export function buildRedirectUri(origin: string): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
  const base = explicit || origin.replace(/\/$/, '');
  return `${base}/api/auth/callback/kakao`;
}

export function isSafeNextPath(next: string | null | undefined): string {
  if (!next) return '/';
  if (!next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}
