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

**2026-07-04 추가 진단 결과**: RAY Legacy Template 경로는 단순 dead code로
정리하면 안 된다. 도달 가능성은 세 단계로 나뉜다.

1. **일반 UI 기준 dead**: `ChatWindow.tsx`가 `isTeaSend=true`를 하드코딩해
   모든 `/api/chat` 요청에 `teaMode:true`를 보낸다. 이 때문에 일반 채팅 화면에서는
   `route.ts`의 Option D / TikiTaka Runtime이 먼저 실행되고 Legacy Template 경로는
   조기 return 뒤에 남는다.
2. **raw API 기준 live**: `/api/chat`을 직접 호출하면서 `teaMode:false` 또는
   `teaMode` 누락 상태로 finance/종목 질문을 보내면 `tryBuildMarketQuickResponse()`
   또는 `buildLegacyStockDetailResult()`까지 내려갈 수 있다. 따라서 코드 그래프상
   완전히 끊긴 dead path는 아니다.
3. **Legacy 내부 기능 기준 손실 위험**: Legacy에는 LLM Runtime에 그대로 흡수되지
   않은 deterministic 기능이 남아 있다. 즉시 삭제하면 사용자 UI에서는 티가 덜 나도
   raw API, 구버전 클라이언트, 테스트 경로에서 기능이 조용히 사라질 수 있다.

Legacy 관련 코드의 현재 목록과 규모는 다음과 같다.

- `app/api/chat/route.ts`: legacy 진입/import 및 호출부
  (`tryBuildMarketQuickResponse`, `buildLegacyStockDetailResult`) 약 150줄 영향.
- `lib/personax/runtime/route-market.ts`: `buildLegacyStockDetailResult()` 중심
  약 591줄.
- `lib/personax/stock-response-builders.ts`: `buildFinalRay()`,
  `buildRayDetail()`, `buildStockDetailResponse()` 등 약 453줄. 단,
  `normalizeNoMarketDataInvestmentPersonaText()`는 현재
  `runtime/route-response-guard.ts`에서 live 사용 중이므로 파일 전체 삭제 대상이
  아니다.
- `lib/personax/templates.ts`: `buildJackText()`, `buildLuciaText()`,
  `buildEchoText()` 및 투자 template helper 약 1193줄.
- `lib/personax/market-quick-handlers.ts`: 특수 투자 질문 quick response 약 516줄.

합산하면 삭제 후보는 약 2500줄 규모지만, live helper와 import 의존성이 섞여 있어
단순 파일 삭제로 처리할 수 없다.

⑨⑩ dead path와 원인은 같다. 둘 다 `isTeaSend=true` 하드코딩과
`isExplicitPersonaPick=false` 고정 때문에 일반 프론트 경로에서 막힌다. 다만 결과는
다르다. ⑨⑩은 프론트 기준 완전 차단에 가깝지만, RAY Legacy Template은 raw API로는
아직 도달 가능하다.

PR #251이 고친 것은 `lib/personax/market-data.ts`의 LLM Runtime용
`detectMarketAsset()` / `buildMarketDataPromptContext()` 경로다. Legacy Template이
사용하는 `lib/personax/market.ts`의 `STOCK_MAP`, `extractKeyword()`,
`fetchMarketPrice(keyword)` 체계와는 별개이며 PR #251의 수정이 Legacy stock detail
경로를 직접 개선하지는 않았다.

Legacy에만 남아 있는 기능은 다음과 같다.

- `calcScores()` 기반 deterministic `verdict`, `confidence`, `breakdown`.
- `positionSizing`, `entryCondition`.
- 시장 세션 라벨: 장마감, 주말, 한국장/미국장 상태.
- ETF/지수 전용 처리.
- 이전 종목과 현재 종목의 섹터 비교.
- `market-quick-handlers.ts`의 특수 질문 핸들러: 추천, 외국인 수급, 섹터 타이밍,
  손절선 안내, 장 초반 거래량, 다음 날 전략 등.

