'use client';

import { useEffect, useState } from 'react';
import type { Room } from '@/lib/personax/room-types';
import RoomCreate from './RoomCreate';

interface RoomListProps {
  onBack: () => void;
  onSelectRoom: (roomId: string) => void;
  onStartChat: (text: string) => void;
  onOpenHistory: () => void;
}

export default function RoomList({ onBack, onSelectRoom, onStartChat, onOpenHistory }: RoomListProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [quickStart, setQuickStart] = useState('');

  const fetchRooms = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/rooms', { cache: 'no-store' });
      const json = (await res.json()) as { rooms?: Room[]; error?: string };
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

  useEffect(() => {
    fetchRooms();
  }, []);

  const handleCreated = (room: Room) => {
    setRooms((prev) => [room, ...prev]);
    setShowCreate(false);
  };

  const handleQuickStart = () => {
    const text = quickStart.trim();
    if (!text) return;
    onStartChat(text);
    setQuickStart('');
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
          기존 홈
        </button>
        <span
          style={{
            fontSize: 17,
            fontWeight: 800,
            color: '#1a1a2e',
            letterSpacing: '-0.4px',
          }}
        >
          채팅
        </span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onOpenHistory}
          style={{
            background: '#FFF8E8',
            color: '#5C3D1E',
            border: '1px solid #C9A46A',
            borderRadius: 8,
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          기록
        </button>
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
          + 새 채팅방
        </button>
      </header>

      <div style={{ padding: '0 16px 12px' }}>
        <div
          style={{
            background: '#FFF8E8',
            border: '1px solid #C9A46A',
            borderRadius: 16,
            padding: '14px 14px 12px',
            boxShadow: '0 4px 12px rgba(92,61,30,0.06)',
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: '#1a1a2e',
              marginBottom: 4,
              letterSpacing: '-0.3px',
            }}
          >
            1:1 Persona 시작
          </div>
          <p style={{ fontSize: 12, color: '#7A5A35', margin: '0 0 10px', lineHeight: 1.4 }}>
            지금 고민을 적고 바로 대화를 시작하세요.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={quickStart}
              onChange={(e) => setQuickStart(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleQuickStart();
              }}
              placeholder="지금 고민을 적어보세요"
              style={{
                flex: 1,
                minWidth: 0,
                background: '#fff',
                border: '1px solid #D7B67A',
                borderRadius: 12,
                padding: '10px 12px',
                fontSize: 14,
                color: '#3F2F1D',
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={handleQuickStart}
              disabled={!quickStart.trim()}
              style={{
                background: quickStart.trim() ? '#B98236' : '#D4B483',
                color: '#FFF8E8',
                border: 'none',
                borderRadius: 12,
                padding: '0 14px',
                minWidth: 72,
                fontSize: 13,
                fontWeight: 800,
                cursor: quickStart.trim() ? 'pointer' : 'default',
                whiteSpace: 'nowrap',
              }}
            >
              시작
            </button>
          </div>
        </div>
      </div>

      {showCreate && (
        <div
          style={{
            background: '#FFF8E8',
            borderBottom: '1px solid #C9A46A',
            flexShrink: 0,
          }}
        >
          <RoomCreate onCreated={handleCreated} onCancel={() => setShowCreate(false)} />
        </div>
      )}

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
          <div
            style={{
              textAlign: 'center',
              color: '#7A5A35',
              fontSize: 14,
              paddingTop: 28,
              paddingBottom: 20,
            }}
          >
            <div style={{ marginBottom: 10 }}>첫 번째 채팅방을 만들어 보세요.</div>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              style={{
                background: '#B98236',
                color: '#FFF8E8',
                border: 'none',
                borderRadius: 10,
                padding: '10px 14px',
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              새 채팅방 만들기
            </button>
          </div>
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
