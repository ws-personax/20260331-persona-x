# PersonaX Room MVP SQL v0 Draft

**목적**: Room MVP PR 1 구현 전, Supabase SQL Editor에서 수동 실행할 최소 테이블 정의를 검토 가능한 문서로 남긴다.

> ⚠️ 이 문서의 SQL은 직접 실행하지 않는다.
> Supabase SQL Editor에서 수동으로 검토 후 실행한다.
> 실행 전 반드시 기존 테이블 목록과 충돌 여부를 확인한다.

---

## 설계 원칙

- 기존 `conversations` / `messages` 테이블은 절대 건드리지 않는다.
- Room 메시지는 `room_messages`에만 저장한다. `messages` 테이블과 혼합하지 않는다.
- v0는 단일 owner(`provider_user_id`) 기반으로 시작한다.
- `room_members`(다중 참여자 초대)는 v1에서 추가한다.
- RLS는 v0에서 보류한다. 보안은 API 레벨에서 `provider_user_id` 검증으로 대체한다.

---

## v0 포함 테이블

| 테이블 | 역할 |
|---|---|
| `rooms` | Room 기본 정보 (소유자, 제목, 주제) |
| `room_messages` | Room 안 발화 기록 (Speaker 중심) |

---

## SQL 초안

### 1. rooms

```sql
create extension if not exists pgcrypto;

-- ============================================================
-- rooms: Room 기본 정보 테이블
-- v0: provider_user_id 단일 owner 기반
-- v1: room_members 추가 시 owner_user_id로 전환 가능
-- ============================================================
create table if not exists rooms (
  id               uuid        primary key default gen_random_uuid(),
  provider_user_id text        not null,
  title            text        not null,
  topic            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 인덱스: 특정 사용자의 Room을 최신순으로 조회
create index if not exists idx_rooms_provider_user_id_created_at
  on rooms (provider_user_id, created_at desc);
```

**컬럼 설명:**

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid | Room 고유 식별자. gen_random_uuid() 자동 생성 |
| `provider_user_id` | text | Kakao/Google OAuth 기반 식별자 (예: `kakao_12345678`) |
| `title` | text | Room 제목. 사용자가 입력 |
| `topic` | text | Room 주제 설명. nullable. 선택 입력 |
| `created_at` | timestamptz | 생성 시각 |
| `updated_at` | timestamptz | 마지막 수정 시각. 메시지 추가 시 갱신 가능 |

---

### 2. room_messages

```sql
-- ============================================================
-- room_messages: Room 안 발화 기록 테이블
-- speaker_type: 'user' | 'persona' | 'system'
-- speaker_key: persona일 때 jack / ray / lucia / echo
-- rooms 삭제 시 cascade 삭제
-- ============================================================
create table if not exists room_messages (
  id           uuid        primary key default gen_random_uuid(),
  room_id      uuid        not null references rooms(id) on delete cascade,
  speaker_type text        not null,
  speaker_key  text,
  content      text        not null,
  created_at   timestamptz not null default now(),

  constraint chk_speaker_type
    check (speaker_type in ('user', 'persona', 'system')),

  constraint chk_content_not_empty
    check (length(trim(content)) > 0)
);

-- 인덱스: 특정 Room의 메시지를 시간순으로 조회
create index if not exists idx_room_messages_room_id_created_at
  on room_messages (room_id, created_at asc);
```

**컬럼 설명:**

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid | 메시지 고유 식별자 |
| `room_id` | uuid | 소속 Room. `rooms.id` 참조. CASCADE 삭제 |
| `speaker_type` | text | 발화 주체 종류: `user` / `persona` / `system` |
| `speaker_key` | text | `speaker_type = 'persona'`일 때 `jack` / `ray` / `lucia` / `echo`. 나머지는 null |
| `content` | text | 메시지 본문. 공백만인 경우 저장 거부 |
| `created_at` | timestamptz | 발화 시각 |

**`speaker_type` 값 정의:**

| 값 | 의미 |
|---|---|
| `user` | 실제 사용자 발화 |
| `persona` | JACK / RAY / LUCIA / ECHO Persona 호출 결과 |
| `system` | 시스템 안내 (Room 생성 알림, 입장 메시지 등) |

---

### 3. updated_at 자동 갱신 트리거 (선택)

```sql
-- ============================================================
-- rooms.updated_at 자동 갱신 트리거
-- room_messages INSERT 시 rooms.updated_at 갱신은 API 레벨에서 처리 가능
-- 필요 시 이 트리거를 rooms 자체 UPDATE에 추가
-- ============================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_rooms_updated_at on rooms;

create trigger trg_rooms_updated_at
  before update on rooms
  for each row
  execute function set_updated_at();
```

