'use client';

import { useEffect, useMemo, useState } from 'react';
import Splash from '@/components/Splash';
import LoginScreen from '@/components/LoginScreen';
import HomeScreen from '@/components/HomeScreen';
import ChatWindow from '@/components/ChatWindow';
import RoomList from '@/components/rooms/RoomList';
import RoomDetail from '@/components/rooms/RoomDetail';
import HistoryModal from '@/components/HistoryModal';
import { createClient } from '@/lib/supabase/client';

type Stage = 'splash' | 'login' | 'home' | 'chat' | 'rooms' | 'room-detail';
type SessionUser = { name?: string | null; email?: string | null } | null;

export default function Page() {
  const supabase = useMemo(() => createClient(), []);
  const [stage, setStage] = useState<Stage>('splash');
  const [user, setUser] = useState<SessionUser>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [initialMessage, setInitialMessage] = useState<string | undefined>(undefined);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // ✅ 기존 Supabase + 카카오 세션 체크 — AuthButton과 동일 로직
  useEffect(() => {
    let mounted = true;

    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      if (data.user) {
        setUser({
          email: data.user.email,
          name: (data.user.user_metadata?.name as string) || data.user.email,
        });
        return;
      }
      // Supabase 세션 없음 → 카카오 세션 확인
      try {
        const res = await fetch('/api/auth/kakao/me', { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as {
          user: { nickname?: string | null; email?: string | null } | null;
        };
        if (!mounted) return;
        if (json.user) {
          setUser({ name: json.user.nickname, email: json.user.email });
        }
      } catch {
        /* 비로그인 — 무시 */
      }
    };

    loadUser().finally(() => {
      if (mounted) setAuthChecked(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!mounted) return;
      if (session?.user) {
        setUser({
          email: session.user.email,
          name: (session.user.user_metadata?.name as string) || session.user.email,
        });
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  // ✅ 카카오 OAuth — AuthButton과 동일 (서버사이드 시작 엔드포인트)
  const onKakaoLogin = () => {
    window.location.href = '/api/auth/kakao/start';
  };

  // ✅ Google OAuth — supabase signInWithOAuth, redirectTo /auth/callback
  const onGoogleLogin = async () => {
    const redirectTo = `${window.location.origin}/auth/callback`;
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
  };

  if (stage === 'splash') {
    return (
      <Splash
        onComplete={() => {
          // splash 끝났을 때 세션 체크가 안 끝났으면 잠시 더 splash 유지
          if (!authChecked) {
            setTimeout(() => setStage('rooms'), 300);
            return;
          }
          setStage('rooms');
        }}
      />
    );
  }

  if (stage === 'login') {
    return (
      <LoginScreen
        onKakaoLogin={onKakaoLogin}
        onGoogleLogin={onGoogleLogin}
        onSkip={() => setStage('rooms')}
      />
    );
  }

  if (stage === 'home') {
    return (
      <HomeScreen
        userName={user?.name ?? undefined}
        isGuest={!user}
        onSubmit={(text) => {
          setInitialMessage(text);
          setStage('chat');
        }}
        onOpenSignup={() => setStage('login')}
      />
    );
  }

  if (stage === 'rooms') {
    return (
      <RoomList
        onBack={() => setStage('home')}
        isGuest={!user}
        onStartChat={(text) => {
          setInitialMessage(text);
          setStage('chat');
        }}
        onOpenSignup={() => setStage('login')}
        onOpenHistory={() => setShowHistory(true)}
        onSelectRoom={(roomId) => {
          setSelectedRoomId(roomId);
          setStage('room-detail');
        }}
      />
    );
  }

  if (stage === 'room-detail' && selectedRoomId) {
    return (
      <RoomDetail
        roomId={selectedRoomId}
        onBack={() => setStage('rooms')}
      />
    );
  }

  return (
    <>
      <main>
        <ChatWindow initialMessage={initialMessage} />
      </main>
      {showHistory && <HistoryModal onClose={() => setShowHistory(false)} />}
    </>
  );
}
