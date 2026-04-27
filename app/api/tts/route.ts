// 네이버 CLOVA Voice Premium TTS — 페르소나별 목소리 매핑.
// POST { text, persona } → audio/mpeg 스트림 반환.
// 환경변수: CLOVA_CLIENT_ID, CLOVA_CLIENT_SECRET (NCP API Gateway 키)

export const maxDuration = 15;

type Persona = 'ray' | 'jack' | 'lucia' | 'echo';

// 페르소나별 CLOVA 화자/속도 매핑.
const VOICE_MAP: Record<Persona, { speaker: string; speed: number }> = {
  lucia: { speaker: 'njiyun',    speed:  0 },
  jack:  { speaker: 'nwminsang', speed: -1 },
  echo:  { speaker: 'nwjoonseo', speed: -1 },
  ray:   { speaker: 'nkyunglee', speed: -1 },
};

const CLOVA_ENDPOINT = 'https://naveropenapi.apigw.ntruss.com/tts-premium/v1/tts';

// CLOVA Voice 입력 길이 제한(약 2000자) 대비 안전하게 1500자로 트림.
const MAX_TEXT_LENGTH = 1500;

export async function POST(req: Request) {
  let body: { text?: unknown; persona?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const personaRaw = typeof body.persona === 'string' ? body.persona.toLowerCase() : '';

  if (!text) {
    return Response.json({ error: 'text required' }, { status: 400 });
  }

  const clientId = process.env.CLOVA_CLIENT_ID;
  const clientSecret = process.env.CLOVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return Response.json({ error: 'CLOVA credentials missing' }, { status: 500 });
  }

  const voice = VOICE_MAP[personaRaw as Persona] || VOICE_MAP.ray;
  const safeText = text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text;

  const params = new URLSearchParams({
    speaker: voice.speaker,
    volume: '0',
    speed: String(voice.speed),
    pitch: '0',
    format: 'mp3',
    text: safeText,
  });

  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), 10000);

  try {
    const res = await fetch(CLOVA_ENDPOINT, {
      method: 'POST',
      headers: {
        'X-NCP-APIGW-API-KEY-ID': clientId,
        'X-NCP-APIGW-API-KEY': clientSecret,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
      signal: ctrl.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('CLOVA 에러:', res.status, errText);
      return Response.json(
        { error: 'CLOVA TTS failed', status: res.status, detail: errText.slice(0, 500) },
        { status: 502 },
      );
    }

    const audio = await res.arrayBuffer();
    return new Response(audio, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    clearTimeout(timeoutId);
    const msg = e instanceof Error ? e.message : 'unknown';
    return Response.json({ error: 'CLOVA TTS request failed', detail: msg }, { status: 502 });
  }
}
