import { createClient } from '@supabase/supabase-js';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { buildConversationMessages } from '@/lib/personax/conversation-messages';
import { saveConversation } from '@/lib/personax/history';
import { saveMemoryFromDecisionSummary } from '@/lib/personax/memory-store';
import type { DecisionSummary } from '@/lib/personax/decision-summary';
import type { PersonaXSession } from '@/lib/personax/session';

type ChatSessionResolver = () => Promise<{
  bodyProviderUserId: string | null;
  session: PersonaXSession;
}>;

type SaveUnifiedConversationParams = {
  getChatSession: ChatSessionResolver;
  category: string;
  title: string;
  personaText: Record<string, string>;
  decisionSummary?: DecisionSummary;
  decisionType?: string;
};

export const getSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
};

// Service role client for server-side logging such as tea_logs.
export const getAdminSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
};

export const saveUnifiedConversation = async ({
  getChatSession,
  category,
  title,
  personaText,
  decisionSummary,
  decisionType,
}: SaveUnifiedConversationParams): Promise<void> => {
  const { bodyProviderUserId, session } = await getChatSession();

  console.log('[providerUserId source]', {
    bodyProviderUserId,
    finalProviderUserId: session.providerUserId,
    source: session.source,
  });

  let supabaseServer: Awaited<ReturnType<typeof createServerSupabase>> | null = null;
  try {
    supabaseServer = await createServerSupabase();
  } catch (e) {
    console.warn('[saveConversation] supabase client init failed:', e);
  }

  if (!supabaseServer) return;

  const conversationMessages = buildConversationMessages(title, '', personaText);

  console.log('[route:saveConversation params]', {
    providerUserId: session.providerUserId,
    userId: session.userId,
    category,
    hasMessages: Array.isArray(conversationMessages),
    messageCount: conversationMessages?.length,
  });

  const saveResult = await saveConversation(supabaseServer, {
    session,
    category,
    title: title.slice(0, 50),
    messages: conversationMessages,
    decisionSummary,
    decisionType,
  });

  if (decisionSummary && saveResult?.conversationId) {
    await saveMemoryFromDecisionSummary({
      supabase: getAdminSupabase() ?? supabaseServer,
      conversationId: saveResult.conversationId,
      category,
      decisionType,
      decisionSummary,
    });
  }
};
