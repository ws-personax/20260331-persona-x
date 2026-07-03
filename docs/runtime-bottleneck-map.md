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

---

# PR3 조사 결과 — app/api/chat/route.ts 해부

PR3(`refactor/runtime-surgery-pr3`)에서 `app/api/chat/route.ts`(1905줄)를 Response
Guard / Market / Save 책임으로 분리하며 함께 수행한 정적 조사. route.ts는
message-router.ts와 달리 하나의 파이프라인이 아니라 **서로 독립적인 레거시 분기가
누적된 파일**이며, 그 과정에서 상당한 죽은 코드가 발견됨. 아래는 지도화만 수행하며
수정하지 않음.

## G. legacy fallback / personaText 직접 조작

| # | 위치 | 코드 | 실행 조건 | 분류 |
|---|---|---|---|---|
| G-1 | `lib/personax/runtime/route-response-guard.ts`(`applyInvestVocabSafetyNet`, 원래 route.ts r1 인라인) | `personaText.echo`에 `"지금 문제는 살지 말지가 아니라..."` fallback을 트레일링 문장으로 append | `categoryV3==='invest' \|\| isHeeInvestComplex` 이고 4명 응답 전체에 `'손절선'`/`'지지선'`이 모두 없을 때 | **PR3.5 후보** — 동일 안전망이 r2(2라운드) 경로에는 없음(비대칭). 아래 H-1 참고 |
| G-2 | route.ts (보편 solo 조기 종료 블록, tagged isRound1 solo 분기 2곳) | `reply = (isHeeSolo ? HEE_FALLBACK : PERSONA_FALLBACK)[invoked]` | solo 응답이 빈 문자열이고 categoryV3 !== 'invest' | 기존 로직 그대로 이동, 2곳에 동일 패턴 중복 — **PR3.5 후보**(dedup 가능) |
| G-3 | route.ts (r2 파싱 실패 분기) | `_r2Fb = (hee) ? HEE_FALLBACK : PERSONA_FALLBACK; reply: _r2Fb.ray` | `callTaggedRound2` 결과가 null | 단일 사용, 이동만 수행 |
| G-4 | route.ts `buildFinanceMultiPersonaResponse` 상단(원래 505-541행대) — `rayHistory`/`jackHistory`/`luciaHistory`/`investmentRule`/`conflictRule`/`rayRound1Role`/`jackRound1Role`/`luciaRound1Role`/`ctxSuffix` | 오케스트레이터 각도(angle)를 반영한 페르소나별 역할 프롬프트 문자열을 조립하지만, 바로 아래 `streamRespond` 콜백은 이 변수들을 전혀 참조하지 않고 `callOptionDWithStage3Guard`/`callTaggedRound2` 기반의 전혀 다른 경로로 응답을 생성함 | 항상 계산되지만 **항상 미사용** | **PR1.5 삭제 후보** — 죽은 코드 확정(참조 0건 확인) |
| G-5 | route.ts (teaMode 블록 내 `selectTeaPersona` 기반 jack/echo/ray/lucia 개별 dispatch, 원래 1130-1229행대) | `isExplicitPersonaPick`가 코드상 상수 `false`로 고정되어 있고, 바로 위에서 `if (!isExplicitPersonaPick) return await buildFinanceMultiPersonaResponse(lastMsg);`로 항상 먼저 반환됨 | **도달 불가능(unreachable)** | **PR1.5 삭제 후보** — `saveTeaLog` 호출 4곳 포함 전체 블록이 죽은 코드 |
| G-6 | `lib/personax/runtime/route-market.ts`(`buildLegacyStockDetailResult`, 원래 route.ts 1632-1663행대) — `profitRateNote`/`positionNote`/`currencyRule`/`noDataNote`/`watchConditionRule` | 포지션/화폐/관망 규칙 안내문을 조립하지만 `buildFinalRay`/`buildEchoText`/`buildJackText`/`buildLuciaText` 어느 빌더 호출에도 전달되지 않음(파라미터로 안 넘어감) | 항상 계산되지만 **항상 미사용** | **PR1.5 삭제 후보** — 죽은 로컬 변수. `buildMarketSessionLabels` 구조분해 중 `nowKST`/`isKRNonTradingToday`/`isKRAfterClose`/`lastKRTradingLabel`도 동일하게 미사용 |

