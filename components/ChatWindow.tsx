'use client';

import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import Link from 'next/link';
import AuthButton from '@/components/AuthButton';
import { PositionInput, buildPositionContext } from './PositionInput';
import type { Position } from './PositionInput';
import { inferCurrency, detectKeyword, shouldShowPosition } from '@/lib/maps';

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
  // ✅ 고급 질문 응답 플래그 — true 면 상단에 "💡 전략 분석" 헤더 표시
  isAdvancedAnswer?: boolean;
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
  retryText?: string; // 재시도 버튼이 다시 보낼 사용자 입력
  // 차 한잔 탭 전용 — Round 1 LUCIA 단독 / Round 2+ LUCIA+JACK+ECHO
  teaMode?: boolean;
  teaLucia?: string;
  teaJack?: string;
  teaEcho?: string;
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
    name: 'JACK',
    label: '결단 · 전략',
    initial: 'J',
    iconBg: '#374151',
    bubbleBg: '#f3f4f6',
    bubbleBorder: '#d1d5db',
    textColor: '#111827',
  },
  lucia: {
    name: 'LUCIA',
    label: '감정 · 공감',
    initial: 'L',
    iconBg: '#a855f7',
    bubbleBg: '#fdf4ff',
    bubbleBorder: '#e9d5ff',
    textColor: '#1f2937',
  },
  ray: {
    name: 'RAY',
    label: '데이터 · 분석',
    initial: 'R',
    iconBg: '#06b6d4',
    bubbleBg: '#ecfeff',
    bubbleBorder: '#a5f3fc',
    textColor: '#1f2937',
  },
  echo: {
    name: 'ECHO',
    label: '구조 · 원칙',
    initial: 'E',
    iconBg: '#d4a017',
    bubbleBg: '#fff8d6',
    bubbleBorder: '#d4a017',
    textColor: '#111827',
    echoTag: 'FINAL COMMAND',
  },
};

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const formatTime = (d: Date) =>
  d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

// ✅ PersonaX 면책 고지 — 모든 종목 공통 (중앙 상수)
const PERSONAX_DISCLAIMER = `⚠️ PersonaX는 AI 금융 콘텐츠 플랫폼입니다.
제공되는 모든 분석은 참고용 시나리오이며
투자 자문·매매 추천이 아닙니다.
투자 판단과 그에 따른 손익의 책임은
전적으로 투자자 본인에게 있습니다.`;

const parseEchoParts = (text: string) => {
  // ✅ 리터럴 \n 정규화
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

  // ⚠️ 장 개장 전/마감 후/주말 휴장 — PersonaX 면책과 분리
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

// ✅ 통일된 공지 박스 — 모든 종목 동일 순서/형식
//   1. ⚠️ 장 개장 전/마감 후 (해당 시에만)
//   2. 📡 데이터 출처
//   3. 💡 컨플루언스 가이드
//   4. ⚠️ PersonaX 면책 고지 (1번만, 중앙 상수 사용)
const NoticeBox = ({
  dataSource,
  marketClosedNote,
}: {
  dataSource: string;
  marketClosedNote: string;
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
      <p style={{ fontSize: 10, color: '#2563eb', margin: '3px 0 0', lineHeight: 1.5, fontWeight: 600 }}>
        💡 컨플루언스 가이드: 낮음 → 참고 · 보통 → 고려 · 높음 → 확신
      </p>
      <p style={{ fontSize: 10, color: '#6b7280', margin: '6px 0 0', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
        {PERSONAX_DISCLAIMER}
      </p>
    </div>
  </div>
);

// 차 한잔 탭 LLM 응답 정리 — 마크다운 볼드 제거 + 연속 빈 줄 완전 제거.
// LLM이 프롬프트 지시를 어기고 **볼드** 나 연속 줄바꿈을 내보내는 경우 차단.
// 연속 빈 줄(\n{2,}) → 단일 줄바꿈(\n) 으로 축소해 호흡을 촘촘하게 유지.
const cleanTeaText = (text: string): string =>
  text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\n{2,}/g, '\n');

// JACK 전용 정리 — 빈 줄 완전 제거. JACK 은 촘촘하게 흘러야 묵직함이 산다.
// 프롬프트에서 "빈 줄 금지" 지시해도 모델이 간헐적으로 \n\n 을 내보내는 경우 차단.
const cleanJackText = (text: string): string =>
  text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\n{2,}/g, '\n');

// ─── Web Speech API 유틸 (STT 입력 / TTS 출력) ───
// SSR 안전: window 접근은 호출 시점에만. 미지원 브라우저에서는 false 반환하여 UI에서 숨김.
const isTTSSupported = (): boolean =>
  typeof window !== 'undefined' && 'speechSynthesis' in window;

const isSTTSupported = (): boolean => {
  if (typeof window !== 'undefined') {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
  }
  return false;
};

// TTS 발화 정리용 — "📰 뉴스보기 →" 같은 마크업/이모지 잡음 최소 제거.
const sanitizeForTTS = (text: string): string =>
  (text || '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/[📰📊📡🎯💡🔍⚔️↳→▲▼💜☕💪]/g, '')
    .replace(/\n+/g, '. ')
    .replace(/\s+/g, ' ')
    .trim();

// ─── 페르소나별 음성 프로필 ───
// 모두 ko-KR. RAY 표준, JACK 묵직(낮고 빠르게), LUCIA 따뜻(천천히), ECHO 분석가(천천히 낮게).
type VoiceProfile = { rate: number; pitch: number };
const PERSONA_VOICE: Record<'ray' | 'jack' | 'lucia' | 'echo', VoiceProfile> = {
  ray:   { rate: 1.0,  pitch: 1.0 },
  jack:  { rate: 1.0,  pitch: 0.8 },
  lucia: { rate: 0.85, pitch: 1.0 },
  echo:  { rate: 0.8,  pitch: 0.7 },
};

// ─── 발화 시퀀스 — 순서대로 한 명씩 읽기. 중간에 stopSpeaking 호출 시 즉시 중단. ───
// currentSeqId 를 증가시켜 진행 중인 시퀀스를 무효화 → 콜백 체인 차단.
let currentSeqId = 0;

// ─── 발화 중 여부 전역 구독 ───
// 모듈 전역 set 으로 리스너를 관리해 ChatWindow / SpeakerButton 양쪽이 동기 상태를 본다.
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
  currentSeqId++;
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try { window.speechSynthesis.cancel(); } catch {}
  notifySpeaking(false);
};

const speakOne = (
  text: string,
  profile: VoiceProfile,
  onEnd?: () => void,
): boolean => {
  if (!isTTSSupported()) return false;
  const clean = sanitizeForTTS(text);
  if (!clean) { onEnd?.(); return false; }
  try {
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'ko-KR';
    u.rate = profile.rate;
    u.pitch = profile.pitch;
    if (onEnd) {
      u.onend = onEnd;
      u.onerror = onEnd;
    }
    window.speechSynthesis.speak(u);
    return true;
  } catch {
    onEnd?.();
    return false;
  }
};

// 단일 텍스트 발화 — SpeakerButton 수동 재생 경로용. 페르소나 선택 가능.
const speakText = (
  text: string,
  personaKey?: 'ray' | 'jack' | 'lucia' | 'echo',
  onEnd?: () => void,
): boolean => {
  if (!isTTSSupported()) return false;
  stopSpeaking();
  const profile = personaKey ? PERSONA_VOICE[personaKey] : { rate: 0.9, pitch: 1.0 };
  notifySpeaking(true);
  return speakOne(text, profile, () => {
    notifySpeaking(false);
    onEnd?.();
  });
};

// 시퀀스 발화 — RAY → JACK → LUCIA → ECHO 등 순서대로 읽기.
// 각 페르소나 끝나면 자동으로 다음 페르소나로 진행. 중도 중지 시 currentSeqId 변동으로 차단.
const speakSequence = (
  items: { text: string; personaKey: 'ray' | 'jack' | 'lucia' | 'echo' }[],
): void => {
  if (!isTTSSupported() || items.length === 0) return;
  stopSpeaking();
  const seqId = ++currentSeqId;
  notifySpeaking(true);
  let i = 0;
  const next = () => {
    if (seqId !== currentSeqId) return; // stopSpeaking 또는 새 시퀀스 시작 시 중단
    if (i >= items.length) {
      notifySpeaking(false);
      return;
    }
    const item = items[i++];
    speakOne(item.text, PERSONA_VOICE[item.personaKey], next);
  };
  next();
};

// ─── 답변 말풍선 우상단 🔊 버튼 — 클릭 시 해당 답변 재생/중지 ───
//   personaKey 전달 시 해당 페르소나 목소리(rate/pitch)로 재생.
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

  // 전역 발화가 멈추면 (다른 곳에서 stopSpeaking 호출 등) 이 버튼의 로컬 상태도 reset
  useEffect(() => {
    if (!globalSpeaking && speaking) setSpeaking(false);
  }, [globalSpeaking, speaking]);

  // 컴포넌트 언마운트 시 자기 발화 중이면 정리
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
  // ✅ \n↳ 기준으로 본문과 반박 분리 — PersonaBubble(ray/jack/lucia)은 ECHO 메타 없음
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
          }}
        >
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
              {isEcho && p.echoTag && !hideEchoTag && (
                <div
                  style={{
                    position: 'absolute',
                    top: -11,
                    left: 10,
                    background: p.iconBg,
                    color: '#111827',
                    fontSize: 10,
                    fontWeight: 900,
                    padding: '2px 8px',
                    borderRadius: 5,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  }}
                >
                  {p.echoTag}
                </div>
              )}
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

              {/* ✅ 자세히 보기 버튼 — RAY/JACK/LUCIA 공용 (말풍선 안) */}
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

              {/* details 본문 — 같은 말풍선 안에서 아래로 확장 */}
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

          {/* ✅ 반박 말풍선 — 같은 페르소나 색상, 점선 테두리 + 들여쓰기 */}
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

