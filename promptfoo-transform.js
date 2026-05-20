// promptfoo HTTP provider — response → personas 객체 추출
// 응답 형태 자동 감지: NDJSON (done 이벤트), SSE (data: 라인), 단일 JSON, 에러 JSON
module.exports = (json, text) => {
  const raw = String(text || '');
  let personas = null;
  for (const line of raw.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try {
      const j = JSON.parse(s.startsWith('data:') ? s.slice(5).trim() : s);
      if (j && j.type === 'done' && j.personas) { personas = j.personas; break; }
      if (j && j.personas && (j.personas.ray || j.personas.jack || j.personas.lucia || j.personas.echo)) {
        personas = j.personas;
        break;
      }
    } catch (e) {}
  }
  if (!personas) {
    if (json && typeof json === 'object') personas = json;
    else personas = { _raw: raw };
  }
  return JSON.stringify(personas || {});
};
