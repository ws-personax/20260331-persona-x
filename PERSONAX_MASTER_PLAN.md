#  비용 폭주 방지 원칙 (최우선)

PersonaX 개발의 최우선 운영 원칙은 비용 통제이다.

## 핵심 원칙

구조 정리 작업에서 API 비용을 태우지 않는다.

코드 리팩토링, 파일 분리, 변수명 변경, 컴포넌트 추출, GitHub 설정 변경, 문서 수정은 원칙적으로 LLM API 호출 없이 검증한다.

## 기본 검증 절차

허용:
- git diff
- npx tsc --noEmit
- 정적 분석
- 로그 분석
- 코드 리뷰

우선 수행:
1. 코드 확인
2. 변경 범위 확인
3. 타입 체크
4. 영향 범위 분석

## 금지 사항

다음 상황에서는 promptfoo 또는 실제 질문 테스트를 실행하지 않는다.

- 단순 리팩토링
- 파일 분리
- 함수 추출
- 변수명 변경
- GitHub Action 수정
- Issue Template 수정
- README 및 문서 수정

## Promptfoo 사용 원칙

promptfoo는 최종 검증 도구이다.

다음 경우에만 사용한다.

- 기능 구현 완료 후
- 사용자 경험에 직접 영향을 주는 변경
- 프롬프트 수정
- 분류기(classifier) 수정
- Persona 규칙 수정
- Decision Summary 수정

## 실제 질문 테스트 원칙

실제 질문 테스트는 최소 횟수만 수행한다.

권장:
- 최종 검증 단계에서 1~2회

금지:
- 작은 수정마다 반복 테스트
- 동일 질문 반복 테스트
- 원인 확인 없이 무분별한 재실행

## GitHub Actions 원칙

promptfoo eval은 자동 실행하지 않는다.

필요한 경우에만 GitHub Actions에서 수동 실행한다.

## 개발 원칙

작은 수정 → 정적 검증

큰 수정 → 정적 검증 → 최종 검증

항상 먼저 분석하고, 마지막에만 비용을 사용한다.

---
# 비용 폭주 방지 원칙

구조 정리 작업에서 API 비용을 태우지 않는다.

작은 수정:
- promptfoo 금지
- 반복 질문 금지
- Production 반복 테스트 금지

우선:
1. 코드 분석
2. git diff
3. npx tsc --noEmit
4. 로그 확인

실제 LLM 호출은 마지막 1~2회만 수행한다.

---

# PERSONAX_MASTER_PLAN.md

# PersonaX North Star Document (2026-05-31)

이 문서는 현재 구현 완료 목록이 아니라 PersonaX의 North Star / 장기 설계도이다.

## 1. 북극성

**PersonaX = 사용자의 의사결정 성장률을 높이는 시스템**

질문 → 결정 → 실행 → 성장 → 재방문

모든 기능 추가 전 질문:

> "이 기능이 사용자의 의사결정 성장률을 높이는가?"

YES → 개발  
NO → 보류

## IMPORTANT (2026-05-31)

PersonaX는 AI 토론 앱이 아니다.

PersonaX는 사용자의 결정을 기억하고 성장시키는 Decision OS이다.

## 최종 종착역 (2026-06-02)

PersonaX의 최종 목표는 질문에 답하는 AI가 아니다.

PersonaX는 사용자의 삶을 기억하고,
결정을 기록하고,
결과를 함께 돌아보며,
사용자가 어떤 사람으로 성장하고 있는지 이해하는
4명의 전문가 친구 네트워크다.

외부 표현:

**나를 기억하는 4명의 전문가 친구**

내부 설계:

**Personal Operating System**

## Trust & Memory Core

Personal Memory 구현 전에 Trust & Memory Core를 먼저 설계한다.

Trust는 모든 레이어의 기반이다.

핵심 원칙:

- 고민 데이터 광고 활용 금지
- 개인 기억과 익명 집계 데이터 분리
- 사용자가 기억 삭제 가능
- 익명 통계는 동의 기반
- 사용자의 편에 서는 서비스
- Trust는 약속이 아니라 사용자가 검증할 수 있는 구조여야 한다

### Memory 3분류

#### Private Memory
개인 기억. 통계/광고/외부 활용 금지.

#### Decision Outcome Data
결정, 실행 여부, 만족도, 결과. 익명 집계 가능.

#### Temporary Context
현재 대화용 맥락. 저장하지 않을 수 있음.

### 장기 구조

