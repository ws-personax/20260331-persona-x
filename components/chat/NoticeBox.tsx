const PERSONAX_DISCLAIMER = `⚠️ PersonaX는 AI 금융 콘텐츠 플랫폼입니다.
제공되는 모든 분석은 참고용 시나리오이며
투자 자문·매매 추천이 아닙니다.
투자 판단과 그에 따른 손익의 책임은
전적으로 투자자 본인에게 있습니다.`;

export const NoticeBox = ({
  dataSource,
  marketClosedNote,
  hideDisclaimer = false,
}: {
  dataSource: string;
  marketClosedNote: string;
  hideDisclaimer?: boolean;
}) => (
  <div style={{ marginTop: 8, padding: '0 12px 0 58px' }}>
    <div
      style={{
        background: 'rgba(0,0,0,0.04)',
        borderRadius: 10,
        padding: '10px 14px',
        border: '1px solid rgba(0,0,0,0.07)',
      }}
    >
      {marketClosedNote && (
        <p style={{ fontSize: 11, color: '#b45309', margin: 0, fontWeight: 700, lineHeight: 1.5 }}>
          {marketClosedNote}
        </p>
      )}
      {dataSource && (
        <p
          style={{
            fontSize: 11,
            color: '#374151',
            margin: marketClosedNote ? '3px 0 0' : 0,
            fontWeight: 700,
            lineHeight: 1.5,
          }}
        >
          {dataSource}
        </p>
      )}
      {!hideDisclaimer && (
        <p style={{ fontSize: 10, color: '#2563eb', margin: '3px 0 0', lineHeight: 1.5, fontWeight: 600 }}>
          💡 참고 가이드: 낮음 → 참고 · 보통 → 고려 · 높음 → 확신
        </p>
      )}
      {!hideDisclaimer && (
        <p style={{ fontSize: 10, color: '#6b7280', margin: '6px 0 0', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
          {PERSONAX_DISCLAIMER}
        </p>
      )}
    </div>
  </div>
);
