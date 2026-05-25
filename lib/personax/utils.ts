// 텍스트를 size 글자 단위로 분할 — 진행형 스트리밍 청크용
export function chunkText(text: string, size: number): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    out.push(text.slice(i, i + size));
  }
  return out;
}

// 2라운드 페르소나 응답에서 다른 페르소나 발화 누출 방어 — 첫 빈 줄 이전 문단만 사용
export const firstParagraph = (t: string): string => (t || '').split(/\n\s*\n/)[0].trim();

// ─────────────────────────────────────────────
// 자세히 보기 전용 후처리 — 지시형 표현 완화 + 이모지 허용 셋만 유지
//   허용 이모지: ✅ ⚠️ 🔹 📊 📈 💡 🔴 🟡 🟢 (📍 렌더링 이슈로 🔹으로 대체)
//   주의: 이 함수는 "자세히 보기(details)" 문자열에만 적용해야 함.
//   ECHO 상단 summary / RAY·JACK·LUCIA 메인 버블에는 적용하지 않음 (지휘관 톤 유지).
// ─────────────────────────────────────────────
export const normalizeDetails = (text: string | null | undefined): string | null => {
  if (!text) return text ?? null;
  return text
    // 이모지 교체 (긴 것 먼저)
    .replace(/🛡️/g, '⚠️')
    .replace(/📌/g, '🔹')
    .replace(/📍/g, '🔹')
    .replace(/🎯/g, '✅')
    .replace(/📉/g, '📊')
    .replace(/💭/g, '💡')
    .replace(/📐/g, '📊')
    // 허용 셋에 없는 이모지 제거 (선행 공백 흡수)
    .replace(/⚔️\s?/g, '')
    .replace(/🔗\s?/g, '')
    // 금지 표현 — 긴 패턴부터
    .replace(/손절\s*기준\s*사수/g, '리스크 기준선 관리')
    .replace(/손절\s*기준\s*엄수/g, '리스크 기준선 이탈 여부 확인 권장')
    .replace(/손절\s*규칙은\s*지키되/g, '리스크 기준선을 참고하되')
    .replace(/손절\s*규칙/g, '리스크 관리 규칙')
    .replace(/손절\s*라인\s*확인\s*권고/g, '리스크 기준선 확인 권고')
    .replace(/손절\s*설정/g, '리스크 기준선 설정')
    .replace(/손절\s*라인/g, '리스크 기준선')
    .replace(/손절가/g, '리스크 기준선')
    .replace(/손절선/g, '리스크 기준선')
    .replace(/권장\s*손절\s*-?\s*(\d+)\s*%/g, '권장 리스크 기준선 -$1%')
    .replace(/손절/g, '리스크 기준선')
    .replace(/현금화/g, '리스크 관리 고려')
    .replace(/섣부른\s*매수\s*금지/g, '충분한 확인 후 판단 권장')
    .replace(/매수\s*금지/g, '신중한 접근 권장')
    .replace(/추격\s*매수는\s*금지/g, '추격 매수는 자제 권장')
    .replace(/섣부른\s*역발상은\s*금지/g, '섣부른 역발상은 자제 권장')
    .replace(/성급한\s*진입은\s*금지/g, '성급한 진입은 자제 권장')
    .replace(/섣부른\s*저점\s*매수는\s*금지/g, '섣부른 저점 매수는 자제 권장')
    .replace(/신규\s*진입을\s*금지/g, '신규 진입 자제 권장')
    .replace(/진입은\s*금지가\s*원칙/g, '진입은 자제가 원칙')
    .replace(/금지합니다/g, '자제 권장')
    .replace(/금지가\s*원칙/g, '자제가 원칙')
    .replace(/즉각\s*재진입하십시오/g, '재진입 시나리오 검토 가능')
    .replace(/즉각\s*/g, '')
    .replace(/사수/g, '')
    .replace(/엄수/g, '준수 권장')
    // "하십시오" 계열 → 권장/검토 형태로 (긴 것 먼저)
    .replace(/서두르지\s*마십시오/g, '서두름 자제 권장')
    .replace(/추격은\s*피하십시오/g, '추격 자제 권장')
    .replace(/피하십시오/g, '자제 권장')
    // "지금 즉시 50% 정리하십시오" 같은 지시형 — 통째로 완화 (개별 '정리하십시오'보다 먼저 매칭)
    .replace(/지금\s*(?:즉시\s*)?\d+\s*%\s*정리하십시오/g, '분할 축소 고려 가능')
    .replace(/\d+\s*%\s*정리하십시오/g, '분할 축소 고려 가능')
    .replace(/정리하십시오/g, '정리 권장')
    .replace(/진입하십시오/g, '진입 권장')
    .replace(/확인하십시오/g, '확인 권장')
    .replace(/기다리십시오/g, '대기 권장')
    .replace(/준비하십시오/g, '준비 권장')
    .replace(/검토하십시오/g, '검토 권장')
    .replace(/고려하십시오/g, '고려 권장')
    .replace(/유지하십시오/g, '유지 권장')
    .replace(/대기하십시오/g, '대기 권장')
    .replace(/판단하십시오/g, '판단 권장')
    .replace(/대응하십시오/g, '대응 권장')
    .replace(/결정하십시오/g, '결정 권장')
    .replace(/접근하십시오/g, '접근 권장')
    .replace(/보류하십시오/g, '보류 권장')
    .replace(/재진입하십시오/g, '재진입 검토')
    .replace(/추종하십시오/g, '추종 검토')
    .replace(/시도하십시오/g, '시도 검토')
    .replace(/설정하십시오/g, '설정 권장')
    // 공백 정리
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};
