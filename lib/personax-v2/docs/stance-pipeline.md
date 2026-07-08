# Stance Pipeline 순서 (PR311)

> 상태: 문서화만, 코드 동작 변경 없음. 어떤 실행 경로에도 연결하지 않는다.
> PR310에서 추가된 `debate/stance-extractor.ts`가 기존 Runtime v2 파이프라인의 어느 지점에서, 어떤 입력을 받아야 하는지 정리한다.

## 1. 현재 활성 파이프라인 (`entrypoint.ts`, weak 전용)

```
classify(question)
  → research(question, classifierResult)
    → runPersonaEngine(...)                 # LLM 호출. PersonaResult.text 생성 (rawText 없음)
      → normalizePersonaResultLabels(...)    # 라벨 오탈자 보정 (deterministic)
                                              # PersonaResult.rawText = 원문 보존
                                              # PersonaResult.text = 정규화된 텍스트로 교체
        → runDecisionEngine(...)             # category 기반 DecisionSummary 생성 (deterministic)
          → resolveSpeakerRouteCategory + routeSpeakerResponse   # 최종 표시 순서/텍스트 라우팅
```

지금은 `tikitakaLevel`로 분기하지 않는다. 모든 질문이 이 경로(사실상 weak 경로)를 그대로 지난다.

## 2. strong 레벨에서 추가되는 단계 (설계만, 미연결)

`normalizePersonaResultLabels(...)` **이후**, `runDecisionEngine(...)` **대신** 다음이 들어가야 한다.

```
        → normalizePersonaResultLabels(...)
          → [weak]   runDecisionEngine(...)                         # 현재 활성 경로
          → [strong, 미연결] extractStanceCard(personaId, text) × 4  # PR310, deterministic
                       → DebateLayerInput { userQuestion, tikitakaLevel: 'strong', stanceCards }
                         → runDebateLayer(...)                       # PR312, deterministic
                           → DebateLayerOutput
```

### 왜 `extractStanceCard`는 정규화 이후의 `text`를 받아야 하는가

- `stance-extractor.ts`의 라벨 매칭은 정확 일치(exact match, `PERSONA_FIELD_LABELS`에 정의된 공식 라벨 문자열)로 동작한다.
- `label-normalizer.ts`는 "선택의 대사" 같은 오탈자를 "선택의 대가"로 교정해 공식 라벨로 되돌리는 역할을 한다.
- 따라서 `extractStanceCard`에 **정규화 전 원문(`rawText`)을 넘기면 안 된다.** 오탈자가 그대로 남아 있으면 stance-extractor가 해당 섹션을 인식하지 못하고 그 필드는 fallback 문구로 채워진다.
- 즉 `normalizePersonaResultLabels`는 `stance-extractor`의 라벨 인식률을 보장하는 전제 조건이며, 두 단계는 반드시 이 순서(정규화 → 추출)로 실행되어야 한다.

## 3. `DebateLayerOutput`을 `DecisionSummary` 자리에 연결하는 문제 (아직 미해결)

- weak 경로는 `runDecisionEngine`이 만든 `DecisionSummary`(`conclusion` / `keyRisks` / `suggestedNextStep` / `confidence`)를 그대로 speaker-router에 넘긴다.
- strong 경로가 만드는 `DebateLayerOutput.finalDecisionFrame`은 필드 구성이 다르다(`conclusion` / `keyTension` / `conditionToResolve` / `confidence`).
- 이 둘을 하나의 표시 형식으로 합치는 작업(타입 통합 또는 speaker-router 쪽 분기 추가)은 이번 문서의 범위 밖이며, Debate Layer 본체 구현 및 실제 Runtime 연결을 다루는 이후 PR에서 별도로 설계한다.

## 4. 이번 PR의 범위

- 이 문서는 순서 정리(문서화)만 담당한다. 코드를 수정하지 않았다.
- `entrypoint.ts`, `decision-engine.ts`, `speaker-router.ts`, `stance-extractor.ts`, `label-normalizer.ts` 등 기존 파일은 수정하지 않았다.
- Debate Layer 본체(`runDebateLayer` 구현)는 이 문서의 범위 밖이며, 별도 PR(PR312)에서 다룬다.