## H. Decision Summary 위치 확정 (route.ts 관점)

- route.ts는 Decision Summary를 **직접 생성하지 않는다.** 생성은 여전히
  `lib/personax/decision-summary.ts`(`buildDecisionSummary`/`formatDecisionSummary`)이고,
  호출·조합은 `lib/personax/message-router.ts`의 `runRoutedRequest`(PR2 이후
  Stage3 반환 직후의 조합 단계)에서 일어난다 — PR2 조사(C절)와 동일한 결론이 route.ts
  쪽에서도 재확인됨.
- route.ts는 `r1.decisionSummary`/`r1.decisionType`을 **결과값으로만 소비**한다:
  `saveUnifiedConversation({ ..., decisionSummary: r1.decisionSummary, decisionType: r1.decisionType })`로
  그대로 저장 전달하고, `lucia_close: r1.decisionSummary ? null : (r1.luciaClose || null)`
  분기(스트리밍 `send()` payload)에서만 존재 여부를 참조한다.
- **레거시 단일 종목 분석 경로(`buildLegacyStockDetailResult`, route-market.ts)는 Decision
  Summary와 완전히 무관하다.** `verdict`/`confidence`/`breakdown`(scoring.ts 산출)이라는
  별도의 구식 판정 체계를 사용하며, generic 캐치올 폴백 문제(PR2 C-3)의 영향을 받지 않는다.
  즉 "하나의 정답보다..." 반복 문구는 **tagged/Option D 경로에서만** 발생하고, 레거시
  종목 분석 경로에는 나타나지 않는다.

## I. RAY marketData 전문가성 병목

- `marketDataPromptContext` 조회는 `lib/personax/runtime/route-market.ts`의
  `createMarketDataContextResolver()`(요청 단위 캐시, 원래 route.ts의
  `getOrBuildMarketDataContext`)를 거쳐 `lib/personax/market-data.ts`의
  `buildMarketDataPromptContext`로 위임된다. route.ts는 이 문자열을 **가져와서
  그대로 전달만 한다** — RAY 프롬프트에 실제로 삽입(`TEA_SYSTEM_RAY + marketDataPromptContext`)하는
  지점은 route.ts가 아니라 `lib/personax/runtime/stage3-script-generation.ts`의
  `runSoloScriptGeneration`(PR2 확인)과 `stage2-persona-analysis.ts`의
  `stage2MarketBlock`이다. → route.ts 자체에는 RAY 전용 보강/변형 로직이 없음.
- **PR #243과의 일관성**: PR #243은 `market-data.ts`의 감지 로직 자체를 수정한 PR이며,
  이번 PR3은 그 호출부(캐시 래퍼)만 이동했을 뿐 `buildMarketDataPromptContext` 호출
  시그니처·인자를 바꾸지 않았다 → 일관성 유지 확인.
- **구조적 발견 — RAY 표현 체계가 두 개로 나뉘어 있음**:
  1. Stage3 LLM 기반 RAY (tagged/Option D 경로) — `marketDataPromptContext` 문자열을
     시스템 프롬프트에 주입하고 LLM이 자연어로 생성.
  2. 레거시 템플릿 기반 RAY (`buildFinalRay`, route-market.ts) — `marketData`/`vix`/`prevCtx`를
     받아 코드로 직접 문자열을 조립(LLM 미사용).
  두 시스템은 서로 다른 파일에서 독립적으로 RAY 텍스트를 만들고, 코드 공유가 전혀
  없다. PR4에서 Persona Runtime을 통합한다면 이 두 RAY 경로를 어떻게 할지(하나로
  합칠지, 레거시 경로를 유지할지) 결정이 필요함.

## J. Market 중복 가능성

