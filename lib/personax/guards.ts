import type { TaggedPersonaKey } from './message-router';

type Stage3GuardResult = {
  first?: string;
  second?: string;
  third?: string;
  echoQuestion?: string;
  closerContent?: string;
  closerKey?: TaggedPersonaKey;
  soloContent?: string;
  soloKey?: TaggedPersonaKey;
  luciaClose?: string;
};

const emptyPersonaText = (): Record<TaggedPersonaKey, string> => ({
  ray: '',
  jack: '',
  lucia: '',
  echo: '',
});

const mapStage3PersonaText = (
  result: Stage3GuardResult,
  order: TaggedPersonaKey[],
): Record<TaggedPersonaKey, string> => {
  const personaText = emptyPersonaText();
  const nonEchoSlots = [result.first, result.second, result.third];
  let nonEchoIdx = 0;
  order.slice(0, 4).forEach((key) => {
    if (result.closerKey === key && result.closerContent) {
      personaText[key] = result.closerContent;
    } else {
      personaText[key] = nonEchoSlots[nonEchoIdx++] || '';
    }
  });
  if (result.echoQuestion) {
    personaText.echo = result.echoQuestion;
  }
  if (!personaText.echo && result.luciaClose) {
    personaText.echo = result.luciaClose;
  }
  if (personaText.echo && !personaText.echo.trimEnd().endsWith('?')) {
    personaText.echo = personaText.echo.trimEnd().replace(/[.!,;:。！]+$/, '') + '?';
  }
  return personaText;
};

export const hasJackYoEnding = (text: string): boolean => {
  if (!text) return false;
  const sentences = text.split(/[.!?\n]+/).map((s) => s.trim()).filter(Boolean);
  return sentences.some((s) => /요$/.test(s));
};

export const cleanJackEnding = (text: string): string =>
  text.replace(/요\./g, '다.');

export const hasEchoSelfReference = (text: string): boolean => {
  if (!text) return false;
  return /ECHO\s*[는가]/.test(text) || /에코\s*[는가]/.test(text);
};

export const cleanEchoSelfReference = (text: string): string =>
  text
    .replace(/ECHO\s*는/g, '저는')
    .replace(/에코\s*는/g, '저는')
    .replace(/ECHO\s*가/g, '제가')
    .replace(/에코\s*가/g, '제가');

// 희(喜) 모드 전용 금지어휘 — RAY/JACK이 기쁨을 깎는 어휘로 빠지면 재생성 트리거.
//   RAY: 준비/환경/부담/리스크/책임/결정 — "다음 스텝" 영역 침범으로 분위기 깎음
//   JACK: 불안/리스크/부담/현실/걱정 — 마동석 짧은 인정 톤이 깨지고 무게로 빠짐
const HEE_RAY_BAN_WORDS = /준비|환경|부담|리스크|책임|결정/;
const HEE_JACK_BAN_WORDS = /불안|리스크|부담|현실|걱정/;

export const hasHeeRayBannedWord = (text: string): boolean =>
  !!text && HEE_RAY_BAN_WORDS.test(text);

export const hasHeeJackBannedWord = (text: string): boolean =>
  !!text && HEE_JACK_BAN_WORDS.test(text);

export const detectStage3GuardViolations = (
  result: Stage3GuardResult,
  order: TaggedPersonaKey[],
  isHeeMode: boolean = false,
): string[] => {
  const reasons: string[] = [];
  // solo 모드 — soloKey/soloContent에서 직접 검사
  if (result.soloKey) {
    if (isHeeMode) {
      if (result.soloKey === 'ray' && hasHeeRayBannedWord(result.soloContent || '')) {
        reasons.push('희(喜) RAY 금지어휘(solo)');
      }
      if (result.soloKey === 'jack' && hasHeeJackBannedWord(result.soloContent || '')) {
        reasons.push('희(喜) JACK 금지어휘(solo)');
      }
    }
    return reasons;
  }
  // full 모드 — 페르소나별 텍스트 분리 후 검사
  const personaText = mapStage3PersonaText(result, order);
  if (isHeeMode) {
    if (hasHeeRayBannedWord(personaText.ray)) reasons.push('희(喜) RAY 금지어휘');
    if (hasHeeJackBannedWord(personaText.jack)) reasons.push('희(喜) JACK 금지어휘');
  }
  return reasons;
};
