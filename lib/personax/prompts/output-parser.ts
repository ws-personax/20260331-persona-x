// PR4-A Runtime Skeleton: parser helpers moved from output.ts without behavior changes.

import type { AllPersonaKey } from '@/app/api/chat/prompts/orchestrator-tagged';

// ✅ 알려진 태그 목록이 아니라 임의의 대문자 구조 태그(예: [FOURTH], [UNKNOWN_TAG])도
//   경계/제거 대상으로 인식한다 — LLM이 미지원 태그를 출력해도 누출·혼합을 막기 위함.
const stripPersonaLabels = (s: string): string =>
  s
    .replace(/^\s*(?:RAY|JACK|LUCIA|ECHO)\s*[:：]\s*/gim, '')
    .replace(/^\s*\[[A-Z_0-9]+\]\s*/gim, '')
    .trim();

const extractTag = (text: string, tag: string): string => {
  // [TAG] 다음 줄부터 다음 [ ... ] 또는 끝까지를 캡처.
  const re = new RegExp(`\\[${tag}\\][^\\S\\n]*\\n?([\\s\\S]*?)(?=\\n\\s*\\[[A-Z_0-9]+\\]|$)`, 'i');
  const m = text.match(re);
  if (!m) return '';
  return stripPersonaLabels(m[1]);
};

export type TaggedRound1Result = {
  first: string;
  second: string;
  third: string;
  echoQuestion: string;
  // solo 모드 — 호명된 페르소나가 ECHO일 수도 있으므로 AllPersonaKey(4-key) 사용.
  soloKey?: AllPersonaKey;
  soloContent?: string;
};

export type TaggedRound2Result = {
  first: string;
  second: string;
  third: string;
  echoFinal: string;
};

export const parseTaggedRound1 = (raw: string): TaggedRound1Result | null => {
  if (!raw) return null;
  const first = extractTag(raw, 'FIRST');
  const second = extractTag(raw, 'SECOND');
  const third = extractTag(raw, 'THIRD');
  const echoQuestion = extractTag(raw, 'ECHO_QUESTION');
  if (!first || !second || !third || !echoQuestion) return null;
  return { first, second, third, echoQuestion };
};

export const parseTaggedRound2 = (raw: string): TaggedRound2Result | null => {
  if (!raw) return null;
  const first = extractTag(raw, 'FIRST_2');
  const second = extractTag(raw, 'SECOND_2');
  const third = extractTag(raw, 'THIRD_2');
  const echoFinal = extractTag(raw, 'ECHO_FINAL');
  if (!first || !second || !third || !echoFinal) return null;
  return { first, second, third, echoFinal };
};