따라서 PR4-C는 "Legacy 삭제"가 아니라 "Legacy deterministic 기능을 버릴지,
LLM Runtime으로 흡수한 뒤 폐기할지"를 결정하는 작업으로 재정의해야 한다.

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

### 2.1 Persona Priority Hierarchy

2026-07-04 진단 결과, Persona Runtime의 핵심 문제는 개별 규칙 부족이 아니라
**규칙 간 우선순위 부재**로 확정한다. LUCIA/JACK/ECHO 규칙을 여러 차례 추가해도
실패가 반복된 이유는 Persona Identity, Role Priority, Conflict Rule, Data Context,
Slot Order, Fallback이 하나의 서열로 묶이지 않았기 때문이다.

현재 실제 우선순위(문제 상태)는 다음과 같다.

| 순위 | 현재 실제 우선순위 | 문제 |
|---|---|---|
| 1순위 | 앞 발화 반박 (`conflict.ts`) | 페르소나 정체성보다 반박 의무가 먼저 실행된다. |
| 2순위 | market data / RAY 숫자 | 숫자와 데이터가 다른 페르소나의 역할을 침범한다. |
| 3순위 | 투자 리스크 언어 | 모든 페르소나가 투자 위험 해설자로 수렴한다. |
| 4순위 | 페르소나 정체성 (`PERSONA_RULE`) | 가장 중요한 정체성 규칙이 가장 늦게 적용된다. |

목표 우선순위(마스터 확정)는 다음과 같다.

| 순위 | 목표 우선순위 | 의미 |
|---|---|---|
| 1순위 | 페르소나 정체성 (고정, 절대 우선) | 어떤 슬롯/카테고리/데이터가 와도 캐릭터 정체성이 먼저다. |
| 2순위 | 사용자 감정/상황 해석 | 응답은 먼저 사용자의 상태와 질문 맥락을 해석한다. |
| 3순위 | 필요 시 앞 발화 반응 | 반박은 선택이며 강제가 아니다. |
| 4순위 | 데이터/숫자는 보조 자료 | 숫자는 RAY 중심 보조 자료이며 페르소나 정체성을 덮지 않는다. |

페르소나별 절대 규칙:

- **LUCIA**: 어떤 상황에서도 RAY를 먼저 반박하지 않는다. 항상 사용자 감정에서 시작한다.
- **JACK**: 숫자를 해설하지 않는다. 책임과 결단 기준을 말한다.
- **ECHO**: 중간 토론자가 아니다. 마지막 구조 판결자다.
- **RAY**: 데이터 담당이다. 다른 페르소나가 RAY 역할을 가져가지 않는다.

이 우선순위 재설계는 PR4-B(완료됨, 규칙 계층 통합)의 연장이지만 더 근본적인
재작업이다. PR4-B가 "규칙을 추가"하는 방식이었다면, 이후 작업은 **규칙 간 서열을
코드/프롬프트 구조로 강제**하는 방식이어야 한다.

오늘 반복 실패 사례도 이 결론을 뒷받침한다. LUCIA 숫자 반복 문제는
`marketDataPromptContext`, `dataContext`, previous context까지 데이터 채널을 3번
막았음에도 완전히 해소되지 않았다. 이는 개별 채널 문제가 아니라, LUCIA 정체성보다
앞 발화 반박과 RAY 숫자가 더 높은 우선순위로 작동한 구조적 문제였다.

### 2.2 "생성 함수 통합"이 아니라 "규칙 계층 통합"

이전 진단(C/D 결론)을 그대로 따른다: 카테고리별로 ECHO/LUCIA의 역할(판결자/네번째
화자/개념정리자/솔로답변자, 감정조명자/반박자)이 근본적으로 다른 것은 **의도된
설계**(액자구조, 지식모드 등)다. 생성 함수를 하나로 합치면 emotional의 액자구조나
knowledge의 개념정리형처럼 의도적으로 다른 톤이 깨진다. 대신:

- **통합 대상**(규칙 계층 — 어느 슬롯에 있든 최소 공통 아이덴티티를 공유해야 하는 것)
- **의도적 분기 유지 대상**(카테고리 고유의 설계 — 통합하면 안 되는 것)

을 명확히 구분한다.

### 2.3 통합 대상

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
   실제로 허용할지(2.4의 PR4-C 결정 사항)를 먼저 정한 뒤 정합화한다.
5. **Dead code 일괄 삭제**: ⑨⑩, `runOrchestrator` 낭비 호출과 그 산출물,
   G-4/G-6의 미사용 변수, `orchestrator-screenplay.ts`.

### 2.4 의도적 분기 유지 대상

1. **emotional의 LUCIA_CLOSE 액자구조(질문형 종결)** — 판결형으로 바꾸지 않는다.
   ECHO_QUESTION과 성격이 다른, 감정 카테고리 고유의 마무리 장치다.
2. **knowledge의 CLOSER 전용 규칙**(개념 경계·조건 정리형) — Rule V2로 흡수하지
   않는다. 지식 질문은 "판결"이 아니라 "정리"가 목적이다.
3. **invest/action/principle의 ECHO_QUESTION 구조** — 그대로 판결자 슬롯 유지.
4. **RAY Legacy Template 경로의 존폐** — 통합/삭제 여부를 이 문서에서 결론짓지
   않고 PR4-C의 명시적 결정 항목으로 남긴다(1.3 참고).
5. **LUCIA가 특정 카테고리에서 CLOSER를 맡을 수 있는지** — 지금 구조를 유지할지,
   emotional에서 LUCIA도 CLOSER 후보에 실제로 오르게 할지는 제품 판단이 필요한
   영역이라 PR4-C 결정 항목으로 분리한다(감정 질문의 마무리를 "JACK의 시스템
   공격"과 "LUCIA의 정서적 종결" 중 무엇으로 할지는 캐릭터 아이덴티티에
   영향을 준다).

---

## 3. PR4 Non-goals

PR4는 Persona Runtime을 통합하는 작업이다.

아래 항목은 작업 중 수정 유혹이 생기더라도 절대 PR4 범위에 포함하지 않는다.
필요하면 별도 PR로 분리한다.

### 3.1 제외 대상

- **`decision-summary.ts` 재설계 금지** — PR3.5-D 및 PR #219 판단으로 현재
  정리 완료. 추가 문구 개선은 별도 소형 PR로 진행한다.
- **`classifier.ts` / `categoryV3` 변경 금지** — Classifier 2차 개선 Backlog
  에서 별도로 진행한다.
- **Memory / History / Review Card 변경 금지** — Decision OS Phase3
  로드맵 항목이다.
- **Room / Speaker 확장 기능 추가 금지** — SNS Group Room, Multi Speaker,
  Messenger 기능은 Phase4 이후로 미룬다.
- **결제 / 구독 구조 변경 금지** — 무료/유료 Persona 정책은 별도 트랙에서
  다룬다.
- **Decision OS 기능 추가 금지** — Review, Memory, Timeline, Analytics 등은
  이번 범위가 아니다.
- **주의: RAY Legacy Runtime 흡수/폐기는 Non-goal이 아니다.** 이번 진단으로
  PR4-C의 정식 결정 범위에 편입됐으므로 Scope Guard 대상이 아니다. 다만
  PR4-A/B에서 조기 삭제하거나 임의로 Runtime을 합치는 것은 금지하고, PR4-C에서
  별도 판단 후 진행한다.

### 3.2 Scope Guard

PR4 작업 중 위 항목을 반드시 수정해야 하는 의존성이 발견되더라도 작업자가
임의로 범위를 확대하지 않는다.

발견 즉시 다음을 보고하고, PR4에서는 수정하지 않는다:

- 왜 필요한지
- 영향 범위
- 별도 PR 필요 여부

---

## 4. PR4-A/B/C/D 순서와 범위

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

