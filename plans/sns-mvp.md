# Plan: SNS MVP

## 배경
PersonaX 결정 기록을 공유 가능한 형태로 확장하기 위해 SNS형 구조(Room/Thread/Speaker)와
공유 페이로드 포맷터가 먼저 도입됨.

## 목표
- 사용자의 결정을 안전하게 공유할 수 있는 최소 구조를 만든다
- Room/Thread/Speaker 타입을 기반으로 다중 화자 대화 흐름을 표현한다
- PERSONAX_MASTER_PLAN.md의 4가지 우선순위 기준(이해받음/자기발견/여정 인식/다음 결정 개선)에 부합하는 범위로 한정한다

## 완료
- SNS Room/Thread/Speaker 타입 구조 정의
- safe share payload formatter 추가

## 남은 작업
- [ ] Room/Thread 생성·조회 API 설계
- [ ] 공유 시 개인정보/민감정보 마스킹 정책 정의
- [ ] 공유된 결정에 대한 Review Card 연동 여부 결정
- [ ] MVP 범위 확정 (읽기 전용 공유 vs 상호작용 가능 공유)

## 위험 요소
- 공유 기능 확장 시 비용 폭주 방지 원칙(PERSONAX_MASTER_PLAN.md)을 위반하지 않도록 LLM 호출 없는 정적 공유 우선
