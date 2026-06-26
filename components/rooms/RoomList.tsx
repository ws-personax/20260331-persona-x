'use client';

import { useEffect, useState } from 'react';
import type { Room } from '@/lib/personax/room-types';
import RoomCreate from './RoomCreate';

interface RoomListProps {
  onBack: () => void;
  onSelectRoom: (roomId: string) => void;
}

export default function RoomList({ onBack, onSelectRoom }: RoomListProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const fetchRooms = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/rooms', { cache: 'no-store' });
      const json = await res.json() as { rooms?: Room[]; error?: string };
      if (!res.ok) {
        setError(json.error ?? '목록 불러오기 실패');
        return;
      }
      setRooms(json.rooms ?? []);
    } catch {
      setError('네트워크 오류');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRooms(); }, []);

  const handleCreated = (room: Room) => {
    setRooms((prev) => [room, ...prev]);
    setShowCreate(false);
  };

  return (
    <div
      style={{
        height: '100dvh',
        background: '#E8DCC0',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* 헤더 */}
      <header
        style={{
          padding: '14px 16px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <button
          type="button"
          onClick={onBack}
          style={{
            background: '#FFF8E8',
            border: '1px solid #C9A46A',
            borderRadius: 8,
            padding: '5px 12px',
            fontSize: 12,
            fontWeight: 700,
            color: '#5C3D1E',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          ← 돌아가기
        </button>
        <span
          style={{
            fontSize: 17,
            fontWeight: 800,
            color: '#1a1a2e',
            letterSpacing: '-0.4px',
          }}
        >
          Rooms
        </span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          style={{
            background: '#B98236',
            color: '#FFF8E8',
            border: 'none',
            borderRadius: 8,
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          + 새 Room
        </button>
      </header>

      {/* Room 생성 패널 */}
      {showCreate && (
        <div
          style={{
            background: '#FFF8E8',
            borderBottom: '1px solid #C9A46A',
            flexShrink: 0,
          }}
        >
          <RoomCreate
            onCreated={handleCreated}
            onCancel={() => setShowCreate(false)}
          />
        </div>
      )}

      {/* 목록 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {loading && (
          <p
            style={{
              textAlign: 'center',
              color: '#7A5A35',
              fontSize: 14,
              paddingTop: 40,
            }}
          >
            불러오는 중...
          </p>
        )}

        {!loading && error && (
          <p
            style={{
              textAlign: 'center',
              color: '#e53e3e',
              fontSize: 14,
              paddingTop: 40,
            }}
          >
            {error}
          </p>
        )}

        {!loading && !error && rooms.length === 0 && (
          <p
            style={{
              textAlign: 'center',
              color: '#7A5A35',
              fontSize: 14,
              paddingTop: 40,
            }}
          >
            아직 Room이 없습니다. 새 Room을 만들어 보세요.
          </p>
        )}

        {!loading &&
          rooms.map((room) => (
            <button
              key={room.id}
              type="button"
              onClick={() => onSelectRoom(room.id)}
              style={{
                width: '100%',
                background: '#FFF8E8',
                border: '1px solid #C9A46A',
                borderRadius: 12,
                padding: '14px 16px',
                marginBottom: 10,
                textAlign: 'left',
                cursor: 'pointer',
                display: 'block',
              }}
            >
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: '#1a1a2e',
                  marginBottom: 4,
                  letterSpacing: '-0.3px',
                }}
              >
                {room.title}
              </div>
              {room.topic && (
                <div style={{ fontSize: 13, color: '#7A5A35', letterSpacing: '-0.2px' }}>
                  {room.topic}
                </div>
              )}
              <div style={{ fontSize: 11, color: '#A08060', marginTop: 6 }}>
                {new Date(room.createdAt).toLocaleDateString('ko-KR', {
                  month: 'short',
                  day: 'numeric',
                })}
              </div>
            </button>
          ))}
      </div>
    </div>
  );
}
