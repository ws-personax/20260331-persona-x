# app/api/chat/route.ts 구조 분석

분석 기준: `app/api/chat/route.ts` 정적 코드 분석. 코드 수정, LLM/API 호출, promptfoo 실행 없음.

## 1. 전체 함수 목록

| 함수 | 줄번호 | 역할 | 주요 외부 의존성 | 분리 가능 여부 | 분리 난이도 |
|---|---:|---|---|---|---|
| `getModelTimeoutMs` | 129 | Gemini 모델명 기준 타임아웃(ms) 결정 | 없음 | 높음 | 낮음 |
| `isRetriableModelError` | 133 | Gemini/LLM 오류가 재시도 가능한지 판정 | 없음 | 높음 | 낮음 |
| `toAnthropicMessages` | 158 | 내부 `TeaMsg`를 Anthropic 메시지 포맷으로 변환 | `Anthropic.MessageParam` | 높음 | 낮음 |
| `callClaudeHaiku` | 170 | Claude Haiku 호출, 실패 시 `null` 반환 | `anthropicClient`, `Anthropic`, env `ANTHROPIC_API_KEY` | 높음 | 중간 |
| `buildTeaHistory` | 237 | 원본 messages에서 페르소나별 대화 이력 재구성 | `TeaMsg`, `TeaPersonaKey` | 높음 | 낮음 |
| `toGeminiContents` | 261 | 내부 `TeaMsg`를 Gemini contents 포맷으로 변환 | Google Generative AI content shape | 높음 | 낮음 |
| `callTeaPersona` | 291 | tea 페르소나 LLM 호출 진입점. Claude 우선, Gemini fallback, 검색 옵션 처리 | `callClaudeHaiku`, `teaGenAI`, `removeDangsin`, `sleep`, env `GOOGLE_GENERATIVE_AI_API_KEY` | 높음 | 중간 |
| `getSupabase` | 400 | anon Supabase client 생성 | `createClient`, env Supabase anon vars | 높음 | 낮음 |
| `getAdminSupabase` | 408 | service-role Supabase client 생성 | `createClient`, env service role vars | 높음 | 낮음 |
| `callOptionD` | 439 | `runRoutedRequest`에 LLM caller와 라우터 입력을 연결하는 wrapper | `routeMessage`, `runRoutedRequest`, `callTeaPersona` | 중간 | 중간 |
| `callOptionDWithStage3Guard` | 494 | Option D 호출 후 Stage 3 품질 위반 감지 시 1회 재생성 | `callOptionD`, `detectStage3GuardViolations`, `detectEmotionalSubtypeHee` | 중간 | 중간 |
| `callTaggedRound2` | 556 | tagged 2라운드 프롬프트 구성, ECHO 호출, 파싱 | `buildTaggedRound2SystemPrompt`, `buildTaggedRound2UserPrompt`, `parseTaggedRound2`, `callTeaPersona` | 높음 | 중간 |
| `POST` | 603 | `/api/chat` 전체 요청 처리. 라우팅, LLM 호출, 투자 분석, 저장, 응답 생성 | 거의 모든 import | 낮음 | 높음 |

## 2. POST 내부 로컬 함수와 역할

