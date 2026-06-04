export type TeaSelectedPersona = 'lucia' | 'jack' | 'echo' | 'ray';

export const buildTeaFallbacks = (
  lastMsg: string,
  round: number,
): { fallbackLucia: string; fallbackJack: string; fallbackEcho: string } => {
  // ── 카테고리 감지 — 폴백 템플릿 분기용 (LLM 응답 자체는 시스템 프롬프트가 알아서 적응) ──
  //   우선순위: 가족/건강 > 손실 > 기쁨 > 기타
  const isFamily = /(가족|부모|어머니|아버지|엄마|아빠|자식|아이|아들|딸|남편|아내|형제|자매|건강|병|아프|수술|입원|병원|암|치매)/.test(lastMsg);
  const isLoss = /(손실|손절|물렸|물림|떨어|빠졌|하락|폭락|투자|주식|코인|마이너스|잃었|날렸|망했|망하)/.test(lastMsg);
  const isJoy = /(기쁨|기뻐|행복|성공|올랐|올라|상승|수익|벌었|대박|축하|자랑|합격|승진|좋은 일)/.test(lastMsg);

  const empathyLine =
    isFamily ? '많이 걱정되시겠어요.'
    : isLoss  ? '많이 속상하셨겠어요.'
    : isJoy   ? '정말 잘 되셨네요!'
    :           '많이 힘드셨겠어요.';

  // ── 폴백 템플릿 (LLM 실패 시 per-persona 사용) ──
  let fallbackLucia: string;
  let fallbackJack: string;
  let fallbackEcho: string;

  if (round >= 3) {
    // ⚠️ ECHO 폴백은 '마무리 표현' 금지 규칙에 맞춰 '파고드는 질문' 형태로만 유지.
    //   JACK 폴백도 공감어 최소화 + 행동 중심 질문 톤으로 통일.
    const deeperCut = round >= 4;
    fallbackLucia = `말씀하신 내용이 마음에 걸려요.\n지금 가장 무거운 게 뭔가요?`;
    fallbackJack = deeperCut
      ? '그 결정의 근거가 뭐였나요?\n다음엔 어떤 기준을 세울 건가요?'
      : '지금 이 문제의 핵심이 뭐라고 보세요?\n피하고 있는 판단이 있다면 뭔가요?';
    fallbackEcho = deeperCut
      ? 'LUCIA는 감정을, JACK은 판단을 물었어요.\n저는 다른 게 궁금합니다 — 이 상황에서 진짜 원하는 게 뭔가요?'
      : '여기까지 들으니 한 가지가 걸려요.\n말하지 않은 것 중에 가장 무거운 건 무엇인가요?';
  } else if (round >= 2) {
    const luciaDeep =
      isFamily ? '그 마음이 얼마나 무거우셨을지 느껴져요.'
      : isLoss  ? '그때 가장 힘들었던 순간이 언제였어요?'
      : isJoy   ? '그 순간 어떤 기분이 드셨어요? 더 들려주세요.'
      :           '그 마음을 꺼내주셔서 감사해요.';
    fallbackLucia = `${empathyLine}\n${luciaDeep}`;
    fallbackJack =
      isJoy && !isLoss && !isFamily
        ? '상황을 조금 더 구체적으로 정리해볼까요?\n어떤 과정에서 그런 결과가 나왔는지 들려주세요.'
        : '상황을 조금 더 구체적으로 정리해볼까요?\n언제부터, 어떤 계기로 이 마음이 시작됐는지 알려주세요.';
    fallbackEcho =
      isJoy && !isLoss && !isFamily
        ? '지금 가장 나누고 싶은 게 뭐예요?\n축하할 일인지, 다음 계획인지 함께 정리해봐요.'
        : '지금 이 순간, 가장 하고 싶은 건 뭐예요?\n들어주기만 해도 되고, 같이 풀어가도 돼요.';
  } else {
    // Round 1 — LUCIA 외에는 응답 없음 (호출도 안 함)
    fallbackLucia = `말씀해주셔서 고마워요.\n${empathyLine}\n조금 더 이야기해주실 수 있어요?`;
    fallbackJack = '';
    fallbackEcho = '';
  }

  return { fallbackLucia, fallbackJack, fallbackEcho };
};

export const selectTeaPersona = (params: {
  teaPersona: unknown;
  category: string;
}): TeaSelectedPersona => {
  // ── 단일 페르소나 1:1 응답 — 기본 lucia, JACK/ECHO/RAY 는 명시적 소환 시에만 ──
  //   ✅ LUCIA 허브 카테고리 라우팅: sports→jack, news/finance→ray, legal/tech→echo (클라이언트 teaPersona 우선)
  const _categoryPersona: 'jack' | 'echo' | 'ray' | null =
    params.category === 'sports' ? 'jack'
    : params.category === 'news'   ? 'ray'
    : params.category === 'finance' ? 'ray'
    : (params.category === 'legal' || params.category === 'tech') ? 'echo'
    : params.category === 'life' ? null
    : null;
  const selectedPersona: 'lucia' | 'jack' | 'echo' | 'ray' =
    params.teaPersona === 'jack' ? 'jack'
    : params.teaPersona === 'echo' ? 'echo'
    : params.teaPersona === 'ray'  ? 'ray'
    : _categoryPersona
      ? _categoryPersona
      : 'lucia';

  return selectedPersona;
};
