# Runtime v2 — Tikitaka Level 설계 문서 (PR303)

> 상태: 설계 확정, 미구현 (docs-only)
> 이 문서는 방향과 계약(contract)만 정의한다. 이번 PR에서는 어떤 실행 경로(`entrypoint.ts`, `decision-engine.ts`, `speaker-router.ts`, `app/api/chat/route.ts` 등)에도 연결하지 않는다.

## 0. 배경

현재 Runtime v2는 4개 Persona(ray/jack/lucia/echo)가 서로의 원문을 보지 않고 각자 독립적으로 답변한 뒤, `decision-engine.ts`가 **category 기준**(invest/emotional/action/knowledge/principle)으로 고정된 `DecisionSummary`를 붙이는 구조다.

티키타카(Persona 간 상호작용)를 도입하려는 이유는, 일부 질문은 "관점이 갈리는 지점을 서로 맞춰봐야" 쓸모 있는 답이 나오기 때문이다. 하지만 모든 질문에 상호작용을 붙이면 비용과 지연만 늘고 품질 이득은 없다. 따라서 질문마다 상호작용 강도(level)를 판단하는 기준이 먼저 있어야 한다.

## 1. 왜 원문 기반 티키타카를 금지하는가

Persona가 서로의 원문(raw text) 응답 전체를 공유하고 그걸 다시 읽고 답하는 방식은 다음 이유로 금지한다.

1. **오염(contamination) 위험** — 한 Persona의 문장 스타일/논리 흐름이 다른 Persona의 응답에 그대로 새어 들어가면, 4개 Persona가 각자 다른 관점을 유지해야 한다는 설계 전제가 무너진다. 지금도 `output-contract/label-normalizer.ts`가 라벨 형식 오염을 잡아내는 것처럼, 원문 공유는 이 문제를 구조적으로 더 키운다.
2. **비용/지연 폭증** — 원문 전체를 N개 Persona에게 재주입하면 토큰 사용량이 Persona 수만큼 곱연산으로 늘어난다. 구조화된 데이터 몇 줄을 공유하는 것과는 비용 차수가 다르다.
3. **디버깅 불가능** — 원문을 서로 주고받기 시작하면 "왜 이 답이 나왔는지"를 역추적하기 어려워진다. 지금 QA suite(`lib/personax-v2/qa/`)가 각 Persona 응답을 독립적으로 검증할 수 있는 것은 Persona 간 입력이 서로 섞이지 않기 때문이다.
4. **v1 Runtime과의 경계 원칙**과 동일한 맥락 — v1을 건드리지 않는 것처럼, v2 내부에서도 "각 Persona 모듈은 독립적으로 교체/검증 가능해야 한다"는 경계를 유지해야 한다.

**따라서 Persona 간에 공유 가능한 것은 원문이 아니라 구조화된 데이터(stance card)뿐이다.** stance card는 `personaId / stance / reason / concern / suggestion` 같은 고정 필드만 가지며, 자유 서술 원문을 필드에 통째로 복사하지 않는다.

## 2. weak / strong 2단계 정의

초기 구현은 2단계만 사용한다. 5단계 세분화는 지금 하지 않는다.

| Level | 동작 방식 | 언제 쓰는가 |
|---|---|---|
| **weak** | 4개 Persona가 완전히 독립적으로 응답 → Decision Engine이 그대로 정리(현재와 동일한 흐름) | 질문에 대해 합리적인 답이 수렴하는 경우. Persona들이 서로 다른 "입장(stance)"을 주장할 필요가 없는 경우. |
| **strong** | 4개 Persona가 먼저 독립적으로 응답 → 각자 stance card(구조화 데이터)로 요약 → Debate Layer가 stance card만 보고 합의/불일치를 정리 → 최종 결정 프레임 생성 | 질문에 대해 Persona마다 정당하게 다른 입장을 취할 수 있고, 그 입장 차이를 사용자가 알아야 쓸모 있는 경우. |

### 판단 기준 (category 아님, question nature 기준)

카테고리(`invest/emotional/action/knowledge/principle`)로 자동 분기하지 않는다. 대신 다음 질문으로 판단한다:

> **"이 질문에 대해 4개 Persona가 각자 독립적으로 답했을 때, 답이 실질적으로 수렴하는가(weak) 아니면 정당하게 갈릴 수 있는 입장(stance)이 존재하는가(strong)?"**