| 함수 | 줄번호 | 역할 | 주요 의존성 | 분리 가능 여부 | 분리 난이도 |
|---|---:|---|---|---|---|
| `hasExplicitConnector` | 654 | 이전 대화와 연결되는 표현 감지 | `explicitConnectorPatterns` | 높음 | 낮음 |
| `applyV3OrderOverride` | 697 | V3 FIRST/CLOSER 결정으로 페르소나 순서 강제 | `_firstPersonaV3`, `_closerPersonaV3`, `_orderCategory`, `enforceOrder` | 중간 | 낮음 |
| `respond` | 721 | `Response.json` wrapper. 필요 시 `luciaIntro` 주입 | `_shouldInjectLuciaIntro`, `luciaRoutingMsg` | 중간 | 낮음 |
| `getOrBuildMarketDataContext` | 732 | marketData prompt context 캐싱 | `marketDataContextCache`, `buildMarketDataPromptContext` | 높음 | 낮음 |
| `hasMarketDataForGuard` | 743 | response guard용 marketData 존재 여부 판정 | `detectQuestionType`, `getOrBuildMarketDataContext` | 높음 | 낮음 |
| `getMarketDataSourceLabelForGuard` | 755 | response guard 이후 출처 라벨 생성 | `getOrBuildMarketDataContext` | 높음 | 낮음 |
| `appendMarketDataSourceLabel` | 773 | 페르소나 텍스트 중 하나에 데이터 출처 라벨 부착 | `personaText` | 높음 | 낮음 |
| `streamRespond` | 795 | NDJSON 스트리밍 Response 생성 | `ReadableStream`, `TextEncoder`, `PERSONA_FALLBACK` | 높음 | 중간 |
| `send` | 801 | `streamRespond` 내부 NDJSON 이벤트 enqueue | `controller`, `encoder` | 낮음 | 낮음 |
| `runOrchestrator` | 839 | 토론 디렉터 LLM 호출로 순서/각도/충돌 계획 생성 | `callTeaPersona`, `createFallbackDebatePlan`, `parseDebatePlanJson` | 높음 | 중간 |
| `buildFinanceMultiPersonaResponse` | 871 | 이름은 finance지만 실제로 generic Option D 스트리밍 빌더 역할 | `runOrchestrator`, `streamRespond`, `callOptionDWithStage3Guard`, `applyResponseGuard`, `saveConversation` | 중간 | 높음 |
| `detectTargetedPersona` | 879 | ECHO 응답의 마지막 질문 대상 페르소나 추출 | 정규식 | 높음 | 낮음 |
| `recentContext` IIFE | 890 | 최근 user/assistant 맥락 요약 생성 | `messages`, `summarize`, `cleanJackEnding`, `cleanEchoSelfReference`, `shouldWeakenContext` | 중간 | 중간 |
| `priorRayResponse` IIFE | 942 | 이전 RAY 응답 일부 추출 | `messages` | 높음 | 낮음 |
| `streamPersonaTagged` | 1009 | 페르소나 텍스트를 chunk 단위로 스트리밍 전송 | `chunkText`, `send` | 높음 | 낮음 |
| `saveUnifiedConversation` | 1022 | tagged/Option D 대화 저장 | `resolveChatSession`, `createServerSupabase`, `saveConversation`, `DecisionSummary` | 높음 | 중간 |
| `priorAssistant` IIFE | 1252 | 2라운드용 직전 assistant/personas 메시지 추출 | `messages` | 높음 | 낮음 |
| `priorUserQuestion` IIFE | 1277 | 2라운드에서 원 질문 추출 | `messages`, `msg` | 높음 | 낮음 |
| `descChange` | 1986 | 등락률을 장 결과 설명 문자열로 변환 | 없음 | 높음 | 낮음 |
| `summarizeStock` | 2278 | 추천 종목 카드용 종목 상태 요약 | market data shape | 높음 | 낮음 |
| `prevIsCryptoKeyword` | 2566 | 이전 키워드가 crypto인지 판정 | crypto keyword list | 높음 | 낮음 |
| `rayTimeNote` IIFE | 2734 | RAY 시세 기준 날짜/휴장 메모 생성 | calendar helpers, market status vars | 중간 | 낮음 |
| `finalRay` IIFE | 2757 | legacy 투자 상세 경로의 RAY 본문 생성 | `marketData`, `vix`, `prevCtx`, `getSector` | 중간 | 중간 |
| `rayFmtVol` | 2765 | RAY 거래량 표시 포맷 | 없음 | 높음 | 낮음 |
| `fmtPx` | 2954 | 상세 패널용 가격 포맷 | `currency` | 높음 | 낮음 |
| `fmtVol` | 2956 | 상세 패널용 거래량 포맷 | 없음 | 높음 | 낮음 |
| `cleanNewsItem` | 3173 | 뉴스 제목/URL 정리 | `NewsRaw` | 높음 | 낮음 |
| `getUrl` | 3194 | 뉴스 URL 우선순위 추출 | `NewsRaw` | 높음 | 낮음 |

