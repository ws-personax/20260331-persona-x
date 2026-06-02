# PersonaX Architecture Map

분석 기준: 정적 코드 분석. LLM/API 호출, promptfoo, 실제 질문 테스트, npm test는 실행하지 않았다.

## 1. 전체 구조 요약

### Frontend

- `components/ChatWindow.tsx`가 사용자 입력, 메시지 상태, `/api/chat` 호출, 스트리밍 수신, 페르소나 버블 렌더링, 히스토리 모달 연결, TTS 버튼 연결까지 대부분 담당한다.
- `components/chat/PersonaBubble.tsx`, `SpeakerButton.tsx`, `TypingIndicator.tsx`, `ErrorCard.tsx`가 채팅 UI의 하위 표시 컴포넌트다.
- `components/HistoryModal.tsx`는 `/api/history`를 조회해 저장된 의사결정/리뷰 예정 항목을 보여준다.
- `components/ReviewCard.tsx`는 `/api/review-card`를 조회해 리뷰 도래 결정을 홈 화면에 노출한다.
- `components/personax/` 디렉터리는 현재 존재하지 않는다. PersonaX UI는 `components/chat/`와 루트 `components/`에 분산되어 있다.

### API Routes

- `app/api/chat/route.ts`가 핵심 진입점이다. 라우팅, LLM 호출, 시장 데이터, response guard, 저장, 스트리밍 응답을 모두 조율한다.
- `app/api/history/route.ts`는 `conversations` 테이블에서 사용자별 최근 대화/결정 기록을 조회한다.
- `app/api/review-card/route.ts`는 `conversations.review_date`와 `review_status='pending'` 기준으로 리뷰 카드 후보를 조회한다.
- `app/api/auth/kakao/*`와 `app/api/auth/callback/kakao/route.ts`는 Kakao OAuth/session cookie 흐름을 담당한다.

### Auth/Session

- `lib/auth/kakao.ts`가 Kakao OAuth URL, session cookie signing/verification, redirect URI, next path safety를 담당한다.
- `lib/personax/auth.ts`는 request body provider id, Kakao cookie, Supabase auth user를 `PersonaXSession`으로 해석한다.
- `lib/personax/session.ts`는 `providerUserId` 정규화와 세션 우선순위를 정의한다.
- `lib/supabase/server.ts`, `lib/supabase/client.ts`는 server/browser Supabase client factory다.

### Message Router

- `lib/personax/message-router.ts`가 V3 라우팅, solo/full 전략, 페르소나 순서, Stage 1 데이터 수집, Stage 2 관점 분해, Stage 3 대본 생성을 담당한다.
- `app/api/chat/route.ts`는 `runRoutedRequest`에 `callTeaPersona`를 주입하는 wrapper 역할도 수행한다.

### Prompt Layer

- `app/api/chat/prompts/orchestrator-tagged.ts`가 tagged 1/2라운드, Stage 1/2/3, ECHO question, FIRST/CLOSER 규칙의 중심이다.
- `tea-ray.ts`, `tea-jack.ts`, `tea-lucia.ts`, `tea-echo.ts`는 각 페르소나 시스템 프롬프트다.
- `advanced-*.ts`는 투자 철학/고급 질문용 별도 시스템 프롬프트다.
- `shared-hoching.ts`는 공통 호칭/컨셉 규칙을 여러 prompt가 공유한다.

### Response Guard

- `lib/personax/response-guard.ts`가 question type 감지, 투자 fallback, 직접 매수/매도 표현 제거, ECHO/RAY/JACK 후처리, marketData fact lock 연결을 담당한다.
- `lib/personax/persona-dna.ts`에는 페르소나 발언 순서 제한과 marketData fact lock 보조 로직이 있다.
- `lib/personax/guards.ts`는 Stage 3 품질 위반, JACK 말투, ECHO 자기 지칭, 희 모드 금지어 감지를 담당한다.

### History/Memory

- `lib/personax/history.ts`가 `conversations`, `messages`, `user_analysis_history` 저장을 담당한다.
- `saveConversation`은 `conversations`를 만들고 하위 `messages`를 insert한다.
- `buildDecisionMemoryFields`는 `DecisionSummary`를 `review_date`, `review_status`, `reasons`, `counter_views`, `next_action` 등으로 변환한다.
- 아직 Personal Memory 전용 추출/검색 레이어는 없다.

### Review Card

