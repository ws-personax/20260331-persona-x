/**
 * PersonaX SNS future structure.
 *
 * Room = shared space.
 * Thread = one concern or decision unit.
 * Message = a user or persona utterance.
 *
 * This file is a type-only bridge for gradually connecting the current
 * conversations/messages storage model to the future SNS surface.
 */

export type SnsSpeakerType =
  | 'USER'
  | 'JACK'
  | 'LUCIA'
  | 'RAY'
  | 'ECHO';

export interface SnsRoomCreator {
  displayName: string;
}

export interface SnsRoom {
  id: string;
  title: string;
  isPublic: boolean;
  createdBy: SnsRoomCreator;
  createdAt: string;
  participants: SnsSpeakerType[];
}

export interface SnsThread {
  id: string;
  roomId: string;
  question: string;
  isPublic: boolean;
  createdAt: string;
}

export interface SnsMessage {
  id: string;
  threadId: string;
  speaker: SnsSpeakerType;
  content: string;
  createdAt: string;
  replyTo?: string;
}

export interface SnsThreadView {
  thread: SnsThread;
  messages: SnsMessage[];
}

/**
 * Current DB mapping reference:
 *
 * SnsRoom
 * - conversations.id
 * - conversations.title
 * - conversations.created_at
 *
 * SnsThread
 * - conversations-centered for now
 * - can be split into a dedicated thread model later
 *
 * SnsMessage
 * - messages.content
 * - messages.role
 * - messages.persona
 * - messages.created_at
 *
 * Speaker mapping:
 * - USER  -> messages.role = 'user'
 * - JACK  -> messages.persona = 'jack'
 * - LUCIA -> messages.persona = 'lucia'
 * - RAY   -> messages.persona = 'ray'
 * - ECHO  -> messages.persona = 'echo'
 */
