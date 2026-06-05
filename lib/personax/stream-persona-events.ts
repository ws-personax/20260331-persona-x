import type { TaggedPersonaKey } from '@/lib/personax/message-router';
import type { StreamEvent } from '@/lib/personax/stream-response';
import { chunkText } from '@/lib/personax/utils';

export const streamPersonaTagged = async (
  send: (event: StreamEvent) => void,
  key: TaggedPersonaKey,
  full: string,
  round: 1 | 2 = 1,
) => {
  let acc = '';
  for (const c of chunkText(full, 15)) {
    acc += c;
    if (key === 'echo') {
      send({ type: 'echo', round, text: acc });
    } else {
      send({ type: 'persona', key, round, text: acc });
    }
    await new Promise((r) => setTimeout(r, 20));
  }
};
