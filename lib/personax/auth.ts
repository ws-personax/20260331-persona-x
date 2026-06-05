import type { NextRequest } from 'next/server';

import {
  readKakaoSessionFromRequest,
  type KakaoSession,
} from '@/lib/auth/kakao';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import {
  normalizeProviderUserId,
  resolvePersonaXSession,
  type AuthProvider,
  type PersonaXSession,
} from '@/lib/personax/session';

export function getKakaoSession(req: NextRequest): KakaoSession | null {
  return readKakaoSessionFromRequest(req);
}

export function buildProviderUserId(
  provider: AuthProvider,
  rawId: string | number | null | undefined,
): string | null {
  return normalizeProviderUserId({ provider, rawId });
}

export async function getCurrentUser(): Promise<string | null> {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return user?.id ?? null;
  } catch {
    return null;
  }
}

export async function resolveProviderUserIdForRead(
  req: NextRequest,
  options: { includeHeaderFallback?: boolean } = {},
): Promise<string | null> {
  const kakaoSession = getKakaoSession(req);
  let providerUserId = buildProviderUserId('kakao', kakaoSession?.id);

  if (!providerUserId) {
    providerUserId = await getCurrentUser();
  }

  if (providerUserId) return providerUserId;

  const fromQuery = req.nextUrl.searchParams.get('providerUserId')?.trim();
  if (fromQuery) return fromQuery;

  if (options.includeHeaderFallback) {
    const fromHeader = req.headers.get('x-provider-user-id')?.trim();
    if (fromHeader) return fromHeader;
  }

  return null;
}

export async function resolveUserId(
  req: NextRequest,
  bodyProviderUserId?: unknown,
  includeSupabase = false,
): Promise<PersonaXSession> {
  const kakaoSession = getKakaoSession(req);
  const cookieProviderUserId = buildProviderUserId('kakao', kakaoSession?.id);
  const supabaseUserId = includeSupabase ? await getCurrentUser() : null;

  return resolvePersonaXSession({
    bodyProviderUserId,
    cookieProviderUserId,
    supabaseUserId,
  });
}

export async function resolveChatSession(
  req: NextRequest,
  requestProviderUserId?: unknown,
  includeSupabase = false,
): Promise<{ bodyProviderUserId: string | null; session: PersonaXSession }> {
  const bodyProviderUserId =
    typeof requestProviderUserId === 'string'
      ? requestProviderUserId
      : null;

  return {
    bodyProviderUserId,
    session: await resolveUserId(req, bodyProviderUserId, includeSupabase),
  };
}
