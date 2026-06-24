# PersonaX Agent Workflow

## 목적
마스터의 관리 부담을 줄이기 위해 QA, Fix, Reviewer, PR, Release, Roadmap, Master Agent가 어떤 순서로 협업하는지 정의한다.

## 전체 흐름

1. Master Agent
- 현재 상황을 분류한다
- 어떤 Agent를 사용할지 결정한다
- 한 번에 하나의 작업만 지시한다

2. Roadmap Agent
- 현재 main 상태와 plans/ 문서를 읽는다
- 오늘 우선순위 1개를 추천한다

3. QA Agent
- 수정 없이 문제를 재현/분석한다
- 실패 케이스와 수정 후보를 보고한다

4. Fix Agent
- 확정된 문제만 최소 수정한다
- tsc와 필요한 QA를 수행한다
- 커밋/푸시/PR 생성을 수행한다

5. Reviewer Agent
- PR diff를 검토한다
- 회귀 위험과 누락 검증을 확인한다
- 머지 권장/보류를 판단한다

6. PR Agent
- 포함 파일과 PR 본문을 검증한다
- gh pr create를 사용해 PR을 생성한다

7. Release Agent
- PR 머지 후 main 최신화
- 머지된 브랜치 정리
- git status 보고

## 표준 작업 파이프라인

### 버그 수정
Master → QA → Fix → Reviewer → PR → Release

### 리팩토링
Master → Roadmap → QA → Fix → Reviewer → PR → Release

### 문서/계획 추가
Master → Fix → PR → Release

### 위험도 높은 변경
Master → QA → Fix → Reviewer → QA 재확인 → PR → Release

## Agent 간 전달 형식

각 Agent는 다음 형식으로 결과를 남긴다.

A. 현재 상태
B. 수행한 작업
C. 발견한 문제
D. 다음 Agent에게 넘길 지시
E. 위험도
F. 최종 추천

## 운영 원칙

- 한 번에 하나의 PR만 진행한다
- 한 PR에 하나의 목적만 담는다
- 코드 변경 전 QA 또는 분석을 우선한다
- Reviewer는 수정하지 않는다
- Release는 소스 코드를 수정하지 않는다
- 마스터에게는 최종 판단만 요구한다
- 의심스러우면 수정하지 말고 보고한다

## PersonaX 현재 우선순위

1. 품질 안정화
2. Intent Resolver 완성
3. SNS MVP 준비
4. Personal Memory
