export type ConversationSpeaker = string;

export interface ConversationMessage {
  speaker: ConversationSpeaker;
  content: string;
  round: number;
  createdAt: string;
}

export interface ConversationState {
  question: string;
  topic: string;
  round: number;
  currentSpeaker: ConversationSpeaker | null;
  previousSpeakers: ConversationSpeaker[];
  messages: ConversationMessage[];
  currentConflict: string | null;
  currentConsensus: string | null;
}

export function createConversationState(params: {
  question: string;
  topic?: string;
  round?: number;
  currentSpeaker?: ConversationSpeaker | null;
  previousSpeakers?: ConversationSpeaker[];
  messages?: ConversationMessage[];
  currentConflict?: string | null;
  currentConsensus?: string | null;
}): ConversationState {
  return {
    question: params.question,
    topic: params.topic ?? '',
    round: params.round ?? 1,
    currentSpeaker: params.currentSpeaker ?? null,
    previousSpeakers: [...(params.previousSpeakers ?? [])],
    messages: [...(params.messages ?? [])],
    currentConflict: params.currentConflict ?? null,
    currentConsensus: params.currentConsensus ?? null,
  };
}

export function nextRound(state: ConversationState): ConversationState {
  return {
    ...state,
    round: state.round + 1,
    currentSpeaker: null,
    previousSpeakers: [],
  };
}

export function recordSpeaker(
  state: ConversationState,
  speaker: ConversationSpeaker,
): ConversationState {
  const previousSpeakers = state.currentSpeaker
    ? [...state.previousSpeakers, state.currentSpeaker]
    : [...state.previousSpeakers];

  return {
    ...state,
    currentSpeaker: speaker,
    previousSpeakers,
  };
}

export function recordMessage(
  state: ConversationState,
  speaker: ConversationSpeaker,
  content: string,
): ConversationState {
  return {
    ...state,
    messages: [
      ...state.messages,
      {
        speaker,
        content,
        round: state.round,
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

export function setConflict(
  state: ConversationState,
  currentConflict: string | null,
): ConversationState {
  return {
    ...state,
    currentConflict,
  };
}

export function setConsensus(
  state: ConversationState,
  currentConsensus: string | null,
): ConversationState {
  return {
    ...state,
    currentConsensus,
  };
}