- `app/api/review-card/route.ts`가 `conversations`에서 pending review를 조회한다.
- `components/ReviewCard.tsx`가 홈 화면 카드로 보여준다.
- `components/HistoryModal.tsx`도 `review_date`와 `review_status`를 표시한다.

### Market Data

- `lib/personax/market.ts`가 종목/코인/지수 키워드 맵, Yahoo/Upbit 등 시세 fetch, trend 계산을 담당한다.
- `lib/personax/market-data.ts`가 PersonaX용 marketData prompt context를 만든다.
- `lib/personax/scoring.ts`가 거래량, 변동성, 뉴스 감성, 점수, 포지션 사이징, entry condition, conflict를 계산한다.
- `lib/personax/market-facts.ts`는 Option D 실험용 fact pack 수집 모듈로 보인다.

### UI Components

- `ChatWindow.tsx`: 채팅 shell, 입력, 상태, API, 스트리밍, 렌더링.
- `PersonaBubble.tsx`: 페르소나별 버블, news chip, details, TTS.
- `SpeakerButton.tsx`: TTS 실행.
- `TypingIndicator.tsx`: 페르소나 순서 기반 로딩 표시.
- `HistoryModal.tsx`: history list.
- `ReviewCard.tsx`: review due card.
- `AuthButton.tsx`: Supabase/Kakao auth UI.
- `PositionInput.tsx`: 투자 포지션 입력 context 생성.

## 2. 파일별 역할

