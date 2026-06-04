import { memo } from 'react';

type VoiceControlsColumnProps = {
  sttSupported: boolean;
  ttsSupported: boolean;
  isRecording: boolean;
  isLoading: boolean;
  autoSendCountdown: number | null;
  autoRead: boolean;
  onToggleRecording: () => void;
  onToggleAutoRead: () => void;
};

export const VoiceControlsColumn = memo(function VoiceControlsColumn({
  sttSupported,
  ttsSupported,
  isRecording,
  isLoading,
  autoSendCountdown,
  autoRead,
  onToggleRecording,
  onToggleAutoRead,
}: VoiceControlsColumnProps) {
  if (!sttSupported && !ttsSupported) return null;
  const inCountdown = autoSendCountdown !== null;
  const bg = inCountdown ? '#fef3c7' : isRecording ? '#fee2e2' : '#f3f4f6';
  const borderColor = inCountdown ? '#f59e0b' : isRecording ? '#dc2626' : '#d1d5db';
  const fg = inCountdown ? '#92400e' : isRecording ? '#dc2626' : '#374151';
  const micLabel = inCountdown ? '자동 전송 취소' : isRecording ? '녹음 중지' : '음성 입력';
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 4,
        flexShrink: 0,
        width: 56,
      }}
    >
      {sttSupported && (
        <button
          type="button"
          onClick={() => {
            console.log('[stt] button clicked');
            onToggleRecording();
          }}
          disabled={isLoading}
          title={inCountdown ? `${micLabel} (${autoSendCountdown}초)` : micLabel}
          aria-label={micLabel}
          style={{
            background: bg,
            border: `1px solid ${borderColor}`,
            borderRadius: 12,
            width: 56,
            height: 56,
            boxSizing: 'border-box',
            fontSize: 22,
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading ? 0.5 : 1,
            color: fg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          🎤
          {inCountdown && (
            <span
              style={{
                position: 'absolute',
                bottom: -2,
                right: -2,
                background: '#f59e0b',
                color: '#fff',
                fontSize: 10,
                fontWeight: 800,
                borderRadius: 999,
                padding: '1px 5px',
                lineHeight: 1.2,
              }}
            >
              {autoSendCountdown}
            </span>
          )}
        </button>
      )}
      {ttsSupported && (
        <button
          type="button"
          onClick={onToggleAutoRead}
          title={autoRead ? '자동 읽기 끄기' : '자동 읽기 켜기'}
          aria-label={autoRead ? '자동 읽기 끄기' : '자동 읽기 켜기'}
          style={{
            background: autoRead ? '#dbeafe' : '#f9fafb',
            border: `1px solid ${autoRead ? '#93c5fd' : '#e5e7eb'}`,
            borderRadius: 8,
            width: 56,
            height: 20,
            padding: 0,
            fontSize: 10,
            fontWeight: 700,
            color: autoRead ? '#1e40af' : '#9ca3af',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
          }}
        >
          {autoRead ? '🔊 ON' : '🔊 OFF'}
        </button>
      )}
    </div>
  );
});

