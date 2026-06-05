import type { SupabaseClient } from '@supabase/supabase-js';
import type { MemoryContextItem, MemoryWriteParams, MemoryWriteResult } from './memory-types';

const DEFAULT_MEMORY_QUERY_LIMIT = 10;
const MAX_MEMORY_CONTEXT_ITEMS = 3;
const MAX_MEMORY_TEXT_LENGTH = 300;
const MAX_MEMORY_REASON_LENGTH = 220;
const MAX_MEMORY_NEXT_ACTION_LENGTH = 260;
const MAX_MEMORY_REASONS = 3;
const MAX_MEMORY_COUNTER_VIEWS = 1;
const DEFAULT_DECISION_IMPORTANCE = 3;

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

const compactText = (value: string | null | undefined, maxLength: number): string | null => {
  const compacted = (value || '').replace(/\s+/g, ' ').trim();
  if (!compacted) return null;
  return compacted.length > maxLength ? compacted.slice(0, maxLength) : compacted;
};

const compactTextList = (
  values: string[] | null | undefined,
  maxItems: number,
  maxLength: number,
): string[] | null => {
  const compacted = (values || [])
    .map((value) => compactText(value, maxLength))
    .filter((value): value is string => Boolean(value))
    .slice(0, maxItems);

  return compacted.length > 0 ? compacted : null;
};

export async function saveMemoryFromDecisionSummary(
  params: MemoryWriteParams,
): Promise<MemoryWriteResult> {
  if (!params.conversationId || !params.decisionSummary) {
    return { ok: false, conversationId: params.conversationId, error: 'missing conversationId or decisionSummary' };
  }

  const decisionType =
    compactText(params.decisionType, MAX_MEMORY_TEXT_LENGTH) ||
    compactText(params.category, MAX_MEMORY_TEXT_LENGTH);
  const counterView = compactText(params.decisionSummary.counterView, MAX_MEMORY_TEXT_LENGTH);

  try {
    const { error } = await params.supabase
      .from('conversations')
      .update({
        verdict: compactText(params.decisionSummary.verdict, MAX_MEMORY_TEXT_LENGTH),
        reasons: compactTextList(
          params.decisionSummary.reasons,
          MAX_MEMORY_REASONS,
          MAX_MEMORY_REASON_LENGTH,
        ),
        counter_views: counterView ? [counterView].slice(0, MAX_MEMORY_COUNTER_VIEWS) : null,
        next_action: compactText(
          params.decisionSummary.nextAction,
          MAX_MEMORY_NEXT_ACTION_LENGTH,
        ),
        decision_type: decisionType,
        decision_importance: DEFAULT_DECISION_IMPORTANCE,
      })
      .eq('id', params.conversationId);

    if (error) {
      console.warn('[memory-store] saveMemoryFromDecisionSummary failed:', error);
      return { ok: false, conversationId: params.conversationId, error: error.message };
    }

    return { ok: true, conversationId: params.conversationId };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn('[memory-store] saveMemoryFromDecisionSummary failed:', message);
    return { ok: false, conversationId: params.conversationId, error: message };
  }
}

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