| 파일 경로 | 역할 | 누가 호출하는지 | 누구를 호출하는지 | 핵심 export/function | 리팩토링 위험도 |
|---|---|---|---|---|---|
| `components/ChatWindow.tsx` | 메인 채팅 UI, `/api/chat` 호출, NDJSON 처리, 렌더링 | 앱 페이지/홈 진입부 | `/api/chat`, `/api/auth/kakao/me`, `HistoryModal`, `PersonaBubble`, `SpeakerButton`, `TypingIndicator`, `PositionInput` | `ChatWindow` | 높음 |
| `components/chat/PersonaBubble.tsx` | 페르소나 버블 표시, details/news/TTS 버튼 | `ChatWindow` | `SpeakerButton` | `PersonaBubble`, `PERSONAS` | 중간 |
| `components/chat/SpeakerButton.tsx` | TTS 버튼 | `ChatWindow`, `PersonaBubble` | `lib/personax/tts` | `SpeakerButton` | 낮음 |
| `components/chat/TypingIndicator.tsx` | 로딩/생각 중 UI | `ChatWindow` | 없음 | `TypingIndicator` | 낮음 |
| `components/chat/ErrorCard.tsx` | API 오류 카드 | `ChatWindow` | 없음 | `ErrorCard` | 낮음 |
| `components/HistoryModal.tsx` | 히스토리/리뷰 예정 목록 | `ChatWindow`, `HomeScreen` | `/api/history` | `HistoryModal` | 중간 |
| `components/ReviewCard.tsx` | 리뷰 도래 카드 | `HomeScreen` | `/api/review-card` | `ReviewCard` | 중간 |
| `components/AuthButton.tsx` | Supabase/Kakao 로그인 UI | `ChatWindow`, `HomeScreen` | Supabase browser, `/api/auth/kakao/*` | `AuthButton` | 중간 |
| `components/PositionInput.tsx` | 포지션 입력 및 context 문자열 생성 | `ChatWindow` | 없음 | `PositionInput`, `buildPositionContext` | 낮음 |
| `components/HomeScreen.tsx` | 홈 UI, Auth/Review/History 연결 | 앱 페이지 | `AuthButton`, `ReviewCard`, `HistoryModal` | `HomeScreen` | 중간 |
| `app/api/chat/route.ts` | PersonaX 핵심 API. 라우팅, LLM, 시장 데이터, 저장, 응답 | `ChatWindow` | 거의 모든 `lib/personax/*`, prompts, Supabase, Anthropic, Gemini, market/news APIs | `POST`, `callTeaPersona`, `callOptionDWithStage3Guard` | 높음 |
| `app/api/history/route.ts` | 사용자별 `conversations` 조회 | `HistoryModal` | `readKakaoSessionFromRequest`, Supabase server/service client | `GET` | 중간 |
| `app/api/review-card/route.ts` | 리뷰 도래 결정 조회 | `ReviewCard` | `readKakaoSessionFromRequest`, Supabase server/service client | `GET` | 중간 |
| `app/api/auth/kakao/start/route.ts` | Kakao OAuth 시작 | `AuthButton` | `lib/auth/kakao`, crypto/cookies | `GET` | 중간 |
| `app/api/auth/callback/kakao/route.ts` | Kakao token/user fetch, session cookie 설정 | Kakao redirect | Kakao API, `signSession`, cookies | `GET` | 중간 |
| `app/api/auth/kakao/logout/route.ts` | Kakao session cookie 제거 | `AuthButton` | `KAKAO_SESSION_COOKIE` | `GET`, `POST` | 낮음 |
| `app/api/auth/kakao/me/route.ts` | Kakao session 조회 | `ChatWindow`, `AuthButton` | `readKakaoSessionFromRequest` | `GET` | 낮음 |
| `lib/auth/kakao.ts` | Kakao session signing/verification/OAuth constants | auth routes, history/review/auth resolver | Node crypto, env `KAKAO_CLIENT_SECRET` | `signSession`, `verifySession`, `readKakaoSessionFromRequest`, `buildRedirectUri` | 중간 |
| `lib/supabase/server.ts` | Server Supabase client factory | API routes, auth/history | `@supabase/ssr`, cookies | `createClient` | 중간 |
| `lib/supabase/client.ts` | Browser Supabase client factory | `ChatWindow`, `AuthButton` | `@supabase/ssr` | `createClient` | 중간 |
| `lib/personax/auth.ts` | chat session/provider id 해석 | `route.ts`, save flows | `lib/auth/kakao`, Supabase server, `session.ts` | `resolveChatSession`, `resolveUserId`, `buildProviderUserId` | 중간 |
| `lib/personax/session.ts` | provider/user id 정규화와 세션 우선순위 | `auth.ts` | 없음 | `resolvePersonaXSession`, `normalizeProviderUserId` | 중간 |
| `lib/personax/history.ts` | conversation/message/history 저장 | `route.ts` | Supabase, `decision-summary`, `scoring`, `market` | `saveConversation`, `saveHistory`, `saveTeaConversation` | 높음 |
| `lib/personax/classifier.ts` | legacy/V3 category 감지 | `route.ts`, `message-router.ts` | 없음 | `detectLegacyCategory`, `detectCategoryV3`, `detectEmotionalSubtypeHee` | 높음 |
| `lib/personax/message-router.ts` | PersonaX route decision과 Option D 실행 | `route.ts` | prompts, OpenAI, Gemini, `market-data`, `decision-summary`, `response-builder` 계열 | `routeMessage`, `runRoutedRequest`, `enforceOrder` | 높음 |
| `app/api/chat/prompts/orchestrator-tagged.ts` | tagged prompt 생성/파싱/순서/strategy | `route.ts`, `message-router.ts` | `shared-hoching`, `decision-frame`, `decision-qa` | `buildDataCollectionPrompt`, `buildPersonaAnalysisPrompt`, `buildScriptPrompt`, `parseTaggedRound1`, `parseTaggedRound2` | 높음 |
| `app/api/chat/prompts/tea-ray.ts` | RAY system prompt | `route.ts`, `message-router.ts` | `shared-hoching` | `TEA_SYSTEM_RAY` | 중간 |
| `app/api/chat/prompts/tea-jack.ts` | JACK system prompt | `route.ts`, `message-router.ts` | `shared-hoching` | `TEA_SYSTEM_JACK` | 중간 |
| `app/api/chat/prompts/tea-lucia.ts` | LUCIA system prompt | `route.ts`, `message-router.ts` | `shared-hoching` | `TEA_SYSTEM_LUCIA` | 중간 |
| `app/api/chat/prompts/tea-echo.ts` | ECHO system prompt | `route.ts`, `message-router.ts` | `shared-hoching` | `TEA_SYSTEM_ECHO` | 높음 |
| `app/api/chat/prompts/advanced-*.ts` | 고급 투자 질문 system prompt | `route.ts` | `shared-hoching` | `ADVANCED_SYSTEM_*` | 중간 |
| `app/api/chat/prompts/shared-hoching.ts` | 공통 호칭/컨셉 규칙 | tea/advanced/orchestrator prompts | 없음 | `SHARED_HOCHING_RULES` | 중간 |
| `lib/personax/response-guard.ts` | questionType, fallback, 투자/비투자 후처리 | `route.ts` | `persona-dna` | `detectQuestionType`, `applyResponseGuard` | 높음 |
| `lib/personax/persona-dna.ts` | 페르소나 순서/미래참조/marketData fact lock | `response-guard.ts` | 없음 | `sanitizeMarketDataFactLock`, `removeFuturePersonaReferences` | 중간 |
| `lib/personax/guards.ts` | Stage 3 품질 가드 | `route.ts`, `message-router.ts` | 없음 | `detectStage3GuardViolations`, `cleanJackEnding`, `cleanEchoSelfReference` | 중간 |
| `lib/personax/market.ts` | 종목/코인/지수 인식, 시세 fetch, trend | `route.ts`, `market-data.ts`, `history.ts`, `market-facts.ts` | 외부 fetch(Yahoo/Upbit 등) | `fetchMarketPrice`, `extractKeyword`, `detectAssetClass`, `getSector` | 높음 |
| `lib/personax/market-data.ts` | 질문에서 asset 감지, marketData prompt context 생성 | `route.ts`, `message-router.ts` | `market.ts` | `detectMarketAsset`, `buildMarketDataPromptContext`, `fetchPersonaXMarketData` | 높음 |
| `lib/personax/scoring.ts` | 투자 점수/조건/출처 계산 | `route.ts`, `history.ts`, `templates.ts` | 없음 | `calcScores`, `buildEntryCondition`, `buildDataSourceLabel`, `detectPersonaConflict` | 높음 |
| `lib/personax/templates.ts` | legacy 투자 persona 템플릿 | `route.ts` | `types.ts` | `buildJackText`, `buildLuciaText`, `buildEchoText` | 높음 |
| `lib/personax/streaming.ts` | tagged 결과를 persona map으로 변환 | `route.ts` | `fallbacks`, `utils` | `mapOrderedRound1`, `mapLegacyEchoRound2` | 중간 |
| `lib/personax/fallbacks.ts` | 빈 응답/solo fallback | `route.ts`, `streaming.ts` | `message-router` type | `PERSONA_FALLBACK`, `HEE_FALLBACK`, `applyPersonaFallback` | 중간 |
| `lib/personax/decision-summary.ts` | Decision Summary 데이터/문자열 생성 | `message-router.ts`, `history.ts`, `response-builder.ts` | 없음 | `buildDecisionSummary`, `formatDecisionSummary` | 높음 |
| `lib/personax/decision-frame.ts` | 질문 기반 decision frame 생성 | `orchestrator-tagged.ts` | 없음 | `buildDecisionFrame`, `buildDecisionSummary` | 중간 |
| `lib/personax/qa/decision-qa.ts` | 결정 QA 질문/점수 | `orchestrator-tagged.ts` | 없음 | `QA_QUESTIONS`, `scoreQA` | 낮음 |
| `lib/personax/debate-plan.ts` | orchestrator JSON plan fallback/parser | `route.ts` | 없음 | `createFallbackDebatePlan`, `parseDebatePlanJson` | 중간 |
| `lib/personax/response-builder.ts` | response/stream event 타입과 builder | 현재 직접 사용 적음 | `decision-summary` type | `buildChatResponse`, `buildDoneEvent` | 낮음 |
| `lib/personax/text-format.ts` | news/advanced text cleanup, bubble split | `route.ts` | 없음 | `cleanNews`, `cleanAdvanced`, `splitForBubble` | 낮음 |
| `lib/personax/utils.ts` | 공통 문자열/청크/순서 util | `route.ts`, `message-router.ts`, `streaming.ts` | `message-router` type | `chunkText`, `summarize`, `removeDangsin`, `normalizeDetails` | 중간 |
| `lib/personax/calendar.ts` | KR market calendar helpers | `route.ts` | 없음 | `isKRMarketHoliday`, `findPrevKRTradingDay` | 낮음 |
| `lib/personax/tts.ts` | 브라우저 TTS/STT hook/util | `SpeakerButton`, UI | `/api/tts` | `speakOne`, `enqueueSpeak`, `stopSpeaking` | 중간 |
| `lib/personax/types.ts` | 공통 투자 타입 | route/templates/scoring/history | 없음 | `AssetType`, `Verdict`, `MarketData` | 낮음 |

