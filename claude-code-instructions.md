PersonaX 첫 화면을 한국 1등 앱(토스/카카오뱅크) 스타일로 완전히 리뉴얼해줘.

## 0. 작업 시작 전 GitHub 백업 (필수)
먼저 현재 상태를 GitHub에 백업한 후 작업 시작:
1. git status로 현재 변경사항 확인
2. 변경사항이 있다면:
   git add -A
   git commit -m "backup: 첫 화면 리뉴얼 작업 시작 전 백업 (2026-05-11)"
   git push origin main
3. 백업 푸시 성공 확인 후에 다음 단계 진행

## 0-1. 작업 전 확인
- 기존 첫 화면 컴포넌트 위치 파악 (app/page.tsx 또는 components/)
- public/scenes/ 폴더 확인, 없으면 생성
- 4명 페르소나 이미지 파일 경로 확인 (personas-4.webp 또는 비슷한 이름)

## 1. Pretendard + Space Grotesk 폰트 설치

app/layout.tsx 수정:
- import 추가: import { Space_Grotesk } from "next/font/google"
- const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], weight: ['500','600','700'], variable: '--font-space-grotesk' })
- <html> className에 ${spaceGrotesk.variable} 추가
- <head>에 Pretendard CDN 추가:
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/[email protected]/dist/web/static/pretendard.css"/>
- Tabler Icons CDN도 추가:
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/[email protected]/dist/tabler-icons.min.css"/>

app/globals.css에 추가:
body {
  font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif;
  background: #ffffff;
  color: #0a0a0f;
}
@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
.animate-fade-in {
  animation: fadeIn 0.8s ease-out;
}

## 2. PersonaX 로고 공통 컴포넌트 생성

components/Logo.tsx 새 파일 생성:

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
}