### PR4-C — RAY Runtime 통합 및 Legacy Finance Runtime 폐기/흡수 결정 (Decision, 리스크 높음·제품 판단 필요)
- 핵심 결정: Legacy deterministic scoring 기능을 버릴 것인가, LLM Runtime 안으로
  흡수한 뒤 Legacy를 폐기할 것인가.
- 결정 대상 기능: `confidence`, `breakdown`, `entryCondition`, `positionSizing`,
  ETF/지수 처리, 종목/섹터 비교, 장마감/주말 시장 세션 라벨,
  `market-quick-handlers.ts` 특수 질문 핸들러.
- 마스터 방향성: **즉시 삭제보다 흡수 후 폐기를 우선 검토한다.** 아래는 이
  방향성을 실제로 어떻게 구현할지에 대한 구체 설계안(작성 완료, 코드 변경
  없음)이다.

#### PR4-C.1 Legacy deterministic scoring 로직 분석

전체 스코어링 파이프라인은 **100% 순수 함수**다. `lib/personax/runtime/route-market.ts:69`의
`buildLegacyStockDetailResult(params)`는 이미 fetch된 데이터(`marketData`/
`nasdaqData`/`news`)를 파라미터로만 받고, 함수 내부에서 외부 API를 전혀
호출하지 않는다. 내부에서 쓰는 `lib/personax/scoring.ts`의 모든 함수
(`getVolumeInfo`/`getVolatility`/`getPricePos`/`getNewsData`/`calcScores`/
`getPositionSizing`/`buildEntryCondition`/`detectMarketSituation`/
`analyzeTrendContext`/`determineWatchLevel`/`detectPersonaConflict`)는 부수효과가
전혀 없는 순수 계산이며, `calcScores`의 `confidence`는
`55 + hasData?15 + newsCount>0?10 + newsCount≥5?5 + volScore>0?5 + volScore≥2?5 + align?3`
가산식(최대 93)으로 산출된다.

입력 데이터 출처: `marketData`는 `lib/personax/market.ts:424`의 `fetchMarketPrice()`가
공급하며, 이 함수는 **LLM Runtime도 이미 동일하게 호출 중**이다
(`lib/personax/market-data.ts:217` `fetchMappedMarketData` → `buildMarketDataPromptContext`,
Stage1/2/3에 주입되는 바로 그 함수). 즉 원 데이터 소스는 이미 완전히 공유되어
있고, 다른 것은 그 데이터를 가지고 계산하는 후처리 레이어뿐이다.

유일한 진짜 차이는 **뉴스**다. `getNewsData()`가 요구하는 `{title, source}[]`
구조화 뉴스는 `lib/news.ts:140`의 `fetchInvestmentNews()`(네이버 뉴스 검색 API,
`NAVER_CLIENT_ID/SECRET` 필요, 5분 캐시)가 공급하며, 이는 LLM Runtime Stage1의
Gemini/Claude `enableSearch` grounding과 완전히 별개의 외부 호출이다 — Stage1은
비정형 텍스트 요약만 받으므로 `getNewsData()`의 제목 키워드 정규식 감성
스코어링에 바로 쓸 수 없다.

참고로 `buildMarketDataPromptContext()`(`market-data.ts:240`)는 이미
`rawPrice`/`rawHigh`/`rawLow`/`rawVolume`/`avgVolume`을 JSON으로 프롬프트에
주입하고 "RAY may use only numeric values present in this Market Data block"
규칙까지 걸어두고 있다 — 흡수를 위한 배관은 절반 이미 존재한다. `trend`(5·20일
이평선)와 계산된 `confidence`/`breakdown`/`entryCondition`/`positionSizing`/
`verdict`만 이 JSON에 없는 상태다.

#### PR4-C.2 흡수 방식 옵션 비교 — **방안 B 채택**