// ✅ ECHO 초압축 말풍선 — summary 4줄 + [자세히 보기 ▼] 버튼을 한 버블 안에 통합.
//    펼치면 details(ECHO 2 전체 + ⚔️ 충돌 블록)가 같은 버블 하단에 확장됨.
const EchoBubble = memo(function EchoBubble({
  summary,
  details,
  timestamp,
  echoNews,
}: {
  summary: string;
  details?: string | null;
  timestamp: Date;
  echoNews?: NewsLink | null;
}) {
  const [open, setOpen] = useState(false);
  const p = PERSONAS.echo;

  // ✅ summary / details 모두에서 📡 메타 분리
  //    지수(나스닥/코스피) 모드는 summary에 메타가 인라인이고, 개별 종목은 details에 들어감.
  //    메타는 본문에서 제거하고 항상-표시되는 통일된 NoticeBox로 렌더.
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
          }}
        >
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
            <SpeakerButton text={`${p.name}. ${summaryText}${detailsText ? '. ' + detailsText : ''}`} personaKey="echo" />
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
              {p.echoTag && (
                <div
                  style={{
                    position: 'absolute',
                    top: -11,
                    left: 10,
                    background: p.iconBg,
                    color: '#111827',
                    fontSize: 10,
                    fontWeight: 900,
                    padding: '2px 8px',
                    borderRadius: 5,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  }}
                >
                  {p.echoTag}
                </div>
              )}

              {/* 초압축 4줄 */}
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

              {/* 자세히 보기 버튼 — 말풍선 안 */}
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

              {/* details 본문 — 같은 말풍선 안에서 아래로 확장 */}
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

      {/* ✅ 통일된 공지 박스 — 항상 1번만 표시 (장 마감 / 데이터 출처 / 가이드 / 면책 순) */}
      <NoticeBox dataSource={dataSource} marketClosedNote={marketClosedNote} />
    </div>
  );
});

// 차 한잔 탭 타이핑 인디케이터 문구 — 선택된 페르소나에 맞춰 분기
const TEA_TYPING_TEXT: Record<'lucia' | 'jack' | 'echo', string> = {
  lucia: 'LUCIA가 마음을 모으고 있어요...',
  jack: 'JACK이 생각을 정리하고 있어요...',
  echo: 'ECHO가 핵심을 찾고 있어요...',
};

// ✅ 차 한잔 모드에서는 선택된 페르소나 1인의 말풍선에 문구 표시,
//    재테크 모드에서는 RAY/JACK/LUCIA 3인의 점 3개 깜빡임.
const TypingIndicator = ({ teaMode = false, teaPersona = null }: { teaMode?: boolean; teaPersona?: 'lucia' | 'jack' | 'echo' | null }) => {
  if (teaMode) {
    const personaKey = (teaPersona || 'lucia') as 'lucia' | 'jack' | 'echo';
    const p = PERSONAS[personaKey];
    const text = TEA_TYPING_TEXT[personaKey];
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
              }}
            >
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
                  animation: 'teaTypingPulse 1.4s ease-in-out infinite',
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
                }}
              >
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

// ✅ 에러/안내 카드 — 빨간 경고 대신 부드러운 안내 톤
//   market_data_unavailable / analysis_failed → 재시도 버튼
//   keyword_not_recognized                    → 안내만
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

// ✅ 첫 진입 온보딩 카드 — 사용자가 아직 질의를 보내지 않았을 때만 표시
//   역할: "ChatGPT랑 뭐가 달라?" 방지 + 서비스 정체성 전달
//   구조: [재테크 / 차 한잔] 2개 탭 + 각 탭 콘텐츠

// ─── 탭 선택 버튼 — 아이콘 + 제목만 (compact pill 스타일) ───
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

// ─── 재테크 탭 본문 ───
type FinanceQuickPanel = '뉴스' | '추천' | '고급';
const FINANCE_TOP_BUTTONS: { panel: FinanceQuickPanel; emoji: string; label: string; color: string; bg: string; border: string }[] = [
  { panel: '뉴스', emoji: '📰', label: '주요 뉴스', color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  { panel: '추천', emoji: '💡', label: '추천 질문', color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  { panel: '고급', emoji: '🎯', label: '고급 질문', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
];

const FinanceTabContent = ({ onOpenQuickPanel }: { onOpenQuickPanel: (panel: FinanceQuickPanel) => void }) => {
  // 온보딩 힌트 — 첫 진입 1회만 (localStorage 'px_finance_hint_v1')
  const [showHint, setShowHint] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem('px_finance_hint_v1')) {
        setShowHint(true);
        localStorage.setItem('px_finance_hint_v1', '1');
      }
    } catch { /* localStorage 비활성 — 그냥 노출하지 않음 */ }
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

      {/* 상단 액션 버튼 3개 — 주요 뉴스 / 추천 질문 / 고급 질문 (가로 균등 배치) */}
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

// ✅ 차 한잔 페르소나 선택 — 카드 데이터
const TEA_PERSONAS_INFO: { key: 'lucia' | 'jack' | 'echo'; emoji: string; name: string; desc: string; border: string; bg: string; fg: string }[] = [
  { key: 'lucia', emoji: '☕', name: 'LUCIA', desc: '따뜻하게 들어드릴게요',   border: '#fb923c', bg: '#fff7ed', fg: '#7c2d12' },
  { key: 'jack',  emoji: '💪', name: 'JACK',  desc: '직설적으로 얘기해드릴게요', border: '#1f2937', bg: '#f3f4f6', fg: '#111827' },
  { key: 'echo',  emoji: '🎯', name: 'ECHO',  desc: '핵심을 짚어드릴게요',     border: '#b45309', bg: '#fefce8', fg: '#78350f' },
];

// ✅ 차 한잔 — 페르소나별 헤드라인/명언
const TEA_PERSONA_HEADLINES: Record<'lucia' | 'jack' | 'echo', { line1: string; line2: string; quote: string }> = {
  lucia: { line1: '판단은 잠시 내려놓으시고', line2: '마음을 꺼내보세요',        quote: '괜찮지 않아도 괜찮아요.' },
  jack:  { line1: '솔직하게 털어놓으세요.',  line2: '방향을 잡아드리겠습니다.', quote: '망설임이 가장 큰 적입니다.' },
  echo:  { line1: '핵심만 말씀해주세요.',    line2: '판단해드리겠습니다.',      quote: '핵심을 보면 답이 보입니다.' },
};

// ✅ 시간대별 LUCIA 선톡 (KST 기준)
//    22:00 ~ 08:59 사이는 선톡 없음 (조용한 시간 존중)
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
      {/* ✅ LUCIA 선톡 — 슬로건 바로 아래, 입력창 위.
           앱 시작 시 1번만 픽 (마운트 시 결정). 22:00~08:59 비활성. */}
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
              }}
            >
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

