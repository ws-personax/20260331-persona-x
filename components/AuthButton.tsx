'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type AuthUser = {
  email?: string | null;
};

type KakaoUser = {
  id: number;
  email?: string | null;
  nickname?: string | null;
  profileImage?: string | null;
};

export default function AuthButton() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [kakao, setKakao] = useState<KakaoUser | null>(null);
  const [error, setError] = useState('');
  const loadingRef = useRef(false);

  const setAuthLoading = (next: boolean) => {
    loadingRef.current = next;
    setLoading(next);
  };

  useEffect(() => {
    let mounted = true;

    const loadAuth = async () => {
      // ✅ getUser 실패는 대개 "비로그인 상태" — 빨간색 에러로 노출하지 않음.
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;
      if (error) {
        setUser(null);
        return;
      }
      setUser(data.user ? { email: data.user.email } : null);
    };

    const loadKakao = async () => {
      try {
        const res = await fetch('/api/auth/kakao/me', { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as { user: KakaoUser | null };
        if (!mounted) return;
        setKakao(json.user);
      } catch {
        /* 비로그인 — 무시 */
      }
    };

    Promise.all([loadAuth(), loadKakao()]).finally(() => {
      if (mounted) setCheckingAuth(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ? { email: session.user.email } : null);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  const signInWithGoogle = async () => {
    if (loadingRef.current) return;
    try {
      setAuthLoading(true);
      setError('');
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (error) {
        setError('로그인 중 잠시 문제가 발생했어요. 다시 시도해 주세요.');
        console.error('Google 로그인 실패:', error);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const signInWithKakao = () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setError('');
    window.location.assign('/api/auth/kakao/start');
  };

  const signOut = async () => {
    if (loadingRef.current) return;
    try {
      setAuthLoading(true);
      setError('');

      if (kakao) {
        const res = await fetch('/api/auth/kakao/logout', { method: 'POST' });
        if (!res.ok) {
          setError('로그아웃 중 잠시 문제가 발생했어요. 다시 시도해 주세요.');
        } else {
          setKakao(null);
        }
      }

      if (user) {
        const { error } = await supabase.auth.signOut();
        if (error) {
          setError('로그아웃 중 잠시 문제가 발생했어요. 다시 시도해 주세요.');
          console.error('로그아웃 실패:', error);
        } else {
          setUser(null);
        }
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const displayLabel =
    kakao?.nickname || kakao?.email || user?.email || '로그인됨';
  const isLoggedIn = Boolean(user || kakao);
  const isBusy = loading || checkingAuth;

  return (
    <>
    <style>{`
      @media (max-width: 640px) {
        .px-auth-button {
          gap: 6px !important;
          flex-wrap: nowrap !important;
        }
        .px-auth-label {
          display: none !important;
        }
        .px-auth-button button {
          padding: 6px 10px !important;
          font-size: 12px !important;
          white-space: nowrap !important;
        }
      }
    `}</style>
    <div className="px-auth-button" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
      {checkingAuth ? (
        <button
          type="button"
          disabled
          style={{
            padding: '8px 14px',
            borderRadius: '10px',
            border: '1px solid #d1d5db',
            background: '#fff',
            color: '#6b7280',
            fontWeight: 700,
            cursor: 'not-allowed',
            touchAction: 'manipulation',
          }}
        >
          처리 중...
        </button>
      ) : isLoggedIn ? (
        <>
          <span
            className="px-auth-label"
            style={{
              fontSize: '12px',
              color: '#374151',
              fontWeight: 600,
              maxWidth: '160px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {displayLabel}
            {kakao ? (
              <span style={{ marginLeft: 6, color: '#a16207' }}>(Kakao)</span>
            ) : null}
          </span>
          <button
            type="button"
            onClick={signOut}
            disabled={isBusy}
            style={{
              padding: '8px 14px',
              borderRadius: '10px',
              border: '1px solid #d1d5db',
              background: '#fff',
              color: '#111827',
              fontWeight: 700,
              cursor: isBusy ? 'not-allowed' : 'pointer',
              touchAction: 'manipulation',
            }}
          >
            {loading ? '처리 중...' : '로그아웃'}
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={isBusy}
            style={{
              padding: '8px 14px',
              borderRadius: '10px',
              border: '1px solid #d1d5db',
              background: '#fff',
              color: '#111827',
              fontWeight: 700,
              cursor: isBusy ? 'not-allowed' : 'pointer',
              touchAction: 'manipulation',
            }}
          >
            {loading ? '로그인 중...' : 'Google 로그인'}
          </button>
          <button
            type="button"
            onClick={signInWithKakao}
            disabled={isBusy}
            style={{
              padding: '8px 14px',
              borderRadius: '10px',
              border: '1px solid #f5d300',
              background: '#FEE500',
              color: '#191600',
              fontWeight: 700,
              cursor: isBusy ? 'not-allowed' : 'pointer',
              touchAction: 'manipulation',
            }}
          >
            {loading ? '로그인 중...' : '카카오 로그인'}
          </button>
          {/* ✅ 부드러운 회색 안내 — 빨간 에러 대신 긍정적 유도 문구 */}
          <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 500 }}>
            로그인하면 더 많이 이용할 수 있어요
          </span>
        </>
      )}
      {/* ✅ 실제 action 실패 시에만 부드러운 회색 안내로 표시 (빨간색 금지) */}
      {error ? (
        <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: 500 }}>
          {error}
        </span>
      ) : null}
    </div>
    </>
  );
}
