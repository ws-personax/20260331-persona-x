export type FeedSpeaker = 'USER' | 'JACK' | 'LUCIA' | 'RAY' | 'ECHO';

export type FeedCardComment = {
  speaker: Exclude<FeedSpeaker, 'USER'>;
  content: string;
};

export type FeedCard = {
  id: string;
  question: string;
  author: {
    displayName: string;
  };
  isPublic: boolean;
  createdAt: string;
  comments: FeedCardComment[];
};

export type FeedCardConversationInput = {
  id: string;
  title?: string | null;
  author_display_name?: string | null;
  is_public?: boolean | null;
  created_at: string;
};

export type FeedCardMessageInput = {
  role?: string | null;
  persona?: string | null;
  content?: string | null;
};

export type BuildFeedCardParams = {
  conversation: FeedCardConversationInput;
  messages: FeedCardMessageInput[];
};

const PERSONA_TO_SPEAKER: Record<string, FeedCardComment['speaker']> = {
  jack: 'JACK',
  lucia: 'LUCIA',
  ray: 'RAY',
  echo: 'ECHO',
};

const compactText = (value: string | null | undefined): string =>
  (value ?? '').replace(/\s+/g, ' ').trim();

const findQuestion = (
  conversation: FeedCardConversationInput,
  messages: FeedCardMessageInput[],
): string => {
  const userMessage = messages.find((message) => message.role === 'user');
  const userQuestion = compactText(userMessage?.content);
  if (userQuestion) return userQuestion;

  return compactText(conversation.title);
};

const buildComments = (messages: FeedCardMessageInput[]): FeedCardComment[] =>
  messages.flatMap((message) => {
    if (message.role !== 'assistant') return [];

    const speaker = message.persona
      ? PERSONA_TO_SPEAKER[message.persona.toLowerCase()]
      : undefined;
    const content = compactText(message.content);

    if (!speaker || !content) return [];
    return [{ speaker, content }];
  });

export function buildFeedCard({
  conversation,
  messages,
}: BuildFeedCardParams): FeedCard {
  const displayName = compactText(conversation.author_display_name) || '익명';

  return {
    id: conversation.id,
    question: findQuestion(conversation, messages),
    author: {
      displayName,
    },
    isPublic: conversation.is_public ?? false,
    createdAt: conversation.created_at,
    comments: buildComments(messages),
  };
}
