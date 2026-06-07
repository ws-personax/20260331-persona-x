import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { resolveProviderUserIdForRead } from '@/lib/personax/auth';

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
  created_at: string;
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

export async function GET(req: NextRequest) {
  try {
    const providerUserId = await resolveProviderUserIdForRead(req, {
      includeHeaderFallback: false,
    });
    if (!providerUserId) return empty();

    const supabase = await createReviewClient();
    const today = new Date().toISOString().split('T')[0];
    const { data: scheduledRows, error: scheduledError } = await supabase
      .from('conversations')
      .select('id, title, verdict, review_date, decision_type, review_status, created_at')
      .eq('provider_user_id', providerUserId)
      .eq('review_status', 'pending')
      .lte('review_date', today)
      .order('review_date', { ascending: true })
      .limit(3);

    if (scheduledError) {
      console.warn('[api/review-card] conversations query failed:', {
        message: scheduledError.message,
        code: scheduledError.code,
      });
      return empty();
    }

    const scheduledItems = (scheduledRows ?? []) as ReviewCardItem[];
    const remainingSlots = Math.max(0, 3 - scheduledItems.length);

    let meaningfulItems: ReviewCardItem[] = [];
    if (remainingSlots > 0) {
      const createdAtCutoff = new Date();
      createdAtCutoff.setDate(createdAtCutoff.getDate() - 14);
      const cutoffIso = createdAtCutoff.toISOString();

      const { data: meaningfulRows, error: meaningfulError } = await supabase
        .from('conversations')
        .select('id, title, verdict, review_date, decision_type, review_status, created_at')
        .eq('provider_user_id', providerUserId)
        .is('review_date', null)
        .not('verdict', 'is', null)
        .lte('created_at', cutoffIso)
        .or('reasons.not.is.null,next_action.not.is.null')
        .order('created_at', { ascending: false })
        .limit(1);

      if (meaningfulError) {
        console.warn('[api/review-card] meaningful conversations query failed:', {
          message: meaningfulError.message,
          code: meaningfulError.code,
        });
      } else {
        meaningfulItems = (meaningfulRows ?? []) as ReviewCardItem[];
      }
    }

    return NextResponse.json(
      { items: [...scheduledItems, ...meaningfulItems].slice(0, 3) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.warn('[api/review-card] failed:', e instanceof Error ? e.message : String(e));
    return empty();
  }
}
