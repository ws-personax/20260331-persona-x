'use client';

import { useState } from 'react';
import Logo from './Logo';

interface HomeScreenProps {
  userName?: string;
  onSubmit: (text: string) => void;
  onOpenHistory?: () => void;
  onOpenMenu?: () => void;
}

export default function HomeScreen({ onSubmit }: HomeScreenProps) {
  const examples = [
    { emoji: '💼', text: '출근이 너무 힘들어요', bg: '#FFF7E0', accent: '#F59E0B' },
    { emoji: '📈', text: '삼성전자 어떻게 할까요?', bg: '#E0F2FE', accent: '#0EA5E9' },
    { emoji: '😴', text: '잠이 안 와요', bg: '#F3E8FF', accent: '#A855F7' },
  ];

  return (
    <div className="h-[100dvh] bg-[#F5EFE0] flex flex-col overflow-hidden">
      {/* 헤더 */}
      <header className="px-5 py-3.5 flex-shrink-0 flex items-center">
        <Logo size="sm" />
      </header>

      {/* 메인 콘텐츠 - 상단 정렬 */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ minHeight: 0 }}>
        {/* 타이틀 + 부제 */}
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
            오늘은 어떤 고민이 있으세요?
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
            4명이 충돌하고, 당신이 결정합니다
          </p>
        </div>

        {/* 4명 페르소나 이미지 */}
        <div
          className="flex justify-center flex-shrink-0"
          style={{ padding: '0 20px 32px' }}
        >
          <div
            className="w-full aspect-square overflow-hidden bg-gray-50"
            style={{ maxWidth: '260px', borderRadius: '20px' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/scenes/personas-4.webp"
              alt="4명 페르소나"
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* 자주 묻는 질문 카드 - 3개 가로 배열, 컬러 다양 */}
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

        {/* 카드 아래 빈 공간 */}
        <div className="flex-1"></div>
      </div>

      {/* 입력창 - 하단 고정, 크고 눈에 띄게 */}
      <div
        className="flex-shrink-0"
        style={{
          padding: '12px 16px',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
        }}
      >
        <InputBar onSubmit={onSubmit} />
      </div>
    </div>
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
        background: '#ffffff',
        border: '2px solid #1a1a2e',
        borderRadius: '24px',
        padding: '10px 12px 10px 18px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
      }}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit();
        }}
        placeholder="오늘 어떠세요?"
        style={{
          flex: 1,
          background: 'transparent',
          outline: 'none',
          border: 'none',
          fontSize: '16px',
          padding: '10px 0',
          color: '#1a1a2e',
          letterSpacing: '-0.3px',
          minWidth: 0,
        }}
      />
      <button
        type="button"
        aria-label="Voice"
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          background: '#f7f7fa',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="9" y="2" width="6" height="12" rx="3" fill="#6b7280" />
          <path
            d="M5 11v1a7 7 0 0 0 14 0v-1"
            stroke="#6b7280"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <line
            x1="12"
            y1="19"
            x2="12"
            y2="22"
            stroke="#6b7280"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <line
            x1="9"
            y1="22"
            x2="15"
            y2="22"
            stroke="#6b7280"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <button
        type="button"
        onClick={handleSubmit}
        style={{
          background: '#FEE500',
          color: '#191919',
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
