'use client';

import Logo from './Logo';

interface LoginScreenProps {
  onKakaoLogin: () => void;
  onGoogleLogin: () => void;
  onSkip: () => void;
}

export default function LoginScreen({ onKakaoLogin, onGoogleLogin, onSkip }: LoginScreenProps) {
  return (
    <div className="h-[100dvh] bg-white flex flex-col px-5 overflow-hidden">
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

      {/* 하단: 3 buttons 세로 배열 */}
      <div className="flex flex-col gap-3 pb-6">
        <button
          type="button"
          onClick={onKakaoLogin}
          className="w-full h-[58px] bg-[#FEE500] rounded-2xl flex items-center justify-center gap-3 active:scale-[0.98] transition-transform"
          style={{ paddingLeft: '20px', paddingRight: '20px' }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 3C7.03 3 3 6.14 3 10c0 2.5 1.65 4.7 4.13 5.97L6 21l5.27-3.5c.24.02.48.03.73.03 4.97 0 9-3.14 9-7s-4.03-7-9-7Z"
              fill="#191919"
            />
          </svg>
          <span style={{ fontSize: '17px', fontWeight: 700, color: '#191919', letterSpacing: '-0.3px' }}>
            카카오로 시작하기
          </span>
        </button>

        <button
          type="button"
          onClick={onGoogleLogin}
          className="w-full h-[58px] bg-white border-[1.5px] border-gray-200 rounded-2xl flex items-center justify-center gap-3 active:scale-[0.98] transition-transform"
          style={{ paddingLeft: '20px', paddingRight: '20px' }}
        >
          <svg width="22" height="22" viewBox="0 0 48 48">
            <path
              d="M44.5 20H24v8.5h11.8C34.7 33.9 30 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"
              fill="#FFC107"
            />
            <path
              d="M6.3 14.7l7 5.1C15.3 15.1 19.3 12 24 12c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 15.8 3 8.5 7.7 6.3 14.7z"
              fill="#FF3D00"
            />
            <path
              d="M24 45c5.5 0 10.4-2 14.1-5.4l-6.5-5.5c-2 1.4-4.5 2.3-7.6 2.3-6 0-10.6-3-12-7.5l-7 5.4C8.2 40.2 15.5 45 24 45z"
              fill="#4CAF50"
            />
            <path
              d="M44.5 20H24v8.5h11.8c-1.1 3.1-3.6 5.7-6.8 7.1l6.5 5.5C40 38 45 32 45 24c0-1.3-.2-2.7-.5-4z"
              fill="#1976D2"
            />
          </svg>
          <span style={{ fontSize: '17px', fontWeight: 600, color: '#1a1a2e', letterSpacing: '-0.3px' }}>
            Google로 시작하기
          </span>
        </button>

        <button
          type="button"
          onClick={onSkip}
          className="w-full h-[58px] bg-gray-50 rounded-2xl flex items-center justify-center gap-3 active:scale-[0.98] transition-transform"
          style={{ paddingLeft: '20px', paddingRight: '20px' }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M9 6L15 12L9 18"
              stroke="#4a4a5a"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span style={{ fontSize: '16px', fontWeight: 600, color: '#4a4a5a', letterSpacing: '-0.3px' }}>
            로그인 없이 시작하기
          </span>
        </button>

        <p
          className="text-center pt-1"
          style={{ fontSize: '12px', color: '#9a9aaa', letterSpacing: '-0.2px' }}
        >
          시작하면 이용약관에 동의하게 됩니다
        </p>
      </div>
    </div>
  );
}
