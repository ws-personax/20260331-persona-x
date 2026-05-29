export type AuthProvider = 'kakao' | 'google' | 'naver' | 'anonymous';

export type PersonaXSession = {
  provider: AuthProvider | null;
  providerUserId: string | null;
  userId: string | null;
  source: 'body' | 'cookie' | 'supabase' | 'localStorage-token' | 'none';
};

export function normalizeProviderUserId(params: {
  provider: AuthProvider;
  rawId: string | number | null | undefined;
}): string | null {
  if (params.rawId === null || params.rawId === undefined) return null;

  const value = String(params.rawId).trim();
  if (!value) return null;

  return `${params.provider}_${value}`;
}

export function isValidProviderUserId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^(kakao|google|naver|anonymous)_[A-Za-z0-9._:-]+$/.test(value)
  );
}

function providerFromProviderUserId(value: string): AuthProvider | null {
  const provider = value.split('_', 1)[0];

  if (
    provider === 'kakao' ||
    provider === 'google' ||
    provider === 'naver' ||
    provider === 'anonymous'
  ) {
    return provider;
  }

  return null;
}

export async function resolvePersonaXSession(params: {
  bodyProviderUserId?: unknown;
  cookieProviderUserId?: string | null;
  supabaseUserId?: string | null;
}): Promise<PersonaXSession> {
  if (isValidProviderUserId(params.bodyProviderUserId)) {
    return {
      provider: providerFromProviderUserId(params.bodyProviderUserId),
      providerUserId: params.bodyProviderUserId,
      userId: params.bodyProviderUserId,
      source: 'body',
    };
  }

  if (isValidProviderUserId(params.cookieProviderUserId)) {
    return {
      provider: providerFromProviderUserId(params.cookieProviderUserId),
      providerUserId: params.cookieProviderUserId,
      userId: params.cookieProviderUserId,
      source: 'cookie',
    };
  }

  if (params.supabaseUserId) {
    return {
      provider: null,
      providerUserId: null,
      userId: params.supabaseUserId,
      source: 'supabase',
    };
  }

  return {
    provider: null,
    providerUserId: null,
    userId: null,
    source: 'none',
  };
}
