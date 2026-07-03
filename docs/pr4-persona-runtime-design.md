# PR4 — Persona Runtime 통합 설계

이 문서는 PR4(Persona Runtime 통합) 착수 전 설계 문서다. 이전 진단 세션(ECHO 8개
경로 지도화)과 `docs/runtime-bottleneck-map.md`(PR2/PR3 사전 조사)의 결과를 이어받아,
LUCIA 역할 고정·RAY 이중 체계·죽은 경로까지 합쳐 "무엇을 통합하고 무엇을 의도적으로
분기 유지할지"를 결정하기 위한 자료다. **이 문서는 설계만 하며 코드를 수정하지 않는다.**

---

## 1. 문제 정의

### 1.1 ECHO 8개 생성/선택 경로 (기존 진단 재인용)

앞선 진단(A/E 항목)에서 확인된 ECHO 관련 실질 경로:

| # | 경로명 | 트리거 | Rule V2 적용 |
|---|---|---|---|
| ① | Stage3 ECHO_QUESTION 정상(단일콜) | TikiTaka 실패 폴백 | ✅ |
| ② | Stage3 ECHO_QUESTION rescue | TikiTaka 성공(실질 주경로) | ✅ |
| ③ | ECHO_QUESTION 하드코딩 최종 폴백 | 재요청도 실패 | ❌(의도적) |
| ④ | Stage3 디베이트 슬롯 ECHO(FIRST/SECOND/THIRD) | emotional/principle에서 order에 echo 잔존 | ❌(PERSONA_RULE에 echo 항목 자체가 없음) |
| ⑤ | Stage3 CLOSER-ECHO | `closerPersona==='echo'`(knowledge 고정, action은 생성 후 폐기) | ❌(knowledge 전용 별도 규칙만 있음) |
| ⑥ | Round2 ECHO_FINAL | 사용자가 ECHO_QUESTION에 답변 | 🟡 부분(TURNING_POINT만, MIN_STRUCTURE 없음) |
| ⑦ | Solo(@ECHO) | 직접 호명 | ✅ |
| ⑧ | 레거시 news 4인 병렬 | legacy `category==='news'` | 🟡 부분(정체성만) |

