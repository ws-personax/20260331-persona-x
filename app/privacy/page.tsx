import Link from 'next/link';

export const metadata = {
  title: '개인정보처리방침 — PersonaX',
};

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px 80px', fontSize: 14, lineHeight: 1.7, color: '#1f2937' }}>
      <Link href="/" style={{ display: 'inline-block', marginBottom: 16, fontSize: 13, color: '#6b7280', textDecoration: 'none' }}>
        ← 메인으로
      </Link>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>PersonaX 개인정보처리방침</h1>
      <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 24px' }}>최종 수정일: 2026-05-06</p>

      <Section title="1. 수집하는 개인정보 항목">
        <Bullet>로그인 정보: 카카오 또는 구글 OAuth 로그인 시 제공받는 이메일, 닉네임, 프로필 식별자</Bullet>
        <Bullet>이용 기록: 사용자가 입력한 질문 및 서비스가 생성한 응답 내용</Bullet>
        <Bullet>자동 수집 정보: 접속 일시, 서비스 이용 로그, 오류 로그 (개인 식별 정보 미포함)</Bullet>
      </Section>

      <Section title="2. 개인정보 수집 및 이용 목적">
        <Bullet>회원 식별 및 로그인 인증</Bullet>
        <Bullet>AI 답변 생성 및 서비스 제공</Bullet>
        <Bullet>서비스 품질 개선 및 페르소나 응답 정합성 검증</Bullet>
        <Bullet>장애 대응 및 부정 이용 방지</Bullet>
      </Section>

      <Section title="3. 개인정보 보유 및 이용 기간">
        원칙적으로 회원 탈퇴 시까지 보유하며, 탈퇴 요청 시 지체 없이 파기합니다. 단, 관련 법령에서
        보존 기간을 정한 경우 해당 기간 동안 보관 후 파기합니다.
      </Section>

      <Section title="4. 개인정보 제3자 제공">
        운영자는 이용자의 개인정보를 제3자에게 제공하지 않습니다. 단, 다음의 경우는 예외로 합니다.
        <Bullet>이용자가 사전에 동의한 경우</Bullet>
        <Bullet>법령의 규정에 따라 수사기관의 요청이 있는 경우</Bullet>
      </Section>

      <Section title="5. 처리 위탁">
        AI 응답 생성을 위해 다음 처리 위탁을 수행할 수 있으며, 위탁 시 개인 식별 정보의 최소화를
        원칙으로 합니다.
        <Bullet>AI 모델 호출: Google(Gemini API) 등 LLM 제공자</Bullet>
        <Bullet>인증·세션 관리: Supabase</Bullet>
        <Bullet>호스팅·배포: Vercel</Bullet>
      </Section>

      <Section title="6. 이용자의 권리">
        이용자는 언제든지 자신의 개인정보를 조회·수정·삭제하거나 처리 정지를 요구할 수 있습니다.
        탈퇴 또는 권리 행사를 원할 경우 아래 문의 채널로 요청해 주세요.
      </Section>

      <Section title="7. 개인정보 안전성 확보 조치">
        <Bullet>전송 구간 암호화 (HTTPS)</Bullet>
        <Bullet>접근 권한의 최소화 및 정기 점검</Bullet>
        <Bullet>외부 침입 방지 및 로그 모니터링</Bullet>
      </Section>

      <Section title="8. 쿠키의 사용">
        서비스는 로그인 세션 유지에 필요한 최소한의 쿠키를 사용합니다. 이용자는 브라우저 설정을
        통해 쿠키 저장을 거부할 수 있으나, 이 경우 일부 기능 이용이 제한될 수 있습니다.
      </Section>

      <Section title="9. 개인정보 보호 책임자">
        <Bullet>책임자: [대표자명 입력 필요]</Bullet>
        <Bullet>문의: [이메일 주소 입력 필요]</Bullet>
      </Section>

      <Section title="10. 처리방침의 변경">
        본 방침은 법령·정책 변경에 따라 개정될 수 있으며, 변경 시 서비스 내 공지를 통해 사전에
        안내합니다.
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, color: '#111827', margin: '0 0 8px' }}>{title}</h2>
      <div style={{ color: '#374151' }}>{children}</div>
    </section>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
      <span style={{ color: '#9ca3af' }}>•</span>
      <span>{children}</span>
    </div>
  );
}
