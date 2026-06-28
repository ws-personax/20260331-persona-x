export type QuoteSpeaker = string;

export interface QuoteInput {
  currentSpeaker: QuoteSpeaker;
  previousSpeaker: QuoteSpeaker;
  previousText: string;
  maxQuoteLength?: number;
}

function normalizeSpeakerName(speaker: QuoteSpeaker): string {
  return speaker.trim().toUpperCase();
}

function compactText(text: string): string {
  return text
    .replace(/\[[A-Z0-9_]+\]/g, ' ')
    .replace(/[#>*_`~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateSentence(sentence: string, maxLength: number): string {
  if (sentence.length <= maxLength) {
    return sentence;
  }

  return `${sentence.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

export function extractKeySentence(text: string, maxLength = 60): string {
  const compacted = compactText(text);

  if (!compacted) {
    return '';
  }

  const sentence =
    compacted
      .split(/[.!?\u3002\uff01\uff1f]\s+|\ub2e4\s+|\uc694\s+/)
      .map((part) => part.trim())
      .find((part) => part.length > 0) ?? compacted;

  return truncateSentence(sentence.replace(/[.!?\u3002\uff01\uff1f]+$/, '').trim(), maxLength);
}

export function shouldQuote(input: {
  currentSpeaker?: QuoteSpeaker | null;
  previousSpeaker?: QuoteSpeaker | null;
  previousText?: string | null;
}): boolean {
  const currentSpeaker = input.currentSpeaker?.trim();
  const previousSpeaker = input.previousSpeaker?.trim();
  const previousText = input.previousText?.trim();

  if (!currentSpeaker || !previousSpeaker || !previousText) {
    return false;
  }

  return normalizeSpeakerName(currentSpeaker) !== normalizeSpeakerName(previousSpeaker);
}

export function buildQuote(input: QuoteInput): string {
  if (!shouldQuote(input)) {
    return '';
  }

  const currentSpeaker = normalizeSpeakerName(input.currentSpeaker);
  const previousSpeaker = normalizeSpeakerName(input.previousSpeaker);
  const keySentence = extractKeySentence(input.previousText, input.maxQuoteLength ?? 60);

  if (!keySentence) {
    return '';
  }

  switch (currentSpeaker) {
    case 'JACK':
      return `${previousSpeaker}\uAC00 '${keySentence}'\uB77C\uACE0 \uD588\uC9C0\uB9CC, \uC9C0\uAE08 \uD544\uC694\uD55C \uAC83\uC740 \uC120\uD0DD\uC785\uB2C8\uB2E4.`;
    case 'RAY':
      return `${previousSpeaker}\uC774 '${keySentence}'\uB77C\uACE0 \uD588\uC9C0\uB9CC, \uADF8 \uD310\uB2E8\uC744 \uD655\uC778\uD560 \uADFC\uAC70\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.`;
    case 'LUCIA':
      return `${previousSpeaker}\uAC00 '${keySentence}'\uB77C\uACE0 \uD55C \uBD80\uBD84\uC740 \uC774\uD574\uD558\uC9C0\uB9CC, \uC0AC\uB78C\uC774 \uAC10\uB2F9\uD560 \uC218 \uC788\uB294\uC9C0\uB3C4 \uBD10\uC57C \uD569\uB2C8\uB2E4.`;
    case 'ECHO':
      return `\uBC29\uAE08 ${previousSpeaker}\uC758 '${keySentence}'\uB294 \uC774 \uD750\uB984\uC758 \uBC18\uBCF5 \uAD6C\uC870\uB97C \uBCF4\uC5EC\uC90D\uB2C8\uB2E4.`;
    default:
      return `${previousSpeaker}\uAC00 '${keySentence}'\uB77C\uACE0 \uD588\uC9C0\uB9CC, \uC0C8\uB85C\uC6B4 \uAD00\uC810\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.`;
  }
}
