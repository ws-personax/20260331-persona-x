# PersonaX Blueprint

**From Decision OS to Decision Platform**

---

## 1. Vision

PersonaX는 AI Chat App이 아니다.

PersonaX는 **Decision Operating System**이다.

목표는 더 좋은 답변이 아니라 **더 좋은 의사결정**이다.

사람이 AI에게 의존하는 것이 아니라,
AI가 사람의 판단을 더 선명하게 만드는 것이 PersonaX의 존재 이유다.

---

## 2. Product Evolution

```
Decision AI
    ↓
  단일 Persona와 1:1 대화로 의사결정 보조

Decision OS
    ↓
  JACK / LUCIA / RAY / ECHO가 역할 분리된 Decision Participant로 작동

Decision Rooms
    ↓
  여러 Speaker가 한 Room에서 함께 의사결정

Decision Network
    ↓
  Room 간 연결, 지인 초대, 공동 결정의 공유

Decision Platform
    ↓
  개인 / 팀 / 조직 단위로 확장되는 결정 인프라
```

---

## 3. Core Principles

`personax-principles.md` 요약

### Room First
Room이 제품의 중심이다.
모든 대화, 결정, 기억은 Room 단위로 관리된다.

### Speaker Before Persona
누가 말했는지가 어떤 Persona가 답하는지보다 먼저다.
Message는 Speaker 없이 존재할 수 없다.

### Decision Before Memory
결정이 먼저이고, Memory는 Decision에서 파생된다.
기억을 위한 기억은 없다.

### Memory Separation
Room Memory와 Personal Memory는 절대 섞지 않는다.
Room의 합의와 개인의 기억은 목적이 다르다.

### Context Boundary
Context Bleeding은 가장 위험한 버그이다.
다른 Room의 맥락, 다른 Persona의 언어가 섞이면 신뢰가 무너진다.

---

## 4. Product Layers

```
UI
  ↓  사용자가 질문하고 Room을 탐색하는 인터페이스

Room
  ↓  의사결정의 컨테이너. 모든 대화와 결정의 기본 단위

Speaker
  ↓  발화 주체. user / persona / system 세 종류

Persona Engine
  ↓  JACK / LUCIA / RAY / ECHO를 역할에 맞게 호출하고 응답을 생성

Decision Engine
  ↓  Persona 토론을 Decision Summary로 정리

Memory Engine
  ↓  Decision에서 파생된 Room Memory와 Personal Memory를 분리 저장

Review Engine
  ↓  저장된 결정을 다시 꺼내 재검토하도록 유도

Storage
     rooms / room_members / room_messages / room_persona_calls
     room_decisions / room_memories / personal_memories
```

---

## 5. Decision Loop

```
사용자
  ↓
질문 입력
  ↓
Persona Debate
  (JACK / LUCIA / RAY / ECHO 각자의 시각으로 분석)
  ↓
Decision Summary
  (결정 이유 / 반대 의견 / 다음 행동 정리)
  ↓
Memory 저장
  (Room Memory 또는 Personal Memory)
  ↓
Review
  (지정 날짜 또는 사용자 요청 시 재검토)
  ↓
다음 Decision
```

이 루프는 한 번으로 끝나지 않는다.
같은 주제를 다시 꺼내고, 다시 검토하고, 더 나은 결정으로 수렴하는 것이 목표다.

---

## 6. Room Loop

```
Room 생성
  ↓
대화 시작
  ↓
Persona 호출 (@JACK / @RAY / @LUCIA / @ECHO 또는 자연어 트리거)
  ↓
Decision 생성
  ↓
Room Memory 저장
  ↓
Review 예약 또는 즉시 재검토
  ↓
다음 토론
```

Room은 한 번 쓰고 버리는 대화창이 아니다.
같은 Room에 다시 돌아와 이전 결정을 꺼내고 이어가는 것이 Room의 가치다.

---

## 7. Data Architecture

### 핵심 테이블

| 테이블 | 역할 |
|---|---|
| `rooms` | 의사결정 대화방. 타입 / 소유자 / 설명 포함 |
| `room_members` | 어떤 사용자가 어떤 Room에 속하는지 |
| `room_messages` | Room 안의 모든 발화. Speaker 중심으로 저장 |
| `room_persona_calls` | 어떤 메시지에서 어떤 Persona가 호출되었는지 |
| `room_decisions` | Room 안에서 정리된 의사결정의 기록 |
| `room_memories` | Decision에서 파생된 방 단위 기억 |
| `personal_memories` | 개인 단위 기억. Room Memory와 분리 |

### 기존 구조와의 관계

