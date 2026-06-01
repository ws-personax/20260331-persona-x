'use client';

import { memo, useEffect, useState } from 'react';
import {
  useIsSpeaking,
  stopSpeaking,
  speakText,
  isTTSSupported,
} from '@/lib/personax/tts';

export const SpeakerButton = memo(function SpeakerButton({
  text,
  personaKey,
}: {
  text: string;
  personaKey?: 'ray' | 'jack' | 'lucia' | 'echo';
}) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const globalSpeaking = useIsSpeaking();

  useEffect(() => {
    setSupported(isTTSSupported());
  }, []);

  useEffect(() => {
    if (!globalSpeaking && speaking) setSpeaking(false);
  }, [globalSpeaking, speaking]);

  useEffect(() => () => { if (speaking) stopSpeaking(); }, [speaking]);

  if (!supported || !text?.trim()) return null;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (speaking) {
          stopSpeaking();
          setSpeaking(false);
          return;
        }
        const ok = speakText(text, personaKey, () => setSpeaking(false));
        if (ok) setSpeaking(true);
      }}
      title={speaking ? '읽기 중지' : '소리로 듣기'}
      style={{
        marginLeft: 'auto',
        background: speaking ? '#fee2e2' : 'transparent',
        border: speaking ? '1px solid #fca5a5' : '1px solid transparent',
        borderRadius: 6,
        padding: '2px 6px',
        fontSize: 13,
        lineHeight: 1,
        cursor: 'pointer',
        color: speaking ? '#b91c1c' : '#6b7280',
      }}
      aria-label={speaking ? '읽기 중지' : '소리로 듣기'}
    >
      {speaking ? '⏹' : '🔊'}
    </button>
  );
});
