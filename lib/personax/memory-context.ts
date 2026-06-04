import type { BuildMemoryContextParams, MemoryContextItem } from './memory-types';

const MAX_CONTEXT_LENGTH = 500;
const MAX_CONTEXT_ITEMS = 3;

const compact = (value: string | null | undefined): string =>
  (value || '').replace(/\s+/g, ' ').trim();

const formatItem = (item: MemoryContextItem): string => {
  const title = compact(item.title) || 'Untitled decision';
  const decisionType = compact(item.decisionType) || compact(item.category);
  const verdict = compact(item.verdict);
  const nextAction = compact(item.nextAction);
  const reason = item.reasons?.map(compact).find(Boolean);
  const review =
    compact(item.reviewStatus) ||
    compact(item.result) ||
    (item.executed === true ? 'executed' : item.executed === false ? 'not executed' : '');

  return [
    `- ${title}`,
    decisionType && `type: ${decisionType}`,
    verdict && `decision: ${verdict}`,
    reason && `reason: ${reason}`,
    nextAction && `next: ${nextAction}`,
    review && `review: ${review}`,
  ].filter(Boolean).join(' / ');
};

export function buildMemoryContext(params: BuildMemoryContextParams): string {
  const items = (params.items || []).filter(Boolean).slice(0, MAX_CONTEXT_ITEMS);
  if (items.length === 0) return '';

  const context = [
    '이전 결정 참고:',
    ...items.map(formatItem),
  ].join('\n');

  return context.length > MAX_CONTEXT_LENGTH
    ? context.slice(0, MAX_CONTEXT_LENGTH)
    : context;
}
