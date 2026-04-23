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
    label: 'Strategy (INTJ)',
    initial: 'J',
    iconBg: '#374151',
    bubbleBg: '#f3f4f6',
    bubbleBorder: '#d1d5db',
    textColor: '#111827',
  },
  lucia: {
    name: 'LUCIA',
    label: 'Risk (ENFP)',
    initial: 'L',
    iconBg: '#a855f7',
    bubbleBg: '#fdf4ff',
    bubbleBorder: '#e9d5ff',
    textColor: '#1f2937',
  },
  ray: {
    name: 'RAY',
    label: 'Data (INTP)',
    initial: 'R',
    iconBg: '#06b6d4',
    bubbleBg: '#ecfeff',
    bubbleBorder: '#a5f3fc',
    textColor: '#1f2937',
  },
  echo: {
    name: 'ECHO',
    label: 'Commander',
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

// ✅ 차 한잔 모드에서는 LUCIA 단독, 재테크 모드에서는 RAY/JACK/LUCIA 3인
const TypingIndicator = ({ teaMode = false }: { teaMode?: boolean }) => (
  <>
    <style>{`
      @keyframes typingDot {
        0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
        30% { transform: translateY(-5px); opacity: 1; }
      }
    `}</style>
    <div style={{ padding: '0 0 8px' }}>
      {((teaMode ? ['lucia'] : ['ray', 'jack', 'lucia']) as PersonaKey[]).map((key, ki) => {
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

// ─── 차 한잔 탭 — 명언 로테이션 (5개, 하루 단위 순환) ───
const QUOTES = [
  { text: '혼자가 아니라는 것을 아는 것만으로도\n우리는 버틸 수 있다.', author: '헬렌 켈러' },
  { text: '슬픔을 나누면 절반이 되고\n기쁨을 나누면 두 배가 된다.', author: '스웨덴 속담' },
  { text: '괜찮지 않아도 괜찮아요.', author: '' },
  { text: '가장 어두운 밤도\n반드시 끝이 있다.', author: '빅토르 위고' },
  { text: '말하지 않은 감정은\n사라지지 않고 쌓인다.', author: '' },
];
const getTodayQuote = () => QUOTES[Math.floor(Date.now() / 86400000) % QUOTES.length];

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
const FinanceTabContent = ({ onExample }: { onExample: (keyword: string) => void }) => (
  <div style={{ padding: '24px 4px 0' }}>
    <h2
      style={{
        fontSize: 21,
        fontWeight: 800,
        lineHeight: 1.4,
        color: '#111827',
        textAlign: 'center',
        margin: '0 0 22px',
      }}
    >
      지금 이 순간의 데이터로
      <br />
      4개의 관점이 충돌합니다
    </h2>
    <p
      style={{
        textAlign: 'center',
        color: '#92400e',
        fontSize: 13,
        fontWeight: 700,
        margin: '0 0 12px',
      }}
    >
      종목명을 입력하세요
    </p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
      {['삼성전자', '테슬라', 'SK하이닉스', '비트코인'].map(name => (
        <button
          key={name}
          type="button"
          onClick={() => onExample(name)}
          style={{
            background: '#ffffff',
            border: '1px solid #d4a017',
            borderRadius: 20,
            padding: '7px 16px',
            fontSize: 13,
            color: '#92400e',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          }}
        >
          {name}
        </button>
      ))}
    </div>
  </div>
);

// ─── 차 한잔 탭 본문 — 감정 카드 3개 ───
//   클릭 시 자동 전송이 아닌, 입력창에 템플릿 텍스트를 채워준다 (onCardClick).
const TEA_CARDS: { emoji: string; title: string; sub: string; prompt: string }[] = [
  { emoji: '😔', title: '속상해요',   sub: '털어놓고 싶어요',    prompt: '속상한 일이 있어요' },
  { emoji: '🎉', title: '자랑할래요', sub: '기쁜 일이 있어요',    prompt: '자랑하고 싶어요' },
  { emoji: '💭', title: '복잡해요',   sub: '돈 문제가 얽혀있어요', prompt: '복잡한 문제가 있어요' },
];

const TeaTabContent = ({ onCardClick }: { onCardClick: (text: string) => void }) => {
  const quote = useMemo(() => getTodayQuote(), []);

  return (
    <div style={{ padding: '20px 4px 0' }}>
      {/* 오늘의 명언 */}
      <div
        style={{
          margin: '0 auto 22px',
          maxWidth: 440,
          padding: '14px 18px',
          background: '#fffaf0',
          border: '1px solid #fcd9a8',
          borderRadius: 12,
          textAlign: 'center',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 13,
            lineHeight: 1.7,
            color: '#7c2d12',
            fontStyle: 'italic',
            whiteSpace: 'pre-line',
          }}
        >
          “{quote.text}”
        </p>
        {quote.author && (
          <p style={{ margin: '6px 0 0', fontSize: 11, color: '#92400e', fontWeight: 600 }}>
            — {quote.author}
          </p>
        )}
      </div>

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
        판단은 잠시 내려놓으시고
        <br />
        마음을 꺼내보세요
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {TEA_CARDS.map(card => (
          <button
            key={card.title}
            type="button"
            onClick={() => onCardClick(card.prompt)}
            style={{
              background: 'linear-gradient(180deg, #fff8eb 0%, #fffaf0 100%)',
              border: '1px solid #fcd9a8',
              borderRadius: 14,
              padding: '14px 16px',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <span style={{ fontSize: 28, lineHeight: 1 }}>{card.emoji}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#7c2d12' }}>{card.title}</span>
              <span style={{ fontSize: 12, color: '#92400e' }}>{card.sub}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── 탭 2개 + 활성 탭 내용 통합 컴포넌트 (controlled — state는 부모가 보유) ───
//   activeTab=null → 탭 버튼만 표시, 콘텐츠 영역은 비움 (클릭 전 상태)
const OnboardingTabs = ({
  onExample,
  onCardClick,
  activeTab,
  onTabChange,
}: {
  onExample: (keyword: string) => void;
  onCardClick: (text: string) => void;
  activeTab: 'finance' | 'tea' | null;
  onTabChange: (tab: 'finance' | 'tea') => void;
}) => {
  return (
    <div style={{ padding: '0 12px' }}>
      {/* 탭 선택 영역 — compact pill 버튼 2개 + 하단 구분선 */}
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

      {/* 활성 탭 본문 — null이면 렌더하지 않음 (탭 클릭 전 상태) */}
      {activeTab === 'finance' && <FinanceTabContent onExample={onExample} />}
      {activeTab === 'tea' && <TeaTabContent onCardClick={onCardClick} />}
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

  // ✅ 시장 상황 + 시간대 기반 동적 추천 질문
  // ✅ 탭 타입 정의
  const [activeTab, setActiveTab] = useState<'추천'|'고급'|'뉴스'>('추천');

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
  const [isLoading, setIsLoading] = useState(false);
  const [showPosition, setShowPosition] = useState(false);
  const [pendingText, setPendingText] = useState('');
  const [pendingKeyword, setPendingKeyword] = useState('');
  const [pendingInitialPosition, setPendingInitialPosition] = useState<Partial<Position> | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<Message[]>([]);

  useEffect(() => {
    setMounted(true);
    // ✅ 첫 진입은 빈 상태 — OnboardingTabs가 SYSTEM ONLINE 안내를 대체
    messagesRef.current = [];
    setMessages([]);
  }, []);

  // ✅ 온보딩 카드 표시 조건 — 사용자가 아직 질의를 보내지 않음
  const hasUserSent = useMemo(() => messages.some(m => m.role === 'user'), [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  const handleSendWithPosition = useCallback(async (text: string, position: Position | null) => {
    setShowPosition(false);

    // ✅ 차 한잔 탭에서 보낼 때는 LUCIA 단독 응답 루트
    const isTeaSend = onboardingTab === 'tea';

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
    setInput('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.slice(-10).map(m => ({ role: m.role, content: m.content })),
          positionContext: buildPositionContext(position),
          teaMode: isTeaSend,
          teaRound,
        }),
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
    }
  }, [onboardingTab]);

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

  if (!mounted) return null;

  return (
    <>
      {/* ✅ iOS Safari 주소창 동적 높이 대응 + 온보딩 중앙 정렬 */}
      <style>{`
        .px-app-root {
          height: 100vh;
          height: 100dvh;
        }
        /* 온보딩 카드를 상단 네비게이션 바 아래 충분한 여백(70px) 두고 배치
           iPad Safari 주소창/네비게이션 바 높이(약 50~60px) 회피 */
        .px-onboarding-wrap {
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          align-items: stretch;
          padding: 70px 0 20px;
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

      <div style={{ flex: 1, overflowY: 'auto', padding: hasUserSent ? '20px 0 140px' : '0 0 140px' }}>
        {!hasUserSent && (
          <div className="px-onboarding-wrap">
            <OnboardingTabs
              onExample={(name) => handleSendWithPosition(name, null)}
              onCardClick={(text) => {
                setInput(text);
                textareaRef.current?.focus();
              }}
              activeTab={onboardingTab}
              onTabChange={setOnboardingTab}
            />
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id}>
            {msg.role === 'user' ? (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, padding: '0 12px' }}>
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
                {/* 1) LUCIA — 공감 */}
                <PersonaBubble
                  personaKey="lucia"
                  text={msg.teaLucia || ''}
                  timestamp={msg.timestamp}
                />
                {/* 2) JACK — 상황 정리 질문 (Round 2+) */}
                {msg.teaJack && (
                  <PersonaBubble
                    personaKey="jack"
                    text={msg.teaJack}
                    timestamp={msg.timestamp}
                  />
                )}
                {/* 3) ECHO — 행동/욕구 질문 (Round 2+, FINAL COMMAND 태그 숨김) */}
                {msg.teaEcho && (
                  <PersonaBubble
                    personaKey="echo"
                    text={msg.teaEcho}
                    timestamp={msg.timestamp}
                    hideEchoTag
                  />
                )}
              </div>
            ) : (
              <div style={{ marginBottom: 12 }}>
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
        {isLoading && <TypingIndicator teaMode={onboardingTab === 'tea'} />}
        <div ref={bottomRef} />
      </div>

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

      {/* ✅ 추천 질문 탭 패널 — footer 바로 위에 고정 */}
      {showQuickQ && (
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
          {/* 탭 헤더 */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
            {(['추천', '고급', '뉴스'] as const).map(tab => (
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
                {tab === '추천' ? '💡 추천' : tab === '고급' ? '🔒 고급' : '📰 뉴스'}
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
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 0', gap: 8 }}>
                <span style={{ fontSize: 28 }}>🔒</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>고급 질문은 유료 회원 전용입니다</span>
                <span style={{ fontSize: 12, color: '#6b7280' }}>기관급 수급 분석 · 옵션 만기 전략 · 매크로 심화 분석</span>
                <button style={{
                  marginTop: 8,
                  background: '#FAE100',
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 20px',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                }}>업그레이드</button>
              </div>
            )}

            {activeTab === '뉴스' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 0', gap: 8 }}>
                <span style={{ fontSize: 28 }}>📰</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>오늘의 주요 경제 뉴스</span>
                <span style={{ fontSize: 12, color: '#6b7280' }}>페르소나 토론 기능 — 준비 중</span>
              </div>
            )}
          </div>
        </div>
      )}

      <footer style={{ background: '#fff', padding: '12px', borderTop: '1px solid #e5e7eb', zIndex: 50, position: 'fixed', bottom: 0, left: 0, right: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* 사전 질문 토글 버튼 — 재테크 맥락에서만 표시 (차 한잔 탭 첫 화면에서는 숨김) */}
          {(hasUserSent || onboardingTab === 'finance') && (
            <button
              onClick={() => setShowQuickQ(prev => !prev)}
              title="추천 질문 / 주요 뉴스"
              style={{
                background: showQuickQ ? '#FAE100' : '#f3f4f6',
                border: 'none',
                borderRadius: 12,
                padding: '6px 12px',
                minHeight: 56,
                height: 56,
                boxSizing: 'border-box',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                whiteSpace: 'nowrap',
                color: '#374151',
                lineHeight: 1.2,
              }}
            >
              <span>💡 추천 질문</span>
              <span>📰 주요 뉴스</span>
            </button>
          )}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
            placeholder={onboardingTab === 'tea' ? '마음을 꺼내보세요' : '종목명을 입력하세요 (예: 삼성전자, 테슬라)'}
            style={{
              flex: 1,
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
            }}
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            style={{
              background: '#FAE100',
              border: 'none',
              borderRadius: 12,
              padding: '0 20px',
              minHeight: 56,
              height: 56,
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
    </div>
    </>
  );
}
