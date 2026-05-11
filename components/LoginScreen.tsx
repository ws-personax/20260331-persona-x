'use client';

import Logo from './Logo';

interface LoginScreenProps {
  onKakaoLogin: () => void;
  onGoogleLogin: () => void;
  onSkip: () => void;
}

export default function LoginScreen({ onKakaoLogin, onGoogleLogin, onSkip }: LoginScreenProps) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center px-6 py-8">
      <div className="flex justify-center mt-12 mb-10">
        <Logo size="md" />
      </div>

      <div className="text-center mb-12">
        <h1
          className="text-[32px] font-bold leading-tight mb-3"
          style={{ letterSpacing: '-0.5px', color: '#1a1a2e' }}
        >
          AI 사랑방
        </h1>
        <p className="text-[15px]" style={{ color: '#4a4a5a' }}>
          4명이 함께 듣고, 같이 생각합니다
        </p>
      </div>

      <div className="flex-1"></div>

      <div className="w-full flex gap-2 mb-6">
        <button
          type="button"
          onClick={onKakaoLogin}
          className="flex-1 h-16 bg-[#FEE500] rounded-xl flex flex-col items-center justify-center gap-1 font-semibold text-[12px] active:scale-[0.98] transition-transform"
          style={{ color: '#191919' }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 3C7.03 3 3 6.14 3 10c0 2.5 1.65 4.7 4.13 5.97L6 21l5.27-3.5c.24.02.48.03.73.03 4.97 0 9-3.14 9-7s-4.03-7-9-7Z"
              fill="#191919"
            />
          </svg>
          카카오
        </button>

        <button
          type="button"
          onClick={onGoogleLogin}
          className="flex-1 h-16 bg-white border-[1.5px] border-gray-200 rounded-xl flex flex-col items-center justify-center gap-1 font-medium text-[12px] active:scale-[0.98] transition-transform"
          style={{ color: '#1a1a2e' }}
        >
          <svg width="20" height="20" viewBox="0 0 48 48">
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
          Google
        </button>

        <button
          type="button"
          onClick={onSkip}
          className="flex-1 h-16 bg-gray-50 border-[1.5px] border-gray-200 rounded-xl flex flex-col items-center justify-center gap-1 font-medium text-[12px] active:scale-[0.98] transition-transform"
          style={{ color: '#4a4a5a' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M9 6L15 12L9 18"
              stroke="#4a4a5a"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          건너뛰기
        </button>
      </div>

      <p className="text-center text-xs" style={{ color: '#4a4a5a' }}>
        시작하면 이용약관에 동의하게 됩니다
      </p>
    </div>
  );
}
