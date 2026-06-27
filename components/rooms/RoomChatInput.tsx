'use client';

import { useState } from 'react';

interface RoomChatInputProps {
  onSend: (content: string) => Promise<void>;
}

export default function RoomChatInput({ onSend }: RoomChatInputProps) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const trimmed = value.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setValue('');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: '#FFF8E8',
        border: '2px solid #B98236',
        borderRadius: 24,
        padding: '10px 12px 10px 18px',
        boxShadow: '0 4px 12px rgba(92,61,30,0.12)',
      }}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) handleSend();
        }}
        placeholder="메시지를 입력하세요. @JACK @RAY @LUCIA @ECHO 를 호출할 수 있습니다."
        disabled={sending}
        style={{
          flex: 1,
          background: 'transparent',
          outline: 'none',
          border: 'none',
          fontSize: 16,
          padding: '10px 0',
          color: '#3F2F1D',
          letterSpacing: '-0.3px',
          minWidth: 0,
        }}
      />
      <button
        type="button"
        onClick={handleSend}
        disabled={!value.trim() || sending}
        style={{
          background: value.trim() && !sending ? '#B98236' : '#D4B483',
          color: '#FFF8E8',
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: '-0.3px',
          borderRadius: 20,
          padding: '10px 18px',
          border: 'none',
          cursor: value.trim() && !sending ? 'pointer' : 'default',
          flexShrink: 0,
        }}
      >
        {sending ? '전송 중...' : '전송'}
      </button>
    </div>
  );
}
