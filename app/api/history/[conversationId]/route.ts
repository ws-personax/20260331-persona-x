import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { resolveProviderUserIdForRead } from '@/lib/personax/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type HistoryConversation = {
  id: string;
  created_at: string;
  category: string | null;
  title: string | null;
  verdict: string | null;
  verdict_strength: number | null;
  reasons: string[] | null;
  counter_views: string[] | null;
  next_action: string | null;
  decision_type: string | null;
  review_date: string | null;
  review_status: string | null;
  result: string | null;
  executed: boolean | null;
  decision_importance: number | null;
};

type HistoryMessage = {
  id: string;
  conversation_id: string;
  role: string;
  persona: string | null;
  content: string;
  created_at: string;
};

const noStoreHeaders = { 'Cache-Control': 'no-store' };

const createHistoryClient = async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceKey) {
    return createSupabaseClient(url, serviceKey);
  }
  return createServerSupabase();
};

export async function GET(
  req: NextRequest,
  { params }: { params: { conversationId: string } },
) {
  try {
    const providerUserId = await resolveProviderUserIdForRead(req, {
      includeHeaderFallback: true,
    });
    if (!providerUserId) {
      return NextResponse.json(
        { conversation: null, messages: [] },
        { status: 401, headers: noStoreHeaders },
      );
    }

    const conversationId = params.conversationId?.trim();
    if (!conversationId) {
      return NextResponse.json(
        { conversation: null, messages: [], error: 'conversationId is required' },
        { status: 400, headers: noStoreHeaders },
      );
    }

    const supabase = await createHistoryClient();
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select(
        'id, created_at, category, title, verdict, verdict_strength, reasons, counter_views, next_action, decision_type, review_date, review_status, result, executed, decision_importance',
      )
      .eq('id', conversationId)
      .eq('provider_user_id', providerUserId)
      .maybeSingle();

    if (conversationError) {
      console.warn('[api/history/detail] conversation query failed:', {
        message: conversationError.message,
        code: conversationError.code,
      });
      return NextResponse.json(
        { conversation: null, messages: [], error: conversationError.message },
        { status: 500, headers: noStoreHeaders },
      );
    }

    if (!conversation) {
      return NextResponse.json(
        { conversation: null, messages: [] },
        { status: 404, headers: noStoreHeaders },
      );
    }

    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('id, conversation_id, role, persona, content, created_at')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.warn('[api/history/detail] messages query failed:', {
        message: messagesError.message,
        code: messagesError.code,
      });
      return NextResponse.json(
        { conversation, messages: [], error: messagesError.message },
        { status: 500, headers: noStoreHeaders },
      );
    }

    return NextResponse.json(
      {
        conversation: conversation as HistoryConversation,
        messages: (messages ?? []) as HistoryMessage[],
      },
      { headers: noStoreHeaders },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'history detail load failed';
    console.warn('[api/history/detail] failed:', message);
    return NextResponse.json(
      { conversation: null, messages: [], error: message },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
