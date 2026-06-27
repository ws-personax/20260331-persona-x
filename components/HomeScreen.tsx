'use client';

import { useState } from 'react';
import AuthButton from './AuthButton';
import HistoryModal from './HistoryModal';
import Logo from './Logo';
import ReviewCard from './ReviewCard';

interface HomeScreenProps {
  userName?: string;
  onSubmit: (text: string) => void;
  onOpenHistory?: () => void;
  onOpenMenu?: () => void;
}

export default function HomeScreen({ onSubmit, onOpenHistory }: HomeScreenProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [selectedReviewConversationId, setSelectedReviewConversationId] = useState<string | null>(null);

  const openHistory = () => {
    setSelectedReviewConversationId(null);
    if (onOpenHistory) {
      onOpenHistory();
      return;
    }
    setShowHistory(true);
  };

  const openReviewConversation = (conversationId: string) => {
    setSelectedReviewConversationId(conversationId);
    setShowHistory(true);
  };

  const closeHistory = () => {
    setShowHistory(false);
    setSelectedReviewConversationId(null);
  };

  const examples = [
    { emoji: '🏢', text: '창업 vs 취업, 어떻게 봐야 할까요?', bg: '#FFF7E0', accent: '#F59E0B' },
    { emoji: '💼', text: '이직 시점, 지금이 맞을까요?', bg: '#E0F2FE', accent: '#0EA5E9' },
    { emoji: '💜', text: '사람을 계속 만나도 될지 고민돼요.', bg: '#F3E8FF', accent: '#A855F7' },
  ];

  return (
    <>
      <div className="h-[100dvh] bg-[#E8DCC0] flex flex-col overflow-hidden">
        <header className="px-5 py-3.5 flex-shrink-0 flex items-center justify-between">
          <Logo size="sm" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <AuthButton />
            <button
              type="button"
              onClick={openHistory}
              style={{
                background: '#FFF8E8',
                padding: '5px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                color: '#5C3D1E',
                border: '1px solid #C9A46A',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                cursor: 'pointer',
                touchAction: 'manipulation',
              }}
            >
              History
            </button>
          </div>
        </header>

        <div className="flex-1 flex flex-col overflow-hidden" style={{ minHeight: 0 }}>
          <div className="text-center flex-shrink-0" style={{ padding: '12px 24px 16px' }}>
            <h2
              className="font-black"
              style={{
                fontSize: '24px',
                letterSpacing: '-0.5px',
                lineHeight: '1.3',
                color: '#1a1a2e',
              }}
            >
              오늘은 어떤 고민이 있으신가요?
            </h2>
            <p
              style={{
                fontSize: '14px',
                color: '#4a4a5a',
                letterSpacing: '-0.3px',
                marginTop: '8px',
                fontWeight: 500,
              }}
            >
              4명의 관점이 충돌하고, 당신의 결정을 정리합니다.
            </p>
          </div>

          <div className="flex flex-col items-center flex-shrink-0" style={{ padding: '0 20px 32px' }}>
            <div
              className="w-full aspect-square overflow-hidden bg-gray-50"
              style={{ maxWidth: '260px', borderRadius: '20px' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/personas/persona-roles-v2.webp"
                alt="4명의 역할"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          <div className="flex flex-shrink-0" style={{ padding: '0 16px', gap: '10px' }}>
            {examples.map((ex, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onSubmit(ex.text)}
                className="flex-1 flex flex-col items-center justify-center active:scale-[0.98] transition-transform"
                style={{
                  background: ex.bg,
                  borderRadius: '20px',
                  padding: '22px 8px',
                  minHeight: '140px',
                  border: 'none',
                  cursor: 'pointer',
                  gap: '10px',
                }}
              >
                <span style={{ fontSize: '32px', lineHeight: 1 }}>{ex.emoji}</span>
                <span
                  style={{
                    fontSize: '12px',
                    color: '#1a1a2e',
                    letterSpacing: '-0.3px',
                    fontWeight: 700,
                    lineHeight: 1.35,
                    textAlign: 'center',
                    wordBreak: 'keep-all',
                  }}
                >
                  {ex.text}
                </span>
              </button>
            ))}
          </div>

          <div className="flex-1"></div>
        </div>

        <div
          className="flex-shrink-0"
          style={{
            padding: '12px 16px',
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
          }}
        >
          <InputBar onSubmit={onSubmit} />
        </div>

        <div className="flex-shrink-0" style={{ paddingTop: 4 }}>
          <ReviewCard onOpenHistory={openHistory} onOpenConversation={openReviewConversation} />
        </div>
      </div>
      {showHistory && (
        <HistoryModal onClose={closeHistory} initialConversationId={selectedReviewConversationId ?? undefined} />
      )}
    </>
  );
}

function InputBar({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [value, setValue] = useState('');

  const handleSubmit = () => {
    const t = value.trim();
    if (!t) return;
    onSubmit(t);
    setValue('');
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        background: '#FFF8E8',
        border: '2px solid #B98236',
        borderRadius: '24px',
        padding: '10px 12px 10px 18px',
        boxShadow: '0 4px 12px rgba(92,61,30,0.12)',
      }}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit();
        }}
        placeholder="지금 가장 고민되는 것을 적어보세요"
        style={{
          flex: 1,
          background: 'transparent',
          outline: 'none',
          border: 'none',
          fontSize: '16px',
          padding: '10px 0',
          color: '#3F2F1D',
          letterSpacing: '-0.3px',
          minWidth: 0,
        }}
      />
      <button
        type="button"
        onClick={handleSubmit}
        style={{
          background: '#B98236',
          color: '#FFF8E8',
          fontSize: '15px',
          fontWeight: 800,
          letterSpacing: '-0.3px',
          borderRadius: '20px',
          padding: '12px 20px',
          border: 'none',
          cursor: 'pointer',
          flexShrink: 0,
          boxShadow: '0 4px 12px rgba(254,229,0,0.4)',
        }}
      >
        시작
      </button>
    </div>
  );
}
