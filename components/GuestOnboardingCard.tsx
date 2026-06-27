'use client';

interface GuestOnboardingCardProps {
  onOpenSignup: () => void;
}

export default function GuestOnboardingCard({ onOpenSignup }: GuestOnboardingCardProps) {
  return (
    <div
      style={{
        margin: '0 16px 12px',
        padding: '14px 14px 12px',
        borderRadius: 16,
        border: '1px solid #C9A46A',
        background: '#FFF8E8',
        boxShadow: '0 4px 12px rgba(92,61,30,0.06)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#1a1a2e', letterSpacing: '-0.3px' }}>
            게스트로 사용 중
          </div>
          <div style={{ fontSize: 12, color: '#7A5A35', marginTop: 4, lineHeight: 1.4 }}>
            가입하면 시간이 이어집니다.
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenSignup}
          style={{
            background: '#B98236',
            color: '#FFF8E8',
            border: 'none',
            borderRadius: 10,
            padding: '10px 12px',
            fontSize: 12,
            fontWeight: 800,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            minWidth: 108,
          }}
        >
          가입하면 시간이 이어집니다.
        </button>
      </div>

      <div style={{ marginTop: 12, display: 'grid', gap: 6, fontSize: 12.5, color: '#3F2F1D', lineHeight: 1.4 }}>
        <div>✓ JACK 사용 가능</div>
        <div>✓ LUCIA 사용 가능</div>
        <div>🔒 RAY (Premium)</div>
        <div>🔒 ECHO (Premium)</div>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: '#7A5A35', lineHeight: 1.45 }}>
        가입 후 사용할 수 있는 기능
        <div style={{ marginTop: 4 }}>• 기록</div>
        <div>• Review</div>
        <div>• Remember</div>
        <div>• Timeline</div>
      </div>
    </div>
  );
}