## 3. 주요 흐름도

### A. 일반 질문 흐름

```text
사용자 입력
  -> components/ChatWindow.tsx
  -> fetch('/api/chat')
  -> app/api/chat/route.ts
  -> detectLegacyCategory / routeMessage / detectCategoryV3
  -> lib/personax/message-router.ts
  -> app/api/chat/prompts/orchestrator-tagged.ts
  -> callTeaPersona 또는 message-router callStage3
  -> LLM(Claude/Gemini/OpenAI/Gemini Stage3)
  -> parseTaggedRound / mapOrderedRound1
  -> applyResponseGuard
  -> saveConversation(conversations + messages)
  -> NDJSON done/persona chunks
  -> ChatWindow 렌더링
  -> PersonaBubble / TypingIndicator / SpeakerButton
```

### B. 투자 질문 흐름

```text
사용자 입력
  -> ChatWindow
  -> /api/chat/route.ts
  -> classifier / routeMessage
  -> buildMarketDataPromptContext
  -> market-data.ts
  -> market.ts(fetchMarketPrice)
  -> message-router.ts 또는 legacy stock-detail path
  -> prompt layer / templates / scoring
  -> response-guard.ts
  -> persona-dna.ts marketData fact lock
  -> saveConversation 또는 saveHistory(user_analysis_history)
  -> ChatWindow 렌더링
```

