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
    { emoji: '💼', text: '직장 고민' },
    { emoji: '📈', text: '주식 투자' },
    { emoji: '💝', text: '관계 고민' },
  ];

  return (
    <div className="h-[100dvh] bg-white flex flex-col overflow-hidden">
      {/* 헤더 */}
      <header className="px-5 py-3.5 flex-shrink-0 flex items-center">
        <Logo size="sm" />
      </header>

      {/* 메인 영역 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 타이틀 - 한 줄만 */}
        <div className="px-6 pt-8 pb-4 text-center">
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
        </div>

        {/* 4명 페르소나 이미지 - 축소 */}
        <div className="px-5 pb-4 flex justify-center">
          <div className="w-full max-w-[140px] aspect-square rounded-2xl overflow-hidden bg-gray-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/scenes/personas-4.webp"
              alt="4명 페르소나"
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* 자주 묻는 질문 카드 - 3개 가로 배열 */}
        <div className="px-5 pb-3 flex gap-2">
          {examples.map((ex, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSubmit(ex.text)}
              className="flex-1 flex flex-col items-center justify-center py-3 px-2 bg-gray-50 rounded-xl active:bg-gray-100 transition-colors gap-1"
            >
              <span style={{ fontSize: '22px' }}>{ex.emoji}</span>
              <span
                style={{
                  fontSize: '12px',
                  color: '#4a4a5a',
                  letterSpacing: '-0.2px',
                  whiteSpace: 'nowrap',
                  fontWeight: 600,
                }}
              >
                {ex.text}
              </span>
            </button>
          ))}
        </div>

        <div className="flex-1"></div>

        {/* 입력창 */}
        <div className="px-5 pt-3 pb-6 flex-shrink-0">
          <InputBar onSubmit={onSubmit} />
        </div>
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
    <div className="flex items-center gap-2.5 bg-white border-[1.5px] border-gray-300 rounded-2xl px-3.5 py-3">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit();
        }}
        placeholder="오늘 어떠세요?"
        className="flex-1 bg-transparent outline-none text-[15px]"
      />
      <button type="button" aria-label="Voice">
        <i className="ti ti-microphone text-xl text-gray-500"></i>
      </button>
      <button
        type="button"
        onClick={handleSubmit}
        className="bg-[#7F77DD] text-white text-sm font-semibold rounded-xl px-4 py-2"
      >
        시작
      </button>
    </div>
  );
}
