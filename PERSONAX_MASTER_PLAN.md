# PERSONAX_MASTER_PLAN.md

# PersonaX North Star Document (2026-05-30)

이 문서는 현재 구현 완료 목록이 아니라 PersonaX의 North Star / 장기 설계도이다.

## 1. 북극성

**PersonaX = 사용자의 의사결정 성장률을 높이는 시스템**

질문 → 결정 → 실행 → 성장 → 재방문

모든 기능 추가 전 질문:

> "이 기능이 사용자의 의사결정 성장률을 높이는가?"

YES → 개발  
NO → 보류

---

## 2. 제품 철학

### ChatGPT
질문 → 답변 → 종료

### PersonaX
질문 → 결정 → 실행 → 성장 → 재방문

PersonaX는 AI 토론 앱이 아니다.

PersonaX는 **Decision OS** 이다.

---

## 3. 핵심 가치

- 충돌
- 재미
- 결정
- 성장

---

## 4. PersonaX 공식

80% 유저 중심  
20% 충돌의 쾌감

= PersonaX

### 원칙

❌ 페르소나 ↔ 페르소나 말싸움

✅ 페르소나 → 사용자 중심 충돌

---

## 5. KPI

### 단기 KPI

1. 결정 수
2. 저장된 결정 수
3. 다음 행동 작성률 (핵심)
4. 2주 후 재방문율
5. 재점검률

### 장기 KPI

6. 의사결정 성장률

### 성장 표현 원칙

❌ 성장률 82점

✅ 지난번보다 창업 준비가 좋아졌습니다

---

## 6. 미래 아키텍처

질문
↓
Decision Frame
↓
Market Data
↓
Persona DNA
↓
LLM 생성
↓
Legal Guard
↓
Persona DNA Guard
↓
Decision Summary
↓
Decision Memory
↓
사용자

---

## 7. Persona DNA Layer

### LUCIA
감정 · 관계

### RAY
데이터 · 분석

### JACK
실행 · 결단

### ECHO
구조 · 원칙

### 목표

사용자가

- "나는 JACK파다"
- "난 LUCIA가 좋다"
- "RAY가 또 팩폭하네"

라고 말하는 수준의 캐릭터 애착 형성

### 적용 주의

Persona DNA는 캐릭터 재미를 위한 장치이지만,
promptfoo 26/26과 Decision QA 품질을 깨지 않는 범위에서 단계적으로 적용한다.

---

## 8. Market Data 원칙

### 절대 원칙

LLM은 Fact를 생성하면 안 된다.

LLM은 Fact를 해석만 한다.

### 구조

Yahoo Finance
Upbit
실제 데이터

↓

Fact Sheet

↓

RAY / JACK / LUCIA / ECHO

### 금지

- 환각 숫자
- 가짜 시세
- 가짜 뉴스
- 가짜 PER/PBR

### 현재 범위

현재는 삼성전자/비트코인 중심 MVP이다.

부동산/환율/금리/원자재는 향후 adapter 확장 대상이다.

---

## 9. Decision Memory

저장 항목

- verdict
- reasons
- counterViews
- nextAction
- reviewDate
- result
- executed

### 목표

"지난번 창업 보류 결정을 하셨습니다.

어떻게 되었나요?"

를 자연스럽게 묻는 시스템

---

## 10. Personal Memory

예정: 2026년 7월

### 저장 대상

- 위험 선호도
- 의사결정 패턴
- 창업 성향
- 관계 성향

### 목표

나를 기억하는 PersonaX

---

## 11. Korean Context Layer

핵심 요소

- 정
- 눈치
- 체면
- 관계
- 가족
- 책임

### 원칙

AI 번역체 금지

한국 중년이 실제로 사용하는 언어 사용

---

## 12. 운영 원칙

### 땜빵 금지

### 기준

새 파일 생성 = 진척도 아님

실제 질문 테스트 통과 = 진척도

---

## 13. 기술 원칙

### route.ts

장기 최종 목표

오케스트레이터 전용

100줄 이내

즉시 목표가 아니다.

현재는 PROJECT_NOTES.md 원칙대로 작은 단위 추출만 진행한다.
route.ts 전체 재작성, Finance 분기 대규모 이동, 응답 흐름 변경은 별도 검증 없이 진행하지 않는다.

### 책임 분리

- auth.ts
- session.ts
- history.ts
- market-data.ts
- persona-dna.ts
- response-guard.ts
- stage1.ts
- stage2.ts
- stage3.ts

---

## 14. 현재 상태 (2026-05-30)

