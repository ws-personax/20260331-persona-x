PersonaX — Kakao 로그인 구현 (2026-05-04)
==========================================

[환경변수 — .env.local 및 Vercel 둘 다 필요]
  KAKAO_CLIENT_ID      = (Kakao 개발자 콘솔 REST API 키)
  KAKAO_CLIENT_SECRET  = (Kakao 개발자 콘솔 Client Secret — 활성화 필수)
  (선택) NEXT_PUBLIC_SITE_URL = https://20260331-persona-x.vercel.app
        ↳ 미설정 시 요청 origin에서 자동 추출

[Kakao 개발자 콘솔 등록]
  Redirect URI: https://20260331-persona-x.vercel.app/api/auth/callback/kakao
  Scope:        profile_nickname, account_email, profile_image
  Client Secret: '사용함' 으로 활성화

[추가/수정된 파일]
  추가  lib/auth/kakao.ts                                (HMAC 서명/검증 + 상수)
  추가  app/api/auth/kakao/start/route.ts                (OAuth 진입)
  추가  app/api/auth/callback/kakao/route.ts             (OAuth 콜백)
  추가  app/api/auth/kakao/logout/route.ts               (POST/GET 로그아웃)
  추가  app/api/auth/kakao/me/route.ts                   (현재 카카오 세션 조회)
  수정  components/AuthButton.tsx                        (카카오 버튼 + 세션 표시)

[세션 방식]
  - HTTP-only 쿠키 px_kakao_session (HMAC-SHA256 서명, 30일)
  - CSRF용 단명 쿠키 px_kakao_state, px_kakao_next (5분)
  - 서명 시크릿: KAKAO_CLIENT_SECRET 재사용
  - 기존 Supabase(Google) 인증과 병렬 동작 — 어느 쪽이든 로그인 시 사용자 표시

[손대지 않은 파일]
  components/ChatWindow.tsx — 작업 지침에 따라 변경 없음
  app/auth/callback/route.ts — 기존 Supabase 흐름 유지

[배포 후 확인 절차]
  1) https://20260331-persona-x.vercel.app/ 접속
  2) '카카오 로그인' 버튼 클릭 → Kakao 동의 화면
  3) 동의 → / 로 복귀, 우측 상단에 닉네임 또는 이메일 + (Kakao) 표시
  4) '로그아웃' 클릭 → 비로그인 상태 복귀
