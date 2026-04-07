'use client';

import { useState } from 'react';

export default function Home() {
  const [input, setInput] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;
    
    setIsLoading(true);
    setResponse('참모 잭(JACK)이 보고서를 전송 중입니다...');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: input }] }),
      });

      // 서버의 JSON 패키지를 안전하게 개봉합니다.
      const data = await res.json();
      setResponse(data.reply || "잭이 응답을 거부했습니다.");

    } catch (error: any) {
      console.error("수신 장애 발생:", error);
      setResponse(`지휘관님, 수신 장애입니다. 사유: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-900 text-white font-sans">
      <div className="w-full max-w-3xl bg-slate-800 rounded-3xl shadow-2xl border border-slate-700 p-12">
        <h1 className="text-4xl font-black mb-2 text-blue-400 text-center tracking-tighter italic">PersonaX COMMAND</h1>
        <p className="text-slate-400 text-center mb-10 font-medium font-mono text-xs uppercase tracking-widest">Commander Seohyun Only</p>
        
        <div className="bg-slate-950 rounded-2xl p-8 min-h-[350px] mb-8 border border-slate-800 text-slate-200 leading-relaxed overflow-y-auto whitespace-pre-wrap text-lg">
          {response ? response : "참모 잭(JACK)이 지휘관님의 명령을 대기 중입니다."}
        </div>

        <div className="flex gap-4">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleSend()}
            className="flex-1 p-5 bg-slate-700 rounded-2xl border border-slate-600 focus:outline-none focus:border-blue-500 text-xl transition-all"
            placeholder="비트코인 전략을 보고하라..."
            disabled={isLoading}
          />
          <button 
            onClick={handleSend} 
            disabled={isLoading} 
            className="px-10 py-5 bg-blue-600 rounded-2xl font-black text-xl hover:bg-blue-500 active:scale-95 transition-all shadow-lg shadow-blue-500/20"
          >
            {isLoading ? "분석중" : "전송"}
          </button>
        </div>
      </div>
    </main>
  );
}