import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { readKakaoSessionFromRequest } from '@/lib/auth/kakao';

export const runtime = 'nodejs';

type HistoryItem = {
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

const empty = (error?: string) =>
  NextResponse.json(
    error ? { items: [], error } : { items: [] },
    { headers: { 'Cache-Control': 'no-store' } },
  );

const createHistoryClient = async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceKey) {
    return createSupabaseClient(url, serviceKey);
  }
  return createServerSupabase();
};

const fallbackProviderUserId = (req: NextRequest): string | null => {
  const fromQuery = req.nextUrl.searchParams.get('providerUserId')?.trim();
  if (fromQuery) return fromQuery;

  const fromHeader = req.headers.get('x-provider-user-id')?.trim();
  return fromHeader || null;
};

export async function GET(req: NextRequest) {
  try {
    const kakaoSession = readKakaoSessionFromRequest(req);
    let providerUserId = kakaoSession?.id ? `kakao_${kakaoSession.id}` : null;

    if (!providerUserId) {
      try {
        const supabaseServer = await createServerSupabase();
        const { data } = await supabaseServer.auth.getUser();
        providerUserId = data.user?.id ?? null;
      } catch {
        providerUserId = null;
      }
    }

    providerUserId = providerUserId ?? fallbackProviderUserId(req);
    if (!providerUserId) return empty();

    const supabase = await createHistoryClient();
    const { data, error } = await supabase
      .from('conversations')
      .select(
        'id, created_at, category, title, verdict, verdict_strength, reasons, counter_views, next_action, decision_type, review_date, review_status, result, executed, decision_importance',
      )
      .eq('provider_user_id', providerUserId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.warn('[api/history] conversations query failed:', {
        message: error.message,
        code: error.code,
      });
      return empty(error.message);
    }

    return NextResponse.json(
      { items: (data ?? []) as HistoryItem[] },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.warn('[api/history] failed:', e instanceof Error ? e.message : String(e));
    return empty(e instanceof Error ? e.message : 'history load failed');
  }
}