투자 경로는 두 갈래가 있다.

- Option D/tagged 경로: `route.ts -> callOptionDWithStage3Guard -> runRoutedRequest -> prompts -> LLM -> response-guard -> saveConversation`.
- Legacy stock-detail 경로: `route.ts -> extractKeyword/fetchMarketPrice/fetchInvestmentNews -> scoring/templates -> saveHistory -> response`.

### C. History 흐름

```text
로그인
  -> Kakao cookie 또는 Supabase session
  -> lib/personax/auth.ts / lib/auth/kakao.ts
  -> saveConversation
  -> conversations
  -> messages
  -> HistoryModal
  -> /api/history
  -> conversations select
  -> History UI 렌더링
```

### D. Review Card 흐름

```text
Decision Summary 생성
  -> saveConversation
  -> buildDecisionMemoryFields
  -> conversations.review_date / review_status='pending'
  -> /api/review-card
  -> ReviewCard UI
  -> HistoryModal에서도 review_date 표시
```

### E. Personal Memory 예정 흐름 후보

```text
auth/session
  -> providerUserId/userId 확정

conversation save
  -> conversations/messages insert
  -> memory candidate extraction

message-router 전
  -> user memory retrieval
  -> prompt context injection

response generation 후
  -> decision/persona outputs에서 memory extraction

history 조회 시
  -> conversations/messages + memory summary merge
```

후보 위치별 판단:

- `auth/session`: 사용자 식별 안정화의 필수 위치. memory key는 `provider_user_id` 기준이 가장 현재 구조와 맞다.
- `conversation save`: 가장 안전한 memory write hook. 이미 `session`, `category`, `messages`, `decisionSummary`가 있다.
- `message-router 전`: memory read/injection 위치. 단, prompt 오염과 비용 증가 위험이 있어 요약된 memory만 넣어야 한다.
- `response generation 후`: output 기반 memory 추출 위치. 별도 LLM을 쓰면 비용 증가, rule-based extraction이면 비용 없음.
- `history 조회 시`: memory UI와 과거 decision linking에 적합하지만 답변 품질 개선에는 늦다.

## 4. 의존성 그래프

