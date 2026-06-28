'use client';

import { useState } from 'react';

interface RoomChatInputProps {
  onSend: (content: string) => Promise<void>;
}

type PersonaCard = {
  key: 'jack' | 'lucia' | 'ray' | 'echo';
  label: string;
  status: string;
  locked: boolean;
  highlight: string;
  description: string;
  bullets: string[];
  callout: string;
};

const PERSONAS: PersonaCard[] = [
  {
    key: 'jack',
    label: 'JACK',
    status: '사용 가능',
    locked: false,
    highlight: '#B98236',
    description: '책임과 선택, 실행을 빠르게 정리하는 판단형 Persona입니다.',
    bullets: ['책임과 선택 정리', '실행 우선순위 정리', '현실적인 다음 행동'],
    callout: '@JACK',
  },
  {
    key: 'lucia',
    label: 'LUCIA',
    status: '사용 가능',
    locked: false,
    highlight: '#9333EA',
    description: '감정과 회복, 관계의 온도를 부드럽게 읽어주는 Persona입니다.',
    bullets: ['감정 정리', '관계 회복', '공감과 정서적 지지'],
    callout: '@LUCIA',
  },
  {
    key: 'ray',
    label: 'RAY',
    status: '?? Premium',
    locked: true,
    highlight: '#2563EB',
    description: '데이터 기반 분석과 반대 의견 검토로 결정을 검증합니다.',
    bullets: ['데이터 기반 분석', '반대 의견 검토', '의사결정 검증'],
    callout: 'Premium Persona',
  },
  {
    key: 'echo',
    label: 'ECHO',
    status: '?? Premium',
    locked: true,
    highlight: '#059669',
    description: '반복 패턴과 장기 흐름을 짚어내는 구조적 통찰 Persona입니다.',
    bullets: ['반복 패턴 분석', '장기 관점', '삶의 흐름 통찰'],
    callout: 'Premium Persona',
  },
];

export default function RoomChatInput({ onSend }: RoomChatInputProps) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [premiumPersona, setPremiumPersona] = useState<PersonaCard | null>(null);

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

  const insertPersonaCall = (callout: string) => {
    setValue((current) => {
      const trimmed = current.trim();
      if (!trimmed) return `${callout} `;
      if (trimmed.includes(callout)) return current;
      return `${callout} ${current}`.replace(/\s+/g, ' ');
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 8,
        }}
      >
        {PERSONAS.map((persona) => (
          <button
            key={persona.key}
            type="button"
            onClick={() => {
              if (persona.locked) {
                setPremiumPersona(persona);
                return;
              }
              insertPersonaCall(persona.callout);
            }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 4,
              background: persona.locked ? '#FFF7ED' : '#FFF8E8',
              border: `1px solid ${persona.highlight}`,
              borderRadius: 16,
              padding: '10px 12px',
              boxShadow: '0 2px 8px rgba(92,61,30,0.08)',
              cursor: 'pointer',
              minHeight: 78,
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: '#1f2937', letterSpacing: '-0.3px' }}>
                {persona.label}
              </span>
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: 11,
                  fontWeight: 800,
                  color: persona.locked ? persona.highlight : '#7A5A35',
                }}
              >
                {persona.status}
              </span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#5C3D1E', lineHeight: 1.35 }}>
              {persona.locked ? '잠금 해제 전 미리보기' : '호출하기'}
            </div>
          </button>
        ))}
      </div>

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

      {premiumPersona && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setPremiumPersona(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(31, 41, 55, 0.45)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            zIndex: 60,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 420,
              background: '#FFF8E8',
              borderRadius: 24,
              border: '1px solid #D7B67A',
              boxShadow: '0 16px 40px rgba(31,41,55,0.18)',
              padding: 18,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: '#B98236', marginBottom: 8 }}>
              Premium Persona
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#1f2937', letterSpacing: '-0.5px' }}>
              {premiumPersona.label}
            </div>
            <p style={{ margin: '8px 0 14px', fontSize: 14, lineHeight: 1.6, color: '#5C3D1E' }}>
              {premiumPersona.description}
            </p>
            <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
              {premiumPersona.bullets.map((bullet) => (
                <div
                  key={bullet}
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid #E6CFA6',
                    borderRadius: 14,
                    padding: '10px 12px',
                    fontSize: 13,
                    color: '#3F2F1D',
                    fontWeight: 600,
                  }}
                >
                  {bullet}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPremiumPersona(null)}
              style={{
                width: '100%',
                background: '#B98236',
                color: '#FFF8E8',
                border: 'none',
                borderRadius: 18,
                padding: '12px 16px',
                fontSize: 14,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              더 깊은 통찰 알아보기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
