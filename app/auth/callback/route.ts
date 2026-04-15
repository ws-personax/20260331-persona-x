import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');

    let next = searchParams.get('next') ?? '/';
    if (!next.startsWith('/')) next = '/';

    if (!code) {
      console.warn('auth callback: code missing');
      return NextResponse.redirect(`${origin}/auth/auth-code-error`);
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('auth callback: exchangeCodeForSession failed', error);
      return NextResponse.redirect(`${origin}/auth/auth-code-error`);
    }

    const forwardedHost = request.headers.get('x-forwarded-host');
    const isLocalEnv = process.env.NODE_ENV === 'development';

    if (isLocalEnv) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    if (forwardedHost) {
      return NextResponse.redirect(`https://${forwardedHost}${next}`);
    }
    return NextResponse.redirect(`${origin}${next}`);

  } catch (error) {
    console.error('auth callback: unexpected error', error);
    const { origin } = new URL(request.url);
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
  }
}