참고: `saveInvestmentHistoryWithTimeout` 함수명은 현재 파일에 존재하지 않는다. 해당 역할은 3217~3235의 `saveHistory` + `Promise.race` 타임아웃 블록이 직접 수행한다.

## 3. 큰 흐름별 구조

### 3.1 모듈 상단 LLM/클라이언트 유틸

- 줄 123~147: Gemini 모델명, fallback chain, timeout, retriable error 판정.
- 줄 154~227: Claude Haiku client와 호출 함수.
- 줄 237~389: tea persona 히스토리 변환, Gemini contents 변환, Claude/Gemini 통합 호출.
- 줄 400~418: Supabase client 생성.

분리 가능성: 높음. `callTeaPersona` 주변은 `lib/personax/llm/tea-persona-client.ts` 같은 파일로 옮기기 적합하다.

### 3.2 Option D / tagged orchestration wrapper

- 줄 421~487: `OptionDRound1Result`, `callOptionD`.
- 줄 494~550: Stage 3 guard 포함 재호출 wrapper.
- 줄 556~584: tagged round2 호출.

분리 가능성: 중간. `callTeaPersona` 주입 구조는 이미 좋지만, `route.ts`의 타입/import와 라우터 결정값에 기대고 있어 한 번에 빼기보다는 LLM client 분리 후 옮기는 편이 안전하다.

### 3.3 POST 초기 라우팅

- 줄 603~622: request logging, rate limit.
- 줄 624~699: body 파싱, legacy/V3 category, router decision, order override 준비.
- 줄 721~787: response wrapper와 marketData guard helper.
- 줄 795~865: streaming response와 orchestrator plan helper.

분리 가능성: 중간. 순수 판정 로직은 분리 가능하지만 `req`, `messages`, `_routerDecision` 캡처가 많다.

### 3.4 Generic Option D 스트리밍 경로

- 줄 871~1385: `buildFinanceMultiPersonaResponse`.
- 줄 986~1384: tagged round1/round2 스트리밍, guard, fallback, 저장, done event.
- 줄 1022~1069: `saveUnifiedConversation`.

분리 가능성: 중간. 기능상 가장 먼저 분리하고 싶은 큰 블록이지만 클로저 의존성이 많다. `req`, `messages`, `category`, `_categoryV3`, `_routerDecision`, `respond`, `streamRespond`, guard helper를 명시 인자로 바꾸면 분리 가능하다.

### 3.5 teaMode/news/general/life 분기

- 줄 1394~1456: 보편 solo 조기 종료.
- 줄 1464~1586: news 4페르소나 + 검색 grounding + 2라운드.
- 줄 1595~1601: teaMode finance/general은 `buildFinanceMultiPersonaResponse`로 위임.
- 줄 1603~1784: deprecated 성격의 단일 페르소나 fallback/legacy tea response.

분리 가능성: 중간. news handler는 별도 파일로 분리하기 좋고, 단일 페르소나 fallback은 deprecated 성격이라 정리 우선순위는 낮다.

### 3.6 advanced 투자 철학 질문

- 줄 1790~1837: advanced 4페르소나 병렬 LLM 호출, details split, tea conversation 저장.

분리 가능성: 높음. 입력과 출력이 비교적 명확하다.

### 3.7 legacy 투자 템플릿/시세 경로

- 줄 1856~2359: 추천/시장 분위기/포트폴리오/섹터/거래량 등 사전 질문 핸들러.
- 줄 2361~2411: keyword/currency/session/marketData/news fetch, 데이터 미수급 처리.
- 줄 2413~2594: 뉴스 필터, 장 상태, scoring, trend/conflict/context 계산.
- 줄 2604~3169: JACK/LUCIA/RAY/ECHO 본문과 details 생성.
- 줄 3171~3210: 뉴스 배정.
- 줄 3217~3235: `saveHistory` 저장 타임아웃 처리.
- 줄 3237~3264: 최종 response.

