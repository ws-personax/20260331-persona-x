import { cleanEchoSelfReference, cleanJackEnding } from '@/lib/personax/guards';
import { summarize } from '@/lib/personax/utils';

export const detectTargetedPersona = (echoResp: string): 'RAY' | 'JACK' | 'LUCIA' | null => {
  if (!echoResp) return null;
  const lastQ = echoResp.lastIndexOf('?');
  const tail = lastQ > 0
    ? echoResp.slice(Math.max(0, lastQ - 200), lastQ + 1)
    : echoResp.slice(-200);
  const m = tail.match(/(RAY|JACK|LUCIA)/i);
  return m ? (m[1].toUpperCase() as 'RAY' | 'JACK' | 'LUCIA') : null;
};

export const buildRecentFinanceContext = (
  messages: unknown,
  shouldWeakenContext: boolean,
): string => {
  if (!Array.isArray(messages) || messages.length < 2) return '';
  const prior = messages.slice(0, -1).slice(-8) as Array<{
    role?: string;
    content?: string;
    teaRay?: string;
    teaJack?: string;
    teaLucia?: string;
    personas?: { ray?: string; jack?: string; lucia?: string; echo?: string };
  }>;
  if (prior.length === 0) return '';

  const turns: string[] = [];
  for (let i = 0; i < prior.length; i++) {
    const m = prior[i];
    if (m?.role !== 'user') continue;
    const q = summarize(m.content || '', 100);
    if (!q) continue;
    const next = prior[i + 1];
    if (next && next.role === 'assistant') {
      const rayText   = summarize(next.personas?.ray   || next.teaRay   || '', 100);
      const jackText  = cleanJackEnding(summarize(next.personas?.jack  || next.teaJack  || '', 80));
      const luciaText = summarize(next.personas?.lucia || next.teaLucia || '', 80);
      const echoText  = cleanEchoSelfReference(summarize(next.personas?.echo  || '', 60));

      const ctxParts: string[] = [`[유저: ${q}]`];
      if (rayText)   ctxParts.push(`[RAY: ${rayText}]`);
      if (jackText)  ctxParts.push(`[JACK: ${jackText}]`);
      if (luciaText) ctxParts.push(`[LUCIA: ${luciaText}]`);
      if (echoText)  ctxParts.push(`[ECHO: ${echoText}]`);
      turns.push(ctxParts.join(' → '));
      i++; // 다음 assistant는 소비됐으므로 건너뜀
    } else {
      turns.push(`[유저: ${q}]`);
    }
  }
  if (shouldWeakenContext) {
    // ✅ V2 결함 #10 보정 — 완전 차단 (라이브 검증으로 200자 요약 불충분 확인)
    //   카테고리 변경 + 명시 연결어 없음 = 새 주제로 전환
    //   이전 맥락 정보를 LLM에게 노출하지 않음 (끌어올 정보 자체를 차단)
    //   마스터 통찰 보호: shouldWeakenContext 로직이 이미 "새 주제"만 감지하므로
    //   명시 연결어/같은 카테고리는 영향 없음 (유지됨)
    return '[새 주제로 전환 — 이전 맥락 무관, 마지막 메시지에만 집중]';
  }
  return turns.join(' → ');
};

export const buildPriorRayResponse = (messages: unknown): string => {
  if (!Array.isArray(messages) || messages.length === 0) return '';
  const prior = messages.slice(-8) as Array<{
    role?: string;
    personas?: { ray?: string };
    teaRay?: string;
  }>;
  for (let i = prior.length - 1; i >= 0; i--) {
    const m = prior[i];
    if (m?.role !== 'assistant') continue;
    const ray = m.personas?.ray || m.teaRay || '';
    if (ray) return ray.replace(/\s+/g, ' ').trim().slice(0, 200);
  }
  return '';
};
