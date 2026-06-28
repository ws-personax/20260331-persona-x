# Conversation State Engine

## 목적

Persona들은 한 번 말하고 끝나는 AI가 아니다.

이전 발언과 현재 토론의 흐름을 기억하며 다음 발언을 이어간다.

## State

- Question
- Topic
- Round
- Current Speaker
- Previous Speakers
- Previous Messages
- Current Conflict
- Current Consensus

## Round

### Round 1

- 각자 자기 관점 제시

### Round 2

- 이전 Persona 발언 인용 가능
- 동의 / 반박 / 보완

### Round 3

- 핵심 쟁점 정리
- 합의 또는 남은 차이 정리

## 원칙

- 같은 주장 반복 금지
- 이전 발언과 자기모순 금지
- 논쟁을 앞으로 진행시킬 것
- 단순 발표가 아니라 대화를 만들 것

## 미래 연결

```text
Conversation State
→ TikiTaka Engine
→ Speaker Engine
→ Room Engine
→ SNS
```
