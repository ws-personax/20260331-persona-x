'use client';

import { useEffect, useRef, useState } from 'react';
import type { Room, RoomMessage } from '@/lib/personax/room-types';
import RoomChatInput from './RoomChatInput';

const PERSONA_LABELS: Record<string, string> = {
  jack: 'JACK',
  ray: 'RAY',
  lucia: 'LUCIA',
  echo: 'ECHO',
};

const PERSONA_COLORS: Record<string, string> = {
  jack: '#B98236',
  ray: '#2563EB',
  lucia: '#9333EA',
  echo: '#059669',
};

interface RoomDetailProps {
  roomId: string;
  onBack: () => void;
}

export default function RoomDetail({ roomId, onBack }: RoomDetailProps) {
  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [roomRes, msgRes] = await Promise.all([
          fetch(`/api/rooms/${roomId}`, { cache: 'no-store' }),
          fetch(`/api/rooms/${roomId}/messages`, { cache: 'no-store' }),
        ]);

        if (!mounted) return;

        if (!roomRes.ok) {
          setError('Room을 찾을 수 없습니다');
          return;
        }

        const roomJson = await roomRes.json() as { room: Room };
        if (!mounted) return;
        setRoom(roomJson.room);

        if (msgRes.ok) {
          const msgJson = await msgRes.json() as { messages: RoomMessage[] };
          if (!mounted) return;
          setMessages(msgJson.messages ?? []);
        }
      } catch {
        if (mounted) setError('네트워크 오류');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchData();
    return () => { mounted = false; };
  }, [roomId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (content: string) => {
    const res = await fetch(`/api/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });

    if (!res.ok) return;

    const json = await res.json() as { message: RoomMessage; personaMessage?: RoomMessage };
    setMessages((prev) => {
      const next = [...prev, json.message];
      if (json.personaMessage) next.push(json.personaMessage);
      return next;
    });
  };

  if (loading) {
    return (
      <div
        style={{
          height: '100dvh',
          background: '#E8DCC0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <p style={{ color: '#7A5A35', fontSize: 14 }}>불러오는 중...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          height: '100dvh',
          background: '#E8DCC0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
        }}
      >
        <p style={{ color: '#e53e3e', fontSize: 14 }}>{error}</p>
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid #C9A46A',
            background: '#FFF8E8',
            color: '#5C3D1E',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          돌아가기
        </button>
      </div>
    );
  }

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
          borderBottom: '1px solid #C9A46A',
          background: '#E8DCC0',
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
            flexShrink: 0,
          }}
        >
          ← Rooms
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: '#1a1a2e',
              letterSpacing: '-0.4px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {room?.title}
          </div>
          {room?.topic && (
            <div
              style={{
                fontSize: 12,
                color: '#7A5A35',
                marginTop: 2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {room.topic}
            </div>
          )}
        </div>
      </header>

      {/* 메시지 목록 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {messages.length === 0 && (
          <p
            style={{
              textAlign: 'center',
              color: '#7A5A35',
              fontSize: 14,
              paddingTop: 40,
            }}
          >
            첫 메시지를 입력해 보세요.
          </p>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 입력창 */}
      <div
        style={{
          flexShrink: 0,
          padding: '12px 16px',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
        }}
      >
        <RoomChatInput onSend={handleSend} />
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: RoomMessage }) {
  const isUser = message.speakerType === 'user';
  const isPersona = message.speakerType === 'persona';
  const isSystem = message.speakerType === 'system';

  if (isSystem) {
    return (
      <div style={{ textAlign: 'center', margin: '8px 0' }}>
        <span
          style={{
            fontSize: 12,
            color: '#A08060',
            background: '#F3E4C6',
            borderRadius: 10,
            padding: '4px 10px',
          }}
        >
          {message.content}
        </span>
      </div>
    );
  }

  const personaKey = message.speakerKey ?? '';
  const personaLabel = PERSONA_LABELS[personaKey] ?? personaKey.toUpperCase();
  const personaColor = PERSONA_COLORS[personaKey] ?? '#B98236';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isUser ? 'row-reverse' : 'row',
        gap: 8,
        marginBottom: 12,
        alignItems: 'flex-end',
      }}
    >
      {isPersona && (
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            flexShrink: 0,
            background: personaColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            fontWeight: 800,
            color: '#fff',
            letterSpacing: '-0.2px',
          }}
        >
          {personaLabel[0]}
        </div>
      )}
      <div style={{ maxWidth: '72%' }}>
        {isPersona && (
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: personaColor,
              marginBottom: 3,
              letterSpacing: '-0.2px',
            }}
          >
            {personaLabel}
          </div>
        )}
        <div
          style={{
            background: isUser ? '#B98236' : '#FFF8E8',
            color: isUser ? '#FFF8E8' : '#1a1a2e',
            borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
            padding: '10px 14px',
            fontSize: 14,
            lineHeight: 1.5,
            letterSpacing: '-0.2px',
            wordBreak: 'break-word',
            border: isUser ? 'none' : '1px solid #C9A46A',
          }}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}
