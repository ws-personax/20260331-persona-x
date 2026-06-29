import type { TaggedPersonaKey } from './message-router';
import { emptyPersonaText } from './fallbacks';
import { toPromptOrder } from './utils';

// ECHO 전용 — 문자열 끝 ? → . 교체. JACK/LUCIA/RAY 미적용.
const stripEchoTrailingQuestionMark = (text: string): string =>
  text.replace(/\?(\s*)$/, '.$1');

type Round1MappingResult = {
  first?: string;
  second?: string;
  third?: string;
  echoQuestion?: string;
  closerContent?: string;
  closerKey?: TaggedPersonaKey;
  luciaClose?: string;
};

type Round2MappingResult = {
  first: string;
  second: string;
  third: string;
  echoFinal: string;
};

export const mapOrderedRound1 = (
  result: Round1MappingResult,
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
  // 복합 카테고리(finance+emotional 등) — order에 echo가 없고 echoQuestion도 비어있을 때,
  //   LUCIA_CLOSE가 실제 닫는 질문 역할이므로 personaText.echo에 동기화.
  //   UI/테스트에서 echo 필드가 비지 않도록 보장.
  if (!personaText.echo && result.luciaClose) {
    personaText.echo = result.luciaClose;
  }
  // ECHO가 FIRST/SECOND/THIRD 슬롯(비-ECHO_QUESTION 경로)에 있을 때는
  // message-router.ts Step 7이 이미 trailing ? → . 변환을 완료했으므로 재강제 금지.
  return personaText;
};

export const mapLegacyEchoRound2 = (
  result: Round2MappingResult,
  order: TaggedPersonaKey[],
): Record<TaggedPersonaKey, string> => {
  const personaText = emptyPersonaText();
  const promptOrder = toPromptOrder(order);
  personaText[promptOrder[0]] = result.first;
  personaText[promptOrder[1]] = result.second;
  personaText[promptOrder[2]] = result.third;
  personaText.echo = stripEchoTrailingQuestionMark(result.echoFinal);
  return personaText;
};
