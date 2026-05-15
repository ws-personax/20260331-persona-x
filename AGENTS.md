# PersonaX — Codex 작업 가이드

## 프로젝트 개요

PersonaX는 4명 페르소나 AI 상담 서비스입니다. 비개발자 마스터가 Claude의 도움으로 개발 중이며, 40~50대 타겟의 "AI 사랑방" 컨셉입니다.

## 4명 페르소나

- **LUCIA** (이사) — 손예진 톤 + 캐시 우드 관점 (감정/혁신/변곡점)
- **JACK** (팀장) — 마동석 톤 + 하워드 막스 관점 (사이클/비대칭/결단)
- **RAY** (대리) — 30대 MZ 퀀트 분석가 (거시 데이터/통계)
- **ECHO** (대표) — 손석희 톤 + 레이 달리오 관점 (검사+판사 판결)

## 기술 스택

- **프레임워크**: Next.js 14, TypeScript, Tailwind CSS
- **배포**: Vercel (https://20260331-persona-x.vercel.app)
- **DB**: Supabase
- **AI 모델**: Claude Haiku 4.5 (cache_control: ephemeral)
- **언어**: 한국어

## 핵심 파일 구조

```
app/api/chat/
  ├── route.ts (3687줄, 5월 후반 분리 예정)
  ├── prompts/
  │   ├── orchestrator-tagged.ts (메인 오케스트레이터)
  │   ├── orchestrator-screenplay.ts
  │   ├── tea-lucia.ts / tea-jack.ts / tea-ray.ts / tea-echo.ts (페르소나 톤)
  │   └── advanced-*.ts (재테크 전용)
components/
  ├── ChatWindow.tsx (3118줄, 5월 후반 분리 예정)
  └── AuthButton.tsx
```

## Codex 작업 영역 (이것만 해주세요)

### ✅ 환영하는 작업

1. **컴포넌트 분리** — 명확한 스펙으로 받은 UI 컴포넌트 추출
2. **백엔드 API** — Supabase 마이그레이션, RLS 정책, 인증
3. **표준 패턴 작업** — 카카오 로그인, Google 로그인, 라우팅
4. **데이터 페치 함수** — 외부 API 호출 모듈 분리
5. **테스트 작성** — Jest, Vitest 등
6. **문서화** — README, 주석, 타입 정의
7. **반복 작업** — 동일 패턴 반복 적용

### ❌ 절대 하지 말아야 할 작업

1. **페르소나 프롬프트 수정** — `orchestrator-*.ts`, `tea-*.ts`, `advanced-*.ts`
2. **호출 구조 변경** — 1차 데이터 수집 / 2차 가공 / 3차 대본 흐름
3. **비전 관련 결정** — 슬로건, 톤, 메시지
4. **`NAVER_CLIENT_SECRET` 환경 변수** — 절대 건드리지 말 것
5. **`tea-*.ts` 표현 톤** — 마스터+Claude 영역

## 작업 규칙

### 안전 원칙

1. **백업 확인**: 작업 시작 전 `D:\BACKUP\PersonaX-[날짜]` 폴더 존재 확인
2. **새 브랜치**: `git checkout -b feature/refactor-step-N`
3. **한 번에 한 가지**: 여러 변경 동시 금지
4. **기존 동작 100% 유지**: 리팩토링은 동작 보존이 절대 원칙
5. **main 직접 푸시 금지**: PR 생성 후 마스터 검토

### 검증 필수 (모두 통과 후 PR)

1. `npx tsc --noEmit` — TypeScript 컴파일 PASS (backups/ 외 에러 0개)
2. `npm run build` — 빌드 PASS
3. import/export 경로 정확
4. 타입 정의 누락 없음
5. 환경 변수 변경 없음

### 보고 형식

PR 본문에 다음 포함:
- 원본 파일 변경 (감소 라인 수)
- 새 파일 생성 (라인 수)
- import 경로 변경 목록
- 컴파일 결과
- 빌드 결과
- 위험도 평가 (🟢/🟡/🔴)

## 현재 진행 중 작업 (V25.7 로드맵)

### 5월 후반 (5/16~5/31)

1. **1순위**: 오케스트레이터 3호출 회귀 — **Claude Code 전담**
2. **2순위**: 자잘한 버그 + tsconfig.json exclude 정리
3. **3순위**: ChatWindow.tsx 5단계 분리
4. **4순위**: route.ts 4단계 분리

### 6월 (6/1~6/15)

5. **5순위**: 모바일 히스토리 + Supabase + 카카오 로그인 + 딸 합류

## 핵심 비전 원칙

- 수익 보장 금지 — "손실 방지 AI"
- 정보가 아니라 관계를 파는 서비스
- 40~50대 + ADHD/잡생각 많은 층
- 의존 아닌 결정 지원 — "떠나보내는 AI"
- 위기 감지 시 즉시 전문가 연결 (109/1393)
- 4명의 티키타카로 세상의 축소판

## 응답 형식

PR 메시지는 한국어로 작성. 코드 주석도 한국어 우선.

마스터(비개발자)가 읽기 쉽게:
- 무엇을 했는지 (목적)
- 어떻게 했는지 (변경 요약)
- 무엇을 안 했는지 (영향 범위 명시)
- 검증 결과 (PASS/FAIL)

## 비상 연락

문제 발생 시 작업 중단하고 마스터에게 보고. 절대 임의로 진행 금지.