분리 가능성: 낮음~중간. 가장 결합도가 높은 구간이다. scoring/template는 이미 일부 모듈화되어 있으나 route 내부에서 market status, prev context, details, response shape가 강하게 섞여 있다.

## 4. 외부 의존성

### 4.1 외부 SDK/API

- `@google/generative-ai`: Gemini persona 호출, Google Search grounding.
- `@anthropic-ai/sdk`: Claude Haiku primary 호출.
- `@supabase/supabase-js`: anon/service role Supabase client.
- `next/server`: `NextRequest`, `Response`.

### 4.2 내부 모듈

- `@/lib/news`: `fetchInvestmentNews`.
- `@/lib/personax/scoring`: 투자 점수, 변동성, 거래량, 뉴스 감성, entry condition, conflict 계산.
- `@/lib/personax/market`: keyword/asset/market data/sector 관련.
- `@/lib/personax/calendar`: 한국장 휴장/전 거래일 계산.
- `@/lib/personax/guards`: ECHO/JACK 후처리, Stage 3 guard.
- `@/lib/personax/templates`: legacy 투자 persona 템플릿.
- `./prompts/tea-*`, `./prompts/advanced-*`: persona system prompts.
- `./prompts/orchestrator-tagged`: tagged prompt builder/parser/order classifier.
- `@/lib/personax/classifier`: category/emotional subtype/legacy category.
- `@/lib/personax/message-router`: route decision, Option D run.
- `@/lib/personax/utils`: text chunking, cleanup, summarize, sleep.
- `@/lib/rate-limit`: IP rate limit.
- `@/lib/personax/text-format`: advanced/news text cleanup and bubble split.
- `@/lib/personax/fallbacks`: persona fallback.
- `@/lib/personax/history`: conversation/history save.
- `@/lib/personax/auth`: session resolve.
- `@/lib/personax/response-guard`: question type and response guard.
- `@/lib/personax/market-data`: marketData prompt context.
- `@/lib/personax/streaming`: tagged result mapping.
- `@/lib/personax/debate-plan`: orchestrator JSON plan fallback/parser.

### 4.3 환경 변수

