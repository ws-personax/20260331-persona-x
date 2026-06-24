# Intent Resolver V2

## 목적

복합 질문에서 하나의 의도가 소실되는 문제를 해결한다.

현재:

* categoryV3 1개
* decisionType 1개
* asset 1개

만 반환한다.

목표:

* splitNeeded
* primaryIntent
* secondaryIntent

구조를 도입하여 복합 질문을 보존한다.

---

## 1. splitNeeded 정의

### 단일 질문

예시:

* 비트코인은 언제쯤 상승할까?
* 행복이란 무엇인가?
* 친구와 손절해야 할까?

결과:

splitNeeded = false

---

### 복합 질문

예시:

* 행복이란 뭔가요? 근데 비트코인은?
* 친구와 손절할까요? 그리고 이직도 고민됩니다.
* 창업할까요? 그런데 요즘 코인도 오른다고 하던데.

결과:

splitNeeded = true

---

### 접속사 패턴

복합 질문 후보:

* 그리고
* 근데
* 그런데
* 또
* 그리고도

---

### 판정 기준

1차:
접속사 존재

2차:
앞 절과 뒤 절을 분리

3차:
각 절의 categoryV3 계산

4차:
서로 다르면

splitNeeded = true

---

## 2. primaryIntent / secondaryIntent

### 타입

primaryIntent

* categoryV3
* decisionType
* asset
* topic

secondaryIntent

* categoryV3
* decisionType
* asset
* topic

---

### 예시

질문:

행복이란 뭔가요?
근데 비트코인은?

결과:

primaryIntent:

* categoryV3: knowledge
* decisionType: knowledge
* asset: none
* topic: 행복

secondaryIntent:

* categoryV3: invest
* decisionType: buy_or_wait
* asset: crypto
* topic: 비트코인

---

## 3. 복합 질문 처리 방식

### 방식 A

첫 번째 의도만 사용

장점:

* 단순

단점:

* 의도 소실 발생

---

### 방식 B

첫 번째 + 두 번째 의도 보존

장점:

* 정보 손실 없음
* SNS Thread 확장 가능

단점:

* 구현 복잡도 증가

---

### 채택

방식 B 채택

---

## 4. QA 케이스

### Case 1

행복이란?
근데 비트코인은?

예상:

knowledge + invest

---

### Case 2

친구 손절?
이직도 고민

예상:

relationship + career

---

### Case 3

창업?
코인도 오른다

예상:

career + invest

---

### Case 4

삼성전자 사야?
부동산은?

예상:

invest + invest

---

### Case 5

어떻게 해야 할까요?

예상:

single
generic

---

### Case 6

미국 금리가 오르면 삼성전자는?

예상:

single
invest

---

## 5. SNS Thread 연결 방식

splitNeeded = true

↓

Thread 자동 생성

Thread A

* primaryIntent

Thread B

* secondaryIntent

---

예시

행복이란?
근데 비트코인은?

↓

Room

├ Thread A (행복)
└ Thread B (비트코인)

---

## 6. 구현 순서

Step 1
IntentResolution에 splitNeeded 추가

Step 2
primaryIntent / secondaryIntent 타입 추가

Step 3
복합 질문 감지 함수 추가

Step 4
route.ts 연결

Step 5
SNS Thread 분리 연결
