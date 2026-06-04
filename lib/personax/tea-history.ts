export type TeaPersonaKey = 'lucia' | 'jack' | 'echo' | 'ray';
export type TeaMsg = { role: 'user' | 'assistant'; content: string };

// 원본 messages 에서 특정 페르소나의 이력만 재구성.
//   - user 턴은 그대로.
//   - assistant 턴은 해당 페르소나의 텍스트(teaJack/teaEcho)가 있으면 그것을,
//     없으면 content(=teaLucia) 를 사용.
//   - 마지막 6 턴 (~12 메시지) 유지.
export const buildTeaHistory = (rawMessages: unknown, persona: TeaPersonaKey): TeaMsg[] => {
  if (!Array.isArray(rawMessages)) return [];
  const mapped: TeaMsg[] = [];
  for (const raw of rawMessages) {
    if (!raw || typeof raw !== 'object') continue;
    const m = raw as { role?: string; content?: string; teaJack?: string; teaEcho?: string; teaRay?: string };
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    let content = typeof m.content === 'string' ? m.content : '';
    if (m.role === 'assistant') {
      if (persona === 'jack' && typeof m.teaJack === 'string' && m.teaJack.trim()) content = m.teaJack;
      else if (persona === 'echo' && typeof m.teaEcho === 'string' && m.teaEcho.trim()) content = m.teaEcho;
      else if (persona === 'ray' && typeof m.teaRay === 'string' && m.teaRay.trim()) content = m.teaRay;
    }
    if (!content.trim()) continue;
    mapped.push({ role: m.role, content });
  }
  return mapped.slice(-12);
};
