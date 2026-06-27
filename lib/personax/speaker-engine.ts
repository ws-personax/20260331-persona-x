export type SpeakerType = 'user' | 'persona' | 'system';

export interface Speaker {
  id: string;
  type: SpeakerType;
  name: string;
  persona?: string;
}

export function resolveSpeaker(input: {
  type: SpeakerType;
  id?: string;
  name?: string;
  persona?: string;
}): Speaker {
  const id = input.id ?? `${input.type}:${input.persona ?? input.name ?? 'default'}`;
  const name =
    input.name ??
    (input.type === 'persona' && input.persona ? input.persona.toUpperCase() : input.type.toUpperCase());

  const speaker: Speaker = {
    id,
    type: input.type,
    name,
  };

  if (input.persona) {
    speaker.persona = input.persona;
  }

  return speaker;
}
