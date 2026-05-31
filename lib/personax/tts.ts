'use client';

import { useEffect, useState } from 'react';

export const isTTSSupported = (): boolean =>
  typeof window !== 'undefined' && typeof Audio !== 'undefined';

export const isSTTSupported = (): boolean => {
  if (typeof window !== 'undefined') {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
  }
  return false;
};

type PersonaVoice = 'ray' | 'jack' | 'lucia' | 'echo';

export const sanitizeForTTS = (text: string, personaKey?: PersonaVoice): string => {
  const raw = text || '';
  let body = raw;
  let hasDetailLink = false;
  if (personaKey && personaKey !== 'echo') {
    const m = /자세히\s*보기/.exec(body);
    if (m) {
      body = body.slice(0, m.index);
    }
    hasDetailLink = false;
  } else if (!personaKey) {
    const m = /자세히\s*보기/.exec(body);
    if (m) {
      hasDetailLink = true;
      body = body.slice(0, m.index);
    }
  }
  let t = body
    .replace(/\([^)]*\)/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/[📰📊📡🎯💡🔍⚔️↳→▲▼💜☕💪]/g, '')
    .replace(/\n+/g, '. ')
    .replace(/\s+/g, ' ')
    .trim();
  if (hasDetailLink) {
    t = t.replace(/[.\s]+$/, '') + '. 자세한 내용은 화면을 확인하세요.';
  }
  return t;
};

type SequenceItem = { text: string; personaKey: PersonaVoice };
const sequenceQueue: SequenceItem[] = [];
let sequenceRunning = false;
let sequenceStopId = 0;
let activeRequestId = 0;
let currentAudio: HTMLAudioElement | null = null;
let currentAudioUrl: string | null = null;

type SpeakingListener = (speaking: boolean) => void;
const speakingListeners = new Set<SpeakingListener>();
export const notifySpeaking = (speaking: boolean) => {
  speakingListeners.forEach(fn => fn(speaking));
};

export const useIsSpeaking = (): boolean => {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    speakingListeners.add(setSpeaking);
    return () => { speakingListeners.delete(setSpeaking); };
  }, []);
  return speaking;
};

export const stopSpeaking = (): void => {
  sequenceStopId++;
  activeRequestId++;
  sequenceQueue.length = 0;
  sequenceRunning = false;
  if (currentAudio) {
    try {
      currentAudio.onended = null;
      currentAudio.onerror = null;
      currentAudio.pause();
      currentAudio.src = '';
    } catch {}
    currentAudio = null;
  }
  if (currentAudioUrl) {
    try { URL.revokeObjectURL(currentAudioUrl); } catch {}
    currentAudioUrl = null;
  }
  notifySpeaking(false);
};

export const speakOne = (
  text: string,
  personaKey: PersonaVoice,
  onEnd?: () => void,
): boolean => {
  if (!isTTSSupported()) return false;
  const clean = text.trim();
  if (!clean) { onEnd?.(); return false; }

  const reqId = ++activeRequestId;
  let ended = false;
  const finish = () => { if (!ended) { ended = true; onEnd?.(); } };

  fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: clean, persona: personaKey }),
  })
    .then(res => {
      if (!res.ok) throw new Error('tts ' + res.status);
      return res.blob();
    })
    .then(blob => {
      if (reqId !== activeRequestId) { finish(); return; }
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudio = audio;
      currentAudioUrl = url;
      const cleanup = () => {
        if (currentAudio === audio) currentAudio = null;
        if (currentAudioUrl === url) {
          try { URL.revokeObjectURL(url); } catch {}
          currentAudioUrl = null;
        }
      };
      audio.onended = () => { cleanup(); finish(); };
      audio.onerror = () => { cleanup(); finish(); };
      audio.play().catch((err) => {
        console.error('audio.play 실패:', err.name, err.message);
        cleanup();
        finish();
      });
    })
    .catch(() => { finish(); });

  return true;
};

export const speakText = (
  text: string,
  personaKey?: PersonaVoice,
  onEnd?: () => void,
): boolean => {
  if (!isTTSSupported()) return false;
  stopSpeaking();
  notifySpeaking(true);
  return speakOne(text, personaKey || 'ray', () => {
    notifySpeaking(false);
    onEnd?.();
  });
};

export const enqueueSpeak = (items: SequenceItem[]): void => {
  if (!isTTSSupported() || items.length === 0) return;
  sequenceQueue.push(...items);
  if (sequenceRunning) return;

  sequenceRunning = true;
  notifySpeaking(true);
  const myStopId = sequenceStopId;

  const next = () => {
    if (myStopId !== sequenceStopId) return;
    const item = sequenceQueue.shift();
    if (!item) {
      sequenceRunning = false;
      notifySpeaking(false);
      return;
    }
    speakOne(item.text, item.personaKey, next);
  };
  next();
};