| 비교 | A. 텍스트 요약 주입 | **B. 구조화 JSON + 인용 규칙 (채택)** | C. Tool-calling 전환 |
|---|---|---|---|
| 설명 | 계산 결과를 문장으로 미리 조립해 `marketDataPromptContext`에 텍스트로 첨부 | 계산 결과를 `buildMarketDataPromptContext()`가 이미 하는 방식 그대로 JSON 필드로 확장(`confidence`/`verdict`/`entryCondition`/`positionSizing`/`breakdown`/`trendContext`), "이 숫자만 인용 가능, 창작 금지" 규칙 부여 | LLM이 스코어링 함수를 함수 호출로 직접 트리거 — 텍스트completion 프롬프팅에서 tool-calling 아키텍처로 전환 |
| 기존 코드 재사용 | 높음(계산 함수 그대로, 포매팅만 추가) | 매우 높음(기존 JSON 패턴 그대로 확장) | 낮음(호출 인터페이스 전체 재설계) |
| 구현 난이도 | 낮음 | 낮음~중간 | 높음 |
| 숫자 창작(hallucination) 방지력 | 약함 — 문장 재구성 과정에서 숫자가 틀리게 옮겨질 여지 | 강함 — 기존 ECHO Verdict Rule V2("인용만, 창작 금지")와 동일 패턴 재사용 | 최강이나 과설계 |
| 회귀 위험 | 낮음 | 낮음(JSON 스키마에 필드만 추가, 파서 영향 없음) | 높음(Stage1/2/3 호출 방식 전체 변경) |
| 비용/지연 영향 | 없음(로컬 계산) | 없음(로컬 계산) | LLM 왕복 추가 가능 |

**마스터 결정: 방안 B(구조화 JSON + 인용 규칙)를 채택한다.** 이미
`buildMarketDataPromptContext()`가 정확히 이 패턴으로 동작 중이므로 새 메커니즘을
만드는 게 아니라 기존 필드 집합을 확장하는 작업이 된다.

#### PR4-C.3 비용/지연시간 영향 추정