- `GEMINI_PRIMARY_MODEL`
- `GEMINI_FALLBACK_MODEL`
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `ANTHROPIC_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## 5. 분리 가능 여부 요약

| 영역 | 분리 가능 여부 | 이유 |
|---|---|---|
| LLM client/format conversion | 높음 | 입력/출력이 명확하고 route request 상태 의존이 적음 |
| Supabase client factory | 높음 | env 기반 순수 factory |
| tagged round2 호출 | 높음 | prompt build + call + parse 구조가 독립적 |
| advanced 질문 handler | 높음 | 별도 prompt, 별도 response shape, 의존성 제한적 |
| response/marketData guard helper | 높음 | 캐시와 helper 인자만 정리하면 독립 가능 |
| streaming wrapper | 높음 | `StreamEvent` 타입만 외부화하면 독립 가능 |
| orchestrator plan 생성 | 높음 | `callTeaPersona`를 인자로 받으면 독립 가능 |
| generic Option D 스트리밍 handler | 중간 | 기능상 독립 가능하지만 `POST` 클로저 의존이 큼 |
| news 4페르소나 handler | 중간 | 검색/저장/응답 wrapper 의존이 있으나 블록 경계가 명확 |
| legacy 사전 질문 handlers | 중간 | 각 handler는 분리 가능하나 현재는 하나의 긴 조건 체인 |
| legacy stock detail full path | 낮음 | scoring, market status, templates, details, save, response가 한 블록에 결합 |
| `POST` 전체 | 낮음 | 모든 경로의 조정자 역할이라 직접 분리 대상이 아니라 orchestration shell로 남기는 것이 적합 |

## 6. 추천 분리 순서

1. LLM client 분리
   - 대상: `getModelTimeoutMs`, `isRetriableModelError`, `toAnthropicMessages`, `callClaudeHaiku`, `buildTeaHistory`, `toGeminiContents`, `callTeaPersona`.
   - 이유: route 내부 상태 의존이 적고 재사용 가능성이 높다.

2. Supabase/session 저장 helper 분리
   - 대상: `getSupabase`, `getAdminSupabase`, `saveUnifiedConversation`, legacy `saveHistory` timeout block.
   - 이유: 저장 로직이 응답 생성과 섞여 있어 장애 원인 추적이 어렵다.

3. streaming/response helper 분리
   - 대상: `respond`, `streamRespond`, `streamPersonaTagged`, marketData source label helpers.
   - 이유: 모든 경로에서 반복되는 응답 포맷 책임을 분리할 수 있다.

4. Option D handler 분리
   - 대상: `callOptionD`, `callOptionDWithStage3Guard`, `buildFinanceMultiPersonaResponse`.
   - 이유: 현재 life/finance/general의 핵심 경로라 변경 빈도가 높다. 단, 앞 단계 helper 분리 후 진행하는 것이 안전하다.

5. news handler 분리
   - 대상: news 카테고리 4페르소나 + 2라운드 블록.
   - 이유: 독립된 검색 grounding 경로이고 legacy 투자 경로와 성격이 다르다.

6. advanced handler 분리
   - 대상: `isAdvancedQuestion` 블록.
   - 이유: 비교적 쉬운 분리지만 핵심 병목은 아니므로 LLM client 분리 후 진행.

7. legacy 사전 질문 핸들러 분리
   - 대상: 시장 분위기, 코인 결론, 포트폴리오, 섹터 타이밍, 거래량, 추천 질문 등.
   - 이유: 조건 체인이 길어 route 가독성을 크게 해친다.

8. legacy stock detail path 분리
   - 대상: marketData fetch 이후 scoring/details/final response 전체.
   - 이유: 결합도가 가장 높아 마지막에 진행해야 한다.

## 7. 예상 생성 파일

| 파일 | 포함 대상 |
|---|---|
| `lib/personax/llm/tea-persona-client.ts` | `TeaPersonaKey`, `TeaMsg`, Claude/Gemini 변환과 `callTeaPersona` |
| `lib/personax/llm/model-retry.ts` | `getModelTimeoutMs`, `isRetriableModelError`, retry delay/chain 상수 |
| `lib/personax/supabase-clients.ts` | `getSupabase`, `getAdminSupabase` |
| `lib/personax/conversation-save.ts` | `saveUnifiedConversation`, investment history timeout 저장 helper |
| `lib/personax/route-response.ts` | `respond`, `streamRespond`, `StreamEvent`, source label append helper |
| `lib/personax/option-d-handler.ts` | `callOptionD`, `callOptionDWithStage3Guard`, generic Option D streaming handler |
| `lib/personax/news-handler.ts` | news 4페르소나 검색 grounding + 2라운드 응답 |
| `lib/personax/advanced-handler.ts` | advanced 투자 철학 4페르소나 응답 |
| `lib/personax/legacy-market-handlers.ts` | 시장 분위기/포트폴리오/섹터/거래량/추천 질문 등 사전 질문 handlers |
| `lib/personax/legacy-stock-detail.ts` | marketData 기반 legacy 종목 상세 분석 response builder |
| `lib/personax/route-context.ts` | category/router/order/context 계산, explicit connector 감지 |

## 8. 주의할 점

- `buildFinanceMultiPersonaResponse`는 이름과 달리 finance 전용이 아니라 life/general/emotional까지 흘러가는 generic Option D 경로로 쓰인다. 파일명 변경 또는 wrapper 이름 정리가 필요하다.
- `POST` 내부 helper들은 대부분 `req`, `messages`, `category`, `_categoryV3`, `_routerDecision`, `respond`를 클로저로 참조한다. 분리 전에는 인자 구조를 먼저 정리해야 한다.
- legacy 투자 경로는 이미 `scoring`, `market`, `templates`로 일부 분리되어 있지만 최종 조립과 details 생성이 `route.ts`에 남아 있다.
- `saveInvestmentHistoryWithTimeout`이라는 독립 함수는 없다. 분리 시 새로 만들 수 있는 후보명이다.