// ─── 첫 화면 자동 전환 슬라이드 ───
// 5초 간격으로 [재테크 / 차 한잔] 예시 답변(4명) 자동 순환. 인디케이터 점으로 수동 전환 가능.
type IntroPersonaKey = 'lucia' | 'jack' | 'echo' | 'ray';
const INTRO_PERSONA_STYLES: Record<IntroPersonaKey, { bg: string; border: string; title: string; body: string }> = {
  lucia: { bg: '#f3e8ff', border: '#c4b5fd', title: '#6b21a8', body: '#581c87' },
  jack:  { bg: '#1f2937', border: '#0f172a', title: '#f9fafb', body: '#e5e7eb' },
  echo:  { bg: '#064e3b', border: '#022c22', title: '#d1fae5', body: '#a7f3d0' },
  ray:   { bg: '#dbeafe', border: '#7dd3fc', title: '#0369a1', body: '#075985' },
};
type IntroSlogan = {
  topIcon: string;
  topText: string;
  mainIcon: string;
  mainText: string;
  highlightWord: string;
  highlightColor: string;
  subIcon: string;
  subText: string;
};
type IntroSlide = {
  id: 'finance' | 'tea';
  question: string;
  layout: '2x2' | 'row3';
  slogan: IntroSlogan;
  cards: { persona: IntroPersonaKey; name: string; role: string; text: string }[];
};
const INTRO_SLIDES: IntroSlide[] = [
  {
    id: 'finance',
    question: '삼성전자 지금 사야 할까요?',
    layout: '2x2',
    slogan: {
      topIcon: '📊',
      topText: '범용 AI는 답을 드리지만,',
      mainIcon: '⚡',
      mainText: '4명이 충돌하고, 당신이 결정합니다.',
      highlightWord: '충돌',
      highlightColor: '#E85D4A',
      subIcon: '📚',
      subText: '재테크 고민, 함께 공부해요',
    },
    cards: [
      { persona: 'ray',   name: 'RAY',   role: '데이터 · 분석', text: '외국인 순매도 3주 연속.\n52주 최저가 대비 +18%.\n지표들을 종합적으로 살펴볼 필요가 있습니다.' },
      { persona: 'jack',  name: 'JACK',  role: '결단 · 전략',  text: '방향이 결정되기 전엔 기다리는 것도 전략.\n분할 접근과 관망,\n두 가지 시각이 있습니다.' },
      { persona: 'lucia', name: 'LUCIA', role: '감정 · 공감',  text: '그 고민 뒤에 뭔가 더 있는 것 같아요.\n요즘 투자가 불안하게 느껴지는\n이유가 있어요?' },
      { persona: 'echo',  name: 'ECHO',  role: '구조 · 원칙',  text: '타이밍보다 원칙이 먼저입니다.\n지금 필요한 건 매수 결정이 아니라\n본인만의 투자 기준입니다.' },
    ],
  },
  {
    id: 'tea',
    question: '남편이랑 싸웠어요',
    layout: 'row3',
    slogan: {
      topIcon: '☕',
      topText: '판단은 잠시 내려놓으시고,',
      mainIcon: '💜',
      mainText: 'AI 참모진이 마음을 함께 나눕니다.',
      highlightWord: '함께',
      highlightColor: '#9B59B6',
      subIcon: '🤝',
      subText: '마음 고민, 저희가 함께해요',
    },
    cards: [
      { persona: 'lucia', name: 'LUCIA', role: '감정 · 공감', text: '아… 많이 속상하셨겠다.\n가까운 사람이랑 다투고 나면\n그 감정이 오래 남잖아요.' },
      { persona: 'jack',  name: 'JACK',  role: '결단 · 전략', text: '지금 할 수 있는 건 두 가지입니다.\n1. 본인이 먼저 사과\n2. 남편 사과 기다리기\n관계를 원한다면 1번입니다.' },
      { persona: 'echo',  name: 'ECHO',  role: '구조 · 원칙', text: '결론: 감정 충돌이 아닙니다.\n소통 구조의 문제입니다.\n먼저 손 내미는 쪽이\n관계를 가져갑니다.' },
    ],
  },
];

// 메인 슬로건에서 highlightWord 만 색 강조 (단어 전후로 split)
const renderSloganHighlight = (text: string, word: string, color: string) => {
  if (!word || !text.includes(word)) return text;
  const parts = text.split(word);
  return parts.flatMap((part, i) =>
    i < parts.length - 1
      ? [<span key={`p${i}`}>{part}</span>, <span key={`h${i}`} style={{ color, fontWeight: 900 }}>{word}</span>]
      : [<span key={`p${i}`}>{part}</span>],
  );
};

const IntroSlider = () => {
  const [idx, setIdx] = useState(0);
  // 5초 자동 전환
  useEffect(() => {
    const t = setInterval(() => {
      setIdx(i => (i + 1) % INTRO_SLIDES.length);
    }, 5000);
    return () => clearInterval(t);
  }, []);

  const slide = INTRO_SLIDES[idx];

  return (
    <div style={{ width: '100%', maxWidth: 380, margin: '0 auto 10px' }}>
      <style>{`
        @keyframes pxIntroFade {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .px-intro-slide {
          animation: pxIntroFade 0.45s ease both;
        }
      `}</style>

      {/* 슬라이드 본체 — key 변경 시 페이드 인 재실행 (슬로건도 함께 전환) */}
      <div key={slide.id} className="px-intro-slide">
        {/* 슬라이드별 슬로건 — 상단 작은 / 메인(하이라이트) / 서브 */}
        <div style={{ textAlign: 'center', marginBottom: 10 }}>
          <p style={{
            fontSize: 11.5,
            fontWeight: 500,
            color: '#9ca3af',
            letterSpacing: 0.3,
            margin: '0 0 3px',
          }}>
            {slide.slogan.topIcon} {slide.slogan.topText}
          </p>
          <p style={{
            fontSize: 16,
            fontWeight: 800,
            color: '#1f2937',
            lineHeight: 1.35,
            margin: '0 0 4px',
          }}>
            {slide.slogan.mainIcon}{' '}
            {renderSloganHighlight(slide.slogan.mainText, slide.slogan.highlightWord, slide.slogan.highlightColor)}
          </p>
          <p style={{
            fontSize: 11.5,
            fontWeight: 500,
            color: '#6b7280',
            lineHeight: 1.45,
            margin: '0 0 10px',
          }}>
            {slide.slogan.subIcon} {slide.slogan.subText}
          </p>
        </div>

        {/* 상단 질문 */}
        <p style={{
          fontSize: 13,
          fontWeight: 700,
          color: '#1f2937',
          textAlign: 'center',
          margin: '0 0 8px',
          padding: '5px 12px',
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: 999,
          display: 'inline-block',
          width: 'auto',
          maxWidth: '100%',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}>
          “{slide.question}”
        </p>

        {/* 카드 그리드 — 레이아웃 분기:
            2x2 (재테크): 가로 2 × 세로 2
            row3 (차 한잔): 가로 3 × 세로 1, 모바일에서도 3개 나란히 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: slide.layout === 'row3' ? '1fr 1fr 1fr' : '1fr 1fr',
          gap: slide.layout === 'row3' ? 5 : 6,
        }}>
          {slide.cards.map(c => {
            const st = INTRO_PERSONA_STYLES[c.persona];
            const isRow3 = slide.layout === 'row3';
            return (
              <div
                key={c.name}
                style={{
                  background: st.bg,
                  border: `1px solid ${st.border}`,
                  borderRadius: 11,
                  padding: isRow3 ? '7px 7px' : '7px 9px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  minHeight: isRow3 ? 130 : 86,
                  minWidth: 0,
                }}
              >
                <div style={{
                  fontSize: isRow3 ? 9.5 : 10.5,
                  fontWeight: 800,
                  color: st.title,
                  letterSpacing: 0.2,
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 4,
                  flexWrap: 'wrap',
                  lineHeight: 1.2,
                }}>
                  <span>{c.name}</span>
                  <span style={{ fontWeight: 600, opacity: 0.8, fontSize: isRow3 ? 8.5 : 10 }}>· {c.role}</span>
                </div>
                <p style={{
                  margin: 0,
                  fontSize: isRow3 ? 9.5 : 10.5,
                  lineHeight: 1.4,
                  color: st.body,
                  whiteSpace: 'pre-line',
                  wordBreak: 'keep-all',
                }}>
                  {c.text}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 하단 인디케이터 점 */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 8,
        marginTop: 8,
      }}>
        {INTRO_SLIDES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            aria-label={`슬라이드 ${i + 1}`}
            onClick={() => setIdx(i)}
            style={{
              width: i === idx ? 22 : 8,
              height: 8,
              borderRadius: 999,
              border: 'none',
              padding: 0,
              background: i === idx ? '#1f2937' : '#d1d5db',
              cursor: 'pointer',
              transition: 'width 0.25s ease, background 0.25s ease',
            }}
          />
        ))}
      </div>

      {/* 법적 고지 — 슬라이드 맨 아래, 작고 옅게 */}
      <p style={{
        marginTop: 10,
        marginBottom: 0,
        textAlign: 'center',
        fontSize: 9.5,
        lineHeight: 1.5,
        color: '#9ca3af',
        whiteSpace: 'pre-line',
      }}>
        {'본 서비스는 투자 권유가 아닌 참고용 콘텐츠입니다.\n투자 판단과 책임은 본인에게 있습니다.\n차 한잔 탭은 심리상담을 대체하지 않습니다.'}
      </p>
    </div>
  );
};

