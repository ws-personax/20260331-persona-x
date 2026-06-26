export type SpeakerType = 'user' | 'persona' | 'system';
export type SpeakerKey = 'jack' | 'ray' | 'lucia' | 'echo';

export type Room = {
  id: string;
  providerUserId: string;
  title: string;
  topic: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RoomMessage = {
  id: string;
  roomId: string;
  speakerType: SpeakerType;
  speakerKey: SpeakerKey | null;
  content: string;
  createdAt: string;
};
