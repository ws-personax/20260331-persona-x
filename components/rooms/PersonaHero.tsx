'use client';

const PERSONA_ITEMS = [
  { key: 'jack', label: 'JACK', value: '결단', locked: false },
  { key: 'lucia', label: 'LUCIA', value: '공감', locked: false },
  { key: 'ray', label: 'RAY', value: '검증', locked: true },
  { key: 'echo', label: 'ECHO', value: '통찰', locked: true },
];

export default function PersonaHero() {
  return (
    <section
      style={{
        padding: '0 16px 14px',
      }}
    >
      <div
        style={{
          background: '#FFF8E8',
          border: '1px solid #C9A46A',
          borderRadius: 18,
          padding: 12,
          boxShadow: '0 4px 12px rgba(92,61,30,0.06)',
          maxWidth: 320,
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 260,
            aspectRatio: '1 / 1',
            overflow: 'hidden',
            borderRadius: 16,
            margin: '0 auto',
            background: '#F8F2E6',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/personas/persona-roles-v2.webp"
            alt="JACK LUCIA RAY ECHO 4분할 히어로"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>

        <p
          style={{
            margin: '10px 2px 8px',
            fontSize: 13,
            lineHeight: 1.45,
            fontWeight: 800,
            color: '#1a1a2e',
            letterSpacing: '-0.3px',
            textAlign: 'center',
          }}
        >
          4명이 토론하고, 당신이 결정합니다.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 8,
          }}
        >
          {PERSONA_ITEMS.map((item) => (
            <div
              key={item.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                borderRadius: 12,
                border: '1px solid #E6CFA6',
                background: '#FFFFFF',
                padding: '8px 10px',
                minHeight: 42,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 900, color: '#1f2937', letterSpacing: '-0.2px' }}>
                  {item.label}
                </span>
                <span style={{ fontSize: 11, color: '#7A5A35', fontWeight: 700 }}>{item.value}</span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: item.locked ? '#B98236' : '#5C3D1E',
                  flexShrink: 0,
                }}
              >
                {item.locked ? '🔒' : '사용 가능'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
