import type { NextRequest } from 'next/server';

import { readKakaoSessionFromRequest } from '@/lib/auth/kakao';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import {
  resolvePersonaXSession,
  type PersonaXSession,
} from '@/lib/personax/session';

export async function resolveUserId(
  req: NextRequest,
  bodyProviderUserId?: unknown,
  includeSupabase = false,
): Promise<PersonaXSession> {
  const cookieProviderUserId = (() => {
    const k = readKakaoSessionFromRequest(req);
    return k?.id ? `kakao_${k.id}` : null;
  })();

  const supabaseUserId = includeSupabase
    ? await (async () => {
        try {
          const sb = await createServerSupabase();
          const {
            data: { user },
          } = await sb.auth.getUser();

          return user?.id ?? null;
        } catch {
          return null;
        }
      })()
    : null;

  return resolvePersonaXSession({
    bodyProviderUserId,
    cookieProviderUserId,
    supabaseUserId,
  });
}
