'use client';

import { useState } from 'react';
import Logo from './Logo';

interface HomeScreenProps {
  userName?: string;
  onSubmit: (text: string) => void;
  onOpenHistory?: () => void;
  onOpenMenu?: () => void;
}

export default function HomeScreen({ userName, onSubmit, onOpenHistory, onOpenMenu }: HomeScreenProps) {
  const examples = [
    { emoji: '💼', text: '출근이 너무 힘들어요' },
    { emoji: '📈', text: '삼성전자 어떻게 할까요?' },
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-5 py-3.5 flex items-center justify-between border-b border-gray-100">
        <Logo size="sm" />
        <div className="flex gap-3 text-gray-500">
          <button type="button" aria-label="History" onClick={onOpenHistory}>
            <i className="ti ti-history text-xl"></i>
          </button>
          <button type="button" aria-label="Menu" onClick={onOpenMenu}>
            <i className="ti ti-menu-2 text-xl"></i>
          </button>
        </div>
      </header>

      <div className="px-6 pt-8 pb-5">
        <p className="text-sm text-gray-500 mb-2">
          {userName ? `${userName} 님, 안녕하세요 👋` : '안녕하세요 👋'}
        </p>
        <h2
          className="text-[22px] font-bold text-gray-900 leading-tight"
          style={{ letterSpacing: '-0.5px' }}
        >
          오늘은 어떤 고민이<br />있으세요?
        </h2>
        <p className="text-[13px] text-gray-400 mt-3">AI 4명이 사랑방에서 기다려요</p>
      </div>

      <div className="px-5 pb-5">
        <div className="bg-gray-50 aspect-square rounded-2xl overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/scenes/personas-4.webp"
            alt="4명 페르소나"
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      <div className="px-5 pb-3">
        <p className="text-[13px] text-gray-500 mb-2.5 pl-1">자주 묻는 질문</p>
        <div className="space-y-2">
          {examples.map((ex, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSubmit(ex.text)}
              className="w-full text-left px-4 py-3.5 bg-gray-50 rounded-xl text-sm text-gray-700 active:bg-gray-100 transition-colors"
            >
              {ex.emoji} {ex.text}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1"></div>

      <div className="px-5 pt-4 pb-6 border-t border-gray-100">
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