- 객관적으로 검증 가능한 사실/정의/메커니즘을 묻는 질문 → 수렴 → **weak**
- 개인의 판단·리스크 감수·가치관에 따라 답이 달라지는 결정/의미 질문 → 발산 → **strong**

이 기준은 카테고리와 상관관계는 있지만(투자 질문은 strong이 많고, 지식 정의 질문은 weak이 많음) **카테고리 자체가 기준이 아니다.** 같은 knowledge 카테고리 안에서도 "인플레이션이 뭐야?"(weak)와 "50대 대표가 가장 많이 하는 고민 3가지는 뭐야?"(weak이지만 이유가 다름 — 4번 참고)는 서로 다른 이유로 weak일 수 있고, principle 카테고리인데도 이유에 따라 strong일 수 있다.

## 3. weak 질문 예시

| 질문 | 이유 |
|---|---|
| 인플레이션이 뭐야? | 교과서적으로 합의된 정의. 4개 Persona가 독립적으로 답해도 실질 내용이 수렴한다. |
| GDP가 뭐야? | 동일. 객관적 정의 질문. |
| 금리가 뭐야? | 동일. 객관적 정의 질문. |

공통점: **"~가 뭐야?" 형태의 객관적 용어 정의 질문**은 Persona 간 입장 차이가 발생할 여지가 없다. 하나의 정답에 수렴하므로 Debate Layer를 거칠 이유가 없다.

## 4. strong 질문 예시

| 질문 | 이유 |
|---|---|
| 이 사람 계속 만나도 될까? | 관계 지속 여부는 개인의 판단·리스크 감수 기준에 따라 Persona마다 정당하게 다른 입장(계속 지켜보기 vs 지금 결정)을 취할 수 있다. |
| 창업을 할까 재취업을 할까? | 명시적 A/B 결정 분기. 안정성(재취업)과 상방(창업) 사이의 트레이드오프에 대해 Persona마다 다른 무게를 둘 수 있다. |
| 삼성전자 지금 사도 될까? | 불확실성 하의 투자 타이밍 판단. "지금 산다 vs 기다린다"는 정당하게 갈리는 입장이다. |
| 행복이란 무엇일까? | 객관적 정답이 없는 가치/의미 질문. 정의(definition) 형태의 문장이지만, "인플레이션이 뭐야?"와 달리 수렴하는 교과서적 답이 없고 Persona마다 근본적으로 다른 관점(성취/수용/관계/패턴)을 정당하게 주장할 수 있다. |

핵심 포인트: **"행복이란 무엇일까?"는 문장 형태가 "~가 뭐야?"와 비슷하지만 strong이다.** weak/strong을 가르는 것은 질문의 문법적 형태가 아니라, 답이 객관적으로 수렴하는가(weak) 아니면 정당하게 발산하는가(strong)라는 성격(nature)이다.

## 5. 애매한 질문 처리 원칙

다음 질문들은 category만으로는 weak/strong을 가르기 어렵다.

| 질문 | 판단 | 근거 |
|---|---|---|
| 50대 대표가 가장 많이 하는 고민 3가지는 뭐야? | **weak** | 사용자가 지금 내려야 할 개인적 결정 분기가 없다. "일반적으로 무엇이 많은가"를 묻는 정보/설문형 질문이다. 여러 의견이 있을 수 있어도, 그 의견들을 조율(reconcile)해야 쓸모가 생기는 질문이 아니라 정리된 정보 하나로 충분하다. |
| 서울 집값은 금리 인하가 시작되면 다시 오를까? | **weak** | "지금 사야 하나"처럼 사용자의 즉각적 행동 분기가 명시돼 있지 않다. 메커니즘·전망을 묻는 분석/예측 질문이며, `knowledge-1`("금리가 내려가면 집값은 왜 오르나요?")과 같은 성격이다. 만약 질문이 "그러니 지금 서울 집을 사야 할까?"로 바뀌면 strong으로 재분류해야 한다. |
| 홍명보 감독 체제는 무엇이 문제였을까? | **weak** | 회고적 분석/평가 질문. 사용자 개인이 지금 내려야 할 결정이 아니라 하나의 정리된 해석을 요구한다. 의견이 갈릴 수 있는 주제라는 사실 자체가 strong의 기준은 아니다. |

