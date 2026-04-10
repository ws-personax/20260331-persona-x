"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { PositionInput, buildPositionContext } from "./PositionInput";
import type { Position } from "./PositionInput";

// ─── 타입 정의 ───────────────────────────────────────────
interface PersonaData {
  jack: string; lucia: string; ray: string; echo: string;
  verdict: string; confidence: number; breakdown: string; positionSizing: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isRead?: boolean;
  personas?: PersonaData;
}

type PersonaKey = "jack" | "lucia" | "ray" | "echo";

// ─── 페르소나 설정 ────────────────────────────────────────
const PERSONAS: Record<PersonaKey, {
  name: string; label: string; initial: string;
  iconBg: string; bubbleBg: string; bubbleBorder: string; echoTag?: string;
}> = {
  jack:  { name: "JACK",  label: "Strategy (INTJ)", initial: "J", iconBg: "#374151", bubbleBg: "#ffffff", bubbleBorder: "#dcdcdc" },
  lucia: { name: "LUCIA", label: "Risk (ENFP)",     initial: "L", iconBg: "#a855f7", bubbleBg: "#fdf4ff", bubbleBorder: "#e9d5ff" },
  ray:   { name: "RAY",   label: "Data (INTP)",     initial: "R", iconBg: "#06b6d4", bubbleBg: "#f0fdff", bubbleBorder: "#a5f3fc" },
  echo:  { name: "ECHO",  label: "Commander",       initial: "E", iconBg: "#b45309", bubbleBg: "#fffbeb", bubbleBorder: "#FAE100", echoTag: "Final Strategy" },
};

// ─── 코인 목록 (currency 판별용) ─────────────────────────
const CRYPTO_LIST = new Set([
  "\uBE44\uD2B8\uCF54\uC778", "BTC", "\uC774\uB354\uB9AC\uC6C0", "ETH",
  "\uB9AC\uD50C", "XRP", "\uC194\uB77C\uB098", "SOL",
  "\uB3C4\uC9C0", "DOGE", "ADA", "BNB",
]);

// ─── 유틸 ─────────────────────────────────────────────────
const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// ✅ 가격 정제 — 쉼표/특수문자 제거, 소수점 중복 방지
const sanitizePrice = (raw: string): string => {
  const cleaned = raw.replace(/,/g, "").replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  return parts.length > 2
    ? `${parts[0]}.${parts.slice(1).join("")}`
    : cleaned;
};

// ✅ 수량 정제 — 소수점 + % 보존 (코인 소수점 수량 대응)
const sanitizeQuantity = (raw: string): string => {
  const cleaned = raw.replace(/,/g, "").replace(/[^\d.%]/g, "");
  const parts = cleaned.split(".");
  const processed = parts.length > 2
    ? `${parts[0]}.${parts.slice(1).join("").replace(/\./g, "")}`
    : cleaned;
  return processed;
};

const formatTime = (d: Date) =>
  d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });

const inferCurrency = (keyword: string): "KRW" | "USD" =>
  CRYPTO_LIST.has(keyword) ? "KRW" : "USD";

// ─── 에코 파싱 ────────────────────────────────────────────
const parseEchoParts = (text: string) => {
  const markers = ["\uD83D\uDCE1", "\u2500\u2500\u2500\u2500\u2500"];
  let splitIdx = -1;
  for (const m of markers) {
    const idx = text.indexOf(m);
    if (idx !== -1 && (splitIdx === -1 || idx < splitIdx)) splitIdx = idx;
  }
  if (splitIdx === -1) return { content: text, dataSource: "", disclaimer: "" };
  const content   = text.slice(0, splitIdx).trim();
  const remainder = text.slice(splitIdx);
  const lines     = remainder.split("\n");
  const dataLine  = lines.find(l => l.includes("\uD83D\uDCE1")) || "";
  const discLines = lines.filter(l => l.trim() && !l.includes("\uD83D\uDCE1")).join("\n").trim();
  return { content, dataSource: dataLine, disclaimer: discLines };
};

