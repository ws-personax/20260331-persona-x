import type { SupabaseClient } from '@supabase/supabase-js';
import type { MemoryContextItem } from './memory-types';

const DEFAULT_MEMORY_QUERY_LIMIT = 10;
const MAX_MEMORY_CONTEXT_ITEMS = 3;

type ConversationMemoryRow = {
  id: string;
  created_at: string;
  provider_user_id: string | null;
  user_id: string | null;
  category: string | null;
  title: string | null;
  verdict: string | null;
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

export type FetchMemoryContextItemsParams = {
  supabase: SupabaseClient;
  providerUserId?: string | null;
  userId?: string | null;
  limit?: number;
};

const hasDecisionSignal = (row: ConversationMemoryRow): boolean =>
  Boolean(
    row.verdict?.trim() ||
    row.next_action?.trim() ||
    row.decision_type?.trim() ||
    (Array.isArray(row.reasons) && row.reasons.length > 0) ||
    (Array.isArray(row.counter_views) && row.counter_views.length > 0),
  );

const toMemoryContextItem = (row: ConversationMemoryRow): MemoryContextItem => ({
  id: row.id,
  sourceConversationId: row.id,
  providerUserId: row.provider_user_id,
  userId: row.user_id,
  createdAt: row.created_at,
  category: row.category,
  title: row.title,
  verdict: row.verdict,
  reasons: row.reasons,
  counterViews: row.counter_views,
  nextAction: row.next_action,
  decisionType: row.decision_type,
  reviewDate: row.review_date,
  reviewStatus: row.review_status,
  result: row.result,
  executed: row.executed,
  decisionImportance: row.decision_importance,
});

export async function fetchMemoryContextItems(
  params: FetchMemoryContextItemsParams,
): Promise<MemoryContextItem[]> {
  if (!params.providerUserId) return [];

  const limit = params.limit ?? DEFAULT_MEMORY_QUERY_LIMIT;
  const { data, error } = await params.supabase
    .from('conversations')
    .select(
      'id, created_at, provider_user_id, user_id, category, title, verdict, reasons, counter_views, next_action, decision_type, review_date, review_status, result, executed, decision_importance',
    )
    .eq('provider_user_id', params.providerUserId)
    .order('decision_importance', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !Array.isArray(data)) return [];

  return (data as ConversationMemoryRow[])
    .filter(hasDecisionSignal)
    .slice(0, MAX_MEMORY_CONTEXT_ITEMS)
    .map(toMemoryContextItem);
}
