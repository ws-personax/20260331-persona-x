interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
}

export default function Logo({ size = 'md' }: LogoProps) {
  const sizes = {
    sm: { font: 20, xSize: 28 },
    md: { font: 32, xSize: 40 },
    lg: { font: 44, xSize: 56 },
  } as const;
  const { font, xSize } = sizes[size];

  return (
    <div className="inline-flex items-baseline gap-1">
      <span
        style={{
          fontFamily: 'var(--font-space-grotesk), sans-serif',
          fontSize: `${font}px`,
          fontWeight: 600,
          letterSpacing: '-1.5px',
          color: '#0a0a0f',
        }}
      >
        Persona
      </span>
      <svg viewBox="0 0 60 60" style={{ width: xSize, height: xSize }}>
        <defs>
          <linearGradient id="x-line1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#378ADD" />
            <stop offset="50%" stopColor="#378ADD" />
            <stop offset="50%" stopColor="#5F5E5A" />
            <stop offset="100%" stopColor="#5F5E5A" />
          </linearGradient>
          <linearGradient id="x-line2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#E24B4A" />
            <stop offset="50%" stopColor="#E24B4A" />
            <stop offset="50%" stopColor="#7F77DD" />
            <stop offset="100%" stopColor="#7F77DD" />
          </linearGradient>
        </defs>
        <line x1="12" y1="12" x2="48" y2="48" stroke="url(#x-line1)" strokeWidth="8" strokeLinecap="round" />
        <line x1="48" y1="12" x2="12" y2="48" stroke="url(#x-line2)" strokeWidth="8" strokeLinecap="round" />
      </svg>
    </div>
  );
}
