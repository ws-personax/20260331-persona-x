'use client';

import { useState } from 'react';
import type { Room } from '@/lib/personax/room-types';

interface RoomCreateProps {
  onCreated: (room: Room) => void;
  onCancel: () => void;
}

export default function RoomCreate({ onCreated, onCancel }: RoomCreateProps) {
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmedTitle, topic: topic.trim() || undefined }),
      });

      const json = (await res.json()) as { room?: Room; error?: string };

      if (!res.ok) {
        setError(json.error ?? '채팅방 생성에 실패했습니다.');
        return;
      }

      if (json.room) onCreated(json.room);
    } catch {
      setError('네트워크 오류');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 10,
    border: '1.5px solid #C9A46A',
    fontSize: 15,
    color: '#3F2F1D',
    background: '#FFF8E8',
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ padding: '20px 16px' }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', marginBottom: 16, marginTop: 0 }}>
        새 채팅방 만들기
      </h3>

      <div style={{ marginBottom: 12 }}>
        <input
          type="text"
          placeholder="채팅방 제목 *"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate();
          }}
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="주제 (선택)"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          style={inputStyle}
        />
      </div>

      {error && (
        <p style={{ color: '#e53e3e', fontSize: 13, marginBottom: 12 }}>{error}</p>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            flex: 1,
            padding: '12px',
            borderRadius: 10,
            border: '1.5px solid #C9A46A',
            background: '#FFF8E8',
            color: '#5C3D1E',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={!title.trim() || loading}
          style={{
            flex: 2,
            padding: '12px',
            borderRadius: 10,
            border: 'none',
            background: title.trim() && !loading ? '#B98236' : '#D4B483',
            color: '#FFF8E8',
            fontSize: 14,
            fontWeight: 700,
            cursor: title.trim() && !loading ? 'pointer' : 'default',
          }}
        >
          {loading ? '만드는 중...' : '만들기'}
        </button>
      </div>
    </div>
  );
}
