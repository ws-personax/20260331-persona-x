export const ErrorCard = ({
  message,
  showRetry,
  onRetry,
}: {
  message: string;
  showRetry: boolean;
  onRetry?: () => void;
}) => (
  <div style={{ padding: '0 12px', marginBottom: 14 }}>
    <div
      style={{
        background: '#f9fafb',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: '16px 18px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 13.5,
          lineHeight: 1.7,
          color: '#374151',
          whiteSpace: 'pre-line',
          textAlign: 'center',
          fontWeight: 500,
        }}
      >
        {message}
      </p>
      {showRetry && onRetry && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button
            type="button"
            onClick={onRetry}
            style={{
              background: '#ffffff',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: 20,
              padding: '7px 18px',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            }}
          >
            다시 시도
          </button>
        </div>
      )}
    </div>
  </div>
);
