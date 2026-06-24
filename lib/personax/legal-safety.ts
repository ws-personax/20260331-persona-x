// ✅ 위기 신호 감지 — LUCIA 첫 응답 앞에 상담 연계 안내 주입
const CRISIS_SIGNAL_PATTERN =
  /포기하고 싶|다 그만두고 싶|살기 싫|죽고 싶|사라지고 싶|없어지고 싶/;

const CRISIS_HOTLINE_NOTICE =
  '지금 많이 힘드시죠. 혼자 감당하기 어려울 때는 자살예방상담전화 109 또는 정신건강상담전화 1577-0199로 연락하실 수 있어요. 긴급한 위험이 있다면 112 또는 119에 바로 연락해 주세요.';

export function hasCrisisSignal(text: string): boolean {
  return CRISIS_SIGNAL_PATTERN.test(text);
}

export function injectCrisisNoticeIfNeeded(userMessage: string, luciaFirstResponse: string): string {
  if (!hasCrisisSignal(userMessage)) {
    return luciaFirstResponse;
  }

  return `${CRISIS_HOTLINE_NOTICE}\n\n${luciaFirstResponse}`;
}
