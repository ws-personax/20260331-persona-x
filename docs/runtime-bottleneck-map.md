# Runtime 반복 패턴 병목 지도 (PR4 사전 조사)

PR2(`refactor/runtime-surgery-pr2`) 작업 중 message-router.ts를 Stage1/2/3으로
분리하면서 함께 수행한 정적 조사 결과. **이 문서는 지도화만 수행하며, 아래 병목은
이번 PR에서 수정하지 않는다.** PR4(Persona Runtime) 설계 시 참고용.

조사 방법: grep 기반 소스 추적 + 각 호출 지점의 조건부/무조건 실행 여부 확인.
실제 API/LLM 호출은 하지 않았다(정적 분석만).

---

## A. LUCIA "RAY 공격형 오프닝" 반복 문구 출처

### A-1. 항상 실행되는 규칙 (근원)
- 파일: `lib/personax/runtime/stage3-script-generation.ts:190` (PR2 이전에는 `message-router.ts` 내 `OPTION_D_SYSTEM`)
- 코드:
  ```
  2. 두 번째 발화자는 첫 번째를 직접 호명하며 반박
     예: "RAY, 그 논리면..." "LUCIA, 그게 맞아요?"
  ```
- 성격: **고정 템플릿, 항상 실행.** Stage 3 system prompt(`OPTION_D_SYSTEM`)에 박혀 있어 카테고리와 무관하게 모든 대본 생성 호출에 포함된다. SECOND 발화자는 FIRST를 "직접 호명하며 반박"하라는 지시가 예시 문구("RAY, 그 논리면...")까지 못 박혀 있음.

### A-2. Few-shot 예시 — 구체적인 "RAY, ~" 공격 문장
- 파일: `lib/personax/few-shot-examples.ts`
  - `SIX_FULL_SIMULATIONS`(269행 시작) 내부:
    - 366행: `LUCIA: "RAY, 그 데이터가 맞아도 — 요양원 보내고 나서..."`
    - 368행: `LUCIA: "RAY, 통계가 전부가 아니에요. 어머니가 낯선 곳에서..."`
    - 398행: `LUCIA: "RAY, 그 조건표가 이분 마음까지 설명해주진 않잖아요."`
    - 466행: `LUCIA: "RAY, 그 학습 여력이 있는 사람이 얼마나 돼요?"`
  - `lib/personax/personas/lucia/fewshots.ts:73`: `LUCIA: "RAY, 숫자가 못 보는 게 있어요..."`
- 성격: **고정 few-shot, 항상 실행.** `SIX_FULL_SIMULATIONS`은 `lib/personax/prompts/conflict.ts:209`에서 `buildPersonaToneAndConflictRules()`에 무조건 삽입되고, 이 함수는 `lib/personax/prompts/output.ts:994`(`buildScriptPrompt` 내부)에서 카테고리 분기 없이 항상 호출된다. 즉 카테고리가 무엇이든 LUCIA가 LLM에게 "RAY, ~" 패턴을 5개 이상 실제 예시로 반복 학습시키는 구조.
- 유도 카테고리: **전 카테고리 공통** (few-shot이 조건부 삽입이 아니므로 invest/emotional/action/knowledge 모두 동일하게 노출).

### A-3. 요약
LUCIA의 "RAY, 그 데이터 타령하다가..." 류 오프닝은 (1) system prompt의 "호명 반박 예시"와 (2) `few-shot-examples.ts`의 5개 이상 하드코딩된 "RAY, ~" 문장이 겹쳐서 만들어지는 **구조적 반복**이다. 특정 버그가 아니라 few-shot 설계 자체가 "LUCIA→RAY 공격"을 표준 패턴으로 학습시키고 있음.

---

## B. JACK "단조로운 행동 압박" 출처

### B-1. 항상 실행되는 규칙
- 파일: `lib/personax/prompts/output.ts:667-673` (`buildScriptPrompt` 내부 "사고방식 충돌 필수 규칙" 섹션)
  ```
  JACK — 행동 우선 사고방식:
  결론이 창업이든 재취업이든, JACK은 항상 "지금 당장 실행 가능한가"로 판단한다.
  데이터가 맞아도 실행력이 없으면 틀린 선택이다.
  감정이 맞아도 행동이 없으면 의미없다.
  앞 발화를 인정하되, "그런데 그게 지금 당장 실행되느냐"로 뒤집는다.
  ```
- 예시 리터럴: `output.ts:754` `"지금 당장 창업해라."` (패턴 2 예시, 고정 문구)
- 성격: **고정 템플릿, 항상 실행.** 이 섹션은 카테고리 분기 없이 `buildScriptPrompt` 호출 시 항상 포함된다(주변 코드 확인 — `categoryV3` 조건부 래핑 없음).

