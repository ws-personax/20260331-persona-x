import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            // ✅ 모바일(삼성 브라우저 등) 쿠키 저장 보장 — sameSite/secure/httpOnly 명시
            //    httpOnly:false 는 createBrowserClient가 클라이언트에서 동일 쿠키를 읽기 위함
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, {
                ...(options as CookieOptions),
                sameSite: 'lax',
                secure: true,
                httpOnly: false,
              });
            });
          } catch {
            // Server Component에서 쿠키 쓰기 불가 시 무시
          }
        },
      },
    }
  );
}
