'use client';

import { Fragment, useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import AuthButton from '@/components/AuthButton';
import HistoryModal from '@/components/HistoryModal';
import Logo from '@/components/Logo';
import { createClient as createSupabaseBrowser } from '@/lib/supabase/client';
import { PositionInput, buildPositionContext } from './PositionInput';
import type { Position } from './PositionInput';
import { inferCurrency, detectKeyword, shouldShowPosition } from '@/lib/maps';

// 재테크 키워드 — 매칭되면 자동으로 4명 동시 답변(RAY/JACK/LUCIA/ECHO) 모드로 라우팅
const FINANCE_KEYWORD_RE = /주식|펀드|ETF|종목|코스피|코스닥|달러|채권|포트폴리오|손절|매수|매도|배당|환율|가상화폐|비트코인|저축|예금|적금|퇴직금|연금/;
const isFinanceQuery = (text: string): boolean =>
  FINANCE_KEYWORD_RE.test(text) || detectKeyword(text) !== null;

interface NewsLink {
  title: string;
  url: string;
}

interface PersonaData {
  jack: string;
  lucia: string;
  ray: string;
  echo: string;
  echoDetails?: string | null;
  rayDetails?: string | null;
  jackDetails?: string | null;
  luciaDetails?: string | null;
  verdict: string;
  confidence: number;
  breakdown: string;
  positionSizing: string;
  jackNews?: NewsLink | null;
  luciaNews?: NewsLink | null;
  rayNews?: NewsLink | null;
  echoNews?: NewsLink | null;
  isAdvancedAnswer?: boolean;
  ray2?: string | null;
  jack2?: string | null;
  lucia2?: string | null;
  echo2?: string | null;
  order?: ('ray' | 'jack' | 'lucia' | 'echo')[];
}

type ErrorType = 'market_data_unavailable' | 'keyword_not_recognized' | 'analysis_failed';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isRead?: boolean;
  personas?: PersonaData | null;
  newsLinks?: NewsLink[];
  errorType?: ErrorType;
  errorMessage?: string;
  retryText?: string;
  teaMode?: boolean;
  teaLucia?: string;
  teaJack?: string;
  teaEcho?: string;
  teaRay?: string;
  teaLucia2?: string;
  teaJack2?: string;
  teaEcho2?: string;
  teaRay2?: string;
  luciaIntro?: string;
}

type PersonaKey = 'jack' | 'lucia' | 'ray' | 'echo';

const PERSONAS: Record<
  PersonaKey,
  {
    name: string;
    label: string;
    initial: string;
    iconBg: string;
    bubbleBg: string;
    bubbleBorder: string;
    textColor: string;
    echoTag?: string;
  }
> = {
  jack: {
    name: 'JACK 팀장',
    label: '결단 · 전략',
    initial: 'J',
    iconBg: '#374151',
    bubbleBg: '#f3f4f6',
    bubbleBorder: '#d1d5db',
    textColor: '#111827',
  },
  lucia: {
    name: 'LUCIA 이사',
    label: '감정 · 공감',
    initial: 'L',
    iconBg: '#a855f7',
    bubbleBg: '#fdf4ff',
    bubbleBorder: '#e9d5ff',
    textColor: '#1f2937',
  },
  ray: {
    name: 'RAY 대리',
    label: '데이터 · 분석',
    initial: 'R',
    iconBg: '#06b6d4',
    bubbleBg: '#ecfeff',
    bubbleBorder: '#a5f3fc',
    textColor: '#1f2937',
  },
  echo: {
    name: 'ECHO 대표',
    label: '구조 · 원칙',
    initial: 'E',
    iconBg: '#d4a017',
    bubbleBg: '#fff8d6',
    bubbleBorder: '#d4a017',
    textColor: '#111827',
    echoTag: '',
  },
};

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const formatTime = (d: Date) =>
  d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });

const PERSONAX_DISCLAIMER = `⚠️ PersonaX는 AI 금융 콘텐츠 플랫폼입니다.
제공되는 모든 분석은 참고용 시나리오이며
투자 자문·매매 추천이 아닙니다.
투자 판단과 그에 따른 손익의 책임은
전적으로 투자자 본인에게 있습니다.`;

const parseEchoParts = (text: string) => {
  const normalized = (text || '').replace(/\\n/g, '\n');

  const markers = ['📡', '─────────────────────────'];
  let splitIdx = -1;
  for (const m of markers) {
    const idx = normalized.indexOf(m);
    if (idx !== -1 && (splitIdx === -1 || idx < splitIdx)) splitIdx = idx;
  }

  if (splitIdx === -1) {
    return { content: normalized, dataSource: '', marketClosedNote: '' };
  }

  const content = normalized.slice(0, splitIdx).trim();
  const remainder = normalized.slice(splitIdx);
  const lines = remainder.split('\n');
  const dataLine = (lines.find(l => l.includes('📡')) || '').trim();

  const marketClosedLine = (lines.find(l => {
    const t = l.trim();
    return t.startsWith('⚠️ 장') || t.startsWith('⚠️ 주말');
  }) || '').trim();

  return { content, dataSource: dataLine, marketClosedNote: marketClosedLine };
};