**핵심 사각지대**: emotional 카테고리는 `needsEchoQuestion=false`라 ECHO_QUESTION
자체가 생성되지 않고, `enforceOrder`가 echo를 order 배열에서 제거하지 않아 ECHO가
그대로 "네 번째 발화자"로 등장한다(경로④). 이 슬롯은 `PERSONA_RULE`(rules.ts)에
echo 항목이 아예 없어 RAY/JACK/LUCIA와 달리 아이덴티티 규칙을 전혀 받지 못하고,
`buildCategoryVocabBlockRule`도 emotional 카테고리에서는 "마음/공감/위로" 어휘를
금지하지 않는다 — ECHO가 LUCIA 톤으로 새어나가는("돈보다 사람을 믿었던 그 고운
마음이...") 근본 원인이 여기 있다.

### 1.2 LUCIA 역할 고정

`orchestrator-tagged.ts`의 결정론적 매핑(LLM 판단 아님, 고정 테이블)을 categoryV3
5개 전부에 대입하면:

| categoryV3 | FIRST | CLOSER 후보 체인 | 실제 CLOSER |
|---|---|---|---|
| invest | ray | jack→echo→lucia | **jack** |
| action | jack | echo→lucia→jack | **echo** |
| emotional | **lucia** | jack→echo→lucia | **jack** |
| principle | echo | jack→lucia→echo | **jack** |
| knowledge | ray | echo→jack→lucia | **echo** |

`getCloserPersona()`는 체인에서 firstPersona와 겹치지 않는 첫 후보를 그대로
반환하는 구조라, **LUCIA가 CLOSER가 되려면 체인의 앞 두 후보가 모두 firstPersona와
같아야 하는데 5개 카테고리 어디에도 그런 경우가 없다 — LUCIA는 CLOSER 0/5, FIRST
1/5(emotional만)**. 이 값은 `buildCloserPersonaRuleSection`(rules.ts)에
`"CLOSER 페르소나 = ${closerName} (고정)"`으로 못박혀 LLM에 강제된다.

프롬프트 텍스트 자체도 LUCIA를 "판단자"가 아니라 "감정 조명자"로 반복 고정한다:

- `output.ts:842`: `"LUCIA는 절대 손절선·리스크 기준·매수매도 판단 기준을 직접 제시하지 않습니다. 그것은 JACK의 영역이지 LUCIA의 영역이 아닙니다."`
- `output.ts:901`: `"LUCIA 슬롯은 이 규칙에서 제외한다. LUCIA는 손절선·지지선·가격 기준선을 말하지 않는다."`
- `personas/lucia/rules.ts:15-16`: `"LUCIA는 수치·통계·퍼센트·데이터를 직접 말하지 않는다. 그건 RAY 영역이다."`
- `prompts/conflict.ts:159,174`: `"LUCIA 반박: 숫자나 기준이 아니라 손실이 주는 감정으로만 반박한다."`

게다가 LUCIA가 유일하게 확실히 등장하는 마무리 전용 슬롯인 `[LUCIA_CLOSE]`
(emotional 전용, `output.ts:557-571`)조차 "토론을 결론짓거나 종합 요약 금지",
"반드시 유저에게 묻는 질문 1개로 끝낼 것"이 강제되어 **판결형이 아니라 질문형
종결**로 설계되어 있다. 즉 LUCIA는 구조상 "판결자" 역할 자체가 배정되지 않는다
(FIRST 1/5, CLOSER 0/5, 유일한 마무리 슬롯도 질문형). `runtime-bottleneck-map.md`
A절이 이미 지적한 "LUCIA→RAY 공격형 오프닝" few-shot 반복(`SIX_FULL_SIMULATIONS`가
`buildPersonaToneAndConflictRules()`를 통해 전 카테고리에 무조건 삽입)도 같은
구조적 원인의 다른 증상이다.

### 1.3 RAY 이중 체계

RAY 발화는 코드 공유가 전혀 없는 두 개의 독립 시스템에서 생성된다.

- **LLM Runtime**: `app/api/chat/prompts/tea-ray.ts`(`TEA_SYSTEM_RAY`),
  `advanced-ray.ts`(`ADVANCED_SYSTEM_RAY`), Stage3의 `buildScriptPrompt` — 자연어
  생성. 최소 4개 호출 지점(`route.ts` teaMode 단일RAY, isAdvancedQuestion 분기,
  Stage1/2/3 파이프라인, 레거시 news 병렬).
- **Legacy Template**: `lib/personax/runtime/route-market.ts:384`
  (`"─── ✅ 레이: 완전 템플릿화 (Gemini 배제) ───"`) → `stock-response-builders.ts:109`
  `buildFinalRay()`가 시세 데이터를 문자열 템플릿에 직접 조립(LLM 미사용).
  JACK/LUCIA/ECHO도 `templates.ts`(`buildJackText:305`, `buildLuciaText:602`,
  `buildEchoText:700`)로 동일 패턴. `market-quick-handlers.ts`의
  `tryBuildMarketQuickResponse`도 유사하게 4명 텍스트를 즉시 템플릿 조립한다.

**reachability**: `components/ChatWindow.tsx:856` `const isTeaSend = true;`가
**모든 메시지에 무조건** `teaMode: true`를 실어 보낸다. `route.ts:702`의
`if (teaMode || ...)`가 이 때문에 항상 먼저 걸려 `buildFinanceMultiPersonaResponse`
(LLM Runtime 경로)로 조기 `return`하므로, Legacy Template 경로
(`buildLegacyStockDetailResult`, `tryBuildMarketQuickResponse`)는 **현재
프론트엔드로는 도달하지 않는다.** 죽은 import는 아니고(코드 그래프상 완전히
연결돼 있음) 프론트가 보내는 값 하나(`teaMode`)에 의해 practically 비활성화된
상태 — `route.ts:842` 주석도 이를 "사실상 deprecated"라고 직접 언급한다.

### 1.4 Dead path / 삭제된 기능 잔여 코드

기존 확인분(⑨⑩) + `runtime-bottleneck-map.md` G절 + 이번에 새로 확정한 항목:

| 위치 | 상태 | 비고 |
|---|---|---|
| ⑨ `route.ts` teaMode 내 `selectTeaPersona` 단일 dispatch(jack/echo/ray/lucia) | 도달 불가 | `isExplicitPersonaPick`가 상수 `false`로 고정, 그 위에서 항상 먼저 return(G-5) |
| ⑩ `isAdvancedQuestion` + `ADVANCED_SYSTEM_ECHO` 분기 | 도달 불가 | 같은 이유로 teaMode 블록이 먼저 return |
| `route.ts` `buildFinanceMultiPersonaResponse` 상단의 `rayHistory`/`jackHistory`/`luciaHistory`/`angleRay`/`conflictPointLine` 등(G-4) | 계산되지만 미사용 | 아래 신규 발견과 직결 |
| **[신규] `runOrchestrator()` 호출 자체가 매 턴 낭비** | **실행되지만 결과 전량 폐기** | `route.ts:336` `const plan = await runOrchestrator(msg, ...)`가 `callTeaPersona('echo', ...)`로 **실제 LLM 호출**을 수행(`route.ts:305`)하고, 그 결과(`plan`)로 만든 `rayHistory`/`jackHistory`/`luciaHistory`(360-362행)는 `buildFinanceMultiPersonaResponse` 함수 어디에서도 다시 참조되지 않는다(grep 0건). 실제 응답은 `callOptionDWithStage3Guard`/`callTaggedRound2`가 전담. **round1/round2 구분 없이 매 턴 발생**(runOrchestrator 호출이 `isRound1` 분기보다 먼저 실행됨) — 현재 라이브 트래픽 전체에 걸린 순수 낭비 호출 |
| `route-market.ts`(G-6) `profitRateNote`/`positionNote` 등 | 계산되지만 미사용 | 어느 빌더 호출에도 전달 안 됨 |
| `app/api/chat/prompts/orchestrator-screenplay.ts` | 죽은 파일 | 어디서도 import 안 됨(0건) |

---

## 2. 통합 원칙

### 2.1 "생성 함수 통합"이 아니라 "규칙 계층 통합"

이전 진단(C/D 결론)을 그대로 따른다: 카테고리별로 ECHO/LUCIA의 역할(판결자/네번째
화자/개념정리자/솔로답변자, 감정조명자/반박자)이 근본적으로 다른 것은 **의도된
설계**(액자구조, 지식모드 등)다. 생성 함수를 하나로 합치면 emotional의 액자구조나
knowledge의 개념정리형처럼 의도적으로 다른 톤이 깨진다. 대신:

- **통합 대상**(규칙 계층 — 어느 슬롯에 있든 최소 공통 아이덴티티를 공유해야 하는 것)
- **의도적 분기 유지 대상**(카테고리 고유의 설계 — 통합하면 안 되는 것)

을 명확히 구분한다.

### 2.2 통합 대상

1. **`PERSONA_RULE`(rules.ts)에 `echo` 키 신설.** 현재 ray/jack/lucia만 정의되어
   있어 ECHO가 디베이트 슬롯(경로④)에 들어갈 때 완전한 규칙 공백 상태다.
2. **ECHO 디베이트 슬롯 전용 축소 규칙**(가칭 `ECHO_DEBATE_SLOT_RULE`) 신설.
   Rule V2(4단계, 판결자 전용) 전체를 옮기는 게 아니라 "감정 어휘로 LUCIA 침범
   금지 + 새 숫자 창작 금지 + 판결자 톤 유지"만 축소 적용.
3. **Round2(ECHO_FINAL)에 `ECHO_VERDICT_MIN_STRUCTURE_RULE` 추가 주입** — 현재
   `ECHO_RULE_BASE`+`TURNING_POINT_RULE`만 있고 4단계 구조 강제가 빠져 있음.
4. **LUCIA FIRST/CLOSER 배정에 대한 서술형 안내문과 실제 강제값 정합화.**
   `output.ts`의 정적 안내문(`"감정/일상 질문의 CLOSER는 JACK 또는 LUCIA가
   적합합니다"`)이 실제 코드가 강제하는 값(LUCIA는 CLOSER 0/5)과 어긋나 프롬프트
   내부에 모순된 신호를 준다. 안내문을 실제 값에 맞추거나, LUCIA CLOSER를
   실제로 허용할지(2.3의 PR4-C 결정 사항)를 먼저 정한 뒤 정합화한다.
5. **Dead code 일괄 삭제**: ⑨⑩, `runOrchestrator` 낭비 호출과 그 산출물,
   G-4/G-6의 미사용 변수, `orchestrator-screenplay.ts`.

### 2.3 의도적 분기 유지 대상

1. **emotional의 LUCIA_CLOSE 액자구조(질문형 종결)** — 판결형으로 바꾸지 않는다.
   ECHO_QUESTION과 성격이 다른, 감정 카테고리 고유의 마무리 장치다.
2. **knowledge의 CLOSER 전용 규칙**(개념 경계·조건 정리형) — Rule V2로 흡수하지
   않는다. 지식 질문은 "판결"이 아니라 "정리"가 목적이다.
3. **invest/action/principle의 ECHO_QUESTION 구조** — 그대로 판결자 슬롯 유지.
4. **RAY Legacy Template 경로의 존폐** — 통합/삭제 여부를 이 문서에서 결론짓지
   않고 PR4-C의 명시적 결정 항목으로 남긴다(2.4 참고).
5. **LUCIA가 특정 카테고리에서 CLOSER를 맡을 수 있는지** — 지금 구조를 유지할지,
   emotional에서 LUCIA도 CLOSER 후보에 실제로 오르게 할지는 제품 판단이 필요한
   영역이라 PR4-C 결정 항목으로 분리한다(감정 질문의 마무리를 "JACK의 시스템
   공격"과 "LUCIA의 정서적 종결" 중 무엇으로 할지는 캐릭터 아이덴티티에
   영향을 준다).

---

## 3. PR4-A/B/C 순서와 범위

### PR4-A — 순수 삭제 (Cost, 리스크 최저)
- `runOrchestrator` 낭비 호출 및 그 산출물(`rayHistory`/`jackHistory`/
  `luciaHistory`/`angleRay` 등) 제거.
- ⑨⑩ dead branch(teaMode 단일 dispatch, isAdvancedQuestion) 삭제.
- `route-market.ts`의 미사용 변수(G-6), `orchestrator-screenplay.ts` 삭제.
- **범위 제한**: 이미 아무 효과가 없던(전량 미사용) 코드만 제거 — 응답 내용에
  대한 어떤 변경도 없어야 한다(회귀 시 즉시 발견 가능해야 함).

### PR4-B — 규칙 계층 통합 (Rule, 리스크 중)
- `PERSONA_RULE.echo` 신설.
- `ECHO_DEBATE_SLOT_RULE`(가칭) 도입 — emotional/principle의 디베이트 슬롯
  ECHO에 적용.
- Round2에 `ECHO_VERDICT_MIN_STRUCTURE_RULE` 주입.
- LUCIA FIRST/CLOSER 서술형 안내문 정합화(2.2-4).
- **범위 제한**: 카테고리별 슬롯 배정(order/closerPersona 계산)은 건드리지
  않는다 — 순수하게 "그 슬롯에 누가 오든 지켜야 할 규칙 텍스트"만 추가/정리.

### PR4-C — 구조 결정 (Decision, 리스크 높음·제품 판단 필요)
- RAY 이중 체계 최종 처리: (a) Legacy Template을 teaMode=false 전용 안전망으로
  명시적으로 남기고 문서화할지, (b) 완전 삭제하고 LLM Runtime 단일화할지 결정.
- LUCIA가 emotional에서 CLOSER 후보가 될 수 있는지 여부 결정.
- action/principle에서 ECHO를 order(디베이트 슬롯)에서 아예 제외할지 검토
  (현재는 생성 후 폐기되는 낭비 호출 — 4절 참고).
- **이 단계는 코드 변경 전 별도 승인이 필요한 제품/캐릭터 결정을 포함**하므로,
  PR4-A/B와 분리해 독립 PR로 진행한다.

---

## 4. 비용 영향 재추정

기존 설계 문서 주석(`route.ts:835` 등)은 "Option D path는 Stage 1+2+3 = 2~3개
LLM 호출로 완료"라고 가정하지만, 이는 TikiTaka 도입 **이전** 설계다. 현재 실제
호출 수를 카테고리별로 재계산하면:

| 구성 | invest/action/principle | emotional | knowledge |
|---|---|---|---|
| `runOrchestrator`(낭비) | 1 | 1 | 1 |
| Stage1(데이터 수집) | 1 | 1 | 1 |
| Stage2(관점 가공) | 1 | 1 | 1 |
| Stage3 TikiTaka(FIRST/SECOND/THIRD/CLOSER) | 4 | 4 | 4 |
| ECHO_QUESTION rescue 또는 LUCIA_CLOSE | 1 | 1 | 0 |
| **합계** | **8** | **8** | **7** |

- 원래 가정("3-call") 대비 이미 2배 이상으로 늘어난 상태이며, 이 사실 자체가
  갱신되지 않은 채 남아 있었다는 것이 이번 조사의 부수 발견이다.
- 여기에 `callOptionDWithStage3Guard`의 품질가드 위반 재생성(hee 모드 등)이
  걸리면 Stage3 4~5콜이 추가로 한 번 더 발생할 수 있다(Stage1/2는 캐시 재사용).
- Round2(ECHO_FINAL, 사용자가 ECHO_QUESTION에 답한 턴)도 `runOrchestrator`가
  먼저 실행된 뒤(1콜 낭비) `callTaggedRound2`가 별도로 1콜 — 라운드1과 별개로
  또 낭비가 반복된다.

**PR4-A만 적용해도 즉시 -1 call/turn** (runOrchestrator 제거, 모든
라운드·카테고리 공통) — 이미 안 쓰이던 산출물이므로 응답 품질에 대한 영향
없이 순수 절감이다. 8/8/7 → **7/7/6**.

**PR4-B(규칙 계층 통합)는 호출 수를 바꾸지 않는다** — 프롬프트 텍스트만
조정하므로 비용 중립.

**PR4-C에서 "action/principle의 echo를 order에서 제외"를 채택하면** TikiTaka가
3콜(FIRST/SECOND/THIRD만, CLOSER는 별도 로직으로 처리하거나 3콜 내에서 흡수)로
줄어들 잠재적 추가 절감 가능성이 있다 — 단 이는 action의 CLOSER=echo 배정
로직과 얽혀 있어 PR4-C에서 신중히 검토해야 하며, 이 문서에서 수치를 확정하지
않는다.

**요약**: PR4-A+B 적용 시 turn당 8→7(약 12% 절감), PR4-C까지 진행 시 추가
절감 가능성 있으나 별도 검증 필요.

---

## 5. 성공 기준 / QA 재검증 계획

### 5.1 성공 기준

1. `PERSONA_RULE`에 `echo` 키가 존재하고, 5개 categoryV3 전부에서 ECHO 발화가
   (슬롯 종류와 무관하게) 최소 공통 규칙 — 감정 어휘로 LUCIA 침범 금지, 새
   숫자·조건 창작 금지 — 를 통과하는지 정적으로 확인 가능해야 한다.
2. "돈을 빌려줬는데 안 갚아요" 류 emotional 케이스에서 ECHO가 LUCIA 톤으로
   새지 않음을 재현 테스트로 확인.
3. `runOrchestrator` 제거 후에도 order/응답 각도에 실질적 변화가 없어야
   한다(원래도 결과가 안 쓰였으므로 회귀가 있다면 그 자체가 버그).
4. Dead code 삭제 후 `tsc --noEmit` 클린 + 기존 6개 SIX_FULL_SIMULATIONS
   시나리오(투자/명퇴/요양원/이직/부동산/AI) 재통과(정적 프롬프트 검증 기준).
5. LUCIA CLOSER 허용 여부(PR4-C)를 어느 쪽으로 결정하든, `output.ts`의 서술형
   안내문과 `buildCloserPersonaRuleSection`의 강제값이 서로 모순되지 않아야
   한다.

### 5.2 QA 재검증 계획 (실행은 각 PR 단계에서 승인 하에 — Level 2/3 비용 정책 적용)

최소 8개 대표 시나리오:
1. invest — "SK하이닉스 지금 들어가도 될까요"
2. action — "회사 5년 다녔는데 이직해야 할까요"
3. emotional — "돈을 빌려줬는데 안 갚아요" (ECHO LUCIA-bleed 재현 확인 핵심 케이스)
4. principle — "AI 때문에 내 직업이 없어질 것 같아요"
5. knowledge — 인플레이션/금리 등 개념 정의형 질문 1개
6. hee 모드 — "아들이 대학에 합격했어요" (희 모드 안전망 회귀 확인)
7. Solo(@ECHO) 직접 호명 1개
8. Round2 — 1번 또는 2번 질문에 대해 ECHO_QUESTION 답변 후속 턴

각 시나리오에서 확인할 것: (a) 카테고리별 예상 경로대로 생성되는지(1절 표
기준), (b) ECHO/LUCIA가 역할 고정 완화 이후에도 캐릭터 붕괴 없는지, (c) 호출
수가 4절 추정치와 일치하는지(로그 `console.log('[stage3-raw]', ...)` 등으로
확인).

PR4-A는 코드 삭제만이므로 QA는 tsc + 정적 검증으로 충분하고 실제 LLM 호출
없이도 완료 가능하다. PR4-B/C는 실제 응답 톤 변화를 수반하므로 위 8개
시나리오의 실제 API 호출 QA(사용자 명시 승인 필요)가 필수다.
