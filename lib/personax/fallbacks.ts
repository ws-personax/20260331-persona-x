import type { TaggedPersonaKey } from './message-router';

export const emptyPersonaText = (): Record<TaggedPersonaKey, string> => ({
  ray: '',
  jack: '',
  lucia: '',
  echo: '',
});

// 솔로 path 전용 ECHO 폴백 — invoked가 echo가 아닐 때, echo 필드에 "현실+미래" 양자택일
//   질문 1줄을 자동 부착해 ECHO 닫는 질문 일관성을 유지.
//   UI/테스트는 personas.echo가 '?'로 끝나는 질문이라고 기대 — 솔로 모드에서도 동일 보장.
export const buildSoloEchoFollowup = (
  invokedKey: TaggedPersonaKey,
): string => {
  if (invokedKey === 'echo') return '';
  const displayMap: Record<'ray' | 'jack' | 'lucia', string> = {
    ray: 'RAY',
    jack: 'JACK',
    lucia: 'LUCIA',
  };
  const display = displayMap[invokedKey];
  return `${display} 의견 들어보셨어요. 지금 이대로 가실 거예요, 5년 후에 다른 분 의견도 들어보실 거예요?`;
};

// ✅ Persona empty-value fallback — non-invest 경로 전용
//   LLM/파싱 실패로 빈 문자열이 반환될 때 최소 안전 문장 보정.
//   invest 카테고리는 기존 안전망(손절선 가드 등)이 담당하므로 제외.
//   hee 모드(emotional + 기쁜 소식)는 축하 톤. 금지어 없음.
export const PERSONA_FALLBACK: Record<TaggedPersonaKey, string> = {
  ray:   '지금 상황을 차분히 정리해보면, 먼저 기준을 세우는 것이 좋습니다.',
  jack:  '핵심은 하나입니다. 지금 바로 결론보다 다음 행동 기준을 정해야 합니다.',
  lucia: '지금 느끼는 마음을 무시하지 말고, 천천히 정리해도 괜찮아요.',
  echo:  '지금 필요한 건 결론인가요, 아니면 한 번 더 확인할 기준인가요?',
};

export const HEE_FALLBACK: Record<TaggedPersonaKey, string> = {
  ray:   '정말 잘 되셨습니다. 오늘은 이 좋은 순간을 충분히 느껴도 됩니다.',
  jack:  '이건 분명 좋은 일입니다. 마음껏 기뻐하셔도 됩니다.',
  lucia: '정말 기쁘고 따뜻한 순간이네요. 함께 축하하고 싶어요.',
  echo:  '이 기쁜 순간을 누구와 가장 먼저 나누고 싶으세요?',
};

/**
 * personaText의 빈(공백 포함) 값만 fallback으로 채운다.
 * 기존 정상 문장은 덮어쓰지 않음.
 * isHee === true 시: 빈 값 보정 외에, "리스크" 또는 "손절" 포함 필드도
 * HEE_FALLBACK으로 치환한다 (축하 톤 유지). echo는 항상 '?'로 종결.
 */
export const applyPersonaFallback = (
  personaText: Record<TaggedPersonaKey, string>,
  isHee: boolean,
): void => {
  const fb = isHee ? HEE_FALLBACK : PERSONA_FALLBACK;
  const keys: TaggedPersonaKey[] = ['ray', 'jack', 'lucia', 'echo'];
  for (const k of keys) {
    if (!personaText[k].trim()) {
      // 빈 값 → fallback 채우기
      personaText[k] = fb[k];
    } else if (isHee && /리스크|손절/.test(personaText[k])) {
      // hee 모드 금지어 포함 필드만 HEE_FALLBACK으로 치환
      personaText[k] = HEE_FALLBACK[k];
    }
  }
};