### 구현 상태

- Decision Frame: MVP 연결 완료, 안정화 진행 중
- Session: 기초 연결 완료, History V2/Auth Session 안정화 필요
- History: 기초 연결 완료, conversations/messages 중심으로 추가 안정화 필요
- Response Guard: 1차 적용 완료, Legal Guard 중앙화 필요
- Market Data: MVP 연결 완료, 실제 답변 반영 안정화 진행 중
- Persona DNA: 예정
- Decision Memory: DB 스키마 설계 단계
- Personal Memory: 7월 이후

---

## 15. 로드맵

### 실행 우선순위

1. Market Data 안정화
2. History V2 / Auth Session 안정화
3. Legal / Response Guard 중앙화
4. conversations 확장 및 Decision Memory 저장
5. Persona DNA Layer
6. Korean Context Layer
7. Decision Summary
8. Personal Memory

### 장기 Phase

- Phase 1: Decision Frame 안정화
- Phase 2: Market Data Layer 안정화
- Phase 3: History V2 / Auth Session 안정화
- Phase 4: Legal / Response Guard 중앙화
- Phase 5: Decision Memory
- Phase 6: Persona DNA / Korean Context Layer
- Phase 7: Decision Summary
- Phase 8: Personal Memory

---

## 16. 최종 비전

현재

AI 4명이 토론하는 앱

↓

중기

내 편인 4명의 조언자가
내 결정을 도와주는 앱

↓

최종

사용자의 의사결정을 기억하고
성장을 추적하는 시스템

### PersonaX = Decision OS

---

## 17. 콘텐츠 UX 전략

### 경쟁자 재정의

❌ 경쟁자 = ChatGPT

✅ 경쟁자 = 유튜브 쇼츠 + 웹툰 + 뉴스

PersonaX는 단순히 더 똑똑한 답변을 제공하는 앱이 아니다.

사용자의 빈 시간, 특히 이동 중·쉬는 시간·퇴근 후에
짧고 강한 몰입을 만들어야 한다.

---

### 핵심 원칙

긴 분석을 짧은 충돌로 시작하고,
마지막은 결정으로 닫는다.

질문
↓
짧은 충돌
↓
궁금증
↓
결정
↓
다음 행동
↓
2주 후 재점검

---

### 1. 쇼츠식 첫 화면

첫 화면은 길면 안 된다.

사용자가 바로 멈추게 만드는 한 줄이 필요하다.

예:

- "창업? 재취업? JACK은 창업 반대합니다."
- "이 사람 계속 만날까요? LUCIA와 JACK의 판단이 갈립니다."
- "삼성전자, 지금 중요한 건 가격보다 투자 기간입니다."

---

### 2. 웹툰식 말풍선

4명 페르소나는 긴 보고서를 쓰는 사람이 아니라
짧고 선명하게 충돌하는 캐릭터여야 한다.

원칙:

- 한 페르소나당 2~3줄 우선
- 첫 문장은 캐릭터답게
- 같은 문장 반복 금지
- 말싸움이 아니라 유저를 위한 관점 충돌

---

### 3. 뉴스식 헤드라인

결정형 질문에는 제목처럼 읽히는 핵심 문장이 필요하다.

예:

- "창업보다 먼저 현금흐름을 확인해야 합니다."
- "관계의 핵심은 감정보다 반복 행동입니다."
- "투자 판단은 가격보다 기간이 먼저입니다."

---

### 4. 다음화 구조

PersonaX는 답변에서 끝나면 안 된다.

결정 이후 다시 돌아올 이유를 만들어야 한다.

예:

- "2주 뒤 이 결정 다시 확인하기"
- "지난번 결정과 무엇이 달라졌나요?"
- "그때 세운 다음 행동을 실행했나요?"

---

### 목표

PersonaX의 체류시간은 긴 답변이 아니라
자기 문제에 대한 몰입에서 나온다.

재방문은 단순 기억이 아니라
결정의 후속 점검에서 나온다.

최종 UX 방향:

쇼츠처럼 시작하고,
웹툰처럼 캐릭터가 살아 있고,
뉴스처럼 핵심이 선명하며,
Decision OS처럼 결정과 재점검으로 닫는다.

---

## 18. 문서 운영 원칙

- PROJECT_NOTES.md = 개발 로그 / 시행착오 기록
- PERSONAX_MASTER_PLAN.md = 공식 North Star / 장기 설계도
- 실제 작업 우선순위는 항상 현재 코드 상태와 테스트 결과를 기준으로 조정한다.
