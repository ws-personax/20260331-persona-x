export const cleanNews = (text: string | null | undefined): string =>
  (text || '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\[(?:1라운드|2라운드|3라운드)[^\]]*\]/g, '')
    .replace(/\[ECHO[^\]]*\]/g, '')
    .replace(/\[역할[^\]]*\]/g, '')
    .replace(/\[지시[^\]]*\]/g, '')
    .replace(/\[현재 시점[^\]]*\]/g, '')
    .replace(/^\s*(?:RAY|JACK|LUCIA|ECHO)\s*[:：]\s*/gm, '')
    .replace(/^\s*지시\s*[:：]\s*/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim();

export const cleanAdvanced = (text: string): string =>
  text.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\n{2,}/g, '\n').trim();

export const splitForBubble = (text: string): { summary: string; details: string } => {
  const clean = cleanAdvanced(text);
  const lines = clean.split('\n').filter(l => l.trim());
  if (lines.length <= 2) return { summary: clean, details: '' };
  return {
    summary: lines.slice(0, 2).join('\n'),
    details: lines.slice(2).join('\n'),
  };
};
