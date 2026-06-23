# Plan: Intent Resolver

## 배경
decision type/intent 분류 로직이 message-router, intent-resolver, decision-summary 등 여러 곳에 분산되어 있었다.
최근 refactor (intent resolver wrapper, decision type 통합)로 단일 경로로 모으는 작업이 진행됨.

## 목표
- decision type 판정 경로를 단일화한다
- 신규 카테고리/키워드 추가 시 수정 지점을 1곳으로 제한한다
- qa:intent 회귀 테스트로 분류 정확도를 추적한다

## 완료
- intent resolver wrapper 도입
- decision type 단일 resolver로 통합
- qa:intent runner 추가

## 남은 작업
- [ ] resolver 단위 테스트 보강 (edge case: 복합 질문, 모호한 질문)
- [ ] qa:intent 결과를 PR 체크리스트에 자동 포함
- [ ] 레거시 분류 분기(불필요 코드) 정리 여부 검토

## 위험 요소
- 분류 경로 변경 시 기존 회귀 케이스가 깨질 수 있음 → qa:intent 결과 비교 필수