```text
ChatWindow.tsx
  -> /api/chat
  -> /api/auth/kakao/me
  -> HistoryModal
  -> PersonaBubble
  -> SpeakerButton
  -> TypingIndicator
  -> ErrorCard
  -> PositionInput
  -> createSupabaseBrowser

HomeScreen.tsx
  -> AuthButton
  -> ReviewCard
  -> HistoryModal

AuthButton.tsx
  -> lib/supabase/client.ts
  -> /api/auth/kakao/me
  -> /api/auth/kakao/start
  -> /api/auth/kakao/logout

HistoryModal.tsx
  -> /api/history

ReviewCard.tsx
  -> /api/review-card

route.ts
  -> lib/personax/auth.ts
  -> lib/personax/classifier.ts
  -> lib/personax/message-router.ts
  -> lib/personax/response-guard.ts
  -> lib/personax/history.ts
  -> lib/personax/market-data.ts
  -> lib/personax/market.ts
  -> lib/personax/scoring.ts
  -> lib/personax/templates.ts
  -> lib/personax/guards.ts
  -> lib/personax/streaming.ts
  -> lib/personax/fallbacks.ts
  -> lib/personax/debate-plan.ts
  -> app/api/chat/prompts/*
  -> Anthropic SDK
  -> Google Generative AI SDK
  -> Supabase
  -> fetchInvestmentNews

message-router.ts
  -> orchestrator-tagged.ts
  -> tea-ray/jack/lucia/echo.ts
  -> decision-summary.ts
  -> response-builder.ts types
  -> market-data.ts
  -> OpenAI SDK
  -> Google Generative AI SDK

orchestrator-tagged.ts
  -> shared-hoching.ts
  -> decision-frame.ts
  -> qa/decision-qa.ts

response-guard.ts
  -> persona-dna.ts

history.ts
  -> lib/supabase/server.ts
  -> @supabase/supabase-js
  -> market.ts
  -> scoring.ts
  -> decision-summary.ts

auth.ts
  -> lib/auth/kakao.ts
  -> lib/supabase/server.ts
  -> session.ts

/api/history
  -> lib/auth/kakao.ts
  -> lib/supabase/server.ts
  -> conversations

/api/review-card
  -> lib/auth/kakao.ts
  -> lib/supabase/server.ts
  -> conversations

market-data.ts
  -> market.ts

market-facts.ts
  -> market.ts

templates.ts
  -> types.ts
```

## 5. 위험 구간 TOP10

1. `app/api/chat/route.ts`가 API handler, LLM client, router wrapper, stream builder, market analysis, persistence를 모두 가진다.
2. `components/ChatWindow.tsx`가 UI, state, API request, streaming parser, auth state, history modal, TTS 연결을 함께 가진다.
3. `message-router.ts`가 라우팅만이 아니라 OpenAI/Gemini Stage 3 직접 호출까지 수행한다.
4. `orchestrator-tagged.ts`가 prompt, parser, router strategy, few-shot, ECHO question 규칙을 한 파일에 담고 있다.
5. `response-guard.ts`가 법적/투자 안전망, 비투자 표현 보정, 페르소나 공격어 보정까지 맡아 책임이 넓다.
6. 투자 규칙과 비투자/커리어/감정 규칙이 같은 prompt 블록에 공존해 숫자/용어 누수 가능성이 있다.
7. `saveConversation`은 `providerUserId`가 없으면 skip하지만, Supabase-only session은 `providerUserId`가 null일 수 있어 저장 누락 위험이 있다.
8. `user_analysis_history`와 `conversations/messages`가 병렬 저장 구조라 Personal Memory 기준 데이터가 갈라질 수 있다.
9. `ReviewCard`는 `conversations.review_date`에 의존하므로 `DecisionSummary`가 없는 응답은 리뷰 대상이 되지 않는다.
10. LLM 호출 경로가 `route.ts`와 `message-router.ts`에 분산되어 비용 통제/테스트 격리가 어렵다.

## 6. 다음 리팩토링 추천 순서

### 1순위: LLM Client 분리

- 이유: 비용 발생 지점을 한 파일로 모아야 안전하게 mock/static 검증이 가능하다.
- 예상 변경 파일:
  - `app/api/chat/route.ts`
  - 새 파일 `lib/personax/llm/tea-persona-client.ts`
  - 가능하면 `lib/personax/message-router.ts`의 Stage 3 client도 이후 같은 계층으로 이동
- 위험도: 중간

### 2순위: `route.ts`의 Option D 스트리밍 handler 분리

- 이유: `buildFinanceMultiPersonaResponse`가 실제 generic PersonaX 응답 경로인데 `route.ts` 내부 클로저에 묶여 있다.
- 예상 변경 파일:
  - `app/api/chat/route.ts`
  - 새 파일 `lib/personax/option-d-handler.ts`
  - 새 파일 `lib/personax/route-response.ts`
- 위험도: 높음

### 3순위: 저장/Memory boundary 분리

- 이유: Personal Memory 준비를 위해 `saveConversation`, `saveHistory`, review fields, future memory extraction hook을 한 계층으로 정리해야 한다.
- 예상 변경 파일:
  - `lib/personax/history.ts`
  - `app/api/chat/route.ts`
  - 새 파일 `lib/personax/conversation-store.ts`
  - 새 파일 `lib/personax/personal-memory.ts`
- 위험도: 중간

### 4순위: `ChatWindow.tsx` API/streaming hook 분리