### B-2. JACK 페르소나 DNA와의 충돌
- 파일: `lib/personax/personas/jack/rules.ts:21-22, 107`
  ```
  ## Decision Criteria Layer — JACK = 행동 기준
  JACK은 정량 기준도 정성 기준도 아니다. JACK의 핵심은 행동 기준이다.
  ...
  그 기준이 없으면 판단보다 기준 수립이 먼저라고 말한다.
  ```
  같은 파일 15-18행: `"결정을 강요하지 말고 기준을 세우게 한다."`, `"사용자를 공격하지 않는다."`
- **발견된 모순**: `jack/rules.ts`는 JACK이 "결정을 강요하지 말고 기준을 세우게" 하라고 명시하는 반면, `output.ts:667-673`은 JACK이 "항상 지금 당장 실행 가능한가로 판단"하고 "지금 당장 창업해라" 식으로 말하라고 예시까지 준다. 두 지시가 같은 Stage 3 프롬프트에 동시에 주입되며, recency bias상 뒤에 오는 `output.ts` 규칙(및 few-shot 예시)이 이길 가능성이 높음 — 이것이 "단조로운 행동 압박"의 구조적 원인으로 보임. (버그 후보 — 아래 G 참조. 이번 PR에서 수정하지 않음)

### B-3. 참고: 비활성 레거시 파일
- `app/api/chat/prompts/orchestrator-screenplay.ts:79-87`에도 유사한 "JACK = 지금 당장 행동" 프레이밍이 있으나, 이 파일은 현재 **어디에도 import되지 않는 죽은 파일**(grep 결과 0건)이라 런타임에는 영향 없음. PR1.5 삭제 후보로 아래 F에 기록.

### B-4. 요약
JACK의 "당장 행동해라/질러라" 톤은 `output.ts`의 "사고방식 충돌" 섹션이 항상 주입하는 고정 규칙 + 고정 예시(`"지금 당장 창업해라."`)에서 나온다. `jack/rules.ts`의 완화 규칙과 상충하는 상태로 공존 중.

---

## C. Decision Summary 반복 템플릿 출처

### C-1. 생성 위치
- 함수: `buildDecisionSummary()` — `lib/personax/decision-summary.ts:165-306`
- 호출 지점: `lib/personax/message-router.ts` (`runRoutedRequest`, `buildPersonaXDecisionSummary` 별칭) — PR2 이후에도 message-router.ts에 그대로 유지(Stage3 결과를 받아 조합하는 "combination" 단계). Stage3 실행 **직후, solo 경로가 아닌 모든 요청에서 항상 실행**.
- 부착 위치: `router.order`의 마지막 슬롯(`lastOutputKey`)에 `decisionSummaryText`가 append됨 (message-router.ts의 `appendSummary` 로직).

### C-2. 반복 문구의 정확한 위치 — 캐치올(catch-all) 폴백
- 파일: `lib/personax/decision-summary.ts:300-305`
  ```
  return withImportance({
    verdict: anchor ? '하나의 정답보다 자신의 기준을 세우는 것이 중요합니다' : '추가 정보보다 먼저 판단 기준을 정해야 합니다',
    reasons: [...],
    counterView: '...',
    nextAction: '오늘 안에 RAY식 검증 기준, JACK식 행동 기준, LUCIA식 회복 기준, ECHO식 반복 기준을 각각 1줄로 적으세요',
  });
  ```
- 성격: **fallback, 조건부.** `buildDecisionSummary`는 `type`(=decisionType) 값에 따라 `real_estate_recommendation` / `buy_or_wait` / `startup_vs_job` / `relationship` / `philosophy_pattern` / `philosophy_definition` / `knowledge` / 목돈 목적 질문을 먼저 분기 처리(188-298행)하고, **이 중 아무것도 매칭되지 않으면**(즉 `decisionType === 'generic'`) 300-305행의 위 문구로 떨어진다.
- `decisionType`은 `lib/personax/decision-type-map.ts:16-52`(`inferDecisionType`)에서 결정되며, 명시적 키워드(창업/재취업, 관계 키워드, 커리어 키워드, 부동산 추천, invest, 반복/후회, 행복/의미, knowledge 카테고리)에 매칭되지 않는 질문은 모두 `'generic'`으로 떨어진다. 예: "부모님 요양원 보내드려야 할까요?"는 `career`/`relationship`/`invest` 키워드 목록에 없어 `generic`으로 분류될 가능성이 높음 → 반복 문구 노출.
- Stage1/2/3 중 부착 시점: **Stage 3(대본 생성) 완료 이후**, message-router.ts의 조합 단계에서 부착. Stage1/2 산출물(dataPack/personaViews)과는 무관.

