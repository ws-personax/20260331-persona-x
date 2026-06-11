import type { SupabaseClient } from '@supabase/supabase-js';
import type { MemoryContextItem, MemoryWriteParams, MemoryWriteResult } from './memory-types';
import { calculateDecisionImportance } from './decision-summary';

const DEFAULT_MEMORY_QUERY_LIMIT = 10;
const MAX_MEMORY_CONTEXT_ITEMS = 3;
const MAX_MEMORY_TEXT_LENGTH = 300;
const MAX_MEMORY_REASON_LENGTH = 220;
const MAX_MEMORY_NEXT_ACTION_LENGTH = 260;
const MAX_MEMORY_REASONS = 3;
const MAX_MEMORY_COUNTER_VIEWS = 1;
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
  /** 현재 질문의 V3 카테고리 — 동일 카테고리 기록만 반환. 미전달 시 전체 조회(레거시 호환). */
  currentCategoryV3?: string | null;
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
  const decisionImportance = calculateDecisionImportance({
    decisionType: params.decisionType,
    category: params.category,
    verdict: params.decisionSummary.verdict,
    reasons: params.decisionSummary.reasons,
    nextAction: params.decisionSummary.nextAction,
  });

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
        decision_importance: decisionImportance,
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
  const selectStr =
    'id, created_at, provider_user_id, user_id, category, title, verdict, reasons, counter_views, next_action, decision_type, review_date, review_status, result, executed, decision_importance';

  // currentCategoryV3가 주어진 경우 동일 카테고리 기록만 조회.
  // 다른 카테고리 기록은 현재 질문과 무관한 컨텍스트로 판단해 완전 제외.
  // 같은 카테고리 기록이 없으면 빈 배열 반환 — 교차 카테고리 폴백 없음.
  let queryBuilder = params.supabase
    .from('conversations')
    .select(selectStr)
    .eq('provider_user_id', params.providerUserId);

  if (!params.currentCategoryV3) return [];
  queryBuilder = queryBuilder.eq('category', params.currentCategoryV3);

  const { data, error } = await queryBuilder
    .order('decision_importance', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !Array.isArray(data)) return [];

  return (data as ConversationMemoryRow[])
    .filter(hasDecisionSignal)
    .slice(0, MAX_MEMORY_CONTEXT_ITEMS)
    .map(toMemoryContextItem);
}
