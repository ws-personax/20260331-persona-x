export default function AuthCodeErrorPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
        color: '#111827',
        padding: '24px',
      }}
    >
      <div
        style={{
          maxWidth: '420px',
          width: '100%',
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.06)',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '12px' }}>
          로그인에 실패했습니다
        </h1>
        <p style={{ fontSize: '14px', lineHeight: 1.7, color: '#4b5563', marginBottom: '20px' }}>
          인증 과정에서 문제가 발생했습니다. 다시 시도해주세요.
        </p>
        <a
          href="/"
          style={{
            display: 'inline-block',
            padding: '10px 16px',
            borderRadius: '10px',
            background: '#111827',
            color: '#fff',
            textDecoration: 'none',
            fontWeight: 700,
          }}
        >
          홈으로 돌아가기
        </a>
      </div>
    </main>
  );
}
