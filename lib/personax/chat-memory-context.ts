import type { NextRequest } from 'next/server';

import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { resolveChatSession } from '@/lib/personax/auth';
import { buildMemoryContext } from '@/lib/personax/memory-context';
import { fetchMemoryContextItems } from '@/lib/personax/memory-store';
import type { PersonaXSession } from '@/lib/personax/session';

export type ChatSessionResolver = () => Promise<{
  bodyProviderUserId: string | null;
  session: PersonaXSession;
}>;

export function createChatSessionResolver(
  req: NextRequest,
  requestProviderUserId?: unknown,
): ChatSessionResolver {
  let chatSessionPromise: ReturnType<typeof resolveChatSession> | null = null;

  return () => {
    if (!chatSessionPromise) {
      chatSessionPromise = resolveChatSession(req, requestProviderUserId);
    }

    return chatSessionPromise;
  };
}

export async function buildOptionDMemoryContext(
  getChatSession: ChatSessionResolver,
): Promise<string> {
  try {
    const { session } = await getChatSession();
    if (!session.providerUserId) return '';

    const supabaseServer = await createServerSupabase();
    const memoryItems = await fetchMemoryContextItems({
      supabase: supabaseServer,
      providerUserId: session.providerUserId,
      userId: session.userId,
    });

    return buildMemoryContext({
      items: memoryItems,
      providerUserId: session.providerUserId,
      userId: session.userId,
    });
  } catch {
    return '';
  }
}
