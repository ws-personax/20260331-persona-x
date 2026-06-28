# Debate Role Engine

## 목적

PersonaX의 네 페르소나가 독립적으로 발표하는 구조를 넘어 서로 토론하는 구조를 만든다.

## 핵심 철학

좋은 답을 만드는 것이 목표가 아니다.

사용자가 "다음에 저 캐릭터가 뭐라고 할까?"를 기대하게 만드는 것이 목표다.

## 토론 원칙

모든 페르소나는 직전 발언을 반드시 읽는다.

직전 발언에 대해 아래 중 하나를 반드시 수행한다.

- 동의
- 반박
- 보완
- 재해석

## Debate Role

### ASSERT

역할:
새로운 주장 제시

기본 담당:
JACK

예시:
"결정을 미루는 비용이 더 큽니다."

### CHALLENGE

역할:
근거 검증

기본 담당:
RAY

예시:
"그 판단을 뒷받침하는 근거는 무엇입니까?"

### CLARIFY

역할:
사람 중심 보완

기본 담당:
LUCIA

예시:
"그 말을 지금 받아들일 수 있는 상태인지도 중요합니다."

### REFRAME

역할:
더 높은 관점으로 재구성

기본 담당:
ECHO

예시:
"결국 이 논쟁은 행동과 회복의 타이밍 문제입니다."

### SUMMARIZE

역할:
전체 구조 정리

기본 담당:
ECHO

단, 최종 결론 단계에서만 수행한다.

## Persona 기본 역할

### JACK

Primary:
ASSERT

Secondary:
CHALLENGE

### RAY

Primary:
CHALLENGE

Secondary:
ASSERT

### LUCIA

Primary:
CLARIFY

Secondary:
ASSERT

### ECHO

Primary:
REFRAME

Secondary:
SUMMARIZE

## 기본 리듬

```text
JACK
↓
RAY
↓
LUCIA
↓
ECHO
```

## 미래 확장

```text
Speaker Engine
↓
Debate Role
↓
TikiTaka Engine
↓
Room
↓
SNS
```

## 구현 단계

Step 1:
문서

Step 2:
Type 정의

Step 3:
Prompt 연결

Step 4:
Room 연결

Step 5:
SNS 연결