export default function Logo({ size = 'md' }: LogoProps) {
  const sizes = {
    sm: { font: 20, xSize: 28 },
    md: { font: 32, xSize: 40 },
    lg: { font: 44, xSize: 56 }
  };
  const { font, xSize } = sizes[size];
  
  return (
    <div className="inline-flex items-baseline gap-1">
      <span 
        style={{ 
          fontFamily: 'var(--font-space-grotesk), sans-serif',
          fontSize: `${font}px`,
          fontWeight: 600,
          letterSpacing: '-1.5px',
          color: '#0a0a0f'
        }}
      >
        Persona
      </span>
      <svg viewBox="0 0 60 60" style={{ width: xSize, height: xSize }}>
        <defs>
          <linearGradient id="x-line1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#378ADD"/>
            <stop offset="50%" stopColor="#378ADD"/>
            <stop offset="50%" stopColor="#5F5E5A"/>
            <stop offset="100%" stopColor="#5F5E5A"/>
          </linearGradient>
          <linearGradient id="x-line2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#E24B4A"/>
            <stop offset="50%" stopColor="#E24B4A"/>
            <stop offset="50%" stopColor="#7F77DD"/>
            <stop offset="100%" stopColor="#7F77DD"/>
          </linearGradient>
        </defs>
        <line x1="12" y1="12" x2="48" y2="48" stroke="url(#x-line1)" strokeWidth="8" strokeLinecap="round"/>
        <line x1="48" y1="12" x2="12" y2="48" stroke="url(#x-line2)" strokeWidth="8" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

## 3. 1단계: 스플래시 화면 (1.5초)

components/Splash.tsx 새 파일 생성:

'use client';
import { useEffect } from 'react';
import Logo from './Logo';

export default function Splash({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 1500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 bg-white flex items-center justify-center z-50">
      <div className="animate-fade-in">
        <Logo size="lg" />
      </div>
    </div>
  );
}

## 4. 2단계: 로그인 화면

components/LoginScreen.tsx 새 파일 생성:

'use client';
import Logo from './Logo';

interface LoginScreenProps {
  onKakaoLogin: () => void;
  onGoogleLogin: () => void;
}

export default function LoginScreen({ onKakaoLogin, onGoogleLogin }: LoginScreenProps) {
  return (
    <div className="min-h-screen bg-white flex flex-col px-6 py-8">
      <div className="flex justify-center mt-12 mb-10">
        <Logo size="md" />
      </div>
      
      <div className="text-center mb-12">
        <h1 className="text-[32px] font-bold text-gray-900 leading-tight mb-3" style={{letterSpacing: '-0.5px'}}>
          AI 사랑방
        </h1>
        <p className="text-[15px] text-gray-500">
          4명이 함께 듣고, 같이 생각합니다
        </p>
      </div>

      <div className="flex-1"></div>

      <div className="space-y-3 mb-6">
        <button
          onClick={onKakaoLogin}
          className="w-full h-14 bg-[#FEE500] rounded-xl flex items-center justify-center gap-2.5 font-semibold text-[16px] text-[#191919] active:scale-[0.98] transition-transform"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 3C7.03 3 3 6.14 3 10c0 2.5 1.65 4.7 4.13 5.97L6 21l5.27-3.5c.24.02.48.03.73.03 4.97 0 9-3.14 9-7s-4.03-7-9-7Z" fill="#191919"/>
          </svg>
          카카오로 시작하기
        </button>
        
        <button
          onClick={onGoogleLogin}
          className="w-full h-14 bg-white border-[1.5px] border-gray-200 rounded-xl flex items-center justify-center gap-2.5 font-medium text-[16px] text-gray-900 active:scale-[0.98] transition-transform"
        >
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path d="M44.5 20H24v8.5h11.8C34.7 33.9 30 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z" fill="#FFC107"/>
            <path d="M6.3 14.7l7 5.1C15.3 15.1 19.3 12 24 12c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 15.8 3 8.5 7.7 6.3 14.7z" fill="#FF3D00"/>
            <path d="M24 45c5.5 0 10.4-2 14.1-5.4l-6.5-5.5c-2 1.4-4.5 2.3-7.6 2.3-6 0-10.6-3-12-7.5l-7 5.4C8.2 40.2 15.5 45 24 45z" fill="#4CAF50"/>
            <path d="M44.5 20H24v8.5h11.8c-1.1 3.1-3.6 5.7-6.8 7.1l6.5 5.5C40 38 45 32 45 24c0-1.3-.2-2.7-.5-4z" fill="#1976D2"/>
          </svg>
          Google로 시작하기
        </button>
      </div>

      <p className="text-center text-xs text-gray-400">
        시작하면 이용약관에 동의하게 됩니다
      </p>
    </div>
  );
}

## 5. 3단계: 홈 화면

components/HomeScreen.tsx 새 파일 생성:

'use client';
import { useState } from 'react';
import Logo from './Logo';

interface HomeScreenProps {
  userName?: string;
  onSubmit: (text: string) => void;
}

export default function HomeScreen({ userName, onSubmit }: HomeScreenProps) {
  const examples = [
    { emoji: '💼', text: '출근이 너무 힘들어요' },
    { emoji: '📈', text: '삼성전자 어떻게 할까요?' }
  ];
  
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-5 py-3.5 flex items-center justify-between border-b border-gray-100">
        <Logo size="sm" />
        <div className="flex gap-3 text-gray-500">
          <button aria-label="History"><i className="ti ti-history text-xl"></i></button>
          <button aria-label="Menu"><i className="ti ti-menu-2 text-xl"></i></button>
        </div>
      </header>

      <div className="px-6 pt-8 pb-5">
        <p className="text-sm text-gray-500 mb-2">안녕하세요 👋</p>
        <h2 className="text-[22px] font-bold text-gray-900 leading-tight" style={{letterSpacing: '-0.5px'}}>
          오늘은 어떤 고민이<br/>있으세요?
        </h2>
        <p className="text-[13px] text-gray-400 mt-3">AI 4명이 사랑방에서 기다려요</p>
      </div>

      <div className="px-5 pb-5">
        <div className="bg-gray-50 aspect-square rounded-2xl overflow-hidden">
          <img src="/scenes/personas-4.webp" alt="4명 페르소나" className="w-full h-full object-cover"/>
        </div>
      </div>

      <div className="px-5 pb-3">
        <p className="text-[13px] text-gray-500 mb-2.5 pl-1">자주 묻는 질문</p>
        <div className="space-y-2">
          {examples.map((ex, i) => (
            <button
              key={i}
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
        <InputBar onSubmit={onSubmit}/>
      </div>
    </div>
  );
}

function InputBar({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [value, setValue] = useState('');
  
  const handleSubmit = () => {
    if (value.trim()) {
      onSubmit(value);
      setValue('');
    }
  };
  
  return (
    <div className="flex items-center gap-2.5 bg-white border-[1.5px] border-gray-300 rounded-2xl px-3.5 py-3">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        placeholder="오늘 어떠세요?"
        className="flex-1 bg-transparent outline-none text-[15px]"
      />
      <button aria-label="Voice"><i className="ti ti-microphone text-xl text-gray-500"></i></button>
      <button
        onClick={handleSubmit}
        className="bg-[#7F77DD] text-white text-sm font-semibold rounded-xl px-4 py-2"
      >
        시작
      </button>
    </div>
  );
}

## 6. 메인 페이지 연결

app/page.tsx (또는 첫 화면 담당 파일) 수정:
- 기존 첫 화면 로직(슬라이드, 대나무 텍스트 등) 모두 제거
- 3단계 상태 관리 추가: 'splash' → 'login' → 'home'

'use client';
import { useState, useEffect } from 'react';
import Splash from '@/components/Splash';
import LoginScreen from '@/components/LoginScreen';
import HomeScreen from '@/components/HomeScreen';

export default function Page() {
  const [stage, setStage] = useState<'splash' | 'login' | 'home'>('splash');
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // 기존 Supabase 세션 체크 로직 활용
    // checkAuthSession().then(u => setUser(u));
  }, []);

  if (stage === 'splash') {
    return <Splash onComplete={() => setStage(user ? 'home' : 'login')} />;
  }
  
  if (stage === 'login') {
    return <LoginScreen 
      onKakaoLogin={() => {/* 기존 카카오 로그인 로직 연결 */}}
      onGoogleLogin={() => {/* 기존 Google 로그인 로직 연결 */}}
    />;
  }
  
  return <HomeScreen 
    userName={user?.name}
    onSubmit={(text) => {/* 채팅 화면으로 이동 + 메시지 전송 */}}
  />;
}

## 7. 빌드 및 배포

작업 완료 후:
1. npm run build 실행하고 에러 확인
2. TypeScript 에러 발생 시 자동 수정 (useState import, props 타입 등)
3. 로컬에서 npm run dev로 테스트
4. 모바일 반응형 확인 (Chrome DevTools)
5. git 커밋 & 푸시 (작업 완료 후 최종 푸시):
   git add -A
   git commit -m "feat: 첫 화면 전체 리뉴얼 - 스플래시/로그인/홈 3단계 분리, AI 사랑방 컨셉, 4색 X 로고, Pretendard 통일"
   git push origin main

## ⚠️ 중요 주의사항

1. 작업 시작 전 반드시 GitHub 백업 먼저 실행
2. 기존 로그인 로직 유지: Supabase 인증, 카카오/구글 OAuth 콜백 로직은 그대로 사용
3. NAVER_CLIENT_SECRET 절대 건드리지 말 것
4. 기존 채팅 화면(ChatWindow.tsx) 그대로 유지: 첫 화면만 변경
5. 이미지 파일 경로 확인: public/scenes/personas-4.webp (파일명 다르면 HomeScreen.tsx의 img src 수정)
6. onKakaoLogin, onGoogleLogin, onSubmit 함수에 기존 로직 연결 필요