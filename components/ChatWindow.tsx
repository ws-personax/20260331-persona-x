"use client";

import { useState, useRef, useEffect } from "react";
import { PositionInput, buildPositionContext } from "./PositionInput";
import type { Position } from "./PositionInput";

// ─── 타입 정의 ───────────────────────────────────────────
interface PersonaData {
  jack:  string;
  lucia: string;
  ray:   string;
  echo:  string;
  verdict:        string;
  confidence:     number;
  breakdown:      string;
  positionSizing: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isRead?: boolean;
  personas?: PersonaData;
}

type PersonaKey = 'jack' | 'lucia' | 'ray' | 'echo';

// ─── 페르소나 설정 ────────────────────────────────────────
const PERSONAS: Record<PersonaKey, {
  name: string; label: string; initial: string;
  iconBg: string; bubbleBg: string; bubbleBorder: string;
  echoTag?: string;
}> = {
  jack:  { name: 'JACK 소장',   label: '전략참모 (INTJ)',   initial: 'J', iconBg: '#374151', bubbleBg: '#ffffff', bubbleBorder: '#dcdcdc' },
  lucia: { name: 'LUCIA 팀장',  label: '리스크분석 (ENFP)', initial: 'L', iconBg: '#a855f7', bubbleBg: '#fdf4ff', bubbleBorder: '#e9d5ff' },
  ray:   { name: 'RAY 분석관',  label: '데이터/퀀트 (INTP)',initial: 'R', iconBg: '#06b6d4', bubbleBg: '#f0fdff', bubbleBorder: '#a5f3fc' },
  echo:  { name: 'ECHO 감독관', label: '최종 결론 하달',    initial: 'E', iconBg: '#b45309', bubbleBg: '#fffbeb', bubbleBorder: '#FAE100', echoTag: '최종 전략' },
};

// ─── 면책 조항 / 데이터 출처 분리 ────────────────────────
const META_MARKER  = '📡 데이터 출처';
const DISC_MARKER  = '─────────────────────────';

interface EchoParts {
  content:    string;
  dataSource: string;
  disclaimer: string;
}

const parseEchoParts = (text: string): EchoParts => {
  const discIdx = text.indexOf(DISC_MARKER);
  const metaIdx = text.indexOf(META_MARKER);

  // 데이터 출처와 면책 조항 분리
  const splitIdx = metaIdx !== -1 ? metaIdx : discIdx !== -1 ? discIdx : -1;

  if (splitIdx === -1) return { content: text, dataSource: '', disclaimer: '' };

  const content   = text.slice(0, splitIdx).trim();
  const remainder = text.slice(splitIdx);

  // 데이터 출처 한 줄 추출
  const lines     = remainder.split('\n');
  const dataLine  = lines.find(l => l.startsWith(META_MARKER)) || '';
  const discLines = lines.filter(l => l.trim() && !l.startsWith(META_MARKER)).join('\n').trim();

  return { content, dataSource: dataLine, disclaimer: discLines };
};

// ─── 시간 포맷 ───────────────────────────────────────────
const formatTime = (d: Date) =>
  d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

// ─── 타이핑 인디케이터 ───────────────────────────────────
const TypingIndicator = () => (
  <div style={{ padding: '8px 12px' }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {(['jack','lucia','ray'] as PersonaKey[]).map(key => {
        const p = PERSONAS[key];
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: p.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ color: '#fff', fontWeight: 800, fontSize: 12 }}>{p.initial}</span>
            </div>
            <div style={{ background: '#e5e7eb', borderRadius: '0 10px 10px 10px', padding: '8px 12px', display: 'flex', gap: 4, alignItems: 'center' }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#9ca3af', animation: 'td 1.2s infinite', animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
            <span style={{ fontSize: 10, color: '#9ca3af' }}>분석 중...</span>
          </div>
        );
      })}
    </div>
  </div>
);