// ─── 탭 2개 + 활성 탭 내용 통합 컴포넌트 (controlled — state는 부모가 보유) ───
//   activeTab=null → 큰 카드 2개로 안내 (첫 화면)
//   activeTab!=null → 기존 pill TabButton 2개 + 활성 탭 콘텐츠
const OnboardingTabs = ({
  activeTab,
  onTabChange,
  teaPersona,
  luciaGreeting,
  onOpenQuickPanel,
}: {
  activeTab: 'finance' | 'tea' | null;
  onTabChange: (tab: 'finance' | 'tea') => void;
  teaPersona: 'lucia' | 'jack' | 'echo';
  luciaGreeting: string | null;
  onOpenQuickPanel: (panel: FinanceQuickPanel) => void;
}) => {
  // ─ 첫 화면 — 큰 카드 2개 (flex-wrap 으로 모바일은 자동 세로 스택) ─
  if (activeTab === null) {
    return (
      <>
        <style>{`
          .px-intro-card {
            transition: transform 0.15s ease, box-shadow 0.15s ease;
          }
          .px-intro-card:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 20px rgba(0,0,0,0.10);
          }
          /* 모바일(< 600px): 카드 2개 세로 스택, 각 카드 100% 너비 */
          @media (max-width: 599px) {
            .px-intro-cards-row {
              flex-direction: column !important;
              flex-wrap: nowrap !important;
            }
            .px-intro-card {
              flex: 0 0 auto !important;
              width: 100% !important;
            }
          }
        `}</style>
        {/* 카드 2개 — PC 는 가로 나란히, 모바일(< 600px) 은 세로 스택
            (media query .px-intro-cards-row). 세로 중앙정렬은 부모 담당. */}
        <div style={{
          textAlign: 'center',
          marginBottom: 10,
          padding: '0 8px',
          width: '100%',
        }}>
          <IntroSlider />
        </div>
        <div
          className="px-intro-cards-row"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            justifyContent: 'center',
            alignItems: 'stretch',
            width: '100%',
            maxWidth: 560,
          }}
        >
          {/* 재테크 카드 — 흰색 배경 + 진한 테두리 */}
          <button
            type="button"
            className="px-intro-card"
            onClick={() => onTabChange('finance')}
            style={{
              flex: '1 1 260px',
              minWidth: '260px',
              minHeight: 84,
              height: 84,
              padding: '10px 14px',
              background: '#ffffff',
              border: '2px solid #1f2937',
              borderRadius: 12,
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              boxSizing: 'border-box',
            }}
          >
            <span style={{ fontSize: 20, lineHeight: 1 }}>📊</span>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: '#111827' }}>재테크</span>
            <span
              style={{
                fontSize: 11.5,
                color: '#4b5563',
                lineHeight: 1.4,
                whiteSpace: 'nowrap',
              }}
            >
              실시간 데이터로 4명의 참모가 분석합니다
            </span>
          </button>

          {/* 차 한잔 카드 — 크림색 배경 + 주황 테두리 */}
          <button
            type="button"
            className="px-intro-card"
            onClick={() => onTabChange('tea')}
            style={{
              flex: '1 1 260px',
              minWidth: '260px',
              minHeight: 84,
              height: 84,
              padding: '10px 14px',
              background: '#fffaf0',
              border: '2px solid #fb923c',
              borderRadius: 12,
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              boxSizing: 'border-box',
            }}
          >
            <span style={{ fontSize: 20, lineHeight: 1 }}>☕</span>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: '#7c2d12' }}>차 한잔 하실래요?</span>
            <span
              style={{
                fontSize: 11.5,
                color: '#92400e',
                lineHeight: 1.4,
                whiteSpace: 'nowrap',
              }}
            >
              고민과 감정을 참모진과 나눠보세요
            </span>
          </button>
        </div>
      </>
    );
  }

  // ─ 탭 선택 후 — 기존 pill TabButton + 해당 탭 콘텐츠 ─
  return (
    <div style={{ padding: '0 12px' }}>
      <div
        style={{
          display: 'flex',
          gap: 8,
          paddingBottom: 12,
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <TabButton
          active={activeTab === 'finance'}
          icon="📊"
          title="재테크"
          onClick={() => onTabChange('finance')}
        />
        <TabButton
          active={activeTab === 'tea'}
          icon="☕"
          title="차 한잔 하실래요?"
          onClick={() => onTabChange('tea')}
        />
      </div>

      {activeTab === 'finance' && <FinanceTabContent onOpenQuickPanel={onOpenQuickPanel} />}
      {activeTab === 'tea' && (
        <TeaTabContent
          teaPersona={teaPersona}
          luciaGreeting={luciaGreeting}
        />
      )}
    </div>
  );
};

export default function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [mounted, setMounted] = useState(false);
  const [input, setInput] = useState('');
  const [showQuickQ, setShowQuickQ] = useState(false);
  // ✅ 온보딩 탭 상태를 부모로 끌어올림 — footer/placeholder와 연동
  //   첫 화면은 null — 탭을 클릭해야 콘텐츠가 표시되도록 (중복 체감 방지)
  const [onboardingTab, setOnboardingTab] = useState<'finance' | 'tea' | null>(null);
  // ✅ 차 한잔 — 진입 시 LUCIA 기본. 하단 소환 버튼으로 JACK/ECHO 전환.
  const [teaPersona, setTeaPersona] = useState<'lucia' | 'jack' | 'echo'>('lucia');
  // ✅ LUCIA 선톡 — 앱 시작 시 1번만 픽 (22:00~08:59 시간대는 null).
  //    SSR 하이드레이션 미스매치 방지를 위해 마운트 후 client 에서만 결정.
  const [luciaGreeting, setLuciaGreeting] = useState<string | null>(null);

  // ✅ 첫 진입 3초 온보딩 — localStorage 플래그 미존재 시 1회만 표시
  const [showOnboarding, setShowOnboarding] = useState(false);

  // 🔍 디버그 — teaPersona state 변경 추적
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[debug] teaPersona state changed →', teaPersona);
  }, [teaPersona]);

  useEffect(() => {
    setLuciaGreeting(pickLuciaGreeting());
  }, []);

  // 첫 진입 시 1회만 온보딩 노출 — 마운트 후 client 에서만 체크 (SSR 안전)
  useEffect(() => {
    try {
      if (!localStorage.getItem('px_onboarded_v1')) {
        setShowOnboarding(true);
      }
    } catch { /* localStorage 비활성 환경 — 그냥 표시 안 함 */ }
  }, []);

  const handleOnboardingPick = (tab: 'finance' | 'tea', persona: 'lucia' | 'echo' | null) => {
    if (tab === 'tea') {
      setOnboardingTab('tea');
      if (persona) setTeaPersona(persona);
    } else {
      setOnboardingTab('finance');
    }
    try { localStorage.setItem('px_onboarded_v1', '1'); } catch {}
    setShowOnboarding(false);
  };

  const handleOnboardingSkip = () => {
    try { localStorage.setItem('px_onboarded_v1', '1'); } catch {}
    setShowOnboarding(false);
  };

  // ✅ 시장 상황 + 시간대 기반 동적 추천 질문
  // ✅ 탭 타입 정의
  const [activeTab, setActiveTab] = useState<'추천'|'고급'|'뉴스'>('추천');

  // ─── 음성 입력 (STT) / 음성 출력 자동 읽기 (TTS) ───
  // 미지원 브라우저(Firefox 등)에서는 마이크/토글 버튼 자체를 숨김.
  const [sttSupported, setSttSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [autoRead, setAutoRead] = useState(false);
  // ✅ STT 발화 종료 후 2초 카운트다운 → 자동 전송. null 이면 비활성, 2/1 은 남은 초.
  const [autoSendCountdown, setAutoSendCountdown] = useState<number | null>(null);
  const recognitionRef = useRef<{ start: () => void; stop: () => void; abort: () => void } | null>(null);
  const lastAutoReadIdRef = useRef<string | null>(null);
  const autoSendStepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // handleSend는 input 의존성 때문에 useCallback identity 가 자주 바뀜 →
  // ref 로 항상 최신 handleSend 를 가리키게 해서 setTimeout 안에서 호출.
  const handleSendRef = useRef<() => void>(() => {});

  useEffect(() => {
    setSttSupported(isSTTSupported());
    setTtsSupported(isTTSSupported());
  }, []);

  // 언마운트 시 발화/녹음/자동전송 타이머 정리
  useEffect(() => () => {
    stopSpeaking();
    try { recognitionRef.current?.abort(); } catch {}
    if (autoSendStepTimerRef.current) clearTimeout(autoSendStepTimerRef.current);
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
        // 최신 handleSend 호출 — 입력창에 STT 결과가 반영된 상태로 전송
        handleSendRef.current();
      }, 1000);
    }, 1000);
  }, []);

  const toggleRecording = useCallback(() => {
    if (!sttSupported) return;
    // 자동 전송 카운트다운 중에 마이크 누르면 즉시 취소 (재녹음 시작 X)
    if (autoSendCountdown !== null) {
      cancelAutoSend();
      return;
    }
    if (isRecording) {
      try { recognitionRef.current?.stop(); } catch {}
      setIsRecording(false);
      return;
    }
    // 녹음 시작 전 자동 읽기 중단 (마이크에 TTS 음성이 섞이지 않도록)
    stopSpeaking();
    const w = window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = new SR();
    rec.lang = 'ko-KR';
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const transcript = e?.results?.[0]?.[0]?.transcript || '';
      if (transcript) {
        setInput(prev => (prev ? prev.trimEnd() + ' ' + transcript : transcript));
        // 발화 인식 직후 2초 카운트다운 시작 → 자동 전송
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
  }, [sttSupported, isRecording, autoSendCountdown, cancelAutoSend, startAutoSendCountdown]);

  // 자동 읽기 — 새 assistant 메시지 도착 시 페르소나별 목소리로 순서대로 발화.
  // 재테크: RAY → JACK → LUCIA → ECHO. 차 한잔: 등장 페르소나 순서대로.
  // 한 명 끝나면 자동으로 다음 페르소나. 새 사용자 입력 시 stopSpeaking 으로 즉시 중단.
  useEffect(() => {
    if (!autoRead || !ttsSupported) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return;
    if (last.errorType) return;
    if (lastAutoReadIdRef.current === last.id) return;
    lastAutoReadIdRef.current = last.id;

    type Item = { text: string; personaKey: 'ray' | 'jack' | 'lucia' | 'echo' };
    const queue: Item[] = [];
    if (last.teaMode) {
      if (last.teaLucia) queue.push({ text: last.teaLucia, personaKey: 'lucia' });
      if (last.teaJack)  queue.push({ text: last.teaJack,  personaKey: 'jack' });
      if (last.teaEcho)  queue.push({ text: last.teaEcho,  personaKey: 'echo' });
    } else if (last.personas) {
      const { ray, jack, lucia, echo } = last.personas;
      if (ray)   queue.push({ text: ray,   personaKey: 'ray' });
      if (jack)  queue.push({ text: jack,  personaKey: 'jack' });
      if (lucia) queue.push({ text: lucia, personaKey: 'lucia' });
      if (echo)  queue.push({ text: echo,  personaKey: 'echo' });
    } else if (last.content) {
      queue.push({ text: last.content, personaKey: 'jack' });
    }
    if (queue.length) speakSequence(queue);
  }, [messages, autoRead, ttsSupported]);

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

    // ── 공통 질문 풀 ──
    const BASE: Q[] = [
      { level: '시장', color: G, bg: GB, text: '오늘 한국/미국 시장 사도 되는 분위기야?' },
      { level: '시장', color: G, bg: GB, text: '코인 지금 매수 vs 관망, 결론만' },
      { level: '분석', color: Y, bg: YB, text: '외국인이 사는 종목 중 따라가도 되는 게 있어?' },
      { level: '분석', color: Y, bg: YB, text: '지금 100만원이면 비중 어떻게 나눠?' },
      { level: '전략', color: R, bg: RB, text: '나스닥과 코스피 지금 따로 움직이고 있어?' },
      { level: '전략', color: R, bg: RB, text: '지금 들어가면 손절 어디야?' },
    ];

    // ── 시간대별 추가 질문 ──
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
      // 개장 전 — 오늘 전략 준비 질문
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
      // 장 중 — 실시간 판단 질문
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
      // 미국장 시간 — 미국 중심 질문
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

    // 기본 (장 마감 후)
    return [
      ...BASE,
      { level: '분석', color: Y, bg: YB, text: '지금 가장 강한 섹터에서 타이밍 맞는 종목은?' },
      { level: '분석', color: Y, bg: YB, text: '거래량 갑자기 터진 종목, 진짜야 페이크야?' },
      { level: '전략', color: R, bg: RB, text: '지금 장에서 추세추종 vs 역추세 중 뭐가 유리해?' },
      { level: '전략', color: R, bg: RB, text: '오늘 장 결과 — 내일 전략은?' },
    ] as Q[];
  }, []);

  // ✅ 고급 질문 — 정적 리스트 (시장 상황 무관)
  // 전략형 (분홍) / 시장분석형 (초록) / 심리판단형 (보라) / 40-50대 특화형 (주황)
  const ADVANCED_QUESTIONS = useMemo(() => {
    type AQ = { level: '전략형' | '시장분석형' | '심리판단형' | '40-50대 특화형'; color: string; bg: string; text: string };
    const P = '#db2777'; const PB = '#fce7f3';   // 분홍 — 전략형
    const G = '#16a34a'; const GB = '#dcfce7';   // 초록 — 시장분석형
    const V = '#9333ea'; const VB = '#f3e8ff';   // 보라 — 심리판단형
    const O = '#ea580c'; const OB = '#ffedd5';   // 주황 — 40-50대 특화형
    return [
      // 전략형
      { level: '전략형', color: P, bg: PB, text: '워런 버핏이라면 지금 삼성전자를 샀을까?' },
      { level: '전략형', color: P, bg: PB, text: '하락장에서 돈 버는 유일한 방법은 무엇인가?' },
      { level: '전략형', color: P, bg: PB, text: '지금 현금이 최고의 투자인 이유는?' },
      { level: '전략형', color: P, bg: PB, text: '상승 추세에서 눌림 매수 vs 돌파 매수, 어떤 상황에서 유리한가?' },
      { level: '전략형', color: P, bg: PB, text: '손절을 가격 기준으로 할지, 시간 기준으로 할지 어떻게 정하나?' },
      // 시장분석형
      { level: '시장분석형', color: G, bg: GB, text: '지금 시장에서 개미는 절대 이길 수 없는 구간인가?' },
      { level: '시장분석형', color: G, bg: GB, text: '공매도 세력이 노리는 종목의 특징은?' },
      { level: '시장분석형', color: G, bg: GB, text: 'AI가 투자를 대체하면 기술적 분석은 죽는가?' },
      { level: '시장분석형', color: G, bg: GB, text: '지금 구간이 상승 초입인지 끝물인지 어떻게 구분하나?' },
      { level: '시장분석형', color: G, bg: GB, text: '외국인 매수와 기관 매수가 동시에 들어올 때 신뢰도는?' },
      // 심리판단형
      { level: '심리판단형', color: V, bg: VB, text: '공포에 팔고 욕심에 사는 패턴을 끊는 방법은?' },
      { level: '심리판단형', color: V, bg: VB, text: '확신과 과신의 차이를 어떻게 구분하나?' },
      { level: '심리판단형', color: V, bg: VB, text: '손실 후 복구 매매를 하면 안 되는 이유는?' },
      { level: '심리판단형', color: V, bg: VB, text: '수익 중일 때 계속 들고 갈지, 일부 익절할지 기준은?' },
      { level: '심리판단형', color: V, bg: VB, text: '시장이 불확실할 때 현금 비중 늘리는 타이밍은?' },
      // 40-50대 특화형
      { level: '40-50대 특화형', color: O, bg: OB, text: '교육비와 노후 준비, 어떻게 균형을 잡나?' },
      { level: '40-50대 특화형', color: O, bg: OB, text: '부모님 요양비가 생겼을 때 투자를 줄여야 하나?' },
      { level: '40-50대 특화형', color: O, bg: OB, text: '이직 고민 중인데 지금 투자를 계속해도 될까?' },
      { level: '40-50대 특화형', color: O, bg: OB, text: '부부가 소비 스타일이 달라서 싸워요. 어떻게 해결하나?' },
      { level: '40-50대 특화형', color: O, bg: OB, text: '50대에 처음 투자 시작해도 늦지 않았나?' },
    ] as AQ[];
  }, []);

  const [isLoading, setIsLoading] = useState(false);
  // ✅ 고급 질문 로딩 여부 — LLM 4명 병렬 호출 대기 중 상단에 안내 문구 노출
  const [isAdvancedLoading, setIsAdvancedLoading] = useState(false);
  const [showPosition, setShowPosition] = useState(false);
  const [pendingText, setPendingText] = useState('');
  const [pendingKeyword, setPendingKeyword] = useState('');
  const [pendingInitialPosition, setPendingInitialPosition] = useState<Partial<Position> | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<Message[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    // ✅ 첫 진입은 빈 상태 — OnboardingTabs가 SYSTEM ONLINE 안내를 대체
    messagesRef.current = [];
    setMessages([]);
  }, []);

  // ✅ 온보딩 카드 표시 조건 — 사용자가 아직 질의를 보내지 않음
  const hasUserSent = useMemo(() => messages.some(m => m.role === 'user'), [messages]);

  // ✅ 스크롤 컨테이너 상단 패딩 — spacer 대신 padding 으로만 관리
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
    // ✅ 새 입력이 들어오면 진행 중인 자동 읽기 즉시 중지
    stopSpeaking();
    setShowPosition(false);

    // ✅ 차 한잔 탭에서 보낼 때는 LUCIA 단독 응답 루트
    const isTeaSend = onboardingTab === 'tea';

    // 🔍 디버그 — 클로저가 최신 teaPersona 를 캡처하고 있는지 확인
    // eslint-disable-next-line no-console
    console.log('[debug] teaPersona state:', teaPersona);
    // eslint-disable-next-line no-console
    console.log('[debug] isTeaSend:', isTeaSend);

    // ✅ 차 한잔 대화 턴 수 — 이번 전송 포함 (1 = 첫 메시지)
    //    기존에 보낸 user 메시지 중 teaMode=true 인 것 +1
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
    if (isAdvanced) setIsAdvancedLoading(true);
    setInput('');

    const requestBody = {
      // 차 한잔 모드 페르소나별 이력 재구성을 위해 assistant 메시지의
      // teaJack/teaEcho 를 함께 전송. 재테크 탭은 서버에서 무시됨.
      messages: nextMessages.slice(-10).map(m => ({
        role: m.role,
        content: m.content,
        ...(m.role === 'assistant' && m.teaJack ? { teaJack: m.teaJack } : {}),
        ...(m.role === 'assistant' && m.teaEcho ? { teaEcho: m.teaEcho } : {}),
      })),
      positionContext: buildPositionContext(position),
      teaMode: isTeaSend,
      teaRound,
      teaPersona: isTeaSend ? teaPersona : undefined,
      // ✅ 재테크 탭 고급 질문 — 4명 페르소나 LLM 병렬 응답 트리거
      isAdvancedQuestion: isAdvanced,
    };

    // 🔍 차 한잔 모드 요청 body 진단 로그 — teaPersona 전달 여부 확인
    if (isTeaSend) {
      // eslint-disable-next-line no-console
      console.log('[tea] sending teaPersona:', teaPersona);
      // eslint-disable-next-line no-console
      console.debug('[tea] request body —', '/ teaMode:', requestBody.teaMode, '/ teaRound:', requestBody.teaRound, '/ messages count:', requestBody.messages.length);
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      // 🔍 차 한잔 모드 응답 구조 진단 로그 — 브라우저 콘솔에서 확인
      //    teaLucia / teaJack / teaEcho 필드 존재 여부와 teaRound 트래킹
      if (isTeaSend) {
        // eslint-disable-next-line no-console
        console.debug('[tea] request teaRound:', teaRound, '/ response keys:', Object.keys(data), '/ teaLucia?', !!data.teaLucia, '/ teaJack?', !!data.teaJack, '/ teaEcho?', !!data.teaEcho);
      }

      const assistantMsg: Message = {
        id: generateId(),
        role: 'assistant',
        timestamp: new Date(),
        content: data.reply || data.teaLucia || '',
        personas: data.personas || null,
        newsLinks: data.newsLinks || [],
        errorType: data.errorType,
        errorMessage: data.errorMessage,
        // 종목 미인식은 같은 텍스트로 재시도해도 결과 같으므로 retryText 미설정
        retryText: data.errorType === 'keyword_not_recognized' ? undefined : text,
        teaMode: data.teaMode,
        teaLucia: data.teaLucia,
        teaJack: data.teaJack,
        teaEcho: data.teaEcho,
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
      setIsAdvancedLoading(false);
    }
  }, [onboardingTab, teaPersona]);

  const handleSend = useCallback(() => {
    const content = input.trim();
    if (!content || isLoading) return;

    const matched = detectKeyword(content);

    // ✅ 평단가/매수가/평균가/취득가 인라인 파싱 — "21만원", "210,000", "$150" 등
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

    // ✅ 평단가 등이 인라인으로 있으면 종목명 매칭 + 모달 표시 강제 (트리거 강화)
    // ⚠️ 차 한잔 탭(onboardingTab === 'tea')에서는 포지션 입력창 절대 표시 금지
    const showModal =
      onboardingTab === 'finance' &&
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
  }, [input, isLoading, handleSendWithPosition, onboardingTab]);

  // 자동 전송 타이머가 항상 최신 handleSend 를 호출하도록 ref 동기화
  useEffect(() => { handleSendRef.current = handleSend; }, [handleSend]);

  // ✅ 자동 읽기 중 화면 아무 곳이나 탭 → 즉시 중지.
  //   capture phase 로 등록해 다른 onClick (SpeakerButton 등) 보다 먼저 실행.
  //   click 이벤트만 사용 — 모바일 스크롤(touchstart) 시 실수로 멈추지 않도록.
  const isSpeakingGlobal = useIsSpeaking();
  useEffect(() => {
    if (!ttsSupported || !isSpeakingGlobal) return;
    const handler = () => stopSpeaking();
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [ttsSupported, isSpeakingGlobal]);

  if (!mounted) return null;

  return (
    <>
      {/* ✅ iOS Safari 주소창 동적 높이 대응 + 온보딩 중앙 정렬 */}
      <style>{`
        .px-app-root {
          height: 100vh;
          height: 100dvh;
        }
        /* 첫 화면 온보딩 래퍼 — 기본은 탭 선택 후 콘텐츠용 (상단 정렬).
           onboardingTab === null 일 때만 인라인 style 로 flex 중앙정렬 override. */
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
        background: '#b2c7da',
        fontFamily: 'sans-serif',
        // ✅ iPad/iPhone Safari notch/주소창 대응 — 상단 safe-area 패딩
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        boxSizing: 'border-box',
      }}
    >
      <header
        style={{
          background: 'rgba(178,199,218,0.95)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <span style={{ fontWeight: 800, fontSize: 18, color: '#1f2937' }}>PersonaX</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: '60vw' }}>
          <AuthButton />
          <Link
            href="/history"
            style={{
              background: '#fff',
              padding: '5px 12px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              color: '#374151',
              textDecoration: 'none',
              border: '1px solid #d1d5db',
              whiteSpace: 'nowrap',
            }}
          >
            History
          </Link>
        </div>
      </header>

      {/* ✅ 자동 읽기 중 상단 알림 — 화면 아무 곳이나 탭하면 stopSpeaking 으로 중지됨.
           pointerEvents: none — 배너 자체는 클릭 가로채지 않도록 (아래 콘텐츠가 그대로 클릭됨). */}
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
          <span>🔊 읽는 중... (탭하면 중지)</span>
        </div>
      )}

      {/* ✅ 첫 화면(hasUserSent=false & onboardingTab=null) — 카드 전용 스크롤 컨테이너.
          헤더 바로 아래에 자연스럽게 카드 배치 (spacer/특수 패딩 없이 단순 padding 만). */}
      {!hasUserSent && onboardingTab === null && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'center' }}>
          <OnboardingTabs
            activeTab={onboardingTab}
            onTabChange={setOnboardingTab}
            teaPersona={teaPersona}
            luciaGreeting={luciaGreeting}
            onOpenQuickPanel={(panel) => { setActiveTab(panel); setShowQuickQ(true); }}
          />
        </div>
      )}

      {/* ✅ 탭 선택 후(onboardingTab !== null) OR 사용자가 메시지 전송 후(hasUserSent) — 기존 스크롤 컨테이너 */}
      {(hasUserSent || onboardingTab !== null) && (
      <div ref={scrollContainerRef} style={{ flex: 1, overflowY: 'auto', padding: scrollPadding }}>
        {!hasUserSent && (
          <div className="px-onboarding-wrap">
            <OnboardingTabs
              activeTab={onboardingTab}
              onTabChange={setOnboardingTab}
              teaPersona={teaPersona}
              luciaGreeting={luciaGreeting}
              onOpenQuickPanel={(panel) => { setActiveTab(panel); setShowQuickQ(true); }}
            />
          </div>
        )}
        {/* ✅ 차 한잔 — JACK/ECHO 소환 후에만 상단 인디케이터. 클릭 시 LUCIA 복귀. */}
        {onboardingTab === 'tea' && teaPersona !== 'lucia' && (() => {
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
        {messages.map(msg => (
          <div key={msg.id}>
            {msg.role === 'user' ? (
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
                {/* 선택된 페르소나만 렌더 (1:1 대화). 각 필드는 비어있으면 표시 안 함. */}
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
              </div>
            ) : (
              <div style={{ marginBottom: 12 }}>
                {/* ✅ 고급 질문 응답일 때 상단 라벨 — 4명 페르소나 투자 철학 기반 답변 */}
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
                  // ✅ 갈등 감지 — JACK 텍스트에 "\n↳ " 포함 시 토론 순서로 재배치
                  //    RAY → JACK(주장) → LUCIA(반박) → JACK(재반박) → ECHO
                  //    LUCIA의 ↳ 뒤 반박은 표시하지 않음 (JACK이 마지막 발언)
                  const jackText = msg.personas.jack;
                  const luciaText = msg.personas.lucia;
                  const jackSplitIdx = jackText.indexOf('\n↳ ');
                  const hasConflict = jackSplitIdx !== -1;

                  if (hasConflict) {
                    const jackMain = jackText.slice(0, jackSplitIdx).trim();
                    const jackRebuttalText = jackText.slice(jackSplitIdx + 1).trim(); // "↳ " 포함
                    const luciaSplitIdx = luciaText.indexOf('\n↳ ');
                    const luciaMain = luciaSplitIdx !== -1 ? luciaText.slice(0, luciaSplitIdx).trim() : luciaText;

                    return (
                      <>
                        <PersonaBubble personaKey="ray" text={msg.personas.ray} timestamp={msg.timestamp} newsItem={msg.personas.rayNews} details={msg.personas.rayDetails} />
                        <PersonaBubble personaKey="jack" text={jackMain} timestamp={msg.timestamp} newsItem={msg.personas.jackNews} details={msg.personas.jackDetails} />
                        <PersonaBubble personaKey="lucia" text={luciaMain} timestamp={msg.timestamp} newsItem={msg.personas.luciaNews} details={msg.personas.luciaDetails} />
                        <PersonaBubble personaKey="jack" text={jackRebuttalText} timestamp={msg.timestamp} isRebuttal />
                        <div style={{ textAlign: 'center', margin: '10px 0', color: '#b45309', fontSize: 10, fontWeight: 700, letterSpacing: 2 }}>
                          ── ECHO COMMAND ──
                        </div>
                        <EchoBubble
                          summary={msg.personas.echo}
                          details={msg.personas.echoDetails}
                          timestamp={msg.timestamp}
                          echoNews={msg.personas.echoNews}
                        />
                      </>
                    );
                  }

                  return (
                    <>
                      <PersonaBubble personaKey="ray" text={msg.personas.ray} timestamp={msg.timestamp} newsItem={msg.personas.rayNews} details={msg.personas.rayDetails} />
                      <PersonaBubble personaKey="jack" text={jackText} timestamp={msg.timestamp} newsItem={msg.personas.jackNews} details={msg.personas.jackDetails} />
                      <PersonaBubble personaKey="lucia" text={luciaText} timestamp={msg.timestamp} newsItem={msg.personas.luciaNews} details={msg.personas.luciaDetails} />
                      <div style={{ textAlign: 'center', margin: '10px 0', color: '#b45309', fontSize: 10, fontWeight: 700, letterSpacing: 2 }}>
                        ── ECHO COMMAND ──
                      </div>
                      <EchoBubble
                        summary={msg.personas.echo}
                        details={msg.personas.echoDetails}
                        timestamp={msg.timestamp}
                        echoNews={msg.personas.echoNews}
                      />
                    </>
                  );
                })() : (
                  <PersonaBubble personaKey="jack" text={msg.content} timestamp={msg.timestamp} />
                )}
              </div>
            )}
          </div>
        ))}
        {/* ✅ 고급 질문 로딩 안내 — 4명 페르소나 병렬 호출 대기 시간 (~20-30초) 사전 고지 */}
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
        {isLoading && <TypingIndicator teaMode={onboardingTab === 'tea'} teaPersona={teaPersona} />}
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

      {/* ✅ 추천 질문 탭 패널 — footer 바로 위에 고정. 차 한잔 탭에서는 절대 표시 안 함 */}
      {showQuickQ && onboardingTab !== 'tea' && (
        <div style={{
          background: '#fff',
          borderTop: '1px solid #e5e7eb',
          position: 'fixed',
          bottom: 92,              // footer 높이(버튼 56px + 여백) 맞춤
          left: 0,
          right: 0,
          zIndex: 40,              // footer(50)보다 낮게 두어 혹시 겹쳐도 footer가 위에
          boxShadow: '0 -4px 12px rgba(0,0,0,0.08)',
          maxHeight: '70vh',       // PC 대형 모니터 기준 충분한 높이 확보
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* ← 처음으로 (재테크 첫 화면으로 복귀) — 모든 탭 상단에 노출 */}
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

          {/* 탭 헤더 — 상단 카드 버튼 순서와 동일: 📰 주요 뉴스 / 💡 추천 질문 / 🎯 고급 질문 */}
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

          {/* 탭 콘텐츠 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 32px 12px' }}>
            {activeTab === '추천' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(['시장', '분석', '전략'] as const).map(section => {
                  const items = QUICK_QUESTIONS.filter(q => q.level === section);
                  if (items.length === 0) return null;
                  const sectionColor = section === '시장' ? '#16a34a' : section === '분석' ? '#d97706' : '#dc2626';
                  return (
                    <div key={section} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {/* 섹션 헤더 */}
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
                      {/* 섹션 내 질문들 */}
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
                      {/* 섹션 헤더 */}
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
                      {/* 섹션 내 질문들 — 고급 탭은 isAdvanced=true 로 서버에 4명 LLM 응답 요청 */}
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

      {/* 첫 화면(탭 미선택 & 대화 전) 에서는 footer 전체 숨김.
          탭(재테크/차 한잔) 을 클릭하거나 한 번이라도 보낸 후에만 footer 표시.
          ✅ 차 한잔 탭에서 teaPersona 가 null 이어도 탭 이동 버튼은 노출 — 입력창만 숨김. */}
      {(onboardingTab !== null || hasUserSent) && (
      <footer style={{ background: '#fff', padding: '12px', borderTop: '1px solid #e5e7eb', zIndex: 50, position: 'fixed', bottom: 0, left: 0, right: 0 }}>
        {/* ✅ 탭 전환 캡슐 — 재테크 ↔ 차 한잔 자연스럽게 이동. 입력창 바로 위에 배치. */}
        {onboardingTab === 'finance' && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => {
                setOnboardingTab('tea');
                setTeaPersona('lucia');
                setMessages([]);
                messagesRef.current = [];
                setInput('');
                requestAnimationFrame(() => {
                  scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
                  window.scrollTo({ top: 0, behavior: 'auto' });
                });
              }}
              style={{
                background: '#fff8f0',
                border: '1px solid #fbbf24',
                borderRadius: 999,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 700,
                color: '#92400e',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              🍵 마음이 복잡하다면 차 한잔 어때요?
            </button>
          </div>
        )}
        {/* ✅ 차 한잔 — 입력창 위에 작은 소환 버튼 (보조 역할).
             현재 페르소나는 비활성, 나머지는 클릭 시 전환. */}
        {onboardingTab === 'tea' && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
            {teaPersona !== 'lucia' && (
              <button
                type="button"
                onClick={() => setTeaPersona('lucia')}
                style={{
                  background: '#fdf4ff',
                  border: '1px solid #e9d5ff',
                  borderRadius: 999,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#6b21a8',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  opacity: 0.85,
                }}
                title="LUCIA로 돌아가기"
              >
                💜 LUCIA
              </button>
            )}
            <button
              type="button"
              onClick={() => setTeaPersona('jack')}
              disabled={teaPersona === 'jack'}
              style={{
                background: teaPersona === 'jack' ? '#e5e7eb' : '#f3f4f6',
                border: '1px solid #d1d5db',
                borderRadius: 999,
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 700,
                color: '#374151',
                cursor: teaPersona === 'jack' ? 'default' : 'pointer',
                whiteSpace: 'nowrap',
                opacity: teaPersona === 'jack' ? 0.5 : 0.85,
              }}
              title="JACK 소환 — 결정 중심"
            >
              ⚡ JACK 소환
            </button>
            <button
              type="button"
              onClick={() => setTeaPersona('echo')}
              disabled={teaPersona === 'echo'}
              style={{
                background: teaPersona === 'echo' ? '#fef9c3' : '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: 999,
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 700,
                color: '#78350f',
                cursor: teaPersona === 'echo' ? 'default' : 'pointer',
                whiteSpace: 'nowrap',
                opacity: teaPersona === 'echo' ? 0.5 : 0.85,
              }}
              title="ECHO 소환 — 판단 구조"
            >
              🔍 ECHO 소환
            </button>
          </div>
        )}
        {/* ✅ 음성 자동 읽기 토글 — 입력창 위. 기본 OFF. ko-KR TTS 미지원 시 숨김. */}
        {ttsSupported && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
            <button
              type="button"
              onClick={() => {
                setAutoRead(v => {
                  if (v) stopSpeaking();
                  return !v;
                });
              }}
              title={autoRead ? '자동 읽기 끄기' : '자동 읽기 켜기'}
              style={{
                background: autoRead ? '#dbeafe' : '#f3f4f6',
                border: `1px solid ${autoRead ? '#93c5fd' : '#d1d5db'}`,
                borderRadius: 999,
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 700,
                color: autoRead ? '#1e40af' : '#6b7280',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {autoRead ? '🔊 자동읽기 ON' : '🔇 자동읽기 OFF'}
            </button>
          </div>
        )}
        {/* ✅ 음성 입력 후 자동 전송 카운트다운 — 입력창 바로 위 노란 배너 */}
        {autoSendCountdown !== null && (
          <div
            role="status"
            aria-live="polite"
            style={{
              background: '#fef3c7',
              border: '1px solid #fbbf24',
              borderRadius: 10,
              padding: '8px 12px',
              marginBottom: 6,
              fontSize: 12.5,
              fontWeight: 700,
              color: '#92400e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span>⏱ {autoSendCountdown}초 후 자동 전송...</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#b45309' }}>
              취소하려면 마이크 클릭
            </span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => { setInput(e.target.value); cancelAutoSend(); }}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
            placeholder={onboardingTab === 'tea' ? '마음을 꺼내보세요' : '삼성전자, 테슬라, 비트코인, 부동산...'}
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
          {/* ✅ 음성 입력 (STT) — 녹음 중 빨강, 자동 전송 카운트다운 중 노랑(취소 대기). */}
          {sttSupported && (() => {
            const inCountdown = autoSendCountdown !== null;
            const bg = inCountdown ? '#fef3c7' : isRecording ? '#fee2e2' : '#f3f4f6';
            const borderColor = inCountdown ? '#f59e0b' : isRecording ? '#dc2626' : '#d1d5db';
            const fg = inCountdown ? '#92400e' : isRecording ? '#dc2626' : '#374151';
            const label = inCountdown ? '자동 전송 취소' : isRecording ? '녹음 중지' : '음성 입력';
            return (
              <button
                type="button"
                onClick={toggleRecording}
                disabled={isLoading}
                title={label}
                style={{
                  background: bg,
                  border: `1px solid ${borderColor}`,
                  borderRadius: 12,
                  width: 56,
                  minHeight: 56,
                  height: 56,
                  flexShrink: 0,
                  boxSizing: 'border-box',
                  fontSize: 22,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.5 : 1,
                  color: fg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                aria-label={label}
              >
                🎤
              </button>
            );
          })()}
          <button
            onClick={handleSend}
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
            Send
          </button>
        </div>
      </footer>
      )}

      {/* ✅ 첫 진입 3초 온보딩 오버레이 — 1회만 (localStorage 'px_onboarded_v1') */}
      {showOnboarding && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            zIndex: 9999,
            animation: 'pxOnbBg 0.35s ease both',
          }}
        >
          <style>{`
            @keyframes pxOnbBg   { from { opacity: 0; } to { opacity: 1; } }
            @keyframes pxOnbCard { from { opacity: 0; transform: translateY(10px) scale(0.97); }
                                  to   { opacity: 1; transform: translateY(0)    scale(1); } }
            .px-onb-btn:hover { background: #f3f4f6 !important; }
            .px-onb-btn:active { transform: scale(0.98); }
          `}</style>
          <div
            style={{
              background: '#ffffff',
              borderRadius: 18,
              padding: '24px 22px 16px',
              width: '100%',
              maxWidth: 360,
              boxShadow: '0 16px 40px rgba(0,0,0,0.22)',
              animation: 'pxOnbCard 0.4s ease both',
              boxSizing: 'border-box',
            }}
          >
            <p style={{
              textAlign: 'center',
              fontSize: 17,
              fontWeight: 800,
              color: '#1f2937',
              margin: '0 0 18px',
            }}>
              지금 어떤 상태인가요?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {([
                { emoji: '😔', text: '감정이 너무 힘들어요', tab: 'tea',     persona: 'lucia' },
                { emoji: '📊', text: '투자 고민이에요',     tab: 'finance', persona: null    },
                { emoji: '🤔', text: '결정을 못 하겠어요',  tab: 'tea',     persona: 'echo'  },
              ] as const).map((opt, i) => (
                <button
                  key={i}
                  type="button"
                  className="px-onb-btn"
                  onClick={() => handleOnboardingPick(opt.tab, opt.persona)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '14px 16px',
                    border: '1px solid #e5e7eb',
                    borderRadius: 12,
                    background: '#f9fafb',
                    fontSize: 14.5,
                    fontWeight: 700,
                    color: '#1f2937',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    transition: 'background 0.15s ease, transform 0.1s ease',
                    boxSizing: 'border-box',
                  }}
                >
                  <span style={{ fontSize: 22, lineHeight: 1 }}>{opt.emoji}</span>
                  <span style={{ flex: 1 }}>{opt.text}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleOnboardingSkip}
              style={{
                marginTop: 14,
                background: 'transparent',
                border: 'none',
                color: '#9ca3af',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                width: '100%',
                padding: '8px 0 4px',
              }}
            >
              건너뛰기
            </button>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