- 이유: UI 수정을 할 때 API/streaming 상태가 같이 흔들린다.
- 예상 변경 파일:
  - `components/ChatWindow.tsx`
  - 새 파일 `components/chat/useChatStream.ts`
  - 새 파일 `components/chat/message-normalize.ts`
- 위험도: 높음

### 5순위: Prompt Layer 분리

- 이유: `orchestrator-tagged.ts`가 너무 커서 투자/비투자 규칙 누수와 ECHO 규칙 충돌이 반복될 가능성이 높다.
- 예상 변경 파일:
  - `app/api/chat/prompts/orchestrator-tagged.ts`
  - 새 파일 `app/api/chat/prompts/rules/investment.ts`
  - 새 파일 `app/api/chat/prompts/rules/non-invest.ts`
  - 새 파일 `app/api/chat/prompts/rules/echo-question.ts`
- 위험도: 높음

## 7. Personal Memory 준비 관점

### 지금 구조에서 막히는 부분

- `providerUserId`와 `userId`가 완전히 통일되어 있지 않다. Kakao cookie는 `kakao_{id}` 형태이고, Supabase auth fallback은 uuid일 수 있다.
- `saveConversation`은 `providerUserId`가 없으면 저장을 skip한다. Supabase-only 사용자는 memory write가 누락될 수 있다.
- `conversations/messages`와 `user_analysis_history`가 서로 다른 저장 체계라 memory source of truth가 불명확하다.
- message-router prompt에 memory를 넣을 위치는 있지만, 어디까지 넣어야 하는지 token/cost policy가 없다.
- memory extraction을 LLM으로 할지 rule-based로 할지 결정되어 있지 않다.

### 먼저 분리해야 할 부분

1. `resolveChatSession` 결과를 모든 저장/조회 API에서 동일하게 사용하도록 정리.
2. `saveConversation`을 독립 service로 분리하고 memory hook을 넣을 수 있는 반환값/이벤트 구조 마련.
3. `/api/history`와 `/api/review-card`의 provider id fallback 정책 통일.
4. `route.ts`의 Option D 응답 생성과 저장 호출 분리.
5. memory read context를 `message-router` 전 단계에 주입하는 인터페이스 정의.

### DB/user_id/auth/session 확인 사항

- `conversations.provider_user_id`가 Personal Memory primary key가 될지 확인.
- `conversations.user_id`는 uuid만 저장하도록 되어 있으므로 Kakao provider id와 연결 테이블이 필요한지 확인.
- `messages.conversation_id` FK와 message role/persona/content 구조 확인.
- memory table 후보:
  - `personal_memories(id, provider_user_id, user_id, type, content, source_conversation_id, confidence, created_at, updated_at)`
  - `memory_events(id, provider_user_id, conversation_id, event_type, payload, created_at)`
- RLS/service role 정책을 history/review/chat 저장 경로와 맞춰야 한다.

### conversations/messages와 연결 가능성

- `saveConversation` 시점에 `conversation_id`가 확보되므로 memory source link를 만들기 가장 좋다.
- `DecisionSummary`가 있으면 decision memory를 rule-based로 저장할 수 있다.
- `messages`의 persona별 content를 이용해 “사용자 사실”, “결정”, “후속 리뷰 필요”를 분리할 수 있다.
- history 조회 시 memory summary를 합치면 UI에 “이전에 이런 결정을 했음”을 보여줄 수 있다.

## 8. 비용 통제 관점

### LLM/API 호출을 일으키는 경로

- `app/api/chat/route.ts`
  - `callClaudeHaiku`: Anthropic `messages.create`.
  - `callTeaPersona`: Gemini `generateContent`, search grounding 옵션 가능.
  - news/advanced/tea persona branches에서 다수 `callTeaPersona`.
  - legacy 투자 경로에서 `fetchMarketPrice`, `fetchInvestmentNews`.
- `lib/personax/message-router.ts`
  - `callGPTMini`: OpenAI.
  - `callGeminiStage3`: Gemini.
  - `runRoutedRequest`: Stage 1/2 injected LLM caller + Stage 3 direct LLM.
  - `buildMarketDataPromptContext`를 통해 market data fetch 가능.
- `lib/personax/market.ts`
  - 외부 시세 fetch.
- `lib/personax/market-data.ts`
  - `fetchMarketPrice` 호출.
- `app/api/auth/callback/kakao/route.ts`
  - Kakao token/user API fetch.