// ─── 데이터 출처 + 면책 조항 박스 ───────────────────────
const MetaBox = ({ dataSource, disclaimer }: { dataSource: string; disclaimer: string }) => {
  if (!dataSource && !disclaimer) return null;
  return (
    <div style={{ marginTop: 8, padding: '0 12px 0 58px' }}>
      <div style={{ background: 'rgba(0,0,0,0.04)', borderRadius: 8, padding: '8px 12px', border: '1px solid rgba(0,0,0,0.07)' }}>
        {/* 데이터 출처 */}
        {dataSource && (
          <p style={{ fontSize: 11, color: '#374151', margin: 0, fontWeight: 600, lineHeight: 1.5 }}>
            {dataSource}
          </p>
        )}
        {/* 면책 조항 */}
        {disclaimer && (
          <div style={{ marginTop: dataSource ? 6 : 0, borderTop: dataSource ? '1px solid rgba(0,0,0,0.08)' : 'none', paddingTop: dataSource ? 6 : 0 }}>
            {disclaimer.split('\n').filter(l => l.trim() && !l.startsWith('─')).map((line, i) => (
              <p key={i} style={{ fontSize: 10, color: '#6b7280', margin: i > 0 ? '2px 0 0' : 0, lineHeight: 1.5 }}>
                {line}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── 페르소나 말풍선 ─────────────────────────────────────
const PersonaBubble = ({
  personaKey, text, timestamp,
}: {
  personaKey: PersonaKey;
  text: string;
  timestamp: Date;
}) => {
  const p      = PERSONAS[personaKey];
  const isEcho = personaKey === 'echo';
  const { content, dataSource, disclaimer } = isEcho
    ? parseEchoParts(text)
    : { content: text, dataSource: '', disclaimer: '' };

  if (!content && !text) return null;

  return (
    <div style={{ marginBottom: isEcho ? 4 : 8 }}>
      <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 8, padding: '0 12px' }}>
        {/* 아이콘 */}
        <div style={{ width: 38, height: 38, borderRadius: 12, background: p.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }}>
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>{p.initial}</span>
        </div>

        <div style={{ flex: 1, maxWidth: '82%' }}>
          {/* 이름 배지 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            <span style={{ fontSize: 12, color: '#1f2937', fontWeight: 700 }}>{p.name}</span>
            <span style={{ fontSize: 9, color: '#6b7280', background: '#f3f4f6', padding: '1px 5px', borderRadius: 4, fontWeight: 500 }}>
              {p.label}
            </span>
          </div>

          {/* 말풍선 */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5 }}>
            <div style={{ position: 'relative', background: p.bubbleBg, borderRadius: '0 12px 12px 12px', padding: '10px 12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: `1px solid ${p.bubbleBorder}` }}>
              {isEcho && p.echoTag && (
                <div style={{ position: 'absolute', top: -10, left: 8, background: '#FAE100', color: '#000', fontSize: 9, fontWeight: 800, padding: '1px 7px', borderRadius: 4, boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>
                  {p.echoTag}
                </div>
              )}
              <p style={{ fontSize: 13, lineHeight: 1.7, color: '#1f2937', whiteSpace: 'pre-wrap', margin: 0, fontWeight: isEcho ? 600 : 400 }}>
                {isEcho ? content : text}
              </p>
            </div>
            <span style={{ fontSize: 10, color: '#9ca3af', flexShrink: 0, paddingBottom: 2 }}>
              {formatTime(timestamp)}
            </span>
          </div>
        </div>
      </div>

      {/* ✅ 데이터 출처 + 면책 조항 박스 */}
      {isEcho && (dataSource || disclaimer) && (
        <MetaBox dataSource={dataSource} disclaimer={disclaimer} />
      )}
    </div>
  );
};

// ─── 에코 구분선 ─────────────────────────────────────────
const EchoDivider = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px 4px' }}>
    <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, rgba(180,83,9,0.3), transparent)' }} />
    <span style={{ fontSize: 9, color: '#b45309', fontWeight: 600, letterSpacing: 1 }}>ECHO 결론</span>
    <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, rgba(180,83,9,0.3), transparent)' }} />
  </div>
);

// ─── 유저 말풍선 ─────────────────────────────────────────
const UserBubble = ({ message }: { message: Message }) => (
  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, alignItems: 'flex-end', gap: 5, padding: '0 12px' }}>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
      {message.isRead && <span style={{ fontSize: 10, color: '#b45309' }}>1</span>}
      <span style={{ fontSize: 10, color: '#9ca3af' }}>{formatTime(message.timestamp)}</span>
    </div>
    <div style={{ maxWidth: '75%' }}>
      <div style={{ background: '#FAE100', borderRadius: '12px 0 12px 12px', padding: '10px 13px', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: '#1a1a1a', margin: 0, fontWeight: 500 }}>
          {message.content}
        </p>
      </div>
    </div>
  </div>
);

// ─── 페르소나 그룹 ───────────────────────────────────────
const PersonaGroup = ({ message }: { message: Message }) => {
  if (!message.personas) {
    return <PersonaBubble personaKey="jack" text={message.content} timestamp={message.timestamp} />;
  }
  const { jack, lucia, ray, echo } = message.personas;
  return (
    <div style={{ marginBottom: 8 }}>
      {jack  && <PersonaBubble personaKey="jack"  text={jack}  timestamp={message.timestamp} />}
      {lucia && <PersonaBubble personaKey="lucia" text={lucia} timestamp={message.timestamp} />}
      {ray   && <PersonaBubble personaKey="ray"   text={ray}   timestamp={message.timestamp} />}
      {echo  && <><EchoDivider /><PersonaBubble personaKey="echo" text={echo} timestamp={message.timestamp} /></>}
    </div>
  );
};

// ─── 예시 질문 ───────────────────────────────────────────
const SampleQuestions = ({ onSelect }: { onSelect: (q: string) => void }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 12px 10px' }}>
    {['지금 비트코인 투자해도 될까?','삼성전자 오늘 분석 보고해','엔비디아 최근 흐름 보고해'].map(q => (
      <button key={q} onClick={() => onSelect(q)}
        style={{ fontSize: 12, background: 'rgba(255,255,255,0.9)', border: '1px solid #d1d5db', color: '#374151', padding: '6px 12px', borderRadius: 16, cursor: 'pointer', fontWeight: 500 }}
        onMouseEnter={e => { const el = e.currentTarget; el.style.background = '#FAE100'; el.style.borderColor = '#FAE100'; }}
        onMouseLeave={e => { const el = e.currentTarget; el.style.background = 'rgba(255,255,255,0.9)'; el.style.borderColor = '#d1d5db'; }}
      >{q}</button>
    ))}
  </div>
);

// ─── 메인 컴포넌트 ───────────────────────────────────────
export default function ChatWindow() {
  const [messages,  setMessages]  = useState<Message[]>([]);
  const [mounted,   setMounted]   = useState(false);
  const [input,     setInput]     = useState('');
  const [isLoading,       setIsLoading]       = useState(false);
  const [pendingText,     setPendingText]     = useState('');
  const [showPosition,    setShowPosition]    = useState(false);
  const [currentPosition, setCurrentPosition] = useState<Position | null>(null);
  const [pendingKeyword,  setPendingKeyword]  = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    setMessages([{
      role: 'assistant',
      content: '[SYSTEM ONLINE]\n지휘관님, 전략 센터 가동됨.\n분석할 종목 또는 시장을 하달하십시오.',
      timestamp: new Date(),
      isRead: true,
    }]);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // 포지션 입력 완료 후 실제 API 호출
  const handleSendWithPosition = async (text: string, position: Position | null) => {
    const userMsg: Message = { role: 'user', content: text, timestamp: new Date(), isRead: false };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    setTimeout(() => {
      setMessages(prev => prev.map(m => m === userMsg ? { ...m, isRead: true } : m));
    }, 600);

    try {
      const positionContext = buildPositionContext(position);
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
          positionContext,
        }),
      });
      const data = await response.json();
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.reply || '분석 데이터 없음.',
        timestamp: new Date(),
        personas: data.personas || null,
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '통신 장애 발생. 재시도 바람.',
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
      setShowPosition(false);
      setCurrentPosition(null);
    }
  };

  const handleSend = async (text?: string) => {
    const content = text || input.trim();
    if (!content || isLoading) return;
    setInput('');

    // 포지션 입력 창 표시 (첫 번째 질문 또는 종목 변경 시)
    const stockKeywords = ['삼성전자','비트코인','BTC','엔비디아','NVDA','테슬라','TSLA',
      '애플','SK하이닉스','현대차','카카오','네이버','기아','이더리움','ETH'];
    const hasKeyword = stockKeywords.some(k => content.includes(k));

    if (hasKeyword && !showPosition) {
      const kw = stockKeywords.find(k => content.includes(k)) || '';
      setPendingText(content);
      setPendingKeyword(kw);
      setShowPosition(true);
      return;
    }

    // 포지션 입력 없이 바로 전송
    const userMsg: Message = { role: 'user', content, timestamp: new Date(), isRead: false };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    setTimeout(() => {
      setMessages(prev => prev.map(m => m === userMsg ? { ...m, isRead: true } : m));
    }, 600);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
          positionContext: buildPositionContext(currentPosition),
        }),
      });
      const data = await response.json();
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.reply || '분석 데이터 없음.',
        timestamp: new Date(),
        personas: data.personas || null,
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '통신 장애 발생. 재시도 바람.',
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  if (!mounted) return null;

  return (
    <>
      <style>{`
        @keyframes td {
          0%,60%,100% { transform:translateY(0);opacity:.5; }
          30% { transform:translateY(-5px);opacity:1; }
        }
        * { box-sizing:border-box; }
        body { margin:0;padding:0;overflow:hidden; }
        ::-webkit-scrollbar { width:3px; }
        ::-webkit-scrollbar-thumb { background:rgba(0,0,0,.1);border-radius:2px; }
      `}</style>

      <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'#b2c7da', fontFamily:"'Apple SD Gothic Neo','Malgun Gothic',sans-serif" }}>

        {/* 헤더 */}
        <div style={{ background:'rgba(178,199,218,.95)', backdropFilter:'blur(10px)', padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid rgba(0,0,0,.06)', position:'sticky', top:0, zIndex:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ display:'flex' }}>
              {(['jack','lucia','ray','echo'] as PersonaKey[]).map((key,i) => (
                <div key={key} style={{ width:28, height:28, borderRadius:8, background:PERSONAS[key].iconBg, display:'flex', alignItems:'center', justifyContent:'center', marginLeft:i>0?-6:0, zIndex:4-i, border:'2px solid #b2c7da' }}>
                  <span style={{ color:'#fff', fontWeight:800, fontSize:10 }}>{PERSONAS[key].initial}</span>
                </div>
              ))}
            </div>
            <div>
              <span style={{ color:'#1f2937', fontWeight:700, fontSize:15 }}>PersonaX 전략본부</span>
              <span style={{ color:'#6b7280', fontSize:11, marginLeft:5 }}>4</span>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {/* 히스토리 버튼 */}
            <a href="/history"
              style={{ background:'rgba(0,0,0,0.08)', border:'1px solid rgba(0,0,0,0.1)', borderRadius:8, padding:'5px 10px', fontSize:11, fontWeight:600, color:'#374151', textDecoration:'none', display:'flex', alignItems:'center', gap:4 }}>
              📋 히스토리
            </a>
            <div style={{ fontSize:11, color:isLoading?'#b45309':'#16a34a', fontWeight:500 }}>
              {isLoading ? '⚡ 토론 중...' : '● 온라인'}
            </div>
          </div>
        </div>

        {/* 날짜 */}
        <div style={{ display:'flex', justifyContent:'center', padding:'12px 0 6px' }}>
          <div style={{ background:'rgba(0,0,0,.12)', borderRadius:12, padding:'3px 12px' }}>
            <span style={{ fontSize:11, color:'#374151', fontWeight:500 }}>
              {new Date().toLocaleDateString('ko-KR', { month:'long', day:'numeric', weekday:'short' })}
            </span>
          </div>
        </div>

        {/* 메시지 목록 */}
        <div style={{ flex:1, overflowY:'auto', paddingTop:4, paddingBottom:8 }}>
          {messages.map((msg,idx) =>
            msg.role === 'assistant'
              ? <PersonaGroup key={idx} message={msg} />
              : <UserBubble key={idx} message={msg} />
          )}
          {isLoading && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>

        {/* 포지션 입력 */}
        {showPosition && (
          <PositionInput
            keyword={pendingKeyword}
            currency={pendingKeyword === '비트코인' || pendingKeyword === 'BTC' || pendingKeyword === '이더리움' || pendingKeyword === 'ETH' ? 'KRW' : 'USD'}
            onSubmit={(position) => {
              setCurrentPosition(position);
              handleSendWithPosition(pendingText, position);
            }}
            onSkip={() => {
              handleSendWithPosition(pendingText, null);
            }}
          />
        )}

        {/* 예시 질문 */}
        {messages.length <= 1 && !isLoading && !showPosition && (
          <SampleQuestions onSelect={q => handleSend(q)} />
        )}

        {/* 입력창 */}
        <div style={{ background:'#f9fafb', borderTop:'1px solid #e5e7eb', padding:'10px 12px', display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ flex:1, background:'#ffffff', border:'1px solid #d1d5db', borderRadius:20, padding:'8px 14px', display:'flex', alignItems:'center', boxShadow:'0 1px 3px rgba(0,0,0,.05)' }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="종목을 입력하십시오..."
              rows={1}
              style={{ width:'100%', background:'transparent', border:'none', outline:'none', color:'#1f2937', fontSize:14, resize:'none', fontFamily:'inherit', lineHeight:1.5, maxHeight:80 }}
            />
          </div>
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            style={{ background:input.trim()&&!isLoading?'#FAE100':'#e5e7eb', color:'#1a1a1a', border:'none', padding:'9px 16px', borderRadius:20, cursor:input.trim()&&!isLoading?'pointer':'not-allowed', fontWeight:700, fontSize:13, transition:'all .2s', boxShadow:input.trim()&&!isLoading?'0 2px 8px rgba(250,225,0,.4)':'none' }}
          >
            전송
          </button>
        </div>
      </div>
    </>
  );
}
