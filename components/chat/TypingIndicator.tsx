import { useState, useEffect, useMemo } from 'react';

type PersonaKey = 'jack' | 'lucia' | 'ray' | 'echo';

export type PersonaStyle = {
  name: string;
  initial: string;
  iconBg: string;
  bubbleBg: string;
  bubbleBorder: string;
};

// ✅ 페르소나별 "생각 중" 메시지 — 시퀀스 사이클에서 표시되는 텍스트.
//   메시지는 페르소나에 고정되고, 표시 순서만 카테고리로 결정됨.
const PERSONA_THINKING_MESSAGES: Record<PersonaKey, string> = {
  lucia: 'LUCIA가 마음을 읽는 중...',
  ray: 'RAY가 데이터를 분석하는 중...',
  jack: 'JACK이 전략을 짜는 중...',
  echo: 'ECHO가 판단하는 중...',
};

// 후방 호환 — 단일 페르소나 표시(solo) 경로에서 여전히 사용. 시퀀스 사이클은 위 상수 사용.
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

// 시퀀스 사이클용 페르소나 순서 결정.
//   1) teaPersona가 solo(jack/echo) → 단일 페르소나 배열 (사이클 없음)
//   2) pendingOrder가 4페르소나 분량(>=4)이면 그 순서 사용 + 누락분 추가
//   3) 그 외엔 userText 카테고리로 첫 페르소나 결정 + 나머지는 [lucia, jack, ray, echo] 순서로 보충
//   → emotional 키워드 → LUCIA 첫번째, invest 키워드 → RAY 첫번째 (사양)
const getThinkingOrder = (
  userText: string,
  pendingOrder: PersonaKey[] | null,
  teaPersona: 'lucia' | 'jack' | 'echo' | null,
): PersonaKey[] => {
  if (teaPersona === 'jack' || teaPersona === 'echo') return [teaPersona];
  const baseOrder: PersonaKey[] = ['lucia', 'jack', 'ray', 'echo'];
  if (pendingOrder && pendingOrder.length >= 4) {
    const seen = new Set<PersonaKey>();
    const result: PersonaKey[] = [];
    for (const p of pendingOrder) {
      if (!seen.has(p)) {
        result.push(p);
        seen.add(p);
      }
    }
    for (const p of baseOrder) {
      if (!seen.has(p)) result.push(p);
    }
    return result;
  }
  const first = getLoadingPersona(userText);
  return [first, ...baseOrder.filter((p) => p !== first)];
};

export const TypingIndicator = ({
  teaMode = false,
  teaPersona = null,
  userText = '',
  pendingOrder = null,
  personas,
}: {
  teaMode?: boolean;
  teaPersona?: 'lucia' | 'jack' | 'echo' | null;
  userText?: string;
  pendingOrder?: PersonaKey[] | null;
  personas: Record<PersonaKey, PersonaStyle>;
}) => {
  // ✅ 시퀀스 사이클 — 카테고리 기반 페르소나 순서대로 "생각 중" 메시지를 1.5초 간격으로 표시.
  //   solo(jack/echo)일 땐 order.length === 1 이라 사이클 없이 단일 페르소나만 보임.
  //   훅은 항상 같은 순서로 호출되도록 컴포넌트 최상단에 위치 (early return 보다 위).
  const thinkingOrder = useMemo(
    () => getThinkingOrder(userText, pendingOrder, teaPersona),
    [userText, pendingOrder, teaPersona],
  );
  const orderKey = thinkingOrder.join(',');
  const [thinkingStep, setThinkingStep] = useState(0);
  useEffect(() => {
    setThinkingStep(0);
    if (thinkingOrder.length <= 1) return;
    const id = window.setInterval(() => {
      setThinkingStep((prev) => (prev + 1) % thinkingOrder.length);
    }, 1500);
    return () => window.clearInterval(id);
    // orderKey가 같으면 thinkingOrder 배열 reference만 변해도 effect 재실행하지 않음.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey]);

  if (teaMode) {
    const personaKey: PersonaKey = thinkingOrder[thinkingStep] || thinkingOrder[0] || 'lucia';
    const p = personas[personaKey];
    const text = PERSONA_THINKING_MESSAGES[personaKey];
    return (
      <>
        <style>{`
          @keyframes teaTypingPulse {
            0%, 100% { opacity: 0.65; }
            50% { opacity: 1; }
          }
        `}</style>
        <div style={{ padding: '0 0 8px' }}>
          <div
            key={personaKey}
            style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '4px 12px' }}
          >
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
          const p = personas[key];
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