- **LLM 콜 수 영향: 0.** 스코어링 전체가 로컬 순수 함수이므로 흡수해도 Stage1/2/3
  호출 횟수는 변하지 않는다 — 5절 기준 현재(PR #259 이후) invest 카테고리
  **7 call/turn**은 그대로 유지.
- 시세(`fetchMarketPrice`)는 이미 LLM Runtime도 호출하므로 추가 호출 없음.
  **뉴스(`fetchInvestmentNews`, 네이버 API)만 순수 추가분**이며, 병렬(`Promise.all`)
  로 묶으면 전체 응답 지연에 실질적으로 추가되는 시간은 미미할 것으로 추정되나
  정확한 ms 단위 수치는 실측 없이는 확정할 수 없다.
- **마스터 결정: 1단계에서는 뉴스 감성 스코어링을 제외한다.** `calcScores`에
  `newsCount:0, newsAvg:0`을 대입하는 축소판으로 시작 — 네이버 API 신규 의존성
  없이(외부 호출 추가 0) confidence 상한만 소폭 낮아지는 트레이드오프를 받아들인다.
  뉴스 감성 포함 여부는 1단계 검증 후 별도로 재검토한다.

#### PR4-C.4 단계적 마이그레이션 순서 (마스터 결정 반영)

**1단계 — 프로토타입 (종목 한정)**
- **마스터 결정: 1단계 프로토타입은 `detectKnownAsset()`(market-data.ts:65)이
  하드코딩 인식하는 삼성전자/SK하이닉스/비트코인 3종목으로 한정한다.**
- Stage1/2 실행 직전에 `calcScores` 등 계산을 로컬 호출(뉴스 제외판)하고 결과를
  `marketDataPromptContext`의 JSON에 `derived: {confidence, verdict,
  entryCondition, positionSizing, breakdown}` 필드로 추가.
- RAY 시스템 프롬프트에 "derived 필드가 있으면 그 confidence/verdict/entryCondition을
  인용하되 새 숫자를 만들지 말 것" 규칙 추가(ECHO Rule V2 문구 패턴 재사용).
- 이 단계에서는 `teaMode=false` 레거시 경로를 건드리지 않는다 — 두 경로 공존.

**2단계 — 흡수 완료 확인 후 레거시 경로 차단/이관**
- 1단계가 QA(아래 E)를 통과하면, `route.ts`의 `teaMode=false` finance 진입점
  (1081행 이하)에서 `buildLegacyStockDetailResult` 호출 대신 LLM Runtime
  (`buildFinanceMultiPersonaResponse`)으로 리다이렉트하거나, 과도기적으로
  "곧 통합됩니다" 안내를 포함한 응답을 얹는 절충안 적용 가능.
- **마스터 결정: raw API(`teaMode=false`) 차단 시점은 지금 확정하지 않는다.**
  1단계 배포 후 실제 raw API 호출 트래픽 로그를 관측한 뒤 그 결과를 근거로
  별도 결정한다(트래픽이 0에 가까우면 즉시 차단, 유의미하면 이관 유예 기간 설정).
- 이 시점에도 코드 자체(`route-market.ts`, `templates.ts`)는 삭제하지 않고
  호출부만 차단 — 롤백 여지를 남긴다.

**3단계 — 완전 제거**
- 2단계 이후 raw API 트래픽이 실제로 0에 수렴함을 로그로 확인한 뒤
  `templates.ts`(`buildJackText`/`buildLuciaText`/`buildEchoText`/`buildFinalRay`),
  `market-quick-handlers.ts`, `route-market.ts`의 `buildLegacyStockDetailResult`를
  제거.
- **단, `stock-response-builders.ts`의 `normalizeNoMarketDataInvestmentPersonaText()`는
  제거 대상에서 제외** — `lib/personax/runtime/route-response-guard.ts:286`에서
  현재 LLM Runtime의 live 응답 가드로 실사용 중임을 확인했다. 파일 자체를 삭제하지
  않고 legacy 전용 함수(`buildFinalRay`, `buildJackDetail`, `buildLuciaDetail`,
  `buildRayDetail`, `buildStockDetailResponse`)만 선택적으로 제거한다.

#### PR4-C.5 리스크 및 되돌리기 계획

QA로 감지할 실패 시나리오:
1. `derived` 필드 주입 후 RAY가 confidence/entryCondition 숫자를 실제로
   인용하는지, 아니면 여전히 무시하고 창작하는지(1단계 필수 확인 항목).
2. entryCondition의 가격 조건(`rawHigh`/`rawLow` 기반)이 실제 응답에 정확히
   반영되는지 — 반영 안 되면 방안 B의 "인용 강제" 실효성이 없다는 뜻이므로
   방안 A/C 재검토.
3. 뉴스 감성 생략판 confidence가 부자연스럽게 낮게 나오는지 체감 QA.

되돌리기 어려운 지점: **2단계에서 raw API를 완전히 차단한 이후**가 유일한
비가역 근접 지점 — 이 경로에 의존하는 외부 클라이언트가 있다면 그 시점부터
되돌리기 어려워진다(그래서 차단 시점을 지금 확정하지 않고 트래픽 로그 관측 후
결정하기로 함). 1단계(필드·규칙 추가)와 3단계(코드 삭제, git 히스토리로 복구
가능)는 상대적으로 안전하다.

#### PR4-C.6 남은 결정 사항

- LUCIA가 emotional에서 CLOSER 후보가 될 수 있는지 여부 결정.
- action/principle에서 ECHO를 order(디베이트 슬롯)에서 아예 제외할지 검토
  (현재는 생성 후 폐기되는 낭비 호출 — 5절 참고).
- 뉴스 감성 스코어링을 향후 흡수 범위에 포함할지(1단계는 제외로 확정, 재검토는
  1단계 검증 이후).
- raw API(`teaMode=false`) 차단 구체 시점 — 트래픽 로그 관측 후 결정(보류).

- **이 단계는 코드 변경 전 별도 승인이 필요한 제품/캐릭터 결정을 포함**하므로,
  PR4-A/B와 분리해 독립 PR로 진행한다.

### PR4-D — Persona Priority Hierarchy 구현 (Proposal, 다음 세션 별도 설계)

- 목표: 2.1의 Persona Priority Hierarchy를 코드/프롬프트 구조에서 강제한다.
- 핵심 방향: 페르소나 정체성이 Conflict Rule, Data Context, Slot Order, Fallback보다
  항상 먼저 적용되도록 Runtime 조립 순서와 프롬프트 주입 구조를 재설계한다.
- PR4-B와의 차이: PR4-B는 부족한 규칙을 추가하고 계층을 정리하는 작업이었다.
  PR4-D는 "규칙 추가"가 아니라 **규칙 간 서열을 강제**하는 작업이다.
- 범위: 이번 문서에서는 구현 범위를 확정하지 않는다. 다음 세션에서 별도 설계 후
  독립 PR로 진행한다.
- 유의사항: LUCIA 숫자 반복 문제처럼 특정 데이터 채널만 막는 방식은 근본 해결책이
  아니다. PR4-D에서는 LUCIA/JACK/ECHO/RAY의 절대 규칙을 먼저 고정하고, 앞 발화
  반응과 데이터 사용은 그 아래 보조 계층으로 내려야 한다.

---

## 5. 비용 영향 재추정

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

## 6. 성공 기준 / QA 재검증 계획

### 6.1 성공 기준

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

### 6.2 QA 재검증 계획 (실행은 각 PR 단계에서 승인 하에 — Level 2/3 비용 정책 적용)

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
수가 5절 추정치와 일치하는지(로그 `console.log('[stage3-raw]', ...)` 등으로
확인).

PR4-A는 코드 삭제만이므로 QA는 tsc + 정적 검증으로 충분하고 실제 LLM 호출
없이도 완료 가능하다. PR4-B/C는 실제 응답 톤 변화를 수반하므로 위 8개
시나리오의 실제 API 호출 QA(사용자 명시 승인 필요)가 필수다.

---

## 7. Persona Runtime 재설계 필요성 — 실패한 접근법 기록

2026-07-05, LUCIA가 반박 시 항상 "RAY, 그 ~"로 시작하며 RAY의 시세 데이터를
그대로 반복하는 문제(Persona Priority Hierarchy 위반, 2.1 참고)를 해결하기
위해 하루 동안 다음 4개 접근을 순차로 시도했으나 전부 실패했다. 배포 QA 결과
"RAY, 그 88% 고점 구간이니 298,250원 눌림목이니 하는 데이터 타령" 패턴이
4번째 시도 이후에도 그대로 재현됨을 확인했다.

### 7.1 시도한 접근법과 결과

| # | 접근법 | 대상 | 커밋 | 결과 |
|---|---|---|---|---|
| 1 | `marketDataPromptContext` 물리적 차단 | LUCIA 슬롯에서 RAY 시세 JSON 자체를 안 보이게 제거 | PR #267~270 (`75bb0e0`, `1cd16af`, `a6accd0`, `c589d1c`/`00ac518`) | 실패 — 숫자 반복 지속 |
| 2 | Stage1 dataPack(dataContext) 물리적 차단 | LUCIA 슬롯에서 Stage1이 넘기는 데이터 채널 자체를 제외 | PR #271 (`42ba33b`/`3fcbc2c`) | 실패 — 숫자 반복 지속 |
| 3 | Previous Persona Responses/Context sanitize | LUCIA에게 보이는 "앞 발화" 텍스트에서 RAY가 언급한 숫자를 제거 | PR #272 (`7c7f514`/`f87162f`) | 실패 — 숫자 반복 지속 |
| 4 | Priority Anchor 삽입 | 프롬프트 recency 이점을 이용해 "정체성 우선" 규칙을 맨 뒤에 강제 삽입 | PR #274 (`e3d8fe0`/`79b56f3`) | 실패 — 배포 QA에서 동일 패턴 재현 확인 |

네 시도 모두 서로 다른 채널(데이터 JSON → dataPack → 이전 발화 텍스트 →
규칙 배치 순서)을 막았지만, 매번 동일한 전역 증상("RAY, 그 ~"로 시작하며
데이터 재인용)이 재발했다.

### 7.2 패턴 진단

정상적인 아키텍처라면 특정 채널을 막는 국소 수정은 그 채널에 한정된 국소
개선으로 이어져야 한다. 그런데 오늘은 서로 무관한 4개 채널을 순서대로
막았음에도 매번 같은 전역적 증상이 그대로 재발했다. **"수정해도 증상이
재발하는 패턴 자체"가 문제의 소재가 개별 채널이 아니라는 진단 근거다.**

이는 2.1에서 이미 확정한 "규칙 간 우선순위 부재" 진단보다 한 단계 더 깊은
결론으로 이어진다: 문제는 우선순위 규칙의 배치(어디에 규칙을 넣을지, 어떤
채널을 막을지)가 아니라, **"하나의 LLM 호출로 4개 페르소나를 순차 생성"하는
Persona Runtime 구조 자체**일 가능성이 높다. 단일 호출 안에서 RAY의 발화가
먼저 생성되고 그 텍스트가 컨텍스트에 남아 있는 한, 그 컨텍스트를 아무리
가지치기해도(채널 차단) 또는 아무리 강한 규칙을 뒤에 붙여도(Anchor) LLM이
직전 컨텍스트의 관성을 완전히 벗어나지 못하는 것으로 보인다.

### 7.3 결론

- 단일 호출 순차 생성 구조 내에서의 프롬프트/규칙 조정(데이터 채널 차단,
  컨텍스트 sanitize, 우선순위 Anchor)으로는 한계에 도달했다고 판단한다.
- 다음 설계는 "규칙을 어디에 어떻게 추가할지"가 아니라 "생성 구조 자체를
  바꿀지"를 검토 대상으로 삼아야 한다.

### 7.4 다음 설계가 검토해야 할 근본 질문

**각 페르소나를 독립된 호출로 분리했을 때, 서로의 발화를 어떤 형태로
참조하게 할 것인가.**

- 완전 분리(페르소나별 독립 호출, 서로의 발화를 아예 전달하지 않음)는 오늘의
  "정체성 침범" 문제는 구조적으로 해소하지만, 그 대가로 반박·호응 같은
  티키타카(tikitaka) 상호작용 자체가 사라질 위험이 있다. 페르소나 간 대화가
  "각자 독백을 이어 붙인 것"처럼 보일 수 있다는 뜻이며, 이는 제품 경험상
  받아들일 수 없는 회귀일 수 있다.
- 따라서 "완전 분리"와 "상호작용 유지"는 상충 관계이며, 다음 설계는 이
  트레이드오프를 명시적으로 어떻게 절충할지(예: 요약된 발화 요지만 다음 호출에
  전달, 반박 대상 발화만 선별적으로 전달 등)를 핵심 설계 질문으로 다뤄야 한다.
  이 문서는 그 답을 확정하지 않는다.

### 7.5 범위 규정

이 재설계는 **PR4-D의 연장이 아니라 별도 논의**로 취급한다. 기존 PR4-A/B/C의
성과물(Dead code 삭제, 규칙 계층 통합, RAY Legacy 흡수 결정)은 그대로
유지하되, 이번에 재검토 대상이 되는 것은 Persona Runtime의 핵심 생성 구조
(단일 호출 순차 생성 여부) 하나로 한정한다. 4.의 PR4-D 항목은 "규칙 서열을
어떻게 강제할지"를 다루는 기존 범위로 남겨두고, 이번 재설계 논의는 그보다
상위 단계의 별도 트랙으로 분리해 다음 세션에서 다룬다.