Decision Memory
↓
Personal Memory
↓
Life Graph
↓
Identity Graph
↓
Agent Layer

### 현재 리팩토링 의미

현재 route.ts 오케스트레이터화, classifier 분리, response-builder, response-guard 안정화는
최종적으로 Trust & Memory Core, Life Graph, Agent Layer를 붙이기 위한
Layer 3 Decision Engine 기반 공사다.

현재 최우선 과제:

1. auth.ts 분리 (resolveUserId: Kakao/Supabase 통합, Account Linking·Personal Memory 기초 공사)
2. ChatWindow.tsx 분리
3. route.ts 오케스트레이터화
4. Account Linking 설계
5. Personal Memory 구현

모든 신규 기능보다 아키텍처 안정화를 우선한다.

## 비용 폭주 방지 원칙

PersonaX는 작은 리팩토링마다 실제 LLM/API 호출을 반복하지 않는다.

### 절대 원칙
- 작은 UI 분리, 파일 이동, 타입 정리 작업에서는 promptfoo 실행 금지
- 작은 리팩토링 검증은 기본적으로 npx tsc --noEmit만 사용
- 실제 서비스 질문 테스트는 꼭 필요한 경우에만 1~2개로 제한
- Gemini / OpenAI / Claude API 호출이 발생하는 테스트는 비용 작업으로 간주
- 디버그 목적의 반복 질문 금지
- Vercel Production에서 반복 테스트 금지
- 가능한 경우 로컬 mock / 로그 / 정적 분석으로 먼저 검증

### promptfoo 실행 기준
promptfoo는 아래 경우에만 실행:
1. route.ts 응답 흐름 변경
2. classifier / guard / prompt 변경
3. Stage 1/2/3 LLM 파이프라인 변경
4. 투자/감정/의사결정 품질에 직접 영향이 있는 변경
5. 배포 전 최종 회귀 확인

### 작은 작업 검증 기준
작은 작업은 아래로 충분:
1. npx tsc --noEmit
2. git diff 확인
3. 변경 파일 범위 확인
4. 필요 시 수동 테스트 1회

### 비용 사고 방지
- 테스트 전 “이 작업이 실제 LLM 호출을 만드는가?”를 먼저 확인
- Gemini 월 spending cap 초과 가능성을 항상 고려
- API 한도 초과 시 fallback 답변을 품질 문제로 오해하지 말 것
- 디버그 로그로 원인을 확인한 뒤 반복 질문 테스트를 멈출 것

### 운영 문구
6월 리팩토링의 목표는 기능 추가가 아니라 구조 정리다.
구조 정리 과정에서 API 비용을 태우지 않는다.

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

## HRM (Hierarchical Reasoning Model) 적용 원칙

### 핵심 원칙

- HRM은 모델 교체 대상이 아니다.
- HRM은 PersonaX 아키텍처 설계 참고용이다.
- PersonaX는 HRM의 "상위 판단 → 하위 판단" 구조를 채택한다.

### PersonaX 구조

L0 Question
사용자 질문

↓

L1 Decision Context
질문의 domain, decisionType, forbiddenTerms 판정

↓

L2 Decision Frame
questionType, conflictLevel, criteria 정의

↓

L3 Persona Debate
RAY / JACK / LUCIA / ECHO 관점 충돌

↓

L4 Decision Summary
최종 결론 생성

↓

L5 Review Card
결정 재검토

↓

L6 Personal Memory
장기 기억 및 의사결정 추적

### 현재 우선순위

2026년 6월:

- Decision Context Layer
- ChatWindow 분리
- route.ts 오케스트레이터화

2026년 7월:

- Personal Memory 구현

### 제품 방향

PersonaX는 답변 품질 경쟁보다
의사결정 기억 경쟁을 목표로 한다.

핵심 원칙:

"80점 답변 + 100점 기억"이
"95점 답변 + 기억 없음"을 이긴다.

### 개발 우선순위 기준

1순위:

- 사용자가 떠나는 버그
- 저장 실패
- 로그인 문제
- History 문제
- 비용 폭주

2순위:

- Decision Context
- Review Card
- Decision Memory
- Personal Memory

3순위:

- 답변 문체 개선
- 페르소나 표현 개선
- 출력 미세 품질 개선

주의:
HRM 관련 구현은 대규모 구조 변경으로 진행하지 않는다.
Decision Context → Decision Frame → Memory 순으로 작은 PR 단위로 진행한다.

---

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

## 14. 현재 상태 (2026-05-31)

