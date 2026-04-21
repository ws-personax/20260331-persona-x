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
  // ✅ Gemini가 \n을 리터럴로 반환하는 경우 정규화
  const normalized = text.replace(/\\n/g, '\n');
  text = normalized;

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
        💡 컨플루언스 가이드: 낮음 → 참고 · 보통 → 고려 · 높음 → 확신
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

const PersonaBubble = memo(function PersonaBubble({
  personaKey,
  text,
  timestamp,
  newsItem,
  echoNews,
  isRebuttal = false,
}: {
  personaKey: PersonaKey;
  text: string;
  timestamp: Date;
  newsItem?: NewsLink | null;
  echoNews?: NewsLink | null;
  isRebuttal?: boolean;
}) {
  const p = PERSONAS[personaKey];
  const isEcho = personaKey === 'echo';
  // ✅ \n↳ 기준으로 본문과 반박 분리 + ECHO 메타 파싱
  //    isRebuttal=true면 split 로직 건너뛰고 전체 텍스트를 반박 스타일 단일 버블로
  const { content, rebuttal, dataSource, disclaimer } = useMemo(() => {
    const normalizedText = text.replace(/\\n/g, '\n');
    const parsed = isEcho
      ? parseEchoParts(normalizedText)
      : { content: normalizedText, dataSource: '', disclaimer: '' };
    if (isRebuttal) {
      return {
        content: parsed.content,
        rebuttal: '',
        dataSource: parsed.dataSource,
        disclaimer: parsed.disclaimer,
      };
    }
    const splitIdx = parsed.content.indexOf('\n↳ ');
    if (splitIdx !== -1) {
      return {
        content: parsed.content.slice(0, splitIdx).trim(),
        rebuttal: parsed.content.slice(splitIdx + 1).trim(), // "↳ " 포함
        dataSource: parsed.dataSource,
        disclaimer: parsed.disclaimer,
      };
    }
    return {
      content: parsed.content,
      rebuttal: '',
      dataSource: parsed.dataSource,
      disclaimer: parsed.disclaimer,
    };
  }, [text, isEcho, isRebuttal]);

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
                  fontStyle: isRebuttal ? 'italic' : 'normal',
                }}
              >
                {content}
              </p>
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
                    fontStyle: 'italic',
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
      {isEcho && (dataSource || disclaimer) && <MetaBox dataSource={dataSource} disclaimer={disclaimer} />}
    </div>
  );
});

const TypingIndicator = () => (
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

export default function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [mounted, setMounted] = useState(false);
  const [input, setInput] = useState('');
  const [showQuickQ, setShowQuickQ] = useState(false);

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
    const initMessages: Message[] = [
      {
        id: 'init',
        role: 'assistant',
        timestamp: new Date(),
        isRead: true,
        content: '[SYSTEM ONLINE]\n지휘관님, 전략 센터 가동됨. 분석할 종목을 하달하십시오.\n⏱ 분석에는 약 10초가 소요됩니다.',
      },
    ];
    messagesRef.current = initMessages;
    setMessages(initMessages);
  }, []);

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
          messages: nextMessages.slice(-10).map(m => ({ role: m.role, content: m.content })),
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
    const showModal = matched && (hasInlinePosition || shouldShowPosition(content, matched));
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

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 0', paddingBottom: '140px' }}>
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
                        <PersonaBubble personaKey="ray" text={msg.personas.ray} timestamp={msg.timestamp} newsItem={msg.personas.rayNews} />
                        <PersonaBubble personaKey="jack" text={jackMain} timestamp={msg.timestamp} newsItem={msg.personas.jackNews} />
                        <PersonaBubble personaKey="lucia" text={luciaMain} timestamp={msg.timestamp} newsItem={msg.personas.luciaNews} />
                        <PersonaBubble personaKey="jack" text={jackRebuttalText} timestamp={msg.timestamp} isRebuttal />
                        <div style={{ textAlign: 'center', margin: '10px 0', color: '#b45309', fontSize: 10, fontWeight: 700, letterSpacing: 2 }}>
                          ── ECHO COMMAND ──
                        </div>
                        <PersonaBubble personaKey="echo" text={msg.personas.echo} timestamp={msg.timestamp} echoNews={msg.personas.echoNews} />
                      </>
                    );
                  }

                  return (
                    <>
                      <PersonaBubble personaKey="ray" text={msg.personas.ray} timestamp={msg.timestamp} newsItem={msg.personas.rayNews} />
                      <PersonaBubble personaKey="jack" text={jackText} timestamp={msg.timestamp} newsItem={msg.personas.jackNews} />
                      <PersonaBubble personaKey="lucia" text={luciaText} timestamp={msg.timestamp} newsItem={msg.personas.luciaNews} />
                      <div style={{ textAlign: 'center', margin: '10px 0', color: '#b45309', fontSize: 10, fontWeight: 700, letterSpacing: 2 }}>
                        ── ECHO COMMAND ──
                      </div>
                      <PersonaBubble personaKey="echo" text={msg.personas.echo} timestamp={msg.timestamp} echoNews={msg.personas.echoNews} />
                    </>
                  );
                })() : (
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
          {/* 사전 질문 토글 버튼 — 2줄 라벨 */}
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
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
            placeholder="종목명 입력 (예: 삼성전자)"
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
  );
}
