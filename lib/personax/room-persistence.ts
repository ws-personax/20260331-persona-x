import { createClient } from '@supabase/supabase-js';
import type { Room, RoomMessage, SpeakerType, SpeakerKey } from './room-types';

const getSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
};

type RoomRow = {
  id: string;
  provider_user_id: string;
  title: string;
  topic: string | null;
  created_at: string;
  updated_at: string;
};

type RoomMessageRow = {
  id: string;
  room_id: string;
  speaker_type: string;
  speaker_key: string | null;
  content: string;
  created_at: string;
};

const toRoom = (row: RoomRow): Room => ({
  id: row.id,
  providerUserId: row.provider_user_id,
  title: row.title,
  topic: row.topic,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toRoomMessage = (row: RoomMessageRow): RoomMessage => ({
  id: row.id,
  roomId: row.room_id,
  speakerType: row.speaker_type as SpeakerType,
  speakerKey: (row.speaker_key ?? null) as SpeakerKey | null,
  content: row.content,
  createdAt: row.created_at,
});

export async function getRooms(providerUserId: string): Promise<Room[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('rooms')
    .select('id, provider_user_id, title, topic, created_at, updated_at')
    .eq('provider_user_id', providerUserId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.warn('[getRooms] failed:', error.message);
    return [];
  }

  return (data ?? []).map(toRoom);
}

export async function createRoom(
  providerUserId: string,
  title: string,
  topic?: string,
): Promise<Room | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('rooms')
    .insert({
      provider_user_id: providerUserId,
      title: title.slice(0, 100),
      topic: topic?.trim() || null,
    })
    .select('id, provider_user_id, title, topic, created_at, updated_at')
    .single();

  if (error || !data) {
    console.warn('[createRoom] failed:', error?.message);
    return null;
  }

  return toRoom(data as RoomRow);
}

export async function getRoom(
  roomId: string,
  providerUserId: string,
): Promise<Room | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('rooms')
    .select('id, provider_user_id, title, topic, created_at, updated_at')
    .eq('id', roomId)
    .eq('provider_user_id', providerUserId)
    .single();

  if (error || !data) return null;
  return toRoom(data as RoomRow);
}

export async function getRoomMessages(roomId: string): Promise<RoomMessage[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('room_messages')
    .select('id, room_id, speaker_type, speaker_key, content, created_at')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[getRoomMessages] failed:', error.message);
    return [];
  }

  return (data ?? []).map(toRoomMessage);
}

export async function addRoomMessage(
  roomId: string,
  speakerType: SpeakerType,
  content: string,
  speakerKey?: SpeakerKey,
): Promise<RoomMessage | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('room_messages')
    .insert({
      room_id: roomId,
      speaker_type: speakerType,
      speaker_key: speakerKey ?? null,
      content,
    })
    .select('id, room_id, speaker_type, speaker_key, content, created_at')
    .single();

  if (error || !data) {
    console.warn('[addRoomMessage] failed:', error?.message);
    return null;
  }

  return toRoomMessage(data as RoomMessageRow);
}