### 일반 원칙 (앞으로 새 질문이 추가될 때도 적용)

> **"의견이 여러 개일 수 있다"는 strong의 기준이 아니다. 기준은 "사용자가 지금 이 순간 내려야 할 개인적 결정/행동 분기가 이 질문 안에 명시적으로 존재하는가, 그리고 그 분기에 대해 Persona들이 정당하게 다른 입장을 취해야만 답이 쓸모 있어지는가"이다.**

- 정보 전달/분석/회고로 끝나는 질문 → 기본값 **weak**
- 사용자의 즉각적 결정 분기가 있고, 그 분기에서 Persona별 입장이 갈려야 쓸모가 생기는 질문 → **strong**
- 판단이 애매하면 **weak을 기본값으로 한다** (strong은 Debate Layer 비용이 드는 명시적 예외 경로이지, 기본 경로가 아니다).

## 6. QA 샘플 20개 — 사람이 정한 expected tikitakaLevel

`lib/personax-v2/qa/samples.ts` 기준. 다음 PR에서 QA 회귀 테스트에 사용할 수 있도록 사람이 직접 라벨링한 초안이다. 코드에는 아직 반영하지 않는다.

| id | category | question | expected tikitakaLevel | 근거 |
|---|---|---|---|---|
| invest-1 | invest | 삼성전자 지금 사도 될까요? | strong | 투자 타이밍 결정 분기 (§4 예시와 동일) |
| invest-2 | invest | 이더리움 지금 사도 될까요? | strong | 투자 타이밍 결정 분기 |
| emotional-1 | emotional | 누군가 나를 시기할 때 어떻게 해야 할까요? | strong | 대응 방식(대면/거리두기/시간차)에 대해 Persona별로 정당하게 다른 행동 입장이 갈리는 개인 판단 질문 |
| emotional-2 | emotional | 요즘 아무것도 하기 싫습니다 | weak | 결정 분기가 없는 상태 표현 + 지지/작은 다음 행동 제안. Persona 응답이 상충하지 않고 보완적으로 수렴 |
| action-1 | action | 재취업을 해야 할까요, 창업을 해야 할까요? | strong | 명시적 A/B 결정 분기 (§4 예시와 동일 성격) |
| action-2 | action | 오늘 당장 뭘 먼저 해야 할까요? | weak | 구체적 선택지가 제시되지 않은 일반 우선순위 질문. 명시적 분기가 없어 §5 기본값(weak) 적용 |
| knowledge-1 | knowledge | 금리가 내려가면 집값은 왜 오르나요? | weak | 메커니즘 설명. 객관적으로 수렴하는 답 |
| knowledge-2 | knowledge | 인플레이션이 정확히 뭔가요? | weak | §3 예시와 동일 (용어 정의) |
| principle-1 | principle | 좋은 배우자를 고르는 기준은 무엇인가요? | strong | 가치판단 기준 질문. "행복이란 무엇일까"와 동일 성격 — 수렴하는 교과서적 정답 없음 |
| principle-2 | principle | 선택할 때 가장 중요한 원칙은 무엇인가요? | strong | 가치판단/메타 원칙 질문. 동일 성격 |
| invest-3 | invest | 삼성전자 지금 사도 될까? | strong | invest-1과 동일 질문(어투만 다름) |
| invest-4 | invest | 이더리움 지금 들어가도 될까? | strong | invest-2와 동일 성격 |
| emotional-3 | emotional | 누군가 나를 시기할 때 어떻게 해야 할까? | strong | emotional-1과 동일 질문(어투만 다름) |
| action-3 | action | 창업을 할까 재취업을 할까? | strong | action-1과 동일 질문(어순만 다름) |
| knowledge-3 | knowledge | 인플레이션이 뭐야? | weak | knowledge-2와 동일 질문(어투만 다름) |
| principle-3 | principle | 행복이란 무엇일까? | strong | §4 명시 예시 |
| knowledge-4 | knowledge | 홍명보 감독 체제는 무엇이 문제였을까? | weak | §5 명시 예시 (회고적 분석, 개인 결정 분기 없음) |
| knowledge-5 | knowledge | 서울 집값은 금리 인하가 시작되면 다시 오를까? | weak | §5 명시 예시 (예측/분석, "지금 사야 하나"라는 명시적 분기 없음) |
| action-4 | action | 이 사람 계속 만나도 될까? | strong | §4 명시 예시 |
| knowledge-6 | knowledge | 50대 대표가 가장 많이 하는 고민 3가지는 뭐야? | weak | §5 명시 예시 (정보/설문형, 개인 결정 분기 없음) |

