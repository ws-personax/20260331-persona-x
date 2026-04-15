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
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        if (mounted) setError('로그인 상태를 확인하지 못했습니다.');
        return;
      }
      if (mounted) setUser(data.user ? { email: data.user.email } : null);
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
        setError('구글 로그인에 실패했습니다.');
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
        setError('로그아웃에 실패했습니다.');
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
      )}
      {error ? (
        <span style={{ fontSize: '12px', color: '#dc2626', fontWeight: 600 }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
