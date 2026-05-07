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
        // ✅ PKCE flow — 삼성 브라우저/모바일 환경에서 더 안정적
        flowType: 'pkce',
      },
      // ✅ 쿠키 기본 사용 (storage 명시 제거) + SameSite=Lax/Secure 명시로
      //    삼성 브라우저 등에서 localStorage 접근 차단 시에도 세션 유지
      cookieOptions: {
        sameSite: 'lax',
        secure: true,
      },
    },
  );
}