- route.ts(및 분리된 route-market.ts)가 직접 호출하는 market 관련 모듈: `market.ts`
  (`fetchMarketPrice`/`extractKeyword`/`CRYPTO_MAP`/`STOCK_MAP`/`getSector`/`inferCurrency`),
  `market-data.ts`(`buildMarketDataPromptContext`), `market-session-label.ts`
  (`buildMarketSessionLabels`), `market-quick-handlers.ts`(`tryBuildMarketQuickResponse`),
  `market-data-label.ts`(현재는 route-response-guard.ts를 통해서만 호출).
- 세 갈래(quick response / tagged·solo marketDataPromptContext / 레거시 종목 분석)는
  한 요청 안에서 **상호 배타적으로 분기**되므로(하나가 반환하면 나머지는 도달하지
  않음) 실제 중복 조회 위험은 낮음. 다만 `fetchMarketPrice` 결과를 캐싱하는 계층이
  `getOrBuildMarketDataContext`(marketDataContext 캐시)뿐이고, `fetchMarketPrice` 자체는
  요청 단위로 캐시되지 않는다 — 레거시 경로는 `keyword`/`'나스닥'`/ETF 심볼들에 대해
  매 요청마다 새로 `fetchMarketPrice`를 호출한다(기존 동작 그대로, 이번 PR에서 변경 없음).
- 데이터 출처 라벨도 두 체계로 나뉜다: `buildDataSourceLabel`(scoring.ts, 레거시
  종목 분석의 ECHO 상세용)과 `appendMarketDataSourceLabel`(market-data-label.ts,
  tagged/guard 경로의 personaText용) — 서로 다른 파일에서 유사한 역할을 독립적으로
  구현. 통합 여부는 PR4 판단 필요.

## K. Save/Memory 부작용

- **저장 시점**: 모든 저장 호출(`saveTeaLog`, `saveUnifiedConversation`,
  `saveTeaConversation`, `saveLegacyStockHistorySafely`)은 페르소나 텍스트가 완성된
  **이후**에 실행된다. tagged 스트리밍 경로(r1/r2)는 `streamPersonaTagged`로 이미
  클라이언트에 청크를 보낸 **다음**에 저장을 수행한다 — 저장이 실패해도 유저는 이미
  응답을 본 상태.
- **저장 실패가 응답 실패로 이어지지 않음**: `saveTeaLog`/`saveLegacyStockHistorySafely`
  모두 내부에서 try/catch(또는 Promise.race 타임아웃)로 감싸 `console.warn`만 하고
  넘어간다 — 기존 동작 그대로 이동, 실패 시 응답에 영향 없음이 재확인됨.
- **저장 패턴이 3가지로 불일치** (PR3에서 발견, 기존부터 존재하던 구조):
  1. `saveTeaLog`(tea_logs) — `await` + try/catch, 타임아웃 없음.
  2. `saveTeaConversation`(history.ts) — route.ts에서 `void`로 fire-and-forget, 타임아웃 없음.
  3. `saveLegacyStockHistorySafely`(saveHistory) — `await` + `Promise.race` 5초 타임아웃
     (주석: "Vercel 서버리스에서는 응답 반환 후 백그라운드 Promise가 종료될 수 있어"
     명시적으로 fire-and-forget을 피한 케이스).
  같은 "Save" 책임 안에서 서로 다른 신뢰성 전략이 혼재 — PR4/PR3.5에서 통일 검토 필요.
- **Review card / 반복 summary 연결**: route.ts 안에서는 review card 저장 로직이나
  Decision Summary와의 직접적 연결 코드를 발견하지 못했다. `saveUnifiedConversation`이
  내부적으로 review card를 다루는지는 `chat-persistence.ts` 내부 구현에 있으며, 이번
  PR3의 조사 범위(route.ts)를 벗어난다 — PR4 조사 시 `chat-persistence.ts`를 별도로
  들여다볼 필요가 있음(조사 공백으로 기록).
