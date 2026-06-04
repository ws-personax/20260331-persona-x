export function buildConversationMessages(
  question: string,
  finalText: string,
  personaText: Record<string, string>,
): Array<{ role: string; persona?: string; content: string }> {
  void finalText;

  return [
    { role: 'user', content: question },
    { role: 'assistant', persona: 'lucia', content: personaText.lucia },
    { role: 'assistant', persona: 'jack', content: personaText.jack },
    { role: 'assistant', persona: 'ray', content: personaText.ray },
    { role: 'assistant', persona: 'echo', content: personaText.echo },
  ].filter((m) => m.content?.trim());
}