### 완료

- Decision Frame
- Decision Summary
- History API
- Decision Memory 저장
- conversations 테이블 확장
- Review Card MVP
- Market Data Fact Lock
- /api/history dynamic route 수정
- 모바일 History 임시 조치 완료, 표시 정상 동작
  - Kakao ↔ Supabase 세션 구조는 근본 미해결
  - auth.ts 정리 이후 재점검 필요

### 진행 중

- auth.ts 분리 (resolveUserId: Kakao/Supabase 통합)
- ChatWindow.tsx 분리
- route.ts 오케스트레이터화

### 예정

- Account Linking
- Personal Memory

---

## 15. 로드맵

### June 2026

### Week 1

- auth.ts 분리 (resolveUserId 함수: Kakao / Supabase 통합 추출)

목적:

- 사용자 식별 로직 중앙화
- Personal Memory 준비
- Account Linking 준비

범위:

- resolveUserId 추출
- Kakao 식별 로직 통합
- Supabase 식별 로직 통합
- route.ts 중복 제거

금지:

- 저장 정책 변경
- Account Linking 구현
- Personal Memory 구현
- saveConversation guard 변경
- saveTeaConversation 수정

- conversations.user_id nullable 추가
- lib/personax/utils.ts 추출 (chunkText, normalizeDetails, firstParagraph)

### Week 2

- ChatWindow.tsx 분리 시작
- UI 단위로 1개씩 분리
- 기능 변경 금지
- 계정 통합 로직 구현 금지

### Week 3

- route.ts 분리
- classifier.ts 분리
- error handling 통일
- console.log 제거

### Week 4

- users 테이블 설계
- user_identities 테이블 설계
- Account Linking 설계

원칙:

6월 = 길만 깔기

### July 2026

- Personal Memory 구현

원칙:

7월 = 차를 달리게 하기

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
- Codex/Claude가 가장 먼저 읽는 문서
- 실제 작업 우선순위는 항상 현재 코드 상태와 테스트 결과를 기준으로 조정한다.

---

## 19. History Architecture

History는 채팅 기록이 아니다.

History는 Decision Session Archive 이다.

목표:

사용자가 과거 결정을 다시 확인할 수 있게 한다.

원칙:

- 질문 제목 우선
- 날짜보다 의사결정 맥락 우선
- 한 화면에 최대한 많은 질문 표시

예시:

창업 vs 재취업 어떻게 해야 할까요?

삼성전자 지금 사야 할까요?

이 사람 계속 만나도 될까요?

향후:

클릭 시

- 전체 대화 복원
- Decision Summary
- Review 상태

주의:

전체 대화 복원 기능은 6월 리팩토링 범위가 아니다.
Personal Memory 이후 단계적으로 진행한다.

---

## 20. Decision Loop

PersonaX의 핵심은 개별 기능이 아니다.

History
→ Review Card
→ Personal Memory

는 하나의 루프이다.

질문
↓
Decision Summary
↓
History
↓
Review Card
↓
Personal Memory
↓
다음 질문

6월 리팩토링 목표는
새 기능 추가가 아니라
이 루프가 끊기지 않게 구조를 정리하는 것이다.

---

## 21. Account Linking Strategy

목표:

Google / Kakao 계정 통합

구조:

users

user_identities

conversations.user_id

설계 원칙:

provider + providerUserId → PersonaX appSession → user_id

예:
- Kakao  → provider: kakao,  providerUserId: kakao_123
- Google → provider: google, providerUserId: google_abc

route.ts는 provider 종류를 알 필요 없음
session.ts가 appSession → user_id 변환 담당

Personal Memory 준비 조건:
conversations.user_id 안정화 + auth.ts 분리 필수

사전 준비:

Week 1 auth.ts 분리를 통해
사용자 식별 로직을 중앙화한다.

Week 2 conversations.user_id nullable 추가로
DB 준비를 완료한다.

Week 4 설계 이후
7월 Personal Memory 구현 전에
Account Linking을 연결한다.

원칙:

- 6월 설계
- 7월 구현

주의:

계정 통합 로직은
Personal Memory 이전에는 구현하지 않는다.

---

## 22. June 2026 Refactoring Rules

반드시 수행:

- conversations.user_id nullable 추가
- classifier.ts 분리
- console.log 제거
- error handling 통일
- ECHO 후처리 제거

금지:

- route.ts 대규모 재작성
- Personal Memory 선구현
- Account Linking 선구현
- History 전체 대화 복원 구현
