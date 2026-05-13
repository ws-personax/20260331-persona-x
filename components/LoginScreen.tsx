'use client';

import Logo from './Logo';

interface LoginScreenProps {
  onKakaoLogin: () => void;
  onGoogleLogin: () => void;
  onSkip: () => void;
}

export default function LoginScreen({ onKakaoLogin, onGoogleLogin, onSkip }: LoginScreenProps) {
  return (
    <div className="h-[100dvh] bg-[#E8DCC0] flex flex-col px-5 overflow-hidden">
      {/* 상단 영역: 비워둠 (균형용) */}
      <div className="h-12"></div>

      {/* 중앙 영역: 로고 + AI 사랑방 + 슬로건 */}
      <div className="flex-1 flex flex-col justify-center items-center gap-8">
        <Logo size="lg" />
        <div className="text-center">
          <h1
            style={{
              fontSize: 'clamp(40px, 11vw, 52px)',
              fontWeight: 900,
              letterSpacing: '-2.5px',
              color: '#1a1a2e',
              lineHeight: 1.05,
              marginBottom: '18px',
            }}
          >
            AI 사랑방
          </h1>
          <p
            style={{
              fontSize: 'clamp(15px, 4.2vw, 18px)',
              color: '#4a4a5a',
              letterSpacing: '-0.5px',
              fontWeight: 500,
            }}
          >
            4명이 함께 듣고, 같이 생각합니다
          </p>
        </div>
      </div>

      {/* 하단: 3 buttons 가로 배열 */}
      <div className="pb-6">
        <div className="flex gap-3">
          {/* 카카오 로그인 */}
          <button
            type="button"
            onClick={onKakaoLogin}
            className="flex-1 h-[58px] bg-[#FEE500] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            style={{ borderRadius: '16px' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 3C7.03 3 3 6.14 3 10c0 2.5 1.65 4.7 4.13 5.97L6 21l5.27-3.5c.24.02.48.03.73.03 4.97 0 9-3.14 9-7s-4.03-7-9-7Z"
                fill="#191919"
              />
            </svg>
            <span
              className="font-bold text-[#191919]"
              style={{ fontSize: '15px', letterSpacing: '-0.3px', whiteSpace: 'nowrap' }}
            >
              카카오 로그인
            </span>
          </button>

          {/* 구글 로그인 */}
          <button
            type="button"
            onClick={onGoogleLogin}
            className="flex-1 h-[58px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            style={{
              borderRadius: '16px',
              background: '#1A73E8',
              border: 'none',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
              <path
                d="M44.5 20H24v8.5h11.8C34.7 33.9 30 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"
                fill="#FFFFFF"
              />
            </svg>
            <span
              style={{
                fontSize: '15px',
                letterSpacing: '-0.3px',
                whiteSpace: 'nowrap',
                color: '#FFFFFF',
                fontWeight: 700,
              }}
            >
              구글 로그인
            </span>
          </button>

          {/* 건너뛰기 */}
          <button
            type="button"
            onClick={onSkip}
            className="flex-1 h-[58px] bg-gray-50 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            style={{
              borderRadius: '16px',
              border: '1.5px solid #e5e7eb',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 6L15 12L9 18"
                stroke="#4a4a5a"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span
              className="font-semibold"
              style={{ fontSize: '15px', color: '#4a4a5a', letterSpacing: '-0.3px', whiteSpace: 'nowrap' }}
            >
              건너뛰기
            </span>
          </button>
        </div>

        <p
          className="text-center pt-4"
          style={{ fontSize: '12px', color: '#9a9aaa', letterSpacing: '-0.2px' }}
        >
          시작하면 이용약관에 동의하게 됩니다
        </p>
      </div>
    </div>
  );
}
