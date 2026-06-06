import type { TaggedRound1Result } from '@/app/api/chat/prompts/orchestrator-tagged';
import type { TaggedPersonaKey } from '@/lib/personax/message-router';
import { toPromptOrder } from '@/lib/personax/utils';

type ChatMessageForRound2 = {
  role?: string;
  content?: string;
  personas?: {
    ray?: string;
    jack?: string;
    lucia?: string;
    echo?: string;
    order?: TaggedPersonaKey[];
  };
};

export function buildRound2ContextFromMessages({
  messages,
  fallbackOrder,
  applyOrderOverride,
  fallbackQuestion,
}: {
  messages: unknown;
  fallbackOrder: TaggedPersonaKey[];
  applyOrderOverride: (order: TaggedPersonaKey[]) => TaggedPersonaKey[];
  fallbackQuestion: string;
}): {
  priorOrder: TaggedPersonaKey[];
  priorRound1: TaggedRound1Result;
  priorUserQuestion: string;
} {
  const list = Array.isArray(messages) ? (messages as ChatMessageForRound2[]) : [];

  let priorAssistant: ChatMessageForRound2 | null = null;
  for (let i = list.length - 2; i >= 0; i--) {
    const message = list[i];
    if (message?.role === 'assistant' && message?.personas) {
      priorAssistant = message;
      break;
    }
  }

  const priorOrder =
    priorAssistant?.personas?.order && priorAssistant.personas.order.length >= 3
      ? applyOrderOverride(priorAssistant.personas.order)
      : fallbackOrder;

  const priorText: Record<TaggedPersonaKey, string> = {
    ray: priorAssistant?.personas?.ray || '',
    jack: priorAssistant?.personas?.jack || '',
    lucia: priorAssistant?.personas?.lucia || '',
    echo: priorAssistant?.personas?.echo || '',
  };
  const promptPriorOrder = toPromptOrder(priorOrder);
  const priorRound1: TaggedRound1Result = {
    first: priorText[promptPriorOrder[0]] || '',
    second: priorText[promptPriorOrder[1]] || '',
    third: priorText[promptPriorOrder[2]] || '',
    echoQuestion: priorText.echo,
  };

  const userMessages = list.filter((message) => message?.role === 'user');
  const priorUserQuestion =
    userMessages.length >= 2
      ? userMessages[userMessages.length - 2]?.content || fallbackQuestion
      : fallbackQuestion;

  return { priorOrder, priorRound1, priorUserQuestion };
}
