# User Identity and Account Linking

## 1. 현재 상태 요약

현재 PersonaX의 대화 저장 흐름은 `provider_user_id` 중심으로 동작한다.

- `saveConversation`은 `conversations.provider_user_id`를 주요 식별자로 저장한다.
- `conversations.user_id`는 세션의 `userId`가 UUID일 때만 저장된다.
- Kakao body/cookie 기반 세션에서는 `userId`가 `kakao_...` 형태의 provider id가 될 수 있으므로 `conversations.user_id`가 `null`이 될 수 있다.
- `app/api/history`와 `app/api/review-card`는 현재 `provider_user_id` 중심으로 대화를 조회한다.
- 이 구조는 현재 History 호환성에는 유리하지만, 7월 Personal Memory와 Account Linking에는 별도 정리가 필요하다.

## 2. 문제점

현재 구조를 그대로 Personal Memory에 사용하면 다음 위험이 있다.

- Kakao, Google, 향후 다른 로그인 수단이 추가될 때 같은 사용자의 기억이 provider별로 쪼개질 수 있다.
- Personal Memory를 `provider_user_id` 기준으로 저장하면 나중에 계정 통합 시 메모리 병합이 어렵다.
- `user_analysis_history`에서 `user_id`와 `provider_user_id` 의미가 혼용될 위험이 있다.
- query, header, body로 들어온 `providerUserId`를 Memory 권한으로 신뢰하면 다른 사용자의 기억에 접근할 수 있는 보안 위험이 생긴다.
- `provider_user_id` 기반 History 조회를 갑자기 `user_id` 기준으로 바꾸면 기존 Kakao 대화가 사라진 것처럼 보일 수 있다.

## 3. 목표 구조

Personal Memory의 최종 기준은 canonical user id여야 한다.

- `users.id`를 PersonaX 내부 canonical user id로 사용한다.
- `user_identities` 테이블로 Kakao, Google, Supabase auth user, provider-specific id를 `users.id`에 연결한다.
- `conversations.user_id`는 최종적으로 `users.id`를 참조한다.
- `provider_user_id`는 레거시 호환, 추적, 마이그레이션 확인용으로 유지한다.
- Personal Memory는 최종적으로 `user_id` 기준으로 저장하고 조회한다.
- Account Linking은 명시적으로 검증된 identity만 하나의 `users.id`에 묶는다.

## 4. 제안 DB 초안

### users

PersonaX 내부 사용자를 나타내는 canonical table이다.

```sql
users (
  id uuid primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  display_name text null
)
```

### user_identities

외부 로그인 provider와 내부 `users.id`를 연결한다.

```sql
user_identities (
  id uuid primary key,
  user_id uuid not null references users(id),
  provider text not null,
  provider_user_id text not null,
  auth_user_id uuid null,
  email text null,
  verified_at timestamptz null,
  created_at timestamptz not null,
  last_seen_at timestamptz null,
  unique(provider, provider_user_id)
)
```

### conversations.user_id 전환 원칙

- 기존 `provider_user_id` 컬럼은 삭제하지 않는다.
- `conversations.user_id`는 nullable 상태로 유지하면서 점진적으로 채운다.
- 신규 저장은 가능한 경우 `user_id`와 `provider_user_id`를 함께 저장한다.
- 조회는 `user_id` 우선, `provider_user_id` fallback 순서로 전환한다.
- 기존 History가 깨지지 않도록 provider 기반 조회 호환성을 유지한다.

### personal_memory 또는 user_memory_facts

Personal Memory v0는 별도 테이블로 시작한다.

```sql
personal_memory (
  id uuid primary key,
  user_id uuid not null references users(id),
  type text not null,
  content text not null,
  source_conversation_id uuid null,
  source_message_id uuid null,
  confidence numeric null,
  importance int null,
  status text not null default 'active',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  last_used_at timestamptz null
)
```

대안 이름으로 `user_memory_facts`를 사용할 수 있다. v0에서는 이름보다 `user_id` 기준 저장과 조회 원칙이 더 중요하다.

## 5. 전환 순서

1. 현재 코드는 변경하지 않고 user identity와 account linking 원칙을 문서화한다.
2. `conversations.user_id`가 nullable로 존재하고 안전하게 사용할 수 있는지 확인한다.
3. `resolveUserId`와 `resolveChatSession`의 역할을 정리한다.
4. `history`와 `review-card`의 조회 로직을 helper로 분리한다.
5. Personal Memory v0는 `user_id` 우선, `provider_user_id` fallback으로 설계한다.
6. Account Linking은 6월 4주에 별도 설계 후 구현한다.
7. 기존 provider 기반 History 호환성을 유지한 상태에서 점진적으로 `user_id` 중심 구조로 옮긴다.

## 6. Personal Memory v0 원칙

Personal Memory v0는 작게 시작한다.

- 처음부터 LLM 요약 메모리를 만들지 않는다.
- 먼저 `conversations`, `messages`, decision fields 기반의 조회형 memory부터 시작한다.
- memory 저장, 조회, prompt 주입은 `route.ts` 안에 직접 넣지 않는다.
- `memory-context.ts`, `memory-store.ts` 같은 별도 모듈을 사용한다.
- route.ts는 오케스트레이터 역할만 유지한다.
- LLM 호출 비용이 늘어나는 구조는 v0에서 제외한다.

## 7. 금지 및 주의 원칙

- 바로 Account Linking을 구현하지 않는다.
- 기존 `provider_user_id`를 삭제하지 않는다.
- 기존 History가 깨지게 변경하지 않는다.
- `provider_user_id` 조회를 바로 `user_id` 조회로 일괄 변경하지 않는다.
- query, header, body로 들어온 `providerUserId`를 Personal Memory 권한으로 그대로 신뢰하지 않는다.
- Personal Memory 구현을 위해 LLM 호출을 추가하지 않는다.
- 작은 문서/리팩토링 PR에는 promptfoo를 불필요하게 실행하지 않는다.