const InlineNewsChip = ({ news }: { news: NewsLink }) => (
  <div style={{ padding: '5px 0 0 48px' }}>
    <a
      href={news.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        color: '#1d4ed8',
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: 6,
        padding: '3px 8px',
        textDecoration: 'none',
        fontWeight: 600,
        maxWidth: 220,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      📰 {news.title}
    </a>
  </div>
);

const EchoNewsChip = ({ news }: { news: NewsLink }) => (
  <div style={{ padding: '6px 12px 4px 58px' }}>
    <a
      href={news.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        color: '#92400e',
        background: '#fffbeb',
        border: '1px solid #fde68a',
        borderRadius: 6,
        padding: '3px 8px',
        textDecoration: 'none',
        fontWeight: 600,
        maxWidth: 220,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      📰 {news.title}
    </a>
  </div>
);

const NoticeBox = ({
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
        <p style={{ fontSize: 11, color: '#374151', margin: marketClosedNote ? '3px 0 0' : 0, fontWeight: 700, lineHeight: 1.5 }}>
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

const cleanTeaText = (text: string): string =>
  text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\n{2,}/g, '\n');

const cleanJackText = (text: string): string =>
  text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\n{2,}/g, '\n');

const isTTSSupported = (): boolean =>
  typeof window !== 'undefined' && typeof Audio !== 'undefined';

const isSTTSupported = (): boolean => {
  if (typeof window !== 'undefined') {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
  }
  return false;
};

type PersonaVoice = 'ray' | 'jack' | 'lucia' | 'echo';

const sanitizeForTTS = (text: string, personaKey?: PersonaVoice): string => {
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
const notifySpeaking = (speaking: boolean) => {
  speakingListeners.forEach(fn => fn(speaking));
};

const useIsSpeaking = (): boolean => {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    speakingListeners.add(setSpeaking);
    return () => { speakingListeners.delete(setSpeaking); };
  }, []);
  return speaking;
};

const stopSpeaking = (): void => {
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

const speakOne = (
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

const speakText = (
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

const enqueueSpeak = (items: SequenceItem[]): void => {
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

const SpeakerButton = memo(function SpeakerButton({
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

const PersonaBubble = memo(function PersonaBubble({
  personaKey,
  text,
  timestamp,
  newsItem,
  echoNews,
  isRebuttal = false,
  details,
  hideEchoTag = false,
}: {
  personaKey: PersonaKey;
  text: string;
  timestamp: Date;
  newsItem?: NewsLink | null;
  echoNews?: NewsLink | null;
  isRebuttal?: boolean;
  details?: string | null;
  hideEchoTag?: boolean;
}) {
  const p = PERSONAS[personaKey];
  const isEcho = personaKey === 'echo';
  const [open, setOpen] = useState(false);
  const normalizedDetails = useMemo(() => (details || '').replace(/\\n/g, '\n').trim(), [details]);
  const hasDetails = !isEcho && !isRebuttal && !!normalizedDetails;
  const { content, rebuttal } = useMemo(() => {
    const normalizedText = (text || '').replace(/\\n/g, '\n');
    if (isRebuttal) return { content: normalizedText, rebuttal: '' };
    const splitIdx = normalizedText.indexOf('\n↳ ');
    if (splitIdx !== -1) {
      return {
        content: normalizedText.slice(0, splitIdx).trim(),
        rebuttal: normalizedText.slice(splitIdx + 1).trim(),
      };
    }
    return { content: normalizedText, rebuttal: '' };
  }, [text, isRebuttal]);

  if (!content?.trim()) return null;

  return (
    <div style={{ marginBottom: isEcho ? 16 : 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '0 12px' }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            background: p.iconBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 2px 5px rgba(0,0,0,0.12)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/avatars/${personaKey}.webp`}
            alt={p.name}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>{p.initial}</span>
        </div>

        <div style={{ flex: 1, maxWidth: '85%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: '#1f2937', fontWeight: 700 }}>{p.name}</span>
            <span
              style={{
                fontSize: 10,
                color: '#6b7280',
                background: '#f3f4f6',
                padding: '1px 6px',
                borderRadius: 4,
              }}
            >
              {p.label}
            </span>
            <SpeakerButton text={`${p.name}. ${content}${rebuttal ? '. ' + rebuttal : ''}`} personaKey={personaKey} />
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
            <div
              style={{
                position: 'relative',
                background: p.bubbleBg,
                opacity: isRebuttal ? 0.92 : 1,
                borderRadius: '0 14px 14px 14px',
                padding: isEcho ? '14px 16px' : '11px 14px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                border: isEcho
                  ? `2px solid ${p.bubbleBorder}`
                  : isRebuttal
                    ? `1px dashed ${p.bubbleBorder}`
                    : `1px solid ${p.bubbleBorder}`,
              }}
            >
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.75,
                  color: p.textColor,
                  whiteSpace: 'pre-wrap',
                  margin: 0,
                  fontWeight: isEcho ? 600 : 400,
                }}
              >
                {content}
              </p>

              {hasDetails && (
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => setOpen(v => !v)}
                    style={{
                      background: '#ffffff',
                      color: '#374151',
                      border: `1px solid ${p.bubbleBorder}`,
                      borderRadius: 6,
                      padding: '3px 9px',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {open ? '접기 ▲' : '자세히 보기 ▼'}
                  </button>
                </div>
              )}

              {hasDetails && open && (
                <div
                  style={{
                    marginTop: 8,
                    paddingTop: 8,
                    borderTop: `1px dashed ${p.bubbleBorder}`,
                  }}
                >
                  <p
                    style={{
                      fontSize: 12.5,
                      lineHeight: 1.7,
                      color: p.textColor,
                      whiteSpace: 'pre-wrap',
                      margin: 0,
                      fontWeight: 500,
                    }}
                  >
                    {normalizedDetails}
                  </p>
                </div>
              )}
            </div>
            <span style={{ fontSize: 10, color: '#9ca3af', flexShrink: 0, paddingBottom: 2 }}>
              {formatTime(timestamp)}
            </span>
          </div>

          {rebuttal && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 6, paddingLeft: 16 }}>
              <div
                style={{
                  background: p.bubbleBg,
                  opacity: 0.9,
                  borderRadius: '0 12px 12px 12px',
                  padding: '8px 12px',
                  border: `1px dashed ${p.bubbleBorder}`,
                  maxWidth: '100%',
                }}
              >
                <p
                  style={{
                    fontSize: 13,
                    lineHeight: 1.65,
                    color: p.textColor,
                    whiteSpace: 'pre-wrap',
                    margin: 0,
                    fontWeight: 500,
                  }}
                >
                  {rebuttal}
                </p>
              </div>
            </div>
          )}

          {!isEcho && newsItem?.url && <InlineNewsChip news={newsItem} />}
        </div>
      </div>

      {isEcho && echoNews?.url && <EchoNewsChip news={echoNews} />}
    </div>
  );
});

const EchoBubble = memo(function EchoBubble({
  summary,
  details,
  timestamp,
  echoNews,
  hideDisclaimer = false,
}: {
  summary: string;
  details?: string | null;
  timestamp: Date;
  echoNews?: NewsLink | null;
  hideDisclaimer?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const p = PERSONAS.echo;

  const { summaryText, detailsText, dataSource, marketClosedNote } = useMemo(() => {
    const summaryParsed = parseEchoParts(summary || '');
    const detailsParsed = details
      ? parseEchoParts(details)
      : { content: '', dataSource: '', marketClosedNote: '' };
    return {
      summaryText: summaryParsed.content,
      detailsText: detailsParsed.content,
      dataSource: detailsParsed.dataSource || summaryParsed.dataSource,
      marketClosedNote: detailsParsed.marketClosedNote || summaryParsed.marketClosedNote,
    };
  }, [summary, details]);

  if (!summaryText.trim()) return null;

  const hasDetails = !!detailsText.trim();

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '0 12px' }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            background: p.iconBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 2px 5px rgba(0,0,0,0.12)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/avatars/echo.webp"
            alt={p.name}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>{p.initial}</span>
        </div>

        <div style={{ flex: 1, maxWidth: '85%', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: '#1f2937', fontWeight: 700 }}>{p.name}</span>
            <span
              style={{
                fontSize: 10,
                color: '#6b7280',
                background: '#f3f4f6',
                padding: '1px 6px',
                borderRadius: 4,
              }}
            >
              {p.label}
            </span>
            <SpeakerButton text={summary || ''} personaKey="echo" />
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
            <div
              style={{
                position: 'relative',
                background: p.bubbleBg,
                borderRadius: '0 14px 14px 14px',
                padding: '14px 16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                border: `2px solid ${p.bubbleBorder}`,
                minWidth: 0,
                maxWidth: '100%',
                overflowWrap: 'break-word',
                wordBreak: 'break-word',
              }}
            >
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.75,
                  color: p.textColor,
                  whiteSpace: 'pre-wrap',
                  margin: 0,
                  fontWeight: 600,
                }}
              >
                {summaryText}
              </p>

              {hasDetails && (
                <div style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => setOpen(v => !v)}
                    style={{
                      background: '#fff8d6',
                      color: '#92400e',
                      border: '1px solid #d4a017',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {open ? '접기 ▲' : '자세히 보기 ▼'}
                  </button>
                </div>
              )}

              {open && hasDetails && (
                <div
                  style={{
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: `1px dashed ${p.bubbleBorder}`,
                  }}
                >
                  <p
                    style={{
                      fontSize: 13,
                      lineHeight: 1.7,
                      color: p.textColor,
                      whiteSpace: 'pre-wrap',
                      margin: 0,
                      fontWeight: 500,
                    }}
                  >
                    {detailsText}
                  </p>
                </div>
              )}
            </div>
            <span style={{ fontSize: 10, color: '#9ca3af', flexShrink: 0, paddingBottom: 2 }}>
              {formatTime(timestamp)}
            </span>
          </div>
        </div>
      </div>

      {echoNews?.url && <EchoNewsChip news={echoNews} />}

      <NoticeBox dataSource={dataSource} marketClosedNote={marketClosedNote} hideDisclaimer={hideDisclaimer} />
    </div>
  );
});

// ✅ ECHO 질문 직후 인라인 답변 입력창 — 단일 호출 태그 오케스트레이터 2라운드 트리거.
//   답변하기 → handleSendWithPosition(value, null) → teaRound=2.
//   건너뛰기 → handleSendWithPosition('', null) → 빈 값으로 teaRound=2.
// 입력창 옆에 붙는 [🎤 / 🔊] 세로 스택 — 일반 모드와 ECHO 모드에서 공통 사용
const VoiceControlsColumn = memo(function VoiceControlsColumn({
  sttSupported,
  ttsSupported,
  isRecording,
  isLoading,
  autoSendCountdown,
  autoRead,
  onToggleRecording,
  onToggleAutoRead,
}: {
  sttSupported: boolean;
  ttsSupported: boolean;
  isRecording: boolean;
  isLoading: boolean;
  autoSendCountdown: number | null;
  autoRead: boolean;
  onToggleRecording: () => void;
  onToggleAutoRead: () => void;
}) {
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
          onClick={onToggleRecording}
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

const EchoAnswerInline = memo(function EchoAnswerInline({
  value,
  onChange,
  onSubmit,
  onSkip,
  disabled,
  voiceColumn,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onSkip: () => void;
  disabled?: boolean;
  voiceColumn?: React.ReactNode;
}) {
  const submit = () => {
    if (!value.trim()) return;
    onSubmit();
  };
  return (
    <div style={{
      margin: '4px 12px 16px 56px',
      padding: 10,
      background: '#fffbea',
      border: '1px solid #fbbf24',
      borderRadius: 12,
      maxWidth: 620,
      display: 'flex',
      gap: 8,
      alignItems: 'flex-start',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (!disabled) submit();
            }
          }}
          placeholder="ECHO의 질문에 답해주세요..."
          disabled={disabled}
          rows={2}
          style={{
            width: '100%',
            padding: 8,
            border: '1px solid #d1d5db',
            borderRadius: 8,
            fontSize: 13,
            resize: 'none',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onSkip}
            disabled={disabled}
            style={{
              padding: '6px 12px',
              background: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              color: '#6b7280',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.6 : 1,
            }}
          >
            건너뛰기
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={disabled || !value.trim()}
            style={{
              padding: '6px 12px',
              background: '#FAE100',
              border: '1px solid #FAE100',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              color: '#1f2937',
              cursor: (disabled || !value.trim()) ? 'not-allowed' : 'pointer',
              opacity: (disabled || !value.trim()) ? 0.6 : 1,
            }}
          >
            답변하기
          </button>
        </div>
      </div>
      {voiceColumn}
    </div>
  );
});

// ✅ FIRST 페르소나 기반 로딩 문구 — 아바타와 말풍선 텍스트 일치 보장
const PERSONA_LOADING_TEXT: Record<PersonaKey, string> = {
  lucia: '🌿 LUCIA가 귀 기울이고 있어요...',
  jack: '💪 JACK이 생각 중이에요...',
  ray: '📊 RAY가 데이터 보고 있어요...',
  echo: '🎯 ECHO가 본질 짚는 중이에요...',
};

// ✅ 카테고리 키워드 기반 로딩 페르소나 fallback — pendingOrder 미정 시 아이콘/색상 분기용
const getLoadingPersona = (text: string): PersonaKey => {
  if (/주식|펀드|코스피|비트코인|ETF|배당|환율|금리|삼성전자|테슬라|엔비디아|돈이|돈은|돈을|살까|팔까|물렸|손실|수익|올랐|하락/.test(text)) return 'ray';
  if (/뉴스|정세|전쟁|이란|중동|트럼프|호르무즈|HMM|유가|금값/.test(text)) return 'ray';
  if (/야구|축구|농구|경기|선수|승부|리그|골프/.test(text)) return 'jack';
  if (/명퇴|은퇴|요양원|치매|무릎|허리|부모님|자녀|노후/.test(text)) return 'lucia';
  if (/법률|세금|계약|소송|퇴직금|실업급여/.test(text)) return 'echo';
  return 'lucia';
};

const TypingIndicator = ({ teaMode = false, teaPersona = null, userText = '', pendingOrder = null }: { teaMode?: boolean; teaPersona?: 'lucia' | 'jack' | 'echo' | null; userText?: string; pendingOrder?: PersonaKey[] | null }) => {
  if (teaMode) {
    // 명시 픽(jack/echo)이면 페르소나 고정, 그 외(lucia/null)는 order 첫 발화자 → 키워드 fallback
    const personaKey: PersonaKey = teaPersona === 'jack' || teaPersona === 'echo'
      ? teaPersona
      : pendingOrder && pendingOrder.length > 0
        ? pendingOrder[0]
        : getLoadingPersona(userText);
    const p = PERSONAS[personaKey];
    const text = PERSONA_LOADING_TEXT[personaKey];
    return (
      <>
        <style>{`
          @keyframes teaTypingPulse {
            0%, 100% { opacity: 0.65; }
            50% { opacity: 1; }
          }
        `}</style>
        <div style={{ padding: '0 0 8px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '4px 12px' }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: p.iconBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                opacity: 0.85,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/avatars/${personaKey}.webp`}
                alt={p.name}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <span style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>{p.initial}</span>
            </div>
            <div style={{ paddingTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>{p.name}</span>
              </div>
              <div
                style={{
                  background: p.bubbleBg,
                  border: `1px solid ${p.bubbleBorder}`,
                  borderRadius: '0 12px 12px 12px',
                  padding: '10px 14px',
                  fontSize: 13.5,
                  color: '#374151',
                  fontWeight: 500,
                  animation: 'teaTypingPulse 1.0s ease-in-out infinite',
                }}
              >
                {text}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      <style>{`
        @keyframes typingDot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
      <div style={{ padding: '0 0 8px' }}>
        {(['ray', 'jack', 'lucia'] as PersonaKey[]).map((key, ki) => {
          const p = PERSONAS[key];
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '4px 12px' }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  background: p.iconBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  opacity: 0.7,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/avatars/${key}.webp`}
                  alt={p.name}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <span style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>{p.initial}</span>
              </div>
              <div style={{ paddingTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>{p.name}</span>
                </div>
                <div
                  style={{
                    background: p.bubbleBg,
                    border: `1px solid ${p.bubbleBorder}`,
                    borderRadius: '0 12px 12px 12px',
                    padding: '10px 14px',
                    display: 'flex',
                    gap: 4,
                    alignItems: 'center',
                  }}
                >
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: p.iconBg,
                        animation: `typingDot 1.2s infinite`,
                        animationDelay: `${ki * 0.15 + i * 0.2}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

const ErrorCard = ({
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


const TabButton = ({
  active,
  icon,
  title,
  onClick,
}: {
  active: boolean;
  icon: string;
  title: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      padding: '9px 16px',
      background: active ? '#1f2937' : '#ffffff',
      color: active ? '#ffffff' : '#6b7280',
      border: active ? '1px solid #1f2937' : '1px solid #d1d5db',
      borderRadius: 20,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 13,
      fontWeight: 700,
      whiteSpace: 'nowrap',
      transition: 'background 0.15s, color 0.15s',
    }}
  >
    <span style={{ fontSize: 15 }}>{icon}</span>
    <span>{title}</span>
  </button>
);

type FinanceQuickPanel = '뉴스' | '추천' | '고급';
const FINANCE_TOP_BUTTONS: { panel: FinanceQuickPanel; emoji: string; label: string; color: string; bg: string; border: string }[] = [
  { panel: '뉴스', emoji: '📰', label: '주요 뉴스', color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  { panel: '추천', emoji: '💡', label: '추천 질문', color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  { panel: '고급', emoji: '🎯', label: '고급 질문', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
];

const FinanceTabContent = ({ onOpenQuickPanel }: { onOpenQuickPanel: (panel: FinanceQuickPanel) => void }) => {
  const [showHint, setShowHint] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem('px_finance_hint_v1')) {
        setShowHint(true);
        localStorage.setItem('px_finance_hint_v1', '1');
      }
    } catch {  }
  }, []);

  return (
    <div style={{ padding: '24px 4px 0' }}>
      <h2
        style={{
          fontSize: 21,
          fontWeight: 800,
          lineHeight: 1.4,
          color: '#111827',
          textAlign: 'center',
          margin: '0 0 12px',
        }}
      >
        지금 이 순간의 데이터로
        <br />
        4개의 관점이 충돌합니다
      </h2>

      <style>{`
        .px-fin-top {
          transition: transform 0.1s ease, box-shadow 0.15s ease, filter 0.15s ease;
        }
        .px-fin-top:hover {
          filter: brightness(1.02);
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        }
        .px-fin-top:active { transform: scale(0.98); }
      `}</style>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 8,
        maxWidth: 460,
        margin: '0 auto 12px',
        padding: '0 8px',
      }}>
        {FINANCE_TOP_BUTTONS.map(b => (
          <button
            key={b.panel}
            type="button"
            className="px-fin-top"
            onClick={() => onOpenQuickPanel(b.panel)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              padding: '10px 6px',
              background: b.bg,
              border: `1px solid ${b.border}`,
              borderRadius: 12,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              boxSizing: 'border-box',
              minHeight: 64,
              minWidth: 0,
            }}
          >
            <span style={{ fontSize: 20, lineHeight: 1 }}>{b.emoji}</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: b.color, whiteSpace: 'nowrap' }}>
              {b.label}
            </span>
          </button>
        ))}
      </div>

      {showHint && (
        <p
          style={{
            textAlign: 'center',
            color: '#9ca3af',
            fontSize: 12,
            fontWeight: 500,
            lineHeight: 1.5,
            margin: '0 0 4px',
          }}
        >
          종목명이나 재테크 고민을 입력하면 4명이 분석해드려요
        </p>
      )}
    </div>
  );
};

const TEA_PERSONAS_INFO: { key: 'lucia' | 'jack' | 'echo'; emoji: string; name: string; desc: string; border: string; bg: string; fg: string }[] = [
  { key: 'lucia', emoji: '☕', name: 'LUCIA 이사', desc: '따뜻하게 들어드릴게요',   border: '#fb923c', bg: '#fff7ed', fg: '#7c2d12' },
  { key: 'jack',  emoji: '💪', name: 'JACK 팀장',  desc: '직설적으로 얘기해드릴게요', border: '#1f2937', bg: '#f3f4f6', fg: '#111827' },
  { key: 'echo',  emoji: '🎯', name: 'ECHO 대표',  desc: '핵심을 짚어드릴게요',     border: '#b45309', bg: '#fefce8', fg: '#78350f' },
];

const TEA_PERSONA_HEADLINES: Record<'lucia' | 'jack' | 'echo', { line1: string; line2: string; quote: string }> = {
  lucia: { line1: '판단은 잠시 내려놓으시고', line2: '마음을 꺼내보세요',        quote: '괜찮지 않아도 괜찮아요.' },
  jack:  { line1: '솔직하게 털어놓으세요.',  line2: '방향을 잡아드리겠습니다.', quote: '망설임이 가장 큰 적입니다.' },
  echo:  { line1: '핵심만 말씀해주세요.',    line2: '판단해드리겠습니다.',      quote: '핵심을 보면 답이 보입니다.' },
};

const LUCIA_GREETINGS: Record<'morning' | 'lunch' | 'afternoon' | 'evening' | 'night', string[]> = {
  morning: [
    '좋은 아침이에요. 오늘 하루도 잘 버텨봐요.',
    '아침부터 뭔가 묵직한 게 있으면 말해요. 들을게요.',
    '오늘 하루 어떤 마음으로 시작하고 있어요?',
    '잘 잤어요? 요즘 잠은 좀 어때요?',
    '오늘 하루 제일 먼저 해결하고 싶은 게 있어요?',
    '아침부터 이미 지쳐있으면 말해요. 같이 생각해봐요.',
    '오늘 하루도 잘 부탁해요. 뭐든 털어놔도 돼요.',
    '좋은 아침. 오늘 마음 상태는 어때요?',
    '아침에 일어나자마자 든 생각이 뭐였어요?',
    '오늘도 바쁜 하루 시작이죠. 잠깐 숨 고르고 가요.',
  ],
  lunch: [
    '밥은 먹었어요? 밥 먹으면서도 머릿속이 복잡하면 말해요.',
    '점심시간에 잠깐 숨 고르고 있어요. 오전 어땠어요?',
    '밥 먹고 잠깐 여기 들렀어요? 뭔가 있으면 털어놔요.',
    '점심 먹었어요? 오늘 오전에 제일 힘들었던 게 뭐예요?',
    '잠깐 쉬는 시간에 왔군요. 오늘 어때요?',
    '점심 먹으면서도 생각나는 게 있으면 말해요.',
    '밥은 챙겨먹고 있어요? 요즘 입맛은 어때요?',
    '점심시간에 혼자 있고 싶을 때 여기 와요. 뭐든 괜찮아요.',
    '오전에 뭔가 있었어요? 얼굴이 좀 피곤해 보이는 것 같아서요.',
    '오늘 오전, 별일 없었어요?',
  ],
  afternoon: [
    '오후가 되면 왠지 더 지치죠. 지금 어때요?',
    '오늘 하루 반쯤 왔어요. 지금 기분은요?',
    '오후 3시면 제일 힘든 시간이에요. 뭔가 있으면 말해요.',
    '오후에 문득 생각나는 게 있으면 털어놔요.',
    '지금 어디서 이걸 보고 있어요? 잠깐 쉬는 중이에요?',
    '오늘 하루 어떻게 흘러가고 있어요?',
    '오후에 갑자기 기운이 빠질 때 여기 와도 돼요.',
    '지금 제일 머릿속에 맴도는 게 뭐예요?',
    '오후엔 왠지 감정이 더 예민해지는 것 같아요. 지금 어때요?',
    '퇴근까지 얼마 남았어요? 오늘 하루 버틸 만해요?',
  ],
  evening: [
    '오늘 하루 수고했어요. 뭔가 털어놓고 싶은 거 있어요?',
    '저녁 먹었어요? 오늘 어땠어요?',
    '퇴근하고 나면 그제야 감정이 올라올 때가 있죠. 지금 어때요?',
    '오늘 제일 힘들었던 순간이 언제였어요?',
    '저녁엔 하루를 돌아보게 되더라고요. 오늘 어떤 하루였어요?',
    '퇴근길에 뭔가 계속 생각났으면 말해요.',
    '오늘 잘 버텼어요. 뭔가 있었으면 털어놔요.',
    '저녁 시간에 여기 왔군요. 오늘 많이 힘들었어요?',
    '하루 마무리하면서 뭔가 정리가 안 되면 말해요.',
    '오늘 하루, 본인한테 수고했다고 말해줬어요?',
  ],
  night: [
    '하루 마무리할 시간이에요. 오늘 어땠어요?',
    '오늘 하루 잘 버텼어요. 뭔가 털어놓고 싶은 거 있어요?',
    '저녁 먹고 좀 쉬고 있어요? 오늘 어떤 하루였어요?',
    '하루 끝자락에 문득 떠오르는 게 있으면 말해요.',
    '오늘 제일 힘들었던 순간이 언제였어요?',
    '밤 되면 하루가 정리되는 것 같죠. 오늘 어땠어요?',
    '오늘 본인한테 수고했다고 말해줬어요?',
    '하루 돌아보면서 뭔가 걸리는 게 있으면 말해요.',
    '오늘 하루 중에 제일 기억에 남는 순간이 뭐예요?',
    '오늘도 잘 버텼어요. 잠들기 전에 잠깐 얘기해요.',
  ],
};

function pickLuciaGreeting(): string | null {
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const hour = nowKST.getUTCHours();
  let bucket: keyof typeof LUCIA_GREETINGS | null = null;
  if (hour >= 9 && hour < 12) bucket = 'morning';
  else if (hour >= 12 && hour < 14) bucket = 'lunch';
  else if (hour >= 14 && hour < 18) bucket = 'afternoon';
  else if (hour >= 18 && hour < 20) bucket = 'evening';
  else if (hour >= 20 && hour < 22) bucket = 'night';
  if (!bucket) return null;
  const list = LUCIA_GREETINGS[bucket];
  return list[Math.floor(Math.random() * list.length)];
}

const TeaTabContent = ({
  teaPersona,
  luciaGreeting,
}: {
  teaPersona: 'lucia' | 'jack' | 'echo';
  luciaGreeting: string | null;
}) => {
  const headline = TEA_PERSONA_HEADLINES[teaPersona];

  return (
    <div style={{ padding: '20px 12px 200px' }}>
      <h2
        style={{
          fontSize: 21,
          fontWeight: 800,
          lineHeight: 1.4,
          color: '#111827',
          textAlign: 'center',
          margin: '0 0 20px',
        }}
      >
        {headline.line1}
        <br />
        {headline.line2}
      </h2>
      {/* 앱 시작 시 1번만 픽 (마운트 시 결정). 22:00~08:59 비활성. */}
      {teaPersona === 'lucia' && luciaGreeting && (
        <div style={{ maxWidth: 440, margin: '0 auto', padding: '0 4px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: PERSONAS.lucia.iconBg,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 15,
                fontWeight: 800,
                flexShrink: 0,
                boxShadow: '0 2px 6px rgba(168, 85, 247, 0.25)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/avatars/lucia.webp"
                alt={PERSONAS.lucia.name}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
              />
              {PERSONAS.lucia.initial}
            </div>
            <div
              style={{
                background: PERSONAS.lucia.bubbleBg,
                border: `1px solid ${PERSONAS.lucia.bubbleBorder}`,
                borderRadius: '4px 18px 18px 18px',
                padding: '12px 16px',
                maxWidth: '85%',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: PERSONAS.lucia.iconBg,
                  marginBottom: 5,
                  letterSpacing: 0.3,
                }}
              >
                LUCIA
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 14.5,
                  lineHeight: 1.6,
                  color: PERSONAS.lucia.textColor,
                }}
              >
                {luciaGreeting}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface ChatWindowProps {
  initialMessage?: string;
}

export default function ChatWindow({ initialMessage }: ChatWindowProps = {}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [mounted, setMounted] = useState(false);
  const [input, setInput] = useState('');
  const [echoAnswerValue, setEchoAnswerValue] = useState('');
  const echoAnswerValueRef = useRef('');
  useEffect(() => { echoAnswerValueRef.current = echoAnswerValue; }, [echoAnswerValue]);
  const [showQuickQ, setShowQuickQ] = useState(false);
  const [teaPersona, setTeaPersona] = useState<'lucia' | 'jack' | 'echo'>('lucia');
  const [luciaGreeting, setLuciaGreeting] = useState<string | null>(null);
  // ✅ 히스토리 모달 — 페이지 이동 없이 같은 supabase 인스턴스로 데이터 조회 (모바일 세션 단절 방지)
  const [showHistory, setShowHistory] = useState(false);
  const supabaseRef = useMemo(() => createSupabaseBrowser(), []);

  useEffect(() => {
    // eslint-disable-next-line no-console
  }, [teaPersona]);

  useEffect(() => {
    setLuciaGreeting(pickLuciaGreeting());
  }, []);

  const [activeTab, setActiveTab] = useState<'추천'|'고급'|'뉴스'>('추천');

  const [sttSupported, setSttSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [autoRead, setAutoRead] = useState(false);
  const [voiceToast, setVoiceToast] = useState(false);
  const voiceToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoSendCountdown, setAutoSendCountdown] = useState<number | null>(null);
  const recognitionRef = useRef<{ start: () => void; stop: () => void; abort: () => void } | null>(null);
  const queuedPersonasRef = useRef<{ msgId: string; set: Set<'ray' | 'jack' | 'lucia' | 'echo'> }>({ msgId: '', set: new Set() });
  const autoSendStepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSendRef = useRef<() => void>(() => {});
  // 음성 마이크가 ECHO 답변 모드일 때는 echoAnswerValue로, 일반 모드에서는 input으로 transcript를 라우팅
  const activeInputUpdaterRef = useRef<(updater: (prev: string) => string) => void>(setInput);

  useEffect(() => {
    setSttSupported(isSTTSupported());
    setTtsSupported(isTTSSupported());
  }, []);

  useEffect(() => () => {
    stopSpeaking();
    try { recognitionRef.current?.abort(); } catch {}
    if (autoSendStepTimerRef.current) clearTimeout(autoSendStepTimerRef.current);
    if (voiceToastTimerRef.current) clearTimeout(voiceToastTimerRef.current);
  }, []);

  const cancelAutoSend = useCallback(() => {
    if (autoSendStepTimerRef.current) {
      clearTimeout(autoSendStepTimerRef.current);
      autoSendStepTimerRef.current = null;
    }
    setAutoSendCountdown(null);
  }, []);

  const startAutoSendCountdown = useCallback(() => {
    if (autoSendStepTimerRef.current) {
      clearTimeout(autoSendStepTimerRef.current);
      autoSendStepTimerRef.current = null;
    }
    setAutoSendCountdown(2);
    autoSendStepTimerRef.current = setTimeout(() => {
      setAutoSendCountdown(1);
      autoSendStepTimerRef.current = setTimeout(() => {
        autoSendStepTimerRef.current = null;
        setAutoSendCountdown(null);
        try { recognitionRef.current?.stop(); } catch {}
        setIsRecording(false);
        handleSendRef.current();
      }, 1000);
    }, 1000);
  }, []);

  const toggleRecording = useCallback(() => {
    if (!sttSupported) return;
    if (autoSendCountdown !== null) {
      cancelAutoSend();
      return;
    }
    if (isRecording) {
      try { recognitionRef.current?.stop(); } catch {}
      setIsRecording(false);
      return;
    }
    stopSpeaking();
    if (!autoRead) {
      setAutoRead(true);
      setVoiceToast(true);
      if (voiceToastTimerRef.current) clearTimeout(voiceToastTimerRef.current);
      voiceToastTimerRef.current = setTimeout(() => setVoiceToast(false), 3000);
    }
    const w = window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = new SR();
    rec.lang = 'ko-KR';
    rec.continuous = true;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const startIdx = e?.resultIndex ?? 0;
      let transcript = '';
      for (let i = startIdx; i < (e?.results?.length || 0); i++) {
        if (e.results[i]?.isFinal !== false) {
          transcript += e.results[i]?.[0]?.transcript || '';
        }
      }
      if (transcript) {
        activeInputUpdaterRef.current(prev => (prev ? prev.trimEnd() + ' ' + transcript : transcript));
        startAutoSendCountdown();
      }
    };
    rec.onend = () => setIsRecording(false);
    rec.onerror = () => setIsRecording(false);
    recognitionRef.current = rec;
    try {
      rec.start();
      setIsRecording(true);
    } catch {
      setIsRecording(false);
    }
  }, [sttSupported, isRecording, autoSendCountdown, autoRead, cancelAutoSend, startAutoSendCountdown]);

  useEffect(() => {
    if (!autoRead || !ttsSupported) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return;
    if (last.errorType) return;

    if (queuedPersonasRef.current.msgId !== last.id) {
      stopSpeaking();
      queuedPersonasRef.current = { msgId: last.id, set: new Set() };
    }
    const queued = queuedPersonasRef.current.set;

    type Item = { text: string; personaKey: 'ray' | 'jack' | 'lucia' | 'echo' };
    const newItems: Item[] = [];

    // luciaIntro TTS — 안내 멘트 가장 먼저 읽기
    if (last.luciaIntro && !queued.has('lucia')) {
      newItems.push({
        text: sanitizeForTTS(last.luciaIntro, 'lucia'),
        personaKey: 'lucia' as const,
      });
      queued.add('lucia');
    }

    if (last.teaMode) {
      const order: { key: 'lucia' | 'jack' | 'echo' | 'ray'; text?: string | null }[] = [
        { key: 'lucia', text: last.teaLucia },
        { key: 'jack',  text: last.teaJack  },
        { key: 'echo',  text: last.teaEcho  },
        { key: 'ray',   text: last.teaRay   },
      ];
      for (const o of order) {
        if (queued.has(o.key) || !o.text) continue;
        newItems.push({
          text: sanitizeForTTS(o.text, o.key),
          personaKey: o.key,
        });
        queued.add(o.key);
      }
    } else if (last.personas) {
      const order: { key: 'ray' | 'jack' | 'lucia' | 'echo'; text?: string | null }[] = [
        { key: 'ray',   text: last.personas.ray   },
        { key: 'jack',  text: last.personas.jack  },
        { key: 'lucia', text: last.personas.lucia },
        {
          key: 'echo',
          text: last.personas.echoDetails
            ? last.personas.echo + ' ' + last.personas.echoDetails
            : last.personas.echo,
        },
      ];
      for (const o of order) {
        if (queued.has(o.key) || !o.text) continue;
        const suffix = o.key !== 'echo' ? ' 자세한 내용은 화면을 확인하세요.' : '';
        newItems.push({
          text: sanitizeForTTS(o.text, o.key) + suffix,
          personaKey: o.key,
        });
        queued.add(o.key);
      }
    } else if (last.content && !queued.has('jack')) {
      newItems.push({ text: sanitizeForTTS(last.content, 'jack'), personaKey: 'jack' });
      queued.add('jack');
    }

    if (newItems.length > 0) {
      notifySpeaking(true);
      const first = newItems[0];
      const rest = newItems.slice(1);
      speakOne(first.text, first.personaKey, () => {
        if (rest.length > 0) enqueueSpeak(rest);
        else notifySpeaking(false);
      });
    }
  }, [
    messages,
    autoRead,
    ttsSupported,
    messages[messages.length - 1]?.content?.length,
    messages[messages.length - 1]?.teaLucia?.length,
    messages[messages.length - 1]?.teaJack?.length,
    messages[messages.length - 1]?.teaEcho?.length,
    messages[messages.length - 1]?.teaRay?.length,
    messages[messages.length - 1]?.personas?.ray?.length,
    messages[messages.length - 1]?.personas?.jack?.length,
    messages[messages.length - 1]?.personas?.lucia?.length,
    messages[messages.length - 1]?.personas?.echo?.length,
  ]);

  const QUICK_QUESTIONS = useMemo(() => {
    const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const hour = nowKST.getUTCHours();
    const minute = nowKST.getUTCMinutes();
    const timeKST = hour * 100 + minute;
    const day = nowKST.getUTCDay();
    const isWeekend = day === 0 || day === 6;
    const isKROpen = !isWeekend && timeKST >= 900 && timeKST < 1530;
    const isKRBeforeOpen = !isWeekend && timeKST < 900;
    const isUSOpen = !isWeekend && (timeKST >= 2330 || timeKST < 600);

    type Q = { level: '시장' | '분석' | '전략'; color: string; bg: string; text: string };
    const G = '#16a34a'; const GB = '#dcfce7';
    const Y = '#d97706'; const YB = '#fef9c3';
    const R = '#dc2626'; const RB = '#fee2e2';

    const BASE: Q[] = [
      { level: '시장', color: G, bg: GB, text: '오늘 한국/미국 시장 사도 되는 분위기야?' },
      { level: '시장', color: G, bg: GB, text: '코인 지금 매수 vs 관망, 결론만' },
      { level: '분석', color: Y, bg: YB, text: '외국인이 사는 종목 중 따라가도 되는 게 있어?' },
      { level: '분석', color: Y, bg: YB, text: '지금 100만원이면 비중 어떻게 나눠?' },
      { level: '전략', color: R, bg: RB, text: '나스닥과 코스피 지금 따로 움직이고 있어?' },
      { level: '전략', color: R, bg: RB, text: '지금 들어가면 손절 어디야?' },
    ];

    if (isWeekend) {
      return [
        { level: '시장', color: G, bg: GB, text: '오늘 한국/미국 시장 사도 되는 분위기야?' },
        { level: '시장', color: G, bg: GB, text: '코인 지금 매수 vs 관망, 결론만' },
        { level: '시장', color: G, bg: GB, text: '지금 들어가도 되는 종목 1개만' },
        { level: '분석', color: Y, bg: YB, text: '다음 주 주목할 섹터는 어디야?' },
        { level: '분석', color: Y, bg: YB, text: '외국인이 사는 종목 중 따라가도 되는 게 있어?' },
        { level: '분석', color: Y, bg: YB, text: '지금 100만원이면 비중 어떻게 나눠?' },
        { level: '분석', color: Y, bg: YB, text: '거래량 갑자기 터진 종목, 진짜야 페이크야?' },
        { level: '전략', color: R, bg: RB, text: '지금 장에서 추세추종 vs 역추세 중 뭐가 유리해?' },
        { level: '전략', color: R, bg: RB, text: '나스닥과 코스피 지금 따로 움직이고 있어?' },
        { level: '전략', color: R, bg: RB, text: '지금 들어가면 손절 어디야?' },
      ] as Q[];
    }

    if (isKRBeforeOpen) {
      return [
        { level: '시장', color: G, bg: GB, text: '오늘 한국/미국 시장 사도 되는 분위기야?' },
        { level: '시장', color: G, bg: GB, text: '오늘 장 열리면 첫 번째로 봐야 할 종목은?' },
        { level: '시장', color: G, bg: GB, text: '코인 지금 매수 vs 관망, 결론만' },
        { level: '분석', color: Y, bg: YB, text: '오늘 장 초반 30분 거래량 기준 뭘 봐야 해?' },
        { level: '분석', color: Y, bg: YB, text: '외국인이 사는 종목 중 따라가도 되는 게 있어?' },
        { level: '분석', color: Y, bg: YB, text: '지금 가장 강한 섹터에서 타이밍 맞는 종목은?' },
        { level: '분석', color: Y, bg: YB, text: '지금 100만원이면 비중 어떻게 나눠?' },
        { level: '전략', color: R, bg: RB, text: '어제 장 결과 — 오늘 전략은?' },
        { level: '전략', color: R, bg: RB, text: '나스닥과 코스피 지금 따로 움직이고 있어?' },
        { level: '전략', color: R, bg: RB, text: '지금 들어가면 손절 어디야?' },
      ] as Q[];
    }

    if (isKROpen) {
      return [
        { level: '시장', color: G, bg: GB, text: '지금 들어가도 되는 종목 1개만' },
        { level: '시장', color: G, bg: GB, text: '오늘 한국/미국 시장 사도 되는 분위기야?' },
        { level: '시장', color: G, bg: GB, text: '코인 지금 매수 vs 관망, 결론만' },
        { level: '분석', color: Y, bg: YB, text: '거래량 갑자기 터진 종목, 진짜야 페이크야?' },
        { level: '분석', color: Y, bg: YB, text: '지금 가장 강한 섹터에서 타이밍 맞는 종목은?' },
        { level: '분석', color: Y, bg: YB, text: '외국인이 사는 종목 중 따라가도 되는 게 있어?' },
        { level: '분석', color: Y, bg: YB, text: '지금 100만원이면 비중 어떻게 나눠?' },
        { level: '전략', color: R, bg: RB, text: '지금 들어가면 손절 어디야?' },
        { level: '전략', color: R, bg: RB, text: '지금 장에서 추세추종 vs 역추세 중 뭐가 유리해?' },
        { level: '전략', color: R, bg: RB, text: '나스닥과 코스피 지금 따로 움직이고 있어?' },
      ] as Q[];
    }

    if (isUSOpen) {
      return [
        { level: '시장', color: G, bg: GB, text: '오늘 한국/미국 시장 사도 되는 분위기야?' },
        { level: '시장', color: G, bg: GB, text: '지금 들어가도 되는 종목 1개만' },
        { level: '시장', color: G, bg: GB, text: '코인 지금 매수 vs 관망, 결론만' },
        { level: '분석', color: Y, bg: YB, text: '거래량 갑자기 터진 종목, 진짜야 페이크야?' },
        { level: '분석', color: Y, bg: YB, text: '지금 가장 강한 섹터에서 타이밍 맞는 종목은?' },
        { level: '분석', color: Y, bg: YB, text: '외국인이 사는 종목 중 따라가도 되는 게 있어?' },
        { level: '분석', color: Y, bg: YB, text: '지금 100만원이면 비중 어떻게 나눠?' },
        { level: '전략', color: R, bg: RB, text: '나스닥과 코스피 지금 따로 움직이고 있어?' },
        { level: '전략', color: R, bg: RB, text: '지금 장에서 추세추종 vs 역추세 중 뭐가 유리해?' },
        { level: '전략', color: R, bg: RB, text: '지금 들어가면 손절 어디야?' },
      ] as Q[];
    }

    return [
      ...BASE,
      { level: '분석', color: Y, bg: YB, text: '지금 가장 강한 섹터에서 타이밍 맞는 종목은?' },
      { level: '분석', color: Y, bg: YB, text: '거래량 갑자기 터진 종목, 진짜야 페이크야?' },
      { level: '전략', color: R, bg: RB, text: '지금 장에서 추세추종 vs 역추세 중 뭐가 유리해?' },
      { level: '전략', color: R, bg: RB, text: '오늘 장 결과 — 내일 전략은?' },
    ] as Q[];
  }, []);

  const ADVANCED_QUESTIONS = useMemo(() => {
    type AQ = { level: '전략형' | '시장분석형' | '심리판단형' | '40-50대 특화형'; color: string; bg: string; text: string };
    const P = '#db2777'; const PB = '#fce7f3';
    const G = '#16a34a'; const GB = '#dcfce7';
    const V = '#9333ea'; const VB = '#f3e8ff';
    const O = '#ea580c'; const OB = '#ffedd5';
    return [
      { level: '전략형', color: P, bg: PB, text: '워런 버핏이라면 지금 삼성전자를 샀을까?' },
      { level: '전략형', color: P, bg: PB, text: '하락장에서 돈 버는 유일한 방법은 무엇인가?' },
      { level: '전략형', color: P, bg: PB, text: '지금 현금이 최고의 투자인 이유는?' },
      { level: '전략형', color: P, bg: PB, text: '상승 추세에서 눌림 매수 vs 돌파 매수, 어떤 상황에서 유리한가?' },
      { level: '전략형', color: P, bg: PB, text: '손절을 가격 기준으로 할지, 시간 기준으로 할지 어떻게 정하나?' },
      { level: '시장분석형', color: G, bg: GB, text: '지금 시장에서 개미는 절대 이길 수 없는 구간인가?' },
      { level: '시장분석형', color: G, bg: GB, text: '공매도 세력이 노리는 종목의 특징은?' },
      { level: '시장분석형', color: G, bg: GB, text: 'AI가 투자를 대체하면 기술적 분석은 죽는가?' },
      { level: '시장분석형', color: G, bg: GB, text: '지금 구간이 상승 초입인지 끝물인지 어떻게 구분하나?' },
      { level: '시장분석형', color: G, bg: GB, text: '외국인 매수와 기관 매수가 동시에 들어올 때 신뢰도는?' },
      { level: '심리판단형', color: V, bg: VB, text: '공포에 팔고 욕심에 사는 패턴을 끊는 방법은?' },
      { level: '심리판단형', color: V, bg: VB, text: '확신과 과신의 차이를 어떻게 구분하나?' },
      { level: '심리판단형', color: V, bg: VB, text: '손실 후 복구 매매를 하면 안 되는 이유는?' },
      { level: '심리판단형', color: V, bg: VB, text: '수익 중일 때 계속 들고 갈지, 일부 익절할지 기준은?' },
      { level: '심리판단형', color: V, bg: VB, text: '시장이 불확실할 때 현금 비중 늘리는 타이밍은?' },
      { level: '40-50대 특화형', color: O, bg: OB, text: '교육비와 노후 준비, 어떻게 균형을 잡나?' },
      { level: '40-50대 특화형', color: O, bg: OB, text: '부모님 요양비가 생겼을 때 투자를 줄여야 하나?' },
      { level: '40-50대 특화형', color: O, bg: OB, text: '이직 고민 중인데 지금 투자를 계속해도 될까?' },
      { level: '40-50대 특화형', color: O, bg: OB, text: '부부가 소비 스타일이 달라서 싸워요. 어떻게 해결하나?' },
      { level: '40-50대 특화형', color: O, bg: OB, text: '50대에 처음 투자 시작해도 늦지 않았나?' },
    ] as AQ[];
  }, []);

  const [isLoading, setIsLoading] = useState(false);
  const [isAdvancedLoading, setIsAdvancedLoading] = useState(false);
  const [showPosition, setShowPosition] = useState(false);
  const [pendingText, setPendingText] = useState('');
  const [pendingKeyword, setPendingKeyword] = useState('');
  const [pendingInitialPosition, setPendingInitialPosition] = useState<Partial<Position> | null>(null);
  const [pendingOrder, setPendingOrder] = useState<PersonaKey[] | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<Message[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    messagesRef.current = [];
    setMessages([]);
  }, []);

  const hasUserSent = useMemo(() => messages.some(m => m.role === 'user'), [messages]);

  // ECHO 질문이 살아있는 동안에는 메인 입력창을 숨기고 EchoAnswerInline만 노출
  const pendingEchoQuestion = useMemo(() => {
    if (messages.length === 0) return false;
    const last = messages[messages.length - 1];
    if (last.role !== 'assistant' || !last.personas) return false;
    // ✅ solo 응답(order.length === 1)은 ECHO 답변이어도 2라운드 입력창 차단.
    //   호명된 1명만 답하는 모드이므로 ECHO 질문→2라운드 흐름 자체가 없음.
    //   (예: "에코는 어떻게 봐요?" → ECHO solo 답변. 질문창 추가 노출 시 대화창 2개로 보이는 버그.)
    const order = last.personas.order;
    if (Array.isArray(order) && order.length === 1) return false;
    const echo = last.personas.echo;
    const echo2 = last.personas.echo2;
    const hasEcho = typeof echo === 'string' && echo.trim().length > 0;
    const hasEcho2 = typeof echo2 === 'string' && echo2.trim().length > 0;
    return hasEcho && !hasEcho2 && echo!.includes('?');
  }, [messages]);

  const scrollPadding = hasUserSent ? '20px 0 140px' : '16px 0 140px';

  useEffect(() => {
    if (messages.length === 0) return;
    let lastUserId: string | null = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserId = messages[i].id;
        break;
      }
    }
    if (!lastUserId) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    const el = container.querySelector(`[data-msg-id="${lastUserId}"]`) as HTMLElement | null;
    if (!el) return;
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const offsetTop = elRect.top - containerRect.top + container.scrollTop;
    container.scrollTo({ top: offsetTop, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const nextHeight = Math.min(el.scrollHeight, 160);
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > 160 ? 'auto' : 'hidden';
  }, [input]);

  const handleSendWithPosition = useCallback(async (text: string, position: Position | null, isAdvanced: boolean = false) => {
    stopSpeaking();
    setShowPosition(false);

    // 재테크 키워드가 포함되면 4명 동시 답변, 아니면 단일 페르소나(LUCIA/JACK/ECHO)
    // sports/news/legal/tech 카테고리는 항상 teaMode=true
    const FORCE_TEA_RE = /재테크|투자|고민|부동산|금리|수익|절약|저축방법|노후|은퇴|야구|축구|농구|배구|골프|올림픽|이길|승부|우승|선수|리그|야구단|기아타이거즈|두산베어스|LG트윈스|롯데자이언츠|한화이글스|삼성라이온즈|정세|뉴스|전쟁|분쟁|중동|러시아|우크라이나|미중|외교|정치|세금|법률|소송|이혼|상속/;
    const isTeaSend = true;

    // eslint-disable-next-line no-console
    // eslint-disable-next-line no-console

    const teaRound = isTeaSend
      ? messagesRef.current.filter(m => m.role === 'user' && m.teaMode).length + 1
      : 0;

    const userMsg: Message = {
      id: generateId(),
      role: 'user',
      content: text,
      timestamp: new Date(),
      isRead: false,
      teaMode: isTeaSend,
    };

    const nextMessages = [...messagesRef.current, userMsg];
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    setIsLoading(true);
    // ✅ solo 호명 즉시 감지 → pendingOrder 선반영 (로딩 메시지가 올바른 페르소나로 표시).
    //   서버 routeMessage의 detectPersonaInvocation/PERSONA_CALL_PATTERNS와 동일 패턴 (영문 + 한국어).
    //   경계 조건: 앞 비-한글/영문, 뒤 비-한글/영문 OR 한국어 조사(은/는/이/가/을/를/의/야/아/도/만/씨/님/과/와/로/께).
    //   ✅ "에코는 어떻게?" / "잭이 봤어요" / "루시아 의견" — 매칭
    //   ⛔ "에코백/루시퍼/레이저/잭슨/JACKET" — 차단
    //   긴 별칭 우선 (alternation 좌→우 평가) — "루시아"가 "루시"보다 우선.
    const buildSoloPattern = (alternation: string): RegExp =>
      new RegExp(
        `(?:^|[^가-힣a-zA-Z])(?:${alternation})(?:$|[^가-힣a-zA-Z]|(?=[은는이가을를의야아도만씨님과와로께]))`,
        'i',
      );
    const SOLO_DETECT_RULES: Array<{ key: PersonaKey; re: RegExp }> = [
      { key: 'lucia', re: buildSoloPattern('LUCIA|루시아|루이사|루누님|루시') },
      { key: 'echo',  re: buildSoloPattern('ECHO|에코') },
      { key: 'jack',  re: buildSoloPattern('JACK|째앵|째액|잭|짹') },
      { key: 'ray',   re: buildSoloPattern('RAY|레이꾼|레\\s+대리|레이') },
    ];
    const soloMatch = SOLO_DETECT_RULES.find(({ re }) => re.test(text));
    setPendingOrder(soloMatch ? [soloMatch.key] : null); // 새 요청마다 초기화 (solo면 즉시 호명 페르소나)
    if (isAdvanced) setIsAdvancedLoading(true);
    setInput('');

    const requestBody = {
      messages: nextMessages.slice(-10).map(m => ({
        role: m.role,
        content: m.content,
        ...(m.role === 'assistant' && m.teaJack ? { teaJack: m.teaJack } : {}),
        ...(m.role === 'assistant' && m.teaEcho ? { teaEcho: m.teaEcho } : {}),
        ...(m.role === 'assistant' && m.teaRay ? { teaRay: m.teaRay } : {}),
        ...(m.role === 'assistant' && m.luciaIntro ? { luciaIntro: m.luciaIntro } : {}),
        // ✅ 단일 호출 태그 오케스트레이터 — 2라운드 호출 시 1라운드 personas 컨텍스트 전달
        ...(m.role === 'assistant' && m.personas ? { personas: m.personas } : {}),
      })),
      positionContext: buildPositionContext(position),
      teaMode: isTeaSend,
      teaRound,
      teaPersona: isTeaSend ? teaPersona : undefined,
      isAdvancedQuestion: isAdvanced,
    };

    if (isTeaSend) {
      // eslint-disable-next-line no-console
      // eslint-disable-next-line no-console
      console.debug('[tea] request body —', '/ teaMode:', requestBody.teaMode, '/ teaRound:', requestBody.teaRound, '/ messages count:', requestBody.messages.length);
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      // ✅ NDJSON 스트리밍 응답 처리 — 각 페르소나 완성 시점에 청크 단위로 버블 갱신
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/x-ndjson') && response.body) {
        const assistantId = generateId();
        const initialPersonas: PersonaData = {
          jack: '', lucia: '', ray: '', echo: '',
          ray2: null, jack2: null, lucia2: null, echo2: null,
          verdict: '관망', confidence: 0, breakdown: '', positionSizing: '0%',
          jackNews: null, luciaNews: null, rayNews: null, echoNews: null,
          order: ['lucia', 'jack', 'ray'],
        };
        const initialMsg: Message = {
          id: assistantId,
          role: 'assistant',
          timestamp: new Date(),
          content: '',
          personas: initialPersonas,
          retryText: text,
        };
        const startedMessages = [...nextMessages, initialMsg];
        messagesRef.current = startedMessages;
        setMessages(startedMessages);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const applyEvent = (event: { type?: string; key?: string; round?: number; text?: string; personas?: PersonaData; reply?: string }) => {
          setMessages(prev => prev.map(m => {
            if (m.id !== assistantId || !m.personas) return m;
            const p = { ...m.personas } as PersonaData & Record<string, unknown>;
            if (event.type === 'persona' && event.key && event.round) {
              const fieldKey = event.round === 2 ? `${event.key}2` : event.key;
              p[fieldKey] = event.text ?? '';
              // 1라운드 ECHO 도착 후 round 2 placeholder 비우기는 echo 이벤트에서 처리
              return { ...m, personas: p };
            }
            if (event.type === 'echo' && event.round) {
              const fieldKey = event.round === 2 ? 'echo2' : 'echo';
              p[fieldKey] = event.text ?? '';
              if (event.round === 1) {
                // ECHO 1 도착 → round 2 placeholder 시작 (null → '')
                if (p.ray2 === null) p.ray2 = '';
                if (p.jack2 === null) p.jack2 = '';
                if (p.lucia2 === null) p.lucia2 = '';
              }
              return { ...m, personas: p };
            }
            if (event.type === 'done' && event.personas) {
              if (event.personas.order && event.personas.order.length > 0) {
                setPendingOrder(event.personas.order);
              }
              return { ...m, content: event.reply || '', personas: event.personas };
            }
            return m;
          }));
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              applyEvent(JSON.parse(trimmed));
            } catch (e) {
              console.warn('[stream] parse 실패', e, trimmed);
            }
          }
        }
        // flush any tail
        if (buffer.trim()) {
          try { applyEvent(JSON.parse(buffer.trim())); } catch {}
        }
        return;
      }

      const data = await response.json();

      if (isTeaSend) {
        // eslint-disable-next-line no-console
        console.debug('[tea] request teaRound:', teaRound, '/ response keys:', Object.keys(data), '/ teaLucia?', !!data.teaLucia, '/ teaJack?', !!data.teaJack, '/ teaEcho?', !!data.teaEcho, '/ teaRay?', !!data.teaRay);
      }

      // [TEMP DEBUG] news round-2 필드 확인용 — 운영 배포 후 제거 예정
      // eslint-disable-next-line no-console
      console.debug('[round2-probe] data.teaMode:', data.teaMode,
        '/ personas keys:', data.personas ? Object.keys(data.personas) : null,
        '/ ray2?', !!data.personas?.ray2,
        '/ jack2?', !!data.personas?.jack2,
        '/ lucia2?', !!data.personas?.lucia2,
        '/ echo2?', !!data.personas?.echo2,
        '/ teaRay2?', !!data.teaRay2,
        '/ teaJack2?', !!data.teaJack2,
        '/ teaLucia2?', !!data.teaLucia2,
        '/ teaEcho2?', !!data.teaEcho2,
        '/ breakdown:', data.personas?.breakdown);

      const assistantMsg: Message = {
        id: generateId(),
        role: 'assistant',
        timestamp: new Date(),
        content: data.reply || data.teaLucia || data.teaRay || '',
        personas: data.personas || null,
        newsLinks: data.newsLinks || [],
        errorType: data.errorType,
        errorMessage: data.errorMessage,
        retryText: data.errorType === 'keyword_not_recognized' ? undefined : text,
        teaMode: data.teaMode,
        teaLucia: data.teaLucia,
        teaJack: data.teaJack,
        teaEcho: data.teaEcho,
        teaRay: data.teaRay,
        teaLucia2: data.teaLucia2,
        teaJack2: data.teaJack2,
        teaEcho2: data.teaEcho2,
        teaRay2: data.teaRay2,
        luciaIntro: typeof data.luciaIntro === 'string' && data.luciaIntro.trim() ? data.luciaIntro : undefined,
      };

      const updated = [...nextMessages, assistantMsg];
      messagesRef.current = updated;
      setMessages(updated);
    } catch {
      const errMsg: Message = {
        id: generateId(),
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        errorType: 'analysis_failed',
        errorMessage: '분석 중 오류가 발생했습니다.\n종목명을 다시 입력해주세요. 🔄',
        retryText: text,
      };
      const updated = [...nextMessages, errMsg];
      messagesRef.current = updated;
      setMessages(updated);
    } finally {
      setIsLoading(false);
      setPendingOrder(null);
      setIsAdvancedLoading(false);
    }
  }, [teaPersona]);

  const handleSend = useCallback((override?: string) => {
    const content = (override ?? input).trim();
    if (!content || isLoading) return;

    // ✅ 스포츠/감정/일반 쿼리 — 포지션 입력창 없이 바로 전송
    const SPORTS_RE = /야구|축구|농구|배구|골프|올림픽|경기|이길|승부|우승|선수|리그|야구단|축구단|기아타이거즈|삼성라이온즈|두산베어스|LG트윈스|롯데자이언츠|한화이글스/;
    const EMOTION_RE = /힘들|외로|슬프|우울|화나|기쁘|설레|불안|걱정|스트레스|피곤|지쳐|고민|마음|감정|위로|공감|바빠|바쁘|힘내|아파|아프/;
    if (SPORTS_RE.test(content) || EMOTION_RE.test(content)) {
      handleSendWithPosition(content, null);
      return;
    }

    const matched = detectKeyword(content);

    const parseInlineValue = (m: RegExpMatchArray | null): string => {
      if (!m) return '';
      const numStr = m[1].replace(/,/g, '');
      const unit = m[2] || '';
      let value = parseFloat(numStr);
      if (!Number.isFinite(value)) return '';
      if (unit === '만원' || unit === '만') value *= 10000;
      if (unit === '억원' || unit === '억') value *= 100000000;
      return String(value);
    };
    const avgMatch = content.match(/(?:평단가?|평균가)[:\s]*([\d,.]+)\s*(만원|만|억원|억|원|USD|달러)?/);
    const buyMatch = content.match(/(?:매수가|취득가)[:\s]*([\d,.]+)\s*(만원|만|억원|억|원|USD|달러)?/);
    const qtyMatch = content.match(/(?:수량|보유)[:\s]*([\d,.]+)/);
    const inlineAvg = parseInlineValue(avgMatch);
    const inlineBuy = parseInlineValue(buyMatch);
    const inlineQty = qtyMatch ? qtyMatch[1].replace(/,/g, '') : '';
    const hasInlinePosition = !!(inlineAvg || inlineBuy || inlineQty);

    const showModal =
      matched &&
      (hasInlinePosition || shouldShowPosition(content, matched));
    if (showModal) {
      setPendingText(content);
      setPendingKeyword(matched);
      setPendingInitialPosition(hasInlinePosition
        ? { avgPrice: inlineAvg, buyPrice: inlineBuy, quantity: inlineQty, note: '' }
        : null);
      setShowPosition(true);
      return;
    }

    handleSendWithPosition(content, null);
  }, [input, isLoading, handleSendWithPosition]);

  // ECHO 답변 제출 — echoAnswerValue 기반 (마이크 자동전송도 이 경로 사용)
  const submitEchoAnswer = useCallback(() => {
    const v = echoAnswerValueRef.current.trim();
    if (!v || isLoading) return;
    setEchoAnswerValue('');
    handleSendWithPosition(v, null);
  }, [isLoading, handleSendWithPosition]);

  const skipEchoAnswer = useCallback(() => {
    if (isLoading) return;
    setEchoAnswerValue('');
    handleSendWithPosition('', null);
  }, [isLoading, handleSendWithPosition]);

  // 모드별 라우팅: pendingEchoQuestion이면 마이크 transcript→echoAnswer, 자동전송→ECHO 답변 제출
  useEffect(() => {
    if (pendingEchoQuestion) {
      activeInputUpdaterRef.current = setEchoAnswerValue;
      handleSendRef.current = submitEchoAnswer;
    } else {
      activeInputUpdaterRef.current = setInput;
      handleSendRef.current = handleSend;
    }
  }, [pendingEchoQuestion, handleSend, submitEchoAnswer]);

  const isSpeakingGlobal = useIsSpeaking();
  useEffect(() => {
    if (!ttsSupported || !isSpeakingGlobal) return;
    const handler = () => stopSpeaking();
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [ttsSupported, isSpeakingGlobal]);

  // ✅ HomeScreen에서 넘긴 첫 메시지 자동 전송 (mount 1회만)
  const initialSentRef = useRef(false);
  useEffect(() => {
    if (initialSentRef.current) return;
    if (!mounted) return;
    const seed = initialMessage?.trim();
    if (!seed) return;
    initialSentRef.current = true;
    handleSend(seed);
  }, [mounted, initialMessage, handleSend]);

  if (!mounted) return null;

  return (
    <>
      <style>{`
        .px-app-root {
          height: 100vh;
          height: 100dvh;
        }
        .px-onboarding-wrap {
          padding: 0 0 20px;
          box-sizing: border-box;
        }
      `}</style>
    <div
      className="px-app-root"
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: '#E8DCC0',
        fontFamily: 'sans-serif',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        boxSizing: 'border-box',
      }}
    >
      <header
        style={{
          background: '#E8DCC0',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #f1f1f4',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <Logo size="sm" />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: '60vw' }}>
          <AuthButton />
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            style={{
              background: '#fff',
              padding: '5px 12px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              color: '#374151',
              border: '1px solid #d1d5db',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
            }}
          >
            History
          </button>
        </div>
      </header>

      {/* pointerEvents: none — 배너 자체는 클릭 가로채지 않도록 (아래 콘텐츠가 그대로 클릭됨). */}
      {isSpeakingGlobal && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: 60,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 60,
            padding: '6px 14px',
            background: '#dbeafe',
            border: '1px solid #93c5fd',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            color: '#1e40af',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            boxShadow: '0 2px 8px rgba(30,64,175,0.18)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          <span>🔊 읽는 중... (누르면 중지)</span>
        </div>
      )}

      {voiceToast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: 60,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 70,
            padding: '8px 16px',
            background: '#1e3a8a',
            color: '#ffffff',
            borderRadius: 999,
            fontSize: 12.5,
            fontWeight: 700,
            boxShadow: '0 4px 12px rgba(30,58,138,0.35)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          🔊 음성 입력 감지 — 자동읽기가 켜졌어요
        </div>
      )}

      {/* HomeScreen은 app/page.tsx 레벨에서 분리 호스팅 — ChatWindow는 채팅 진입 후만 책임 */}
      {hasUserSent && (
      <div ref={scrollContainerRef} style={{ flex: 1, overflowY: 'auto', padding: scrollPadding }}>
        {teaPersona !== 'lucia' && (() => {
          const p = TEA_PERSONAS_INFO.find(x => x.key === teaPersona)!;
          return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '0 12px 10px' }}>
              <button
                type="button"
                onClick={() => setTeaPersona('lucia')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: p.bg,
                  border: `1px solid ${p.border}`,
                  borderRadius: 999,
                  padding: '5px 12px',
                  fontSize: 12,
                  fontWeight: 700,
                  color: p.fg,
                  cursor: 'pointer',
                }}
                title="LUCIA로 돌아가기"
              >
                <span style={{ fontSize: 14 }}>{p.emoji}</span>
                <span>{p.name}와 대화 중 · 💜 LUCIA로 돌아가기</span>
              </button>
            </div>
          );
        })()}
        {messages.map((msg, msgIdx) => (
          <div key={msg.id}>
            {msg.role === 'user' ? (
              // ✅ ECHO 질문 건너뛰기로 빈 값 전송된 경우 user 버블을 숨김
              msg.content.trim() ? (
                <div data-msg-id={msg.id} style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, padding: '0 12px' }}>
                  <div style={{ background: '#FAE100', borderRadius: '15px 0 15px 15px', padding: '10px 15px', maxWidth: '75%', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>
                      {msg.content.includes('약 10초') ? (
                        <>
                          {msg.content.split('약 10초')[0]}
                          <span style={{ fontWeight: 900, fontSize: 16 }}>약 10초</span>
                          {msg.content.split('약 10초')[1]}
                        </>
                      ) : msg.content}
                    </p>
                  </div>
                </div>
              ) : null
            ) : msg.errorType && msg.errorMessage ? (
              <div style={{ marginBottom: 12 }}>
                <ErrorCard
                  message={msg.errorMessage}
                  showRetry={msg.errorType !== 'keyword_not_recognized' && !!msg.retryText}
                  onRetry={msg.retryText ? () => handleSendWithPosition(msg.retryText!, null) : undefined}
                />
              </div>
            ) : msg.teaMode ? (
              <div style={{ marginBottom: 12 }}>
                {msg.luciaIntro && (
                  <PersonaBubble
                    personaKey="lucia"
                    text={msg.luciaIntro}
                    timestamp={msg.timestamp}
                  />
                )}
                {msg.teaLucia && (
                  <PersonaBubble
                    personaKey="lucia"
                    text={cleanTeaText(msg.teaLucia)}
                    timestamp={msg.timestamp}
                  />
                )}
                {msg.teaJack && (
                  <PersonaBubble
                    personaKey="jack"
                    text={cleanJackText(msg.teaJack)}
                    timestamp={msg.timestamp}
                  />
                )}
                {msg.teaEcho && (
                  <PersonaBubble
                    personaKey="echo"
                    text={cleanTeaText(msg.teaEcho)}
                    timestamp={msg.timestamp}
                    hideEchoTag
                  />
                )}
                {msg.teaRay && (
                  <PersonaBubble
                    personaKey="ray"
                    text={cleanTeaText(msg.teaRay)}
                    timestamp={msg.timestamp}
                  />
                )}
                {msg.teaRay2 && (
                  <PersonaBubble
                    personaKey="ray"
                    text={cleanTeaText(msg.teaRay2)}
                    timestamp={msg.timestamp}
                  />
                )}
                {msg.teaJack2 && (
                  <PersonaBubble
                    personaKey="jack"
                    text={cleanJackText(msg.teaJack2)}
                    timestamp={msg.timestamp}
                  />
                )}
                {msg.teaLucia2 && (
                  <PersonaBubble
                    personaKey="lucia"
                    text={cleanTeaText(msg.teaLucia2)}
                    timestamp={msg.timestamp}
                  />
                )}
                {msg.teaEcho2 && (
                  <PersonaBubble
                    personaKey="echo"
                    text={cleanTeaText(msg.teaEcho2)}
                    timestamp={msg.timestamp}
                    hideEchoTag
                  />
                )}
              </div>
            ) : (
              <div style={{ marginBottom: 12 }}>
                {msg.luciaIntro && (
                  <PersonaBubble
                    personaKey="lucia"
                    text={msg.luciaIntro}
                    timestamp={msg.timestamp}
                  />
                )}
                {msg.personas?.isAdvancedAnswer && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    margin: '4px 12px 10px',
                    padding: '6px 10px',
                    background: 'linear-gradient(90deg, #fef3c7 0%, #fce7f3 100%)',
                    border: '1px solid #fbbf24',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 800,
                    color: '#92400e',
                    width: 'fit-content',
                  }}>
                    <span>💡</span>
                    <span>전략 분석</span>
                  </div>
                )}
                {msg.personas ? (() => {
                  const jackText = msg.personas.jack;
                  const luciaText = msg.personas.lucia;
                  const jackSplitIdx = jackText.indexOf('\n↳ ');
                  const hasConflict = jackSplitIdx !== -1;

                  // [TEMP DEBUG] news 응답 렌더 분기 확인용 — 제거 예정
                  // eslint-disable-next-line no-console
                  console.debug('[round2-render] branch:', msg.teaMode ? 'tea' : (hasConflict ? 'conflict' : 'non-conflict'),
                    '/ breakdown:', msg.personas.breakdown,
                    '/ has ray2?', !!msg.personas.ray2,
                    '/ has jack2?', !!msg.personas.jack2,
                    '/ has lucia2?', !!msg.personas.lucia2,
                    '/ has echo2?', !!msg.personas.echo2);

                  if (hasConflict) {
                    const jackMain = jackText.slice(0, jackSplitIdx).trim();
                    const jackRebuttalText = jackText.slice(jackSplitIdx + 1).trim();
                    const luciaSplitIdx = luciaText.indexOf('\n↳ ');
                    const luciaMain = luciaSplitIdx !== -1 ? luciaText.slice(0, luciaSplitIdx).trim() : luciaText;

                    return (
                      <>
                        <PersonaBubble personaKey="ray" text={msg.personas.ray} timestamp={msg.timestamp} newsItem={msg.personas.rayNews} details={msg.personas.rayDetails} />
                        <PersonaBubble personaKey="jack" text={jackMain} timestamp={msg.timestamp} newsItem={msg.personas.jackNews} details={msg.personas.jackDetails} />
                        <PersonaBubble personaKey="lucia" text={luciaMain} timestamp={msg.timestamp} newsItem={msg.personas.luciaNews} details={msg.personas.luciaDetails} />
                        <PersonaBubble personaKey="jack" text={jackRebuttalText} timestamp={msg.timestamp} isRebuttal />
                        <EchoBubble
                          summary={msg.personas.echo}
                          details={msg.personas.echoDetails}
                          timestamp={msg.timestamp}
                          echoNews={msg.personas.echoNews}
                          hideDisclaimer={msg.personas.breakdown !== undefined}
                        />
                        {msg.personas.ray2 && (
                          <PersonaBubble personaKey="ray" text={msg.personas.ray2} timestamp={msg.timestamp} />
                        )}
                        {msg.personas.jack2 && (
                          <PersonaBubble personaKey="jack" text={msg.personas.jack2} timestamp={msg.timestamp} />
                        )}
                        {msg.personas.lucia2 && (
                          <PersonaBubble personaKey="lucia" text={msg.personas.lucia2} timestamp={msg.timestamp} />
                        )}
                        {msg.personas.echo2 && (
                          <EchoBubble summary={msg.personas.echo2} timestamp={msg.timestamp} hideDisclaimer />
                        )}
                      </>
                    );
                  }

                  // 오케스트레이터가 결정한 발언 순서 사용. 미지정 시 RAY→JACK→LUCIA 폴백.
                  const validKeys: PersonaKey[] = ['ray', 'jack', 'lucia', 'echo'];
                  const order: PersonaKey[] =
                    Array.isArray(msg.personas.order) && msg.personas.order.length > 0 &&
                    msg.personas.order.every(k => (validKeys as string[]).includes(k))
                      ? msg.personas.order
                      : validKeys;

                  // 스트리밍 로딩 텍스트 — 페르소나별 대기 메시지
                  const loadingText: Record<PersonaKey, string> = {
                    ray: 'RAY가 분석 중...',
                    jack: 'JACK이 판단 중...',
                    lucia: 'LUCIA가 공감 중...',
                    echo: 'ECHO가 판결 중...',
                  };

                  // 1글자라도 도착하면 즉시 실제 텍스트로 전환. key를 loading↔real로 바꿔서
                  // PersonaBubble의 memo를 우회하고 강제 리마운트시킨다.
                  const hasText = (s: string | null | undefined): s is string =>
                    typeof s === 'string' && s.trim().length > 0;

                  const renderRound1 = (key: PersonaKey) => {
                    if (key === 'echo') {
                      if (!showEcho1) return null;
                      const hasEcho = hasText(msg.personas!.echo);
                      return (
                        <Fragment key={`echo1-wrap-${hasEcho ? 'real' : 'loading'}`}>
                          <EchoBubble
                            key={`echo1-${hasEcho ? 'real' : 'loading'}`}
                            summary={hasEcho ? msg.personas!.echo : loadingText.echo}
                            details={msg.personas!.echoDetails}
                            timestamp={msg.timestamp}
                            echoNews={msg.personas!.echoNews}
                            hideDisclaimer={msg.personas!.breakdown !== undefined}
                          />
                          {msgIdx === messages.length - 1 && hasEcho && !hasText(msg.personas!.echo2) && msg.personas!.echo!.includes('?') && (!Array.isArray(msg.personas!.order) || msg.personas!.order.length > 1) && (
                            <EchoAnswerInline
                              disabled={isLoading}
                              value={echoAnswerValue}
                              onChange={(v) => { setEchoAnswerValue(v); cancelAutoSend(); }}
                              onSubmit={submitEchoAnswer}
                              onSkip={skipEchoAnswer}
                              voiceColumn={
                                <VoiceControlsColumn
                                  sttSupported={sttSupported}
                                  ttsSupported={ttsSupported}
                                  isRecording={isRecording}
                                  isLoading={isLoading}
                                  autoSendCountdown={autoSendCountdown}
                                  autoRead={autoRead}
                                  onToggleRecording={toggleRecording}
                                  onToggleAutoRead={() => setAutoRead(v => { if (v) stopSpeaking(); return !v; })}
                                />
                              }
                            />
                          )}
                        </Fragment>
                      );
                    }
                    let raw: string | null | undefined;
                    let news: NewsLink | null | undefined;
                    let details: string | null | undefined;
                    if (key === 'ray')        { raw = msg.personas!.ray;   news = msg.personas!.rayNews;   details = msg.personas!.rayDetails; }
                    else if (key === 'jack')  { raw = jackText;            news = msg.personas!.jackNews;  details = msg.personas!.jackDetails; }
                    else                      { raw = luciaText;           news = msg.personas!.luciaNews; details = msg.personas!.luciaDetails; }

                    // ✅ solo 응답(order 길이 < 3)에서 빈 페르소나 버블 렌더링 차단.
                    //   호명 응답은 order=[invoked] 1-element로 도착 → 다른 페르소나 슬롯은
                    //   빈 문자열이지만 loading 텍스트로 false-render되는 문제 방지.
                    if (order.length < 3 && !hasText(raw)) return null;

                    const ready = hasText(raw);
                    const displayText = ready ? raw : loadingText[key];
                    const bubbleKey = `r1-${key}-${ready ? 'real' : 'loading'}`;
                    return <PersonaBubble key={bubbleKey} personaKey={key} text={displayText} timestamp={msg.timestamp} newsItem={news} details={details} />;
                  };

                  const renderRound2 = (key: PersonaKey) => {
                    if (key === 'echo') {
                      if (!showEcho2) return null;
                      const hasEcho2 = hasText(msg.personas!.echo2);
                      return (
                        <EchoBubble
                          key={`echo2-${hasEcho2 ? 'real' : 'loading'}`}
                          summary={hasEcho2 ? msg.personas!.echo2! : 'ECHO가 최후 판결 중...'}
                          timestamp={msg.timestamp}
                          hideDisclaimer
                        />
                      );
                    }
                    const field = `${key}2` as 'ray2' | 'jack2' | 'lucia2';
                    const value = msg.personas![field];
                    // null = 아직 round 2 시작 전 (ECHO 1 미도착) → 렌더 안 함
                    if (value === null || value === undefined) return null;
                    // ✅ solo 응답에서 빈 라운드 2 버블 렌더링 차단 (round 1과 동일 방어).
                    if (order.length < 3 && !hasText(value)) return null;
                    const ready = hasText(value);
                    const displayText = ready ? value : loadingText[key];
                    const bubbleKey = `r2-${key}-${ready ? 'real' : 'loading'}`;
                    return <PersonaBubble key={bubbleKey} personaKey={key} text={displayText} timestamp={msg.timestamp} />;
                  };

                  // 단계별 진행 상태 — 스트리밍 중에도 자연스러운 노출 흐름
                  const allR1Done = !!(msg.personas.ray && msg.personas.jack && msg.personas.lucia);
                  const allR2Done = !!(msg.personas.ray2 && msg.personas.jack2 && msg.personas.lucia2);
                  const showEcho1 = !!msg.personas.echo || allR1Done;
                  const showEcho2 = !!msg.personas.echo2 || (!!msg.personas.echo && allR2Done);

                  return (
                    <>
                      {order.map(renderRound1)}
                      {order.map(renderRound2)}
                    </>
                  );
                })() : null}
              </div>
            )}
          </div>
        ))}
        {isLoading && isAdvancedLoading && (
          <div style={{
            margin: '8px 12px',
            padding: '10px 14px',
            background: 'linear-gradient(90deg, #fef3c7 0%, #fce7f3 100%)',
            border: '1px solid #fbbf24',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 700,
            color: '#92400e',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <span>🔍</span>
            <span>AI 참모진이 분석 중입니다. 약 20~30초 소요됩니다.</span>
          </div>
        )}
        {isLoading && <TypingIndicator teaMode={messages.slice().reverse().find(m => m.role === 'user')?.teaMode === true} teaPersona={teaPersona} pendingOrder={pendingOrder} userText={
          messages
            .slice()
            .reverse()
            .filter(m => m.role === 'user')
            .slice(0, 3)
            .map(m => m.content)
            .join(' ') || ''
        } />}
        <div ref={bottomRef} />
      </div>
      )}

      {showPosition && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 60, zIndex: 100 }}>
          <PositionInput
            keyword={pendingKeyword}
            currency={inferCurrency(pendingKeyword)}
            initial={pendingInitialPosition || undefined}
            onSubmit={pos => handleSendWithPosition(pendingText, pos)}
            onSkip={() => handleSendWithPosition(pendingText, null)}
          />
        </div>
      )}

      {showQuickQ && (
        <div style={{
          background: '#fff',
          borderTop: '1px solid #e5e7eb',
          position: 'fixed',
          bottom: 92,
          left: 0,
          right: 0,
          zIndex: 40,
          boxShadow: '0 -4px 12px rgba(0,0,0,0.08)',
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <button
            type="button"
            onClick={() => setShowQuickQ(false)}
            style={{
              alignSelf: 'flex-start',
              background: 'none',
              border: 'none',
              padding: '8px 12px',
              fontSize: 12.5,
              fontWeight: 700,
              color: '#6b7280',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            ← 처음으로
          </button>

          <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
            {(['뉴스', '추천', '고급'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  fontSize: 13,
                  fontWeight: activeTab === tab ? 800 : 500,
                  color: activeTab === tab ? '#111827' : '#9ca3af',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === tab ? '2px solid #FAE100' : '2px solid transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                {tab === '뉴스' ? '📰 주요 뉴스' : tab === '추천' ? '💡 추천 질문' : '🎯 고급 질문'}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 32px 12px' }}>
            {activeTab === '추천' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(['시장', '분석', '전략'] as const).map(section => {
                  const items = QUICK_QUESTIONS.filter(q => q.level === section);
                  if (items.length === 0) return null;
                  const sectionColor = section === '시장' ? '#16a34a' : section === '분석' ? '#d97706' : '#dc2626';
                  return (
                    <div key={section} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 11,
                        fontWeight: 800,
                        color: sectionColor,
                        paddingTop: 4,
                      }}>
                        <span style={{
                          display: 'inline-block',
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: sectionColor,
                        }} />
                        {section} ({items.length})
                        <span style={{ flex: 1, height: 1, background: `${sectionColor}22`, marginLeft: 4 }} />
                      </div>
                      {items.map((q, i) => (
                        <button
                          key={`${section}-${i}`}
                          onClick={() => {
                            setInput(q.text);
                            setShowQuickQ(false);
                            setTimeout(() => {
                              handleSendWithPosition(q.text, null);
                              setInput('');
                            }, 50);
                          }}
                          disabled={isLoading}
                          style={{
                            background: q.bg,
                            border: `1px solid ${q.color}22`,
                            borderRadius: 10,
                            padding: '8px 12px',
                            textAlign: 'left',
                            fontSize: 13,
                            fontWeight: 500,
                            color: '#111827',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                            opacity: isLoading ? 0.5 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <span style={{
                            fontSize: 10,
                            fontWeight: 800,
                            color: q.color,
                            background: '#fff',
                            border: `1px solid ${q.color}`,
                            borderRadius: 4,
                            padding: '1px 5px',
                            minWidth: 24,
                            textAlign: 'center',
                          }}>{q.level}</span>
                          {q.text}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === '고급' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(['전략형', '시장분석형', '심리판단형', '40-50대 특화형'] as const).map(section => {
                  const items = ADVANCED_QUESTIONS.filter(q => q.level === section);
                  if (items.length === 0) return null;
                  const sectionColor =
                    section === '전략형' ? '#db2777'
                    : section === '시장분석형' ? '#16a34a'
                    : section === '심리판단형' ? '#9333ea'
                    : '#ea580c';
                  return (
                    <div key={section} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 11,
                        fontWeight: 800,
                        color: sectionColor,
                        paddingTop: 4,
                      }}>
                        <span style={{
                          display: 'inline-block',
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: sectionColor,
                        }} />
                        {section} ({items.length})
                        <span style={{ flex: 1, height: 1, background: `${sectionColor}22`, marginLeft: 4 }} />
                      </div>
                      {items.map((q, i) => (
                        <button
                          key={`${section}-${i}`}
                          onClick={() => {
                            setInput(q.text);
                            setShowQuickQ(false);
                            setTimeout(() => {
                              handleSendWithPosition(q.text, null, true);
                              setInput('');
                            }, 50);
                          }}
                          disabled={isLoading}
                          style={{
                            background: q.bg,
                            border: `1px solid ${q.color}22`,
                            borderRadius: 10,
                            padding: '8px 12px',
                            textAlign: 'left',
                            fontSize: 13,
                            fontWeight: 500,
                            color: '#111827',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                            opacity: isLoading ? 0.5 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <span style={{
                            fontSize: 10,
                            fontWeight: 800,
                            color: q.color,
                            background: '#fff',
                            border: `1px solid ${q.color}`,
                            borderRadius: 4,
                            padding: '1px 5px',
                            minWidth: 24,
                            textAlign: 'center',
                          }}>{q.level}</span>
                          {q.text}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === '뉴스' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  {
                    title: '美 관세 협상 재개...코스피 반등 기대',
                    summary: '미중 협상 재개 소식에 외국인 매수세 유입 예상',
                    prompt: '美 관세 협상 재개 소식이 있어요. 코스피에 어떤 영향을 줄까요?',
                  },
                  {
                    title: '삼성전자 2분기 실적 전망 상향',
                    summary: '반도체 업황 회복으로 영업이익 개선 기대',
                    prompt: '삼성전자 2분기 실적 전망이 상향됐어요. 지금 어떻게 봐야 할까요?',
                  },
                  {
                    title: '부동산 PF 리스크 완화...건설주 강세',
                    summary: '정부 지원책 발표로 건설사 유동성 우려 완화',
                    prompt: '부동산 PF 리스크 완화 소식이에요. 건설주 지금 들어가도 될까요?',
                  },
                ].map((news, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setInput(news.prompt);
                      setShowQuickQ(false);
                      setTimeout(() => {
                        handleSendWithPosition(news.prompt, null);
                        setInput('');
                      }, 50);
                    }}
                    disabled={isLoading}
                    style={{
                      background: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: 12,
                      padding: '12px 14px',
                      textAlign: 'left',
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      opacity: isLoading ? 0.5 : 1,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                      <span style={{ fontSize: 14, lineHeight: 1.3 }}>📰</span>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: '#111827', lineHeight: 1.4 }}>
                        {news.title}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5, paddingLeft: 22 }}>
                      {news.summary}
                    </span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1d4ed8', alignSelf: 'flex-end', marginTop: 2 }}>
                      4명에게 물어보기 →
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {hasUserSent && !pendingEchoQuestion && (
      <footer style={{ background: '#fff', padding: '12px', borderTop: '1px solid #e5e7eb', zIndex: 50, position: 'fixed', bottom: 0, left: 0, right: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => { setInput(e.target.value); cancelAutoSend(); }}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
            placeholder="무엇이든 물어보세요"
            style={{
              flex: 1,
              minWidth: 0,
              border: '1px solid #d1d5db',
              borderRadius: 12,
              padding: '10px',
              resize: 'none',
              fontSize: 14,
              outline: 'none',
              minHeight: 56,
              height: 56,
              maxHeight: 160,
              overflowY: 'hidden',
              boxSizing: 'border-box',
            }}
            rows={1}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            style={{
              background: '#FAE100',
              border: 'none',
              borderRadius: 12,
              padding: '0 18px',
              minWidth: 72,
              minHeight: 56,
              height: 56,
              flexShrink: 0,
              boxSizing: 'border-box',
              fontWeight: 800,
              cursor: !input.trim() || isLoading ? 'not-allowed' : 'pointer',
              opacity: !input.trim() || isLoading ? 0.5 : 1,
            }}
          >
            보내기
          </button>
          <VoiceControlsColumn
            sttSupported={sttSupported}
            ttsSupported={ttsSupported}
            isRecording={isRecording}
            isLoading={isLoading}
            autoSendCountdown={autoSendCountdown}
            autoRead={autoRead}
            onToggleRecording={toggleRecording}
            onToggleAutoRead={() => setAutoRead(v => { if (v) stopSpeaking(); return !v; })}
          />
        </div>
      </footer>
      )}
    </div>
    {showHistory && (
      <HistoryModal
        onClose={() => setShowHistory(false)}
        supabaseClient={supabaseRef}
      />
    )}
    </>
  );
}
