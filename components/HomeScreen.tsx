'use client';

import { useEffect, useRef, useState } from 'react';

const SCENES = [
  '/images/intro/scene1-samsung.png',
  '/images/intro/scene2-work.png',
  '/images/intro/scene3-midlife.png',
];

const SLOGANS = [
  '말하면 4명이 충돌하고, 당신이 결정합니다',
  '지금 이 순간의 데이터로 4개의 관점이 부딪힙니다',
  'AI 대나무숲 — RAY, JACK, LUCIA, ECHO',
];

type Props = {
  onSubmit: (text: string) => void;
  onSetInput?: (text: string) => void;
  onStartRecording?: () => void;
  sttSupported?: boolean;
  rightSlot?: React.ReactNode;
};

export default function HomeScreen({
  onSubmit,
  onSetInput,
  onStartRecording,
  sttSupported,
  rightSlot,
}: Props) {
  const [input, setInput] = useState('');
  const [sceneIndex, setSceneIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const [sloganIndex, setSloganIndex] = useState(0);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setSceneIndex(i => (i + 1) % SCENES.length);
    }, 3800);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const target = SLOGANS[sloganIndex];
    setTyped('');
    let i = 0;
    const tick = () => {
      i += 1;
      setTyped(target.slice(0, i));
      if (i < target.length) {
        typingTimerRef.current = setTimeout(tick, 55);
      } else {
        typingTimerRef.current = setTimeout(() => {
          setSloganIndex(idx => (idx + 1) % SLOGANS.length);
        }, 2400);
      }
    };
    typingTimerRef.current = setTimeout(tick, 55);
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [sloganIndex]);

  const submit = () => {
    const t = input.trim();
    if (!t) return;
    if (onSetInput) onSetInput(t);
    onSubmit(t);
  };

  return (
    <div
      className="px-home-root"
      style={{
        position: 'relative',
        width: '100%',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background:
          'radial-gradient(ellipse at top, #1c1233 0%, #0a0a0f 55%, #050507 100%)',
        color: '#f3f4f6',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        boxSizing: 'border-box',
      }}
    >
      <style>{`
        @keyframes px-blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        .px-home-input::placeholder { color: rgba(243,244,246,0.45); }
        .px-home-input:focus {
          outline: none;
          border-color: rgba(165,180,252,0.6);
          background: rgba(255,255,255,0.08);
          box-shadow: 0 0 0 3px rgba(99,102,241,0.18);
        }
        .px-home-btn-primary:hover { filter: brightness(1.08); }
        .px-home-btn-ghost:hover { background: rgba(255,255,255,0.10); }
        @media (max-width: 480px) {
          .px-home-logo { font-size: 36px !important; }
          .px-home-slogan { font-size: 13px !important; }
        }
      `}</style>

      {/* 상단 바 — 로그인/히스토리 등 호스트가 주입 */}
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          padding: '14px 16px 0',
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 8,
          boxSizing: 'border-box',
        }}
      >
        {rightSlot}
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: 480,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '18px 20px 28px',
          gap: 18,
          boxSizing: 'border-box',
        }}
      >
        {/* 로고 */}
        <h1
          className="px-home-logo"
          style={{
            fontFamily:
              'var(--font-space-grotesk), "Space Grotesk", system-ui, sans-serif',
            fontWeight: 700,
            fontSize: 44,
            letterSpacing: '-0.02em',
            margin: '8px 0 0',
            lineHeight: 1.1,
            background:
              'linear-gradient(135deg, #ffffff 0%, #c4b5fd 55%, #a5b4fc 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          PersonaX
        </h1>

        {/* 타이핑 슬로건 */}
        <p
          className="px-home-slogan"
          style={{
            margin: 0,
            fontSize: 14.5,
            color: '#cbd5e1',
            textAlign: 'center',
            lineHeight: 1.55,
            minHeight: '1.55em',
            fontWeight: 500,
            padding: '0 8px',
            wordBreak: 'keep-all',
          }}
        >
          {typed}
          <span
            style={{
              display: 'inline-block',
              marginLeft: 2,
              animation: 'px-blink 1s steps(2) infinite',
              color: '#a5b4fc',
            }}
          >
            |
          </span>
        </p>

        {/* 이미지 슬라이드 */}
        <div
          className="relative w-full aspect-square overflow-hidden rounded-2xl"
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 360,
            aspectRatio: '1 / 1',
            borderRadius: 18,
            overflow: 'hidden',
            boxShadow:
              '0 18px 50px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06) inset',
            background: '#0f0a1f',
          }}
        >
          {SCENES.map((src, idx) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt={`Scene ${idx + 1}`}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transition: 'opacity 1000ms ease-in-out',
                opacity: sceneIndex === idx ? 1 : 0,
              }}
            />
          ))}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              background:
                'linear-gradient(180deg, rgba(10,10,15,0.05) 0%, rgba(10,10,15,0.55) 100%)',
            }}
          />
          {/* 슬라이드 인디케이터 */}
          <div
            style={{
              position: 'absolute',
              bottom: 12,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: 6,
            }}
          >
            {SCENES.map((_, idx) => (
              <span
                key={idx}
                style={{
                  width: sceneIndex === idx ? 18 : 6,
                  height: 6,
                  borderRadius: 999,
                  background:
                    sceneIndex === idx
                      ? 'rgba(255,255,255,0.85)'
                      : 'rgba(255,255,255,0.35)',
                  transition: 'all 400ms ease',
                }}
              />
            ))}
          </div>
        </div>

        {/* 입력창 */}
        <div style={{ width: '100%', maxWidth: 440, marginTop: 4 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="px-home-input"
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') submit();
              }}
              placeholder="무엇이든 물어보세요"
              style={{
                flex: 1,
                minWidth: 0,
                padding: '12px 14px',
                fontSize: 14,
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 12,
                background: 'rgba(255,255,255,0.05)',
                color: '#f3f4f6',
                boxSizing: 'border-box',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
              }}
            />
            {sttSupported && onStartRecording && (
              <button
                type="button"
                onClick={onStartRecording}
                aria-label="음성 입력"
                className="px-home-btn-ghost"
                style={{
                  padding: '10px 12px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 12,
                  color: '#f3f4f6',
                  cursor: 'pointer',
                  fontSize: 18,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                🎤
              </button>
            )}
            <button
              type="button"
              onClick={submit}
              className="px-home-btn-primary"
              style={{
                padding: '10px 18px',
                background:
                  'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                border: 'none',
                borderRadius: 12,
                color: '#ffffff',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: 13,
                whiteSpace: 'nowrap',
                boxShadow: '0 6px 18px rgba(99,102,241,0.35)',
                flexShrink: 0,
              }}
            >
              시작
            </button>
          </div>
          <p
            style={{
              fontSize: 11,
              color: 'rgba(203,213,225,0.55)',
              textAlign: 'center',
              margin: '10px 0 0',
              lineHeight: 1.4,
            }}
          >
            투자 권유·불법·욕설은 답변이 제한될 수 있어요
          </p>
        </div>
      </div>
    </div>
  );
}