> 참고: `room_messages` INSERT 시 `rooms.updated_at` 갱신은 v0에서는 API 레벨에서 수동으로 처리한다. 트리거로 처리하려면 별도 트리거가 필요하지만 v0에서는 불필요하다.

---

## 삭제 정책

| 대상 | 정책 | 근거 |
|---|---|---|
| `rooms` 삭제 | `room_messages`도 CASCADE 삭제 | Room이 사라지면 메시지는 의미 없음 |
| `room_messages` 개별 삭제 | v0에서는 허용하지 않음 (API 미노출) | 의사결정 기록은 함부로 삭제하지 않는다 |
| 논리 삭제 | v1에서 `deleted_at` 컬럼 추가 검토 | v0는 물리 삭제만 허용 |

---

## 보안 및 RLS 주의사항

### v0 RLS 미적용 리스크

v0에서는 Supabase RLS(Row Level Security)를 적용하지 않는다.
이는 다음 리스크를 수반한다.

| 리스크 | 내용 |
|---|---|
| 다른 사용자의 Room 접근 | `room_id`만 알면 `room_messages` 조회 가능 |
| 다른 사용자의 Room 목록 접근 | `provider_user_id` 없이 전체 rooms 조회 가능 |
| 메시지 임의 삽입 | `room_id`를 아는 누구나 메시지 삽입 가능 |

### v0 보안 대응 (API 레벨)

RLS 대신 모든 Room API에서 다음을 반드시 검증한다.

```
GET  /api/rooms
  → provider_user_id로 본인 Room만 조회

POST /api/rooms
  → provider_user_id를 서버에서 세션 기반으로 직접 주입 (클라이언트 신뢰 금지)

GET  /api/rooms/[roomId]
  → rooms.provider_user_id === 세션 provider_user_id 검증

POST /api/rooms/[roomId]/messages
  → rooms.provider_user_id === 세션 provider_user_id 검증 후 삽입
```

**핵심 규칙**: `provider_user_id`는 클라이언트가 body로 전달하지 않는다.
서버에서 쿠키/세션을 통해 `resolveProviderUserIdForRead()`로 직접 조회한다.

### v1에서 추가할 것

```
alter table rooms enable row level security;

create policy "owner can read own rooms"
  on rooms for select
  using (provider_user_id = current_setting('request.jwt.claims', true)::json->>'sub');
```

v1 RLS 설계는 `provider_user_id` → `user_id`(UUID) 전환 이후에 확정한다.

---

## v0에서 제외한 것

| 항목 | 이유 | 추가 시점 |
|---|---|---|
| `room_members` | 초대/다중 참여 기능 전까지 불필요 | v1 |
| `room_decisions` | Decision 저장은 Room 대화 안정 후 추가 | v1 |
| `room_memories` | Decision에서 파생. Decision 없으면 불필요 | v1 |
| RLS 정책 | `provider_user_id` 기반 정책 설계 복잡성 | v1 |
| `owner_user_id` (UUID) | 현재 `provider_user_id` 기반으로 충분 | v1 전환 시 |
| `reply_to` (스레드) | 1:1 응답 스레드는 MVP 이후 | v2 |
| `room_type` | 창업/투자/관계 분류는 Room 안정 후 | v2 |
| 논리 삭제 (`deleted_at`) | 물리 삭제로 충분 | v2 |

---

## 실행 전 체크리스트

Supabase SQL Editor에서 실행 전 반드시 확인:

- [ ] `rooms` 테이블이 아직 존재하지 않는가
- [ ] `room_messages` 테이블이 아직 존재하지 않는가
- [ ] 기존 `conversations`, `messages` 테이블에 영향이 없는가
- [ ] `gen_random_uuid()` 함수가 Supabase에서 활성화되어 있는가 (기본 활성화)
- [ ] `provider_user_id` 포맷이 기존 `conversations`와 동일한가 (`kakao_123...` 형식)

---

## 기존 테이블과의 관계

```
[기존 구조] ← 절대 수정 없음
conversations (id, provider_user_id, title, verdict, ...)
  └─ messages (id, conversation_id, role, persona, content)

[신규 구조] ← 완전 분리
rooms (id, provider_user_id, title, topic, ...)
  └─ room_messages (id, room_id, speaker_type, speaker_key, content)
```

두 구조는 `provider_user_id`로 동일 사용자를 식별하지만, 테이블은 완전히 분리된다.
Room 기능이 기존 1:1 채팅에 영향을 주지 않는다.
