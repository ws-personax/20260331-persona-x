import Link from 'next/link';

export const metadata = {
  title: '이용약관 — PersonaX',
};

export default function TermsPage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px 80px', fontSize: 14, lineHeight: 1.7, color: '#1f2937' }}>
      <Link href="/" style={{ display: 'inline-block', marginBottom: 16, fontSize: 13, color: '#6b7280', textDecoration: 'none' }}>
        ← 메인으로
      </Link>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>PersonaX 이용약관</h1>
      <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 24px' }}>최종 수정일: 2026-05-06</p>

      <Section title="제1조 (목적)">
        본 약관은 PersonaX(이하 &ldquo;서비스&rdquo;)가 제공하는 AI 기반 정보 제공 서비스의 이용 조건과 절차,
        이용자와 운영자의 권리·의무 및 책임 사항을 규정함을 목적으로 합니다.
      </Section>

      <Section title="제2조 (운영자 정보)">
        <Bullet>서비스명: PersonaX</Bullet>
        <Bullet>운영자: 개인사업자 [대표자명 입력 필요]</Bullet>
        <Bullet>문의: [이메일 주소 입력 필요]</Bullet>
      </Section>

      <Section title="제3조 (서비스의 내용)">
        본 서비스는 다양한 페르소나(RAY/JACK/LUCIA/ECHO)가 사용자의 질문에 대해 서로 다른 시각으로
        의견을 제시하는 AI 기반 토론형 정보 제공 서비스입니다. 서비스가 제공하는 모든 답변은
        참고용 콘텐츠이며, 어떠한 형태의 자문·권유·진단·확정적 판단도 아닙니다.
      </Section>

      <Section title="제4조 (투자 정보의 한계)">
        본 서비스가 제공하는 투자 관련 정보는 일반 정보 제공을 목적으로 하며, 투자자문업·투자권유·
        매매 추천이 아닙니다. 투자 판단과 그에 따른 손익의 책임은 전적으로 이용자 본인에게 있으며,
        운영자는 이용자의 투자 결정 및 결과에 대해 어떠한 책임도 지지 않습니다.
      </Section>

      <Section title="제5조 (의료·법률·세무 정보의 한계)">
        건강·의료·법률·세무·노무 등 전문 영역에 관한 정보는 일반 참고용이며 진단·처방·법률 자문·
        세무 자문을 대체하지 않습니다. 해당 영역의 의사결정은 반드시 자격을 갖춘 전문가의 상담을
        받으시기 바랍니다.
      </Section>

      <Section title="제6조 (이용자의 의무)">
        이용자는 다음 행위를 하여서는 아니 됩니다.
        <Bullet>법령 및 공서양속에 위반되는 내용의 입력</Bullet>
        <Bullet>타인의 명예를 훼손하거나 권리를 침해하는 행위</Bullet>
        <Bullet>욕설·차별·혐오·성적 표현 등 부적절한 표현의 입력</Bullet>
        <Bullet>서비스의 정상적 운영을 방해하는 행위(스팸, 자동화 도구를 통한 대량 요청 등)</Bullet>
        <Bullet>타인의 계정·개인정보를 도용하는 행위</Bullet>
        <Bullet>운영자의 지적재산권 또는 제3자의 권리를 침해하는 행위</Bullet>
      </Section>

      <Section title="제7조 (서비스 변경 및 중단)">
        운영자는 서비스의 품질 향상, 기술적 필요, 정책 변경 등의 사유로 서비스의 전부 또는 일부를
        변경·중단할 수 있으며, 이로 인해 발생한 이용자의 손해에 대해서는 고의 또는 중대한 과실이
        없는 한 책임을 지지 않습니다.
      </Section>

      <Section title="제8조 (책임의 제한)">
        운영자는 천재지변, 통신장애, 제3자 서비스(LLM 제공자 등)의 오류·중단으로 인한 서비스 장애에
        대해 책임을 지지 않으며, AI 답변의 정확성·완전성·시의성을 보장하지 않습니다.
      </Section>

      <Section title="제9조 (약관의 변경)">
        운영자는 관련 법령을 위반하지 않는 범위에서 본 약관을 변경할 수 있으며, 변경된 약관은
        서비스 내 공지를 통해 시행됩니다. 이용자가 변경된 약관에 동의하지 않을 경우 서비스 이용을
        중단할 수 있습니다.
      </Section>

      <Section title="제10조 (분쟁 해결)">
        본 약관과 관련하여 발생한 분쟁에 대해서는 대한민국 법령을 적용하며, 운영자의 주소지를
        관할하는 법원을 합의 관할로 합니다.
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