### C-3. 요약
"하나의 정답보다..." / "오늘 안에 RAY식 검증 기준..." 문구는 `decisionType` 분류가 실패(=generic)할 때만 나오는 **캐치올 폴백**이다. 즉 특정 카테고리에서 항상 나오는 게 아니라, **decision-type-map.ts의 키워드 커버리지가 좁아서 자주 generic으로 새는 구조적 문제**로 보임.

---

## D. PR4 설계 반영 의견 (요청 J)

1. **Stage3 내부 페르소나별 독립 호출 분리 지점**: `lib/personax/runtime/stage3-script-generation.ts`의 `runStage3ScriptGeneration()`은 이미 FIRST→SECOND→THIRD→CLOSER(→LUCIA_CLOSE)를 TikiTaka 방식으로 순차 호출한다(각 호출이 이전 발화를 컨텍스트로 받음). 페르소나별 독립 호출로 전환하려면 이 순차 호출 사이에서 **`scriptPrompt`(공통 베이스)를 페르소나별로 분기 — 특히 `buildPersonaToneAndConflictRules()`가 주입하는 few-shot(A-2)과 "사고방식 충돌" 규칙(B-1)을 발화자별로 선택 주입**하도록 바꿔야 함. 지금은 모든 슬롯이 동일한 `scriptPrompt`를 받아서 "RAY 공격" 패턴이 슬롯과 무관하게 전염됨.
2. **Summary Runtime 분리 지점**: 현재 `message-router.ts`의 `runRoutedRequest` 말미(Stage3 반환 이후, `decisionSummary` 조합 블록)가 사실상 별도 "Summary Runtime" 역할을 하고 있다. `buildDecisionSummary`(C-1)를 message-router.ts에서 완전히 분리해 `lib/personax/runtime/stage4-summary.ts`(가칭)로 옮기고, `decisionType` 분류 커버리지(C-3)를 먼저 넓히는 작업을 그 앞단 선행 과제로 두는 것을 제안.
3. **Speaker Router 입력값**: 향후 Speaker Router(발화자 순서/슬롯 결정기)를 만든다면 지금 `RouterDecision`이 들고 있는 `categoryV3`, `firstPersona`, `closerPersona`, `order`, `hasPriorConversation`뿐 아니라, **A/B에서 확인한 "이전 발화자가 누구였는지"(TikiTaka의 `previous` 배열)와 "이번 슬롯이 몇 번째 반박인지"**를 함께 받아야 함 — 지금은 few-shot이 슬롯 위치와 무관하게 균일하게 주입되어 있어 "몇 번째 반박인지"에 따른 강도 조절이 불가능한 상태.

---

## E. PR1.5 삭제 후보 추가 발견 (요청 F)

- `app/api/chat/prompts/orchestrator-screenplay.ts` — grep 결과 다른 어떤 파일에서도 import되지 않는 죽은 파일(B-3). PR1.5 삭제 후보.
- `lib/personax/message-router.ts`의 `buildCategoryVocabBlockRule` import(1행대) — 파일 내에서 실제로 사용되지 않는 미사용 import. PR1 이전부터 존재하던 것으로 보이며, 이번 PR2에서도 그대로 이동/보존함(원칙상 삭제하지 않음).

---

## F. 버그 후보 (수정하지 않고 기록만)

1. **JACK 규칙 상충** (B-2): `lib/personax/personas/jack/rules.ts:15-18`("결정을 강요하지 말고 기준을 세우게 한다", "사용자를 공격하지 않는다")와 `lib/personax/prompts/output.ts:667-673`("JACK은 항상 지금 당장 실행 가능한가로 판단", "지금 당장 창업해라" 예시)가 같은 Stage 3 프롬프트에 동시 주입되어 상호 모순.
2. **decisionType 커버리지 부족** (C-3): `decision-type-map.ts`의 키워드 목록이 좁아 다수 질문이 `generic`으로 분류되고, 그 결과 Decision Summary가 캐치올 문구로 반복 수렴함.
3. **solo 경로의 LLM 호출자 비대칭**: `runSoloScriptGeneration`(옛 solo 블록)은 주입된 `callLLM`을 사용하지만, 일반 4인 경로(`runStage3ScriptGeneration`)는 내부 전용 `callStage3`(GPT-4.1-mini/Gemini 직접 호출)를 사용한다 — 동일 Stage 3인데 호출 경로가 다름. 기존부터 존재하던 구조이며 이번 PR에서 변경하지 않음.
