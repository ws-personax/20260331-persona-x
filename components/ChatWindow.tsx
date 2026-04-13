"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { PositionInput, buildPositionContext } from "./PositionInput";
import type { Position } from "./PositionInput";

interface PersonaData {
  jack: string; lucia: string; ray: string; echo: string;
  verdict: string; confidence: number; breakdown: string; positionSizing: string;
}

interface Message {
  id: string; role: "user" | "assistant"; content: string;
  timestamp: Date; isRead?: boolean; personas?: PersonaData | null;
}

const PERSONAS = {
  jack:  { name: "JACK",  label: "Strategy (INTJ)", initial: "J", iconBg: "#374151", bubbleBg: "#ffffff", bubbleBorder: "#dcdcdc" },
  lucia: { name: "LUCIA", label: "Risk (ENFP)",     initial: "L", iconBg: "#a855f7", bubbleBg: "#fdf4ff", bubbleBorder: "#e9d5ff" },
  ray:   { name: "RAY",   label: "Data (INTP)",     initial: "R", iconBg: "#06b6d4", bubbleBg: "#f0fdff", bubbleBorder: "#a5f3fc" },
  echo:  { name: "ECHO",  label: "Commander",       initial: "E", iconBg: "#b45309", bubbleBg: "#fffbeb", bubbleBorder: "#FAE100" },
};

export default function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPosition, setShowPosition] = useState(false);
  const [pendingText, setPendingText] = useState("");
  const [pendingKeyword, setPendingKeyword] = useState("");
  const [stockKeywords, setStockKeywords] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([{ id: "init", role: "assistant", timestamp: new Date(), content: "[SYSTEM ONLINE]\n분석할 종목을 입력하십시오." }]);
    fetch("/api/keywords").then(r => r.json()).then(d => setStockKeywords(d.keywords || []));
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isLoading]);

  // ✅ 화폐 판별기 보강
  const getCurrency = (kw: string) => {
    const krwList = ["삼성전자", "현대차", "에코프로", "비트코인", "리플", "카카오", "네이버", "SK하이닉스"];
    return krwList.some(k => kw.includes(k)) ? "KRW" : "USD";
  };

  const handleSendWithPosition = useCallback(async (text: string, position: Position | null) => {
    setShowPosition(false); // ✅ 즉시 닫기
    const userMsg: Message = { id: `${Date.now()}`, role: "user", content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);
    setInput("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
          positionContext: buildPositionContext(position),
        }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { id: `${Date.now()}-ai`, role: "assistant", timestamp: new Date(), content: data.reply, personas: data.personas }]);
    } catch {
      setMessages(prev => [...prev, { id: "err", role: "assistant", content: "통신 실패.", timestamp: new Date() }]);
    } finally { setIsLoading(false); }
  }, [messages]);

  const handleSend = () => {
    const val = input.trim();
    if (!val || isLoading) return;
    const matched = stockKeywords.find(k => val.includes(k));
    if (matched) { setPendingText(val); setPendingKeyword(matched); setShowPosition(true); return; }
    handleSendWithPosition(val, null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#b2c7da" }}>
      <header style={{ background: "#b2c7da", padding: "12px 16px", display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(0,0,0,0.1)" }}>
        <span style={{ fontWeight: 800, fontSize: 18 }}>PersonaX</span>
        <Link href="/history" style={{ background: "#fff", padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: "none", color: "#000" }}>History</Link>
      </header>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 0" }}>
        {messages.map(msg => (
          <div key={msg.id} style={{ marginBottom: 16 }}>
            {msg.role === "user" ? (
              <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 12px" }}>
                <div style={{ background: "#FAE100", borderRadius: "15px 0 15px 15px", padding: "10px 15px", maxWidth: "75%", fontSize: 14 }}>{msg.content}</div>
              </div>
            ) : (
              <div>
                {msg.personas ? (
                  <>
                    {["jack", "lucia", "ray"].map(k => (
                      <PersonaBubble key={k} personaKey={k as any} text={(msg.personas as any)[k]} timestamp={msg.timestamp} />
                    ))}
                    <div style={{ textAlign: "center", margin: "10px 0", color: "#b45309", fontSize: 10, fontWeight: 700 }}>── ECHO COMMAND ──</div>
                    <PersonaBubble personaKey="echo" text={msg.personas.echo} timestamp={msg.timestamp} personas={msg.personas} />
                  </>
                ) : (
                  <PersonaBubble personaKey="jack" text={msg.content} timestamp={msg.timestamp} />
                )}
              </div>
            )}
          </div>
        ))}
        {isLoading && <div style={{ padding: "0 20px", fontSize: 12, color: "#666" }}>분석관들이 토론 중...</div>}
        <div ref={bottomRef} />
      </div>

      {showPosition && (
        <PositionInput 
          keyword={pendingKeyword} 
          currency={getCurrency(pendingKeyword)} 
          onSubmit={pos => handleSendWithPosition(pendingText, pos)} 
          onSkip={() => handleSendWithPosition(pendingText, null)} 
        />
      )}

      <footer style={{ background: "#fff", padding: "12px" }}>
        <div style={{ display: "flex", gap: 10 }}>
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSend())} placeholder="종목명 입력..." style={{ flex: 1, border: "1px solid #ddd", borderRadius: 12, padding: "10px", outline: "none", resize: "none" }} rows={1} />
          <button onClick={handleSend} disabled={!input.trim() || isLoading} style={{ background: "#FAE100", border: "none", borderRadius: 12, padding: "0 20px", fontWeight: 800 }}>전송</button>
        </div>
      </footer>
    </div>
  );
}

function PersonaBubble({ personaKey, text, timestamp, personas }: { personaKey: keyof typeof PERSONAS; text: string; timestamp: Date; personas?: PersonaData | null }) {
  const p = PERSONAS[personaKey];
  const isEcho = personaKey === "echo";
  if (!text) return null;
  return (
    <div style={{ marginBottom: 8, padding: "0 12px" }}>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: p.iconBg, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 14 }}>{p.initial}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 2 }}>{p.name} <span style={{ fontWeight: 400, color: "#666", fontSize: 9 }}>{p.label}</span></div>
          <div style={{ background: p.bubbleBg, border: isEcho ? "2px solid #FAE100" : "1px solid #ddd", padding: "10px", borderRadius: "0 12px 12px 12px" }}>
            {isEcho && personas && (
              <div style={{ marginBottom: 8, borderBottom: "1px solid #eee", paddingBottom: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontWeight: 700, color: "#b45309" }}><span>신뢰도 {personas.confidence}%</span><span>{personas.breakdown}</span></div>
                <div style={{ height: 3, background: "#eee", marginTop: 4 }}><div style={{ height: "100%", width: `${personas.confidence}%`, background: "#b45309" }} /></div>
              </div>
            )}
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{text}</p>
          </div>
        </div>
      </div>
    </div>
  );
}