// ─── MetaBox ─────────────────────────────────────────────
const MetaBox = ({ dataSource, disclaimer }: { dataSource: string; disclaimer: string }) => {
  if (!dataSource && !disclaimer) return null;
  return (
    <div style={{ marginTop: 8, padding: "0 12px 0 58px" }}>
      <div style={{ background: "rgba(0,0,0,0.04)", borderRadius: 8, padding: "8px 12px", border: "1px solid rgba(0,0,0,0.07)" }}>
        {dataSource && (
          <p style={{ fontSize: 11, color: "#374151", margin: 0, fontWeight: 600, lineHeight: 1.5 }}>{dataSource}</p>
        )}
        <p style={{ fontSize: 10, color: "#2563eb", margin: "5px 0 0", lineHeight: 1.5 }}>
          {"\uD83D\uDCA1 \uC2E0\uB8B0\uB3C4 \uAC00\uC774\uB4DC: 60%+ \uCC38\uACE0 \u00B7 70%+ \uACE0\uB824 \u00B7 80%+ \uD655\uC2E0"}
        </p>
        {disclaimer && (
          <div style={{ marginTop: 6, borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 6 }}>
            {disclaimer.split("\n")
              .filter(l => l.trim() && !l.startsWith("\u2500"))
              .map((line, i) => (
                <p key={i} style={{ fontSize: 10, color: "#6b7280", margin: i > 0 ? "2px 0 0" : 0, lineHeight: 1.5 }}>{line}</p>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── 타이핑 인디케이터 ────────────────────────────────────
const TypingIndicator = () => (
  <div style={{ padding: "8px 12px" }}>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {(["jack", "lucia", "ray"] as PersonaKey[]).map(key => {
        const p = PERSONAS[key];
        return (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: p.iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ color: "#fff", fontWeight: 800, fontSize: 12 }}>{p.initial}</span>
            </div>
            <div style={{ background: "#e5e7eb", borderRadius: "0 10px 10px 10px", padding: "8px 12px", display: "flex", gap: 4, alignItems: "center" }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#9ca3af", animation: "td 1.2s infinite", animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

// ─── 페르소나 말풍선 ─────────────────────────────────────
const PersonaBubble = ({ personaKey, text, timestamp }: { personaKey: PersonaKey; text: string; timestamp: Date }) => {
  const p = PERSONAS[personaKey];
  const isEcho = personaKey === "echo";
  const { content, dataSource, disclaimer } = isEcho ? parseEchoParts(text) : { content: text, dataSource: "", disclaimer: "" };
  if (!content && !text) return null;

  return (
    <div style={{ marginBottom: isEcho ? 4 : 8 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "0 12px" }}>
        <div style={{ width: 38, height: 38, borderRadius: 12, background: p.iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }}>
          <span style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>{p.initial}</span>
        </div>
        <div style={{ flex: 1, maxWidth: "82%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
            <span style={{ fontSize: 12, color: "#1f2937", fontWeight: 700 }}>{p.name}</span>
            <span style={{ fontSize: 9, color: "#6b7280", background: "#f3f4f6", padding: "1px 5px", borderRadius: 4, fontWeight: 500 }}>{p.label}</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 5 }}>
            <div style={{ position: "relative", background: p.bubbleBg, borderRadius: "0 12px 12px 12px", padding: "10px 12px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", border: `1px solid ${p.bubbleBorder}` }}>
              {isEcho && p.echoTag && (
                <div style={{ position: "absolute", top: -10, left: 8, background: "#FAE100", color: "#000", fontSize: 9, fontWeight: 800, padding: "1px 7px", borderRadius: 4 }}>
                  {p.echoTag}
                </div>
              )}
              <p style={{ fontSize: 13, lineHeight: 1.7, color: "#1f2937", whiteSpace: "pre-wrap", margin: 0, fontWeight: isEcho ? 600 : 400 }}>
                {isEcho ? content : text}
              </p>
            </div>
            <span style={{ fontSize: 10, color: "#9ca3af", flexShrink: 0, paddingBottom: 2 }}>{formatTime(timestamp)}</span>
          </div>
        </div>
      </div>
      {isEcho && (dataSource || disclaimer) && <MetaBox dataSource={dataSource} disclaimer={disclaimer} />}
    </div>
  );
};

const EchoDivider = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px 4px" }}>
    <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, rgba(180,83,9,0.3), transparent)" }} />
    <span style={{ fontSize: 9, color: "#b45309", fontWeight: 600, letterSpacing: 1 }}>ECHO</span>
    <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, rgba(180,83,9,0.3), transparent)" }} />
  </div>
);

const UserBubble = ({ message }: { message: Message }) => (
  <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16, alignItems: "flex-end", gap: 5, padding: "0 12px" }}>
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
      {message.isRead && <span style={{ fontSize: 10, color: "#b45309" }}>1</span>}
      <span style={{ fontSize: 10, color: "#9ca3af" }}>{formatTime(message.timestamp)}</span>
    </div>
    <div style={{ maxWidth: "75%" }}>
      <div style={{ background: "#FAE100", borderRadius: "12px 0 12px 12px", padding: "10px 13px", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }}>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: "#1a1a1a", margin: 0, fontWeight: 500 }}>{message.content}</p>
      </div>
    </div>
  </div>
);

const PersonaGroup = ({ message }: { message: Message }) => {
  if (!message.personas) return <PersonaBubble personaKey="jack" text={message.content} timestamp={message.timestamp} />;
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

const SampleQuestions = ({ onSelect }: { onSelect: (q: string) => void }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "6px 12px 10px" }}>
    {[
      "\uC9C0\uAE08 \uBE44\uD2B8\uCF54\uC778 \uD22C\uC790\uD574\uB3C4 \uB420\uAE4C?",
      "\uC0BC\uC131\uC804\uC790 \uC624\uB298 \uBD84\uC11D \uBCF4\uACE0\uD574",
      "\uC5D4\uBE44\uB514\uC544 \uCD5C\uADFC \uD750\uB984 \uBCF4\uACE0\uD574",
    ].map(q => (
      <button key={q} onClick={() => onSelect(q)}
        style={{ fontSize: 12, background: "rgba(255,255,255,0.9)", border: "1px solid #d1d5db", color: "#374151", padding: "6px 12px", borderRadius: 16, cursor: "pointer", fontWeight: 500 }}
        onMouseEnter={e => { const el = e.currentTarget; el.style.background = "#FAE100"; el.style.borderColor = "#FAE100"; }}
        onMouseLeave={e => { const el = e.currentTarget; el.style.background = "rgba(255,255,255,0.9)"; el.style.borderColor = "#d1d5db"; }}
      >{q}</button>
    ))}
  </div>
);

// ─── 메인 컴포넌트 ───────────────────────────────────────
export default function ChatWindow() {
  const [messages,        setMessages]        = useState<Message[]>([]);
  const [mounted,         setMounted]         = useState(false);
  const [input,           setInput]           = useState("");
  const [isLoading,       setIsLoading]       = useState(false);
  const [showPosition,    setShowPosition]    = useState(false);
  const [pendingText,     setPendingText]     = useState("");
  const [pendingKeyword,  setPendingKeyword]  = useState("");
  const [currentPosition, setCurrentPosition] = useState<Position | null>(null);
  // ✅ keywords API에서 로드 (STOCK_MAP 자동 동기화)
  const [stockKeywords,   setStockKeywords]   = useState<string[]>([]);

  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<Message[]>([]);

  // messagesRef 동기화 — useCallback dependency 최소화
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    setMounted(true);
    setMessages([{
      id: "init",
      role: "assistant",
      content: "[SYSTEM ONLINE]\n\uC9C0\uD718\uAD00\uB2D8, \uC804\uB7B5 \uC13C\uD130 \uAC00\uB3D9\uB428.\n\uBD84\uC11D\uD560 \uC885\uBAA9 \uB610\uB294 \uC2DC\uC7A5\uC744 \uD558\uB2EC\uD558\uC2ED\uC2DC\uC624.",
      timestamp: new Date(),
      isRead: true,
    }]);
    // ✅ keywords API에서 종목 목록 자동 로드
    fetch("/api/keywords")
      .then(r => r.json())
      .then(d => setStockKeywords(d.keywords || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // textarea 자동 높이 조절
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 80)}px`;
  };

  // ✅ messagesRef 사용으로 useCallback dependency 최소화
  const handleSendWithPosition = useCallback(async (text: string, position: Position | null) => {
    // ✅ 포지션 데이터 정제
    const safePosition = position ? {
      ...position,
      avgPrice: sanitizePrice(position.avgPrice || "0"),
      quantity: sanitizeQuantity(position.quantity || "0"),
    } : null;

    const userMsgId = generateId();
    const userMsg: Message = {
      id: userMsgId, role: "user", content: text,
      timestamp: new Date(), isRead: false,
    };

    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    // ✅ id 기반 비교 (객체 참조 비교 제거)
    setTimeout(() => {
      setMessages(prev => prev.map(m => m.id === userMsgId ? { ...m, isRead: true } : m));
    }, 600);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messagesRef.current, userMsg].map(m => ({ role: m.role, content: m.content })),
          positionContext: buildPositionContext(safePosition),
        }),
      });
      const data = await response.json();
      setMessages(prev => [...prev, {
        id: generateId(), role: "assistant",
        content: data.reply || "",
        timestamp: new Date(), personas: data.personas || null,
      }]);
    } catch (err) {
      console.error("❌ 통신 에러:", err);
      setMessages(prev => [...prev, {
        id: generateId(), role: "assistant",
        content: "\uD1B5\uC2E0 \uC7A5\uC560. \uC7AC\uC2DC\uB3C4 \uBC14\uB78C.",
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
      setShowPosition(false);
      setCurrentPosition(null); // ✅ 포지션 초기화
    }
  }, []); // messagesRef 사용으로 dependency 없음

  const handleSend = useCallback(async (text?: string) => {
    const content = (text || input).trim();
    if (!content || isLoading) return;
    setInput("");

    // textarea 높이 초기화
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    // ✅ keywords API에서 로드한 목록으로 종목 감지
    const matchedKeyword = stockKeywords.find(k => content.includes(k));

    if (matchedKeyword) {
      setPendingText(content);
      setPendingKeyword(matchedKeyword);
      setShowPosition(true);
      return;
    }

    await handleSendWithPosition(content, currentPosition);
  }, [input, isLoading, stockKeywords, currentPosition, handleSendWithPosition]);

  if (!mounted) return null;

  // 입력 중 종목 감지 힌트
  const currentMatched = stockKeywords.find(k => input.includes(k));

  return (
    <>
      <style>{`
        @keyframes td{0%,60%,100%{transform:translateY(0);opacity:.5;}30%{transform:translateY(-5px);opacity:1;}}
        *{box-sizing:border-box;}body{margin:0;padding:0;overflow:hidden;}
        ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-thumb{background:rgba(0,0,0,.1);border-radius:2px;}
      `}</style>

      <div role="log" aria-live="polite" aria-label="\uCC44\uD305 \uB0B4\uC5ED"
        style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#b2c7da", fontFamily: "'Apple SD Gothic Neo','Malgun Gothic',sans-serif" }}>

        {/* Header */}
        <header style={{ background: "rgba(178,199,218,.95)", backdropFilter: "blur(10px)", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(0,0,0,.06)", position: "sticky", top: 0, zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex" }}>
              {(["jack", "lucia", "ray", "echo"] as PersonaKey[]).map((key, i) => (
                <div key={key} style={{ width: 28, height: 28, borderRadius: 8, background: PERSONAS[key].iconBg, display: "flex", alignItems: "center", justifyContent: "center", marginLeft: i > 0 ? -6 : 0, zIndex: 4 - i, border: "2px solid #b2c7da" }}>
                  <span style={{ color: "#fff", fontWeight: 800, fontSize: 10 }}>{PERSONAS[key].initial}</span>
                </div>
              ))}
            </div>
            <div>
              <span style={{ color: "#1f2937", fontWeight: 700, fontSize: 15 }}>PersonaX</span>
              <span style={{ color: "#6b7280", fontSize: 11, marginLeft: 5 }}>4</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* ✅ Next.js Link 적용 */}
            <Link href="/history" style={{ background: "rgba(0,0,0,0.08)", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 600, color: "#374151", textDecoration: "none" }}>
              History
            </Link>
            <div style={{ fontSize: 11, color: isLoading ? "#b45309" : "#16a34a", fontWeight: 500 }}>
              {isLoading ? "analyzing..." : "online"}
            </div>
          </div>
        </header>

        {/* Date */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 6px" }}>
          <div style={{ background: "rgba(0,0,0,.12)", borderRadius: 12, padding: "3px 12px" }}>
            <span style={{ fontSize: 11, color: "#374151", fontWeight: 500 }}>
              {new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })}
            </span>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", paddingTop: 4, paddingBottom: 8 }}>
          {messages.map(msg =>
            msg.role === "assistant"
              ? <PersonaGroup key={msg.id} message={msg} />
              : <UserBubble key={msg.id} message={msg} />
          )}
          {isLoading && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>

        {/* Position Input */}
        {showPosition && (
          <PositionInput
            keyword={pendingKeyword}
            currency={inferCurrency(pendingKeyword)}
            onSubmit={position => {
              setCurrentPosition(position);
              handleSendWithPosition(pendingText, position);
            }}
            onSkip={() => handleSendWithPosition(pendingText, null)}
          />
        )}

        {/* Sample questions */}
        {messages.length <= 1 && !isLoading && !showPosition && (
          <SampleQuestions onSelect={q => handleSend(q)} />
        )}

        {/* Input */}
        <footer style={{ background: "#f9fafb", borderTop: "1px solid #e5e7eb", padding: "10px 12px" }}>
          {/* ✅ 종목 감지 힌트 */}
          {currentMatched && (
            <div style={{ fontSize: 10, color: "#b45309", paddingBottom: 4, fontWeight: 600 }}>
              {"\uD83C\uDFAF"} {currentMatched} {"\uBD84\uC11D \uBAA8\uB4DC"} ({inferCurrency(currentMatched) === "KRW" ? "\uC6D0\uD654" : "\uB2EC\uB7EC"})
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label htmlFor="chat-input" style={{ display: "none" }}>{"\uBA54\uC2DC\uC9C0 \uC785\uB825"}</label>
            <div style={{ flex: 1, background: "#ffffff", border: "1px solid #d1d5db", borderRadius: 20, padding: "8px 14px", display: "flex", alignItems: "center" }}>
              <textarea
                id="chat-input"
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Enter stock or topic..."
                rows={1}
                style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: "#1f2937", fontSize: 14, resize: "none", fontFamily: "inherit", lineHeight: 1.5, maxHeight: 80, overflow: "auto" }}
              />
            </div>
            <button
              type="button"
              aria-label="\uBA54\uC2DC\uC9C0 \uC804\uC1A1"
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading}
              style={{ background: input.trim() && !isLoading ? "#FAE100" : "#e5e7eb", color: "#1a1a1a", border: "none", padding: "9px 16px", borderRadius: 20, cursor: input.trim() && !isLoading ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 13, transition: "all .2s" }}
            >
              Send
            </button>
          </div>
        </footer>
      </div>
    </>
  );
}