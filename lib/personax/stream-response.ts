import { stripInternalScriptTagsFromValue } from '@/lib/personax/response-guard';

export type StreamEvent =
  | { type: 'persona'; key: 'ray' | 'jack' | 'lucia'; round: 1 | 2; text: string }
  | { type: 'echo'; round: 1 | 2; text: string }
  | { type: 'done'; personas: Record<string, unknown>; reply: string };

export const streamRespond = (
  build: (send: (event: StreamEvent) => void) => Promise<void>,
  fallbackEvent: StreamEvent,
): Response => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        try {
          const safeEvent = stripInternalScriptTagsFromValue(event);
          controller.enqueue(encoder.encode(JSON.stringify(safeEvent) + '\n'));
        } catch (e) {
          console.warn('[stream] enqueue 실패', e);
        }
      };
      try {
        await build(send);
      } catch (e) {
        console.error('[stream] build 실패', e);
        send(fallbackEvent);
      } finally {
        try { controller.close(); } catch {}
      }
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
};
