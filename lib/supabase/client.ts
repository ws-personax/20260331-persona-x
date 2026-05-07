'use client';

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        detectSessionInUrl: true,
        // ✅ 모바일 Safari/Chrome 쿠키 미동기화 대응 — localStorage에 세션 저장
        //    (쿠키 기반 SSR 대신 클라이언트 storage로 폴백 → 모바일 OAuth 직후 세션 즉시 사용 가능)
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      },
    },
  );
}
