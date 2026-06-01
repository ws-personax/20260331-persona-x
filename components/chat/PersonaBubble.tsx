'use client';

import { memo, useMemo, useState } from 'react';
import { SpeakerButton } from '@/components/chat/SpeakerButton';

export type NewsLink = {
  title: string;
  url: string;
};

export type PersonaKey = 'jack' | 'lucia' | 'ray' | 'echo';

export const PERSONAS: Record<
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
    bubbleBg: '#FEF2F2',
    bubbleBorder: '#d1d5db',
    textColor: '#111827',
  },
  lucia: {
    name: 'LUCIA 이사',
    label: '감정 · 공감',
    initial: 'L',
    iconBg: '#a855f7',
    bubbleBg: '#F5F3FF',
    bubbleBorder: '#e9d5ff',
    textColor: '#1f2937',
  },
  ray: {
    name: 'RAY 대리',
    label: '데이터 · 분석',
    initial: 'R',
    iconBg: '#06b6d4',
    bubbleBg: '#EFF6FF',
    bubbleBorder: '#a5f3fc',
    textColor: '#1f2937',
  },
  echo: {
    name: 'ECHO 대표',
    label: '구조 · 원칙',
    initial: 'E',
    iconBg: '#d4a017',
    bubbleBg: '#F9FAFB',
    bubbleBorder: '#fef08a',
    textColor: '#111827',
    echoTag: '',
  },
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

export const PersonaBubble = memo(function PersonaBubble({
  personaKey,
  text,
  timestamp,
  newsItem,
  echoNews,
  isRebuttal = false,
  details,
  hideEchoTag = false,
  bgOverride,
  formatTime,
  renderEchoNewsChip,
}: {
  personaKey: PersonaKey;
  text: string;
  timestamp: Date;
  newsItem?: NewsLink | null;
  echoNews?: NewsLink | null;
  isRebuttal?: boolean;
  details?: string | null;
  hideEchoTag?: boolean;
  /** 버블 배경색 override — LUCIA_CLOSE처럼 같은 페르소나의 별도 슬롯 시각 구분용 */
  bgOverride?: string;
  formatTime: (d: Date) => string;
  renderEchoNewsChip?: (news: NewsLink) => any;
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
                background: bgOverride || p.bubbleBg,
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

      {isEcho && echoNews?.url && renderEchoNewsChip?.(echoNews)}
    </div>
  );
});
