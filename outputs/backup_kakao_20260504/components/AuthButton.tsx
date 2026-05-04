'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type AuthUser = {
  email?: string | null;
};

export default function AuthButton() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    const loadUser = async () => {
      // ✅ getUser 실패는 대개 "비로그인 상태" — 빨간색 에러로 노출하지 않음.
      //   실패 시 user=null로 두고 조용히 로그인 버튼만 표시.
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;
      if (error) {
        setUser(null);
        return;
      }
      setUser(data.user ? { email: data.user.email } : null);
    };

    loadUser();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => {
        if (!mounted) return;
        setUser(session?.user ? { email: session.user.email } : null);
      }, 0);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  const signInWithGoogle = async () => {
    try {
      setLoading(true);
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
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setLoading(true);
      setError('');
      const { error } = await supabase.auth.signOut();
      if (error) {
        setError('로그아웃 중 잠시 문제가 발생했어요. 다시 시도해 주세요.');
        console.error('로그아웃 실패:', error);
      } else {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
      {user ? (
        <>
          <span
            style={{
              fontSize: '12px',
              color: '#374151',
              fontWeight: 600,
              maxWidth: '140px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {user.email || '로그인됨'}
          </span>
          <button
            type="button"
            onClick={signOut}
            disabled={loading}
            style={{
              padding: '8px 14px',
              borderRadius: '10px',
              border: '1px solid #d1d5db',
              background: '#fff',
              color: '#111827',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
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
            disabled={loading}
            style={{
              padding: '8px 14px',
              borderRadius: '10px',
              border: '1px solid #d1d5db',
              background: '#fff',
              color: '#111827',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '로그인 중...' : 'Google 로그인'}
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
  );
}
