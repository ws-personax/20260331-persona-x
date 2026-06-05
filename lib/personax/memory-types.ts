import type { SupabaseClient } from '@supabase/supabase-js';
import type { DecisionSummary } from './decision-summary';

export type MemoryContextItem = {
  id: string;
  sourceConversationId: string;
  providerUserId?: string | null;
  userId?: string | null;
  createdAt: string;
  category: string | null;
  title: string | null;
  verdict: string | null;
  reasons: string[] | null;
  counterViews: string[] | null;
  nextAction: string | null;
  decisionType: string | null;
  reviewDate: string | null;
  reviewStatus: string | null;
  result: string | null;
  executed: boolean | null;
  decisionImportance: number | null;
};

export type BuildMemoryContextParams = {
  items?: MemoryContextItem[] | null;
  providerUserId?: string | null;
  userId?: string | null;
};

export type MemoryWriteParams = {
  supabase: SupabaseClient;
  conversationId?: string | null;
  category?: string | null;
  decisionType?: string | null;
  decisionSummary?: DecisionSummary | null;
};

export type MemoryWriteResult = {
  ok: boolean;
  conversationId?: string | null;
  error?: string;
};