### 리팩토링 중 건드리면 비용이 발생할 수 있는 파일

- `app/api/chat/route.ts`
- `lib/personax/message-router.ts`
- `lib/personax/market.ts`
- `lib/personax/market-data.ts`
- `app/api/chat/prompts/orchestrator-tagged.ts`
- `app/api/chat/prompts/tea-*.ts`
- `app/api/chat/prompts/advanced-*.ts`
- `app/api/auth/callback/kakao/route.ts`

이 파일들은 import/정적 분석은 안전하지만, 실제 handler 호출이나 dev UI 질문 테스트는 LLM/API 비용을 발생시킬 수 있다.

### 비용 없이 검증 가능한 영역

- `rg`, `git diff`, `git status`.
- TypeScript 타입 확인: `npx tsc --noEmit`.
- prompt string diff 검토.
- pure helper의 로컬 문자열 테스트:
  - `detectQuestionType`
  - `detectLegacyCategory`
  - `detectCategoryV3`
  - `applyResponseGuard`
  - `parseTaggedRound1/2`
  - `mapOrderedRound1`
  - `normalizeProviderUserId`
- UI 컴포넌트의 정적 import/props 분석.

### promptfoo를 돌려야 하는 경우와 돌리지 말아야 하는 경우

돌려야 하는 경우:

- prompt 규칙 변경이 실제 생성 품질에 영향을 줄 때.
- `message-router.ts`, `orchestrator-tagged.ts`, `response-guard.ts`의 응답 정책 변경 후 회귀 확인이 필요할 때.
- 페르소나 순서/FIRST/CLOSER/Decision Summary/LUCIA_CLOSE 관련 변경 후.

돌리지 말아야 하는 경우:

- 문서 생성만 하는 작업.
- 단순 정적 분석.
- 사용자가 명시적으로 금지한 경우.
- 비용 통제 중이거나 LLM/API 호출 금지가 걸린 작업.
- 로컬 타입/문자열 테스트만으로 충분한 순수 함수 변경.

## 9. Personal Memory 붙일 후보 위치별 상세

| 후보 위치 | write/read | 장점 | 위험 |
|---|---|---|---|
| `resolveChatSession` 직후 | read/write key 확정 | 사용자 식별을 한 번에 통일 가능 | provider id 정책이 흔들리면 전체 memory 오염 |
| `saveConversation` 직후 | write | conversation id와 messages가 모두 있음 | 저장 실패 시 memory도 같이 누락 |
| `buildFinanceMultiPersonaResponse` 진입 전 | read | Option D prompt에 memory 주입 가능 | token 증가, prompt 오염 |
| `runRoutedRequest` 내부 Stage 1 전 | read | DATA_PACK과 함께 memory를 구조화 가능 | router가 더 무거워짐 |
| `applyResponseGuard` 후 | write | 최종 사용자 노출 문장 기준 memory 추출 | guard가 만든 fallback도 memory로 저장될 위험 |
| `/api/history` 조회 시 | read | UI 표시 쉬움 | 답변 생성에는 늦음 |

추천 시작점:

```text
saveConversation
  -> conversation insert 성공
  -> messages insert 성공
  -> rule-based memory candidate 생성
  -> personal_memories upsert
```

그 다음:

```text
POST 시작
  -> resolveChatSession
  -> loadPersonalMemory(providerUserId)
  -> message-router prompt context에 짧은 summary만 주입
```

## 10. 즉시 관찰된 정리 포인트

- `ROUTE_ANALYSIS.md`도 별도 생성되어 있으므로 `route.ts` 세부 해부는 그 문서를 참조할 수 있다.
- `components/personax/`는 없다. UI 문서화나 리팩토링 시 `components/chat/`를 PersonaX UI 계층으로 간주해야 한다.
- `response-builder.ts`는 타입/빌더가 있으나 `route.ts`는 아직 대부분 직접 object literal을 만든다. 응답 포맷 일원화 후보이다.
- `message-router.ts`가 LLM client를 직접 갖고 있어 “route에서 LLM 주입”이라는 주석과 일부 충돌한다. Stage 3는 여전히 router 내부 직접 호출이다.
- `market-facts.ts`의 `FEATURE_OPTION_D=false`와 `message-router.ts`의 `FEATURE_OPTION_D=true`가 공존한다. 실험 플래그 의미 정리가 필요하다.