```
기존: conversations / messages (1:1 구조)
        ↓ 유지 (회귀 없음)

신규: rooms / room_members / room_messages
        ↓ Room Layer로 얹음 (충돌 없음)
```

Room 구조는 기존 1:1 채팅 구조를 대체하지 않는다.
새로운 Layer로 위에 얹는다.

---

## 8. Persona System

Persona는 답을 주는 봇이 아니다.
**Decision Participant**다.

### JACK
- 책임 / 선택 / 실행
- "지금 가장 중요한 결정은 무엇인가"를 묻는다
- 실행 가능한 행동으로 수렴시킨다

### LUCIA
- 공감 / 회복 / 감정
- 감정의 무게를 먼저 받아낸다
- 결정 전에 사람이 안정되도록 돕는다

### RAY
- 정의 / 분해 / 검증
- 문제를 구성 요소로 분해한다
- 논리적 허점과 가정을 검증한다

### ECHO
- 패턴 / 구조 / 원칙
- 반복 패턴과 구조적 원인을 찾는다
- 원칙과 기준에 비추어 결정을 검토한다

각 Persona는 다른 Persona의 역할을 흉내 내지 않는다.
역할이 겹치면 결정의 선명도가 낮아진다.

---

## 9. Memory Architecture

```
Personal Memory
  ↓
  개인의 반복 패턴 / 선호 / 장기 맥락
  → 개인 1:1 대화와 연결

Decision Memory
  ↓
  특정 결정에서 파생된 판단 근거 / 기준 / 행동 계획
  → room_decisions에서 파생

Room Memory
  ↓
  방 단위로 공유되는 합의 / 기억 / 다음 토론 기준
  → room_memories에 저장

Review
  ↓
  저장된 Memory를 꺼내 다시 검토하는 트리거
  → review_date 기준 또는 사용자 요청
```

### 분리 원칙
Room Memory는 공동 결정의 기록이다.
Personal Memory는 개인 맥락의 보조 기록이다.
둘이 섞이면 누가 합의한 내용인지 흐려진다.

---

## 10. Success Metrics

`persona-beta-gate.md` 요약

PersonaX는 다운로드 수가 아니라 **행동**을 본다.

| 지표 | 의미 |
|---|---|
| 1주 재방문율 | 제품이 다시 필요한가 |
| 2번째 고민 입력률 | 한 번으로 끝나지 않는가 |
| Persona 2회 이상 호출률 | Persona가 실제로 쓰이는가 |
| 같은 Room 재방문 횟수 | Room이 가치 있는가 |
| Decision Summary 열람률 | 결정 기록이 의미 있는가 |
| Review Card 재진입률 | 기억이 다시 꺼내지는가 |

### 베타 통과 기준
- 5명 중 3명 이상이 2회 이상 사용한다
- 5명 중 2명 이상이 "다시 써보고 싶다"는 반응을 보인다
- 최소 3개 이상의 실제 의사결정 기록이 생성된다

---

## 11. Roadmap

```
Phase 1 — Persona 품질 (완료)
  ↓
  JACK / LUCIA / RAY / ECHO 역할 분리
  Decision Summary 구조 확립
  의사결정 Prompt 품질 강화

Phase 2 — Room MVP
  ↓
  Room 생성 / 초대 / 참여
  Speaker 구조 구현
  Room 단위 Persona 호출

Phase 3 — Decision Memory
  ↓
  room_decisions 저장
  room_memories 분리
  Review 예약 및 재진입

Phase 4 — SNS
  ↓
  Room 공개 / 공유
  지인 초대 / Decision 공유
  Decision Network 초기 형태

Phase 5 — Voice
  ↓
  음성 입력 기반 Room
  Voice Persona 호출

Phase 6 — Decision Platform
  ↓
  팀 / 조직 단위 Room
  Decision 히스토리 분석
  외부 연동 / API
```

---

## 12. What PersonaX is NOT

PersonaX는 다음이 아니다.

- **AI 검색엔진**: 정보를 찾아주는 도구가 아니다
- **단순 챗봇**: 질문에 답을 주고 끝나는 시스템이 아니다
- **단순 메모장**: 생각을 저장하는 노트 앱이 아니다
- **단순 SNS**: 소셜 활동을 위한 플랫폼이 아니다

PersonaX는 **Decision Platform**이다.

사람이 중요한 결정을 내리는 과정을 지원하고,
그 결정을 기억하고, 다시 꺼내고, 더 나은 결정으로 이어가는
**의사결정 운영 체계**다.

---

## 13. Final Statement

> "PersonaX는 AI가 사람을 대신해 결정하는 시스템이 아니라,
> 사람이 스스로 더 좋은 결정을 내릴 수 있도록 돕는 플랫폼이다."