**요약: strong 12개** (invest-1/2/3/4, emotional-1/3, action-1/3/4, principle-1/2/3) / **weak 8개** (emotional-2, action-2, knowledge-1/2/3/4/5/6).

## 7. Debate Layer 초안 (계약만 정의, 미구현)

strong 레벨에서만 호출되는 계층. 원문이 아니라 **stance card**만 입력으로 받는다.

### Input — Stance Card (Persona별 1개씩)

```ts
interface StanceCard {
  personaId: PersonaId;      // 'ray' | 'jack' | 'lucia' | 'echo'
  stance: string;            // 이 Persona가 취하는 입장을 한 문장으로 요약
  reason: string;            // 그 입장을 뒷받침하는 핵심 근거 한두 문장
  concern: string;           // 이 입장의 리스크/우려
  suggestion: string;        // 이 입장에서 나오는 구체적 다음 행동 제안
}

interface DebateLayerInput {
  userQuestion: string;
  tikitakaLevel: 'strong';
  stanceCards: StanceCard[]; // Persona 원문이 아닌, 각 Persona 응답에서 추출된 구조화 데이터
}
```

- `stanceCards`는 각 Persona의 독립 응답(현재 `PersonaResult.text`)에서 파생되지만, Debate Layer에는 원문(`text`/`rawText`)을 절대 넘기지 않는다. 원문 → stance card 추출은 이번 PR 범위 밖(다음 PR에서 설계).

### Output — 조율 결과

```ts
interface DebateLayerOutput {
  agreement: string[];       // 모든/대다수 Persona가 공통으로 동의하는 지점
  disagreement: Array<{
    point: string;           // 무엇에 대해 갈리는지
    positions: Array<{ personaId: PersonaId; stance: string }>; // 누가 어떤 입장인지
  }>;
  finalDecisionFrame: {
    conclusion: string;      // 상충을 반영한 최종 결론 프레임
    keyTension: string;      // 핵심 상충 지점 한 문장 요약
    conditionToResolve: string; // 이 상충을 없앨 수 있는 조건/추가 정보
    confidence: 'low' | 'medium' | 'high';
  };
}
```

- `finalDecisionFrame`은 현재 `DecisionSummary`(`conclusion` / `keyRisks` / `suggestedNextStep` / `confidence`)와 유사한 철학을 따르되, strong 레벨 전용으로 `keyTension`(Persona 간 입장 차이)과 `conditionToResolve`(그 차이를 좁힐 조건)를 추가로 가진다.
- weak 레벨은 이 계층을 거치지 않고 현재처럼 `decision-engine.ts`가 직접 `DecisionSummary`를 만든다.

### 확장성 메모

- 지금은 `weak | strong` 2단계만 정의한다.
- 향후 필요 시 `weak | medium | strong` 3단계로 확장할 수 있도록, level 타입은 문자열 유니온으로 느슨하게 두고 하드코딩된 2분기 스위치를 여러 곳에 흩뿌리지 않는다. (실제 타입 선언은 구현 PR에서 진행 — 이번 PR은 문서만)

## 8. 이번 PR의 범위

- 이 문서는 설계 확정 문서이며, 어떤 실행 경로에도 연결되지 않는다.
- `entrypoint.ts`, `decision-engine.ts`, `speaker-router.ts`, `app/api/chat/route.ts` 등 v2 Runtime 동작 코드는 수정하지 않았다.
- LLM 호출 로직, 프롬프트, 출력 계약(`output-contract/`)도 변경하지 않았다.
- `tikitakaLevel` 필드는 아직 `types.ts`나 `samples.ts`에 추가되지 않았다 — 다음 PR에서 §6 표를 기준으로 QA 샘플에 실제 필드를 추가하고, Debate Layer(§7)를 구현하는 것을 제안한다.
