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
