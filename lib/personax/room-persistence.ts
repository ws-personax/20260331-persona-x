import { createClient } from '@supabase/supabase-js';
import type { Room } from './room-types';

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

const toRoom = (row: RoomRow): Room => ({
  id: row.id,
  providerUserId: row.provider_user_id,
  title: row.title,
  topic: row.topic,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
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
