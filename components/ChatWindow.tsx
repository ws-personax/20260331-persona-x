'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AuthButton from '@/components/AuthButton';
import { PositionInput, buildPositionContext } from './PositionInput';
import type { Position } from './PositionInput';
import { inferCurrency, detectKeyword } from '@/lib/maps';

interface NewsLink {
  title: string;
  url: string;
}

interface PersonaData {
  jack: string;
  lucia: string;
  ray: string;
  echo: string;
  verdict: string;
  confidence: number;
  breakdown: string;
  positionSizing: string;
  jackNews?: NewsLink | null;
  luciaNews?: NewsLink | null;
  rayNews?: NewsLink | null;
  echoNews?: NewsLink | null;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isRead?: boolean;
  personas?: PersonaData | null;
  newsLinks?: NewsLink[];
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

const parseEchoParts = (text: string) => {
  const markers = ['📡', '─────────────────────────'];
  let splitIdx = -1;

  for (const m of markers) {
    const idx = text.indexOf(m);
    if (idx !== -1 && (splitIdx === -1 || idx < splitIdx)) splitIdx = idx;
  }

  if (splitIdx === -1) return { content: text, dataSource: '', disclaimer: '' };

  const content = text.slice(0, splitIdx).trim();
  const remainder = text.slice(splitIdx);
  const lines = remainder.split('\n');
  const dataLine = lines.find(l => l.includes('📡')) || '';
  const discLines = lines
    .filter(l => {
      const t = l.trim();
      return t && !t.includes('📡') && !/^─+$/.test(t);
    })
    .join('\n')
    .trim();

  return { content, dataSource: dataLine, disclaimer: discLines };
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

const MetaBox = ({ dataSource, disclaimer }: { dataSource: string; disclaimer: string }) => (
  <div style={{ marginTop: 8, padding: '0 12px 0 58px' }}>
    <div
      style={{
        background: 'rgba(0,0,0,0.04)',
        borderRadius: 10,
        padding: '10px 14px',
        border: '1px solid rgba(0,0,0,0.07)',
      }}
    >
      {dataSource && (
        <p style={{ fontSize: 11, color: '#374151', margin: 0, fontWeight: 700, lineHeight: 1.5 }}>
          {dataSource}
        </p>
      )}
      <p style={{ fontSize: 10, color: '#2563eb', margin: '5px 0 0', lineHeight: 1.5, fontWeight: 600 }}>
        💡 신뢰도 가이드: 60%+ 참고 · 70%+ 고려 · 80%+ 확신
      </p>
      {disclaimer && (
        <div style={{ marginTop: 8, borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 8 }}>
          {disclaimer
            .split('\n')
            .filter(l => {
              const t = l.trim();
              return t && !/^─+$/.test(t);
            })
            .map((line, i) => (
              <p
                key={i}
                style={{
                  fontSize: 10,
                  color: '#6b7280',
                  margin: i > 0 ? '3px 0 0' : 0,
                  lineHeight: 1.6,
                }}
              >
                {line}
              </p>
            ))}
        </div>
      )}
    </div>
  </div>
);

const PersonaBubble = ({
  personaKey,
  text,
  timestamp,
  newsItem,
  echoNews,
}: {
  personaKey: PersonaKey;
  text: string;
  timestamp: Date;
  newsItem?: NewsLink | null;
  echoNews?: NewsLink | null;
}) => {
  const p = PERSONAS[personaKey];
  const isEcho = personaKey === 'echo';
  const { content, dataSource, disclaimer } = isEcho
    ? parseEchoParts(text)
    : { content: text, dataSource: '', disclaimer: '' };

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
                borderRadius: '0 14px 14px 14px',
                padding: isEcho ? '14px 16px' : '11px 14px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                border: isEcho ? `2px solid ${p.bubbleBorder}` : `1px solid ${p.bubbleBorder}`,
              }}
            >
              {isEcho && p.echoTag && (
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
            </div>
            <span style={{ fontSize: 10, color: '#9ca3af', flexShrink: 0, paddingBottom: 2 }}>
              {formatTime(timestamp)}
            </span>
          </div>

          {!isEcho && newsItem?.url && <InlineNewsChip news={newsItem} />}
        </div>
      </div>

      {isEcho && echoNews?.url && <EchoNewsChip news={echoNews} />}
      {isEcho && (dataSource || disclaimer) && <MetaBox dataSource={dataSource} disclaimer={disclaimer} />}
    </div>
  );
};

const TypingIndicator = () => (
  <>
    <style>{`
      @keyframes typingDot {
        0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
        30% { transform: translateY(-5px); opacity: 1; }
      }
    `}</style>
    <div style={{ padding: '0 0 8px' }}>
      {(['jack', 'lucia', 'ray'] as PersonaKey[]).map((key, ki) => {
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

export default function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [mounted, setMounted] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPosition, setShowPosition] = useState(false);
  const [pendingText, setPendingText] = useState('');
  const [pendingKeyword, setPendingKeyword] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<Message[]>([]);

  useEffect(() => {
    setMounted(true);
    const initMessages: Message[] = [
      {
        id: 'init',
        role: 'assistant',
        timestamp: new Date(),
        isRead: true,
        content: '[SYSTEM ONLINE]\n지휘관님, 전략 센터 가동됨. 분석할 종목을 하달하십시오.\n⏱ 분석에는 10~20초가 소요됩니다.',
      },
    ];
    messagesRef.current = initMessages;
    setMessages(initMessages);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

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

    const userMsg: Message = {
      id: generateId(),
      role: 'user',
      content: text,
      timestamp: new Date(),
      isRead: false,
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
          messages: nextMessages.map(m => ({ role: m.role, content: m.content })),
          positionContext: buildPositionContext(position),
        }),
      });

      const data = await response.json();

      const assistantMsg: Message = {
        id: generateId(),
        role: 'assistant',
        timestamp: new Date(),
        content: data.reply || '',
        personas: data.personas || null,
        newsLinks: data.newsLinks || [],
      };

      const updated = [...nextMessages, assistantMsg];
      messagesRef.current = updated;
      setMessages(updated);
    } catch {
      const errMsg: Message = {
        id: generateId(),
        role: 'assistant',
        content: '사령부 시스템 일시 지연. 잠시 후 재시도하십시오.',
        timestamp: new Date(),
      };
      const updated = [...nextMessages, errMsg];
      messagesRef.current = updated;
      setMessages(updated);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSend = useCallback(() => {
    const content = input.trim();
    if (!content || isLoading) return;

    const matched = detectKeyword(content);
    if (matched) {
      setPendingText(content);
      setPendingKeyword(matched);
      setShowPosition(true);
      return;
    }

    handleSendWithPosition(content, null);
  }, [input, isLoading, handleSendWithPosition]);

  if (!mounted) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#b2c7da', fontFamily: 'sans-serif' }}>
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

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 0' }}>
        {messages.map(msg => (
          <div key={msg.id}>
            {msg.role === 'user' ? (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, padding: '0 12px' }}>
                <div style={{ background: '#FAE100', borderRadius: '15px 0 15px 15px', padding: '10px 15px', maxWidth: '75%', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{msg.content}</p>
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 12 }}>
                {msg.personas ? (
                  <>
                    <PersonaBubble personaKey="jack" text={msg.personas.jack} timestamp={msg.timestamp} newsItem={msg.personas.jackNews} />
                    <PersonaBubble personaKey="lucia" text={msg.personas.lucia} timestamp={msg.timestamp} newsItem={msg.personas.luciaNews} />
                    <PersonaBubble personaKey="ray" text={msg.personas.ray} timestamp={msg.timestamp} newsItem={msg.personas.rayNews} />
                    <div style={{ textAlign: 'center', margin: '10px 0', color: '#b45309', fontSize: 10, fontWeight: 700, letterSpacing: 2 }}>
                      ── ECHO COMMAND ──
                    </div>
                    <PersonaBubble personaKey="echo" text={msg.personas.echo} timestamp={msg.timestamp} echoNews={msg.personas.echoNews} />
                  </>
                ) : (
                  <PersonaBubble personaKey="jack" text={msg.content} timestamp={msg.timestamp} />
                )}
              </div>
            )}
          </div>
        ))}
        {isLoading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {showPosition && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 60, zIndex: 100 }}>
          <PositionInput
            keyword={pendingKeyword}
            currency={inferCurrency(pendingKeyword)}
            onSubmit={pos => handleSendWithPosition(pendingText, pos)}
            onSkip={() => handleSendWithPosition(pendingText, null)}
          />
        </div>
      )}

      <footer style={{ background: '#fff', padding: '12px', borderTop: '1px solid #e5e7eb', zIndex: 10, position: 'relative' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
            placeholder="종목명 입력 (예: 비트코인, 삼성전자)"
            style={{
              flex: 1,
              border: '1px solid #d1d5db',
              borderRadius: 12,
              padding: '10px',
              resize: 'none',
              fontSize: 14,
              outline: 'none',
              minHeight: 44,
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
  );
}
