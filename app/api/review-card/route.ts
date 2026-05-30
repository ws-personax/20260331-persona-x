import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { readKakaoSessionFromRequest } from '@/lib/auth/kakao';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ReviewCardItem = {
  id: string;
  title: string | null;
  verdict: string | null;
  review_date: string | null;
  decision_type: string | null;
  review_status: string | null;
};

const empty = () =>
  NextResponse.json(
    { items: [] },
    { headers: { 'Cache-Control': 'no-store' } },
  );

const createReviewClient = async () => {
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
  return null;
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

    const supabase = await createReviewClient();
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('conversations')
      .select('id, title, verdict, review_date, decision_type, review_status')
      .eq('provider_user_id', providerUserId)
      .eq('review_status', 'pending')
      .lte('review_date', today)
      .order('review_date', { ascending: true })
      .limit(3);

    if (error) {
      console.warn('[api/review-card] conversations query failed:', {
        message: error.message,
        code: error.code,
      });
      return empty();
    }

    return NextResponse.json(
      { items: (data ?? []) as ReviewCardItem[] },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.warn('[api/review-card] failed:', e instanceof Error ? e.message : String(e));
    return empty();
  }
}