- **Memory 스킵 조건**: `buildOptionDMemoryContext` 호출 여부는 route.ts의
  `(shouldWeakenContext || !_categoryV3) ? '' : await buildOptionDMemoryContext(_categoryV3)`
  한 줄로 결정된다 — "언제 memory를 쓸지"는 route.ts(라우팅 상태 기반), "어떻게
  가져올지"는 `chat-memory-context.ts`가 담당하는 역할 분리가 이미 되어 있어, 이번
  PR3에서 별도 `route-memory.ts`를 만들지 않은 이유이기도 함(아래 참고).

## L. route.ts 파일 분리 판단 근거 — route-history.ts / route-memory.ts를 만들지 않은 이유

작업 지시의 예상 파일 목록에는 `route-history.ts`/`route-memory.ts`도 있었으나,
route.ts를 전수 조사한 결과 두 책임 모두 **이미 기존 파일로 충분히 externalize되어
있고, route.ts에 남은 코드는 1~2줄짜리 호출부뿐**이라 새 파일을 만들지 않았다.

- **History**: `buildTeaHistory`(tea-history.ts), `buildRecentFinanceContext`/
  `buildPriorRayResponse`(finance-context.ts), `buildRound2ContextFromMessages`
  (finance-round2-context.ts), `saveHistory`/`saveTeaConversation`(history.ts) —
  route.ts에는 이들을 호출하는 단일 라인만 존재하고 History 자체의 로직은 없음.
- **Memory**: `buildOptionDMemoryContext`(route.ts의 2줄 wrapper)는
  `buildOptionDMemoryContextFromSession`(chat-memory-context.ts)을
  `getChatSession`에 바인딩하는 것뿐이고, 실제 memory 조회/조합 로직은
  전부 chat-memory-context.ts 안에 있음.

새 파일을 만드는 대신 **G/K에서 이 두 책임의 route.ts 쪽 호출 조건(언제 부르는지)만
지도화**했다. Save는 반대로 `saveTeaLog`/`saveLegacyStockHistorySafely`처럼 route.ts에
직접 박혀 있던 중복 블록이 있어 `route-save.ts`를 만들 가치가 있었음 — Market/Response
Guard도 마찬가지로 route.ts 안에 실제 계산 로직이 직접 있었기 때문에 분리함.

## M. PR3.5 저비용 수정 후보 (최종)

PR2에서 나온 항목 + route.ts에서 새로 나온 항목을 합친 목록.

1. LUCIA "RAY, ~" 공격형 오프닝 반복 few-shot (PR2 A) — `few-shot-examples.ts`
2. JACK 규칙 상충 (PR2 B-2 / F-1)
3. `decisionType` generic 과다 분류 (PR2 C-3 / F-2)
4. **(PR3 신규)** invest 어휘 안전망(G-1)이 r1에만 있고 r2에는 없는 비대칭
5. **(PR3 신규)** solo 빈 응답 fallback 선택 로직(G-2)이 2곳에 중복
6. **(PR3 신규)** Save 신뢰성 전략 3종 불일치(K) — tea_logs/saveTeaConversation/saveHistory가 각각 다른 재시도·타임아웃 정책 사용
7. **(PR3 신규)** RAY 표현 체계 이중화(I) — Stage3 LLM 기반 vs 레거시 템플릿 기반이 코드 공유 없이 독립 존재

## N. 버그 후보 (PR3 추가분, 수정하지 않고 기록만)

4. **invest 안전망 비대칭** (G-1/M-4): r1(1라운드)에는 `applyInvestVocabSafetyNet`이 있지만 r2(2라운드, ECHO_QUESTION 후속 답변)에는 동일 로직이 없어, 2라운드 응답에서는 '손절선'/'지지선' 누락 시에도 보강되지 않을 수 있음.
5. **Save 전략 불일치** (K/M-6): 동일한 "저장 실패가 응답에 영향 없어야 한다"는 목표를 tea_logs(await+try/catch)/saveTeaConversation(void fire-and-forget)/saveHistory(await+5초 timeout) 세 가지 다른 방식으로 구현 — Vercel 서버리스 환경에서 `saveTeaConversation`만 fire-and-forget인 것이 의도적인지 누락인지 불명확.
