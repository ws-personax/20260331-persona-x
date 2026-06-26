# Plan: PersonaX Room Schema Design

## 1. 설계 목표
- 기존 1:1 구조를 유지한다.
- Room 기능은 신규 Layer로 추가한다.
- Room Memory와 Personal Memory를 분리한다.
- Speaker 중심으로 모든 메시지와 결정을 추적한다.
- 기존 `conversations` / `messages` 구조와 충돌하지 않도록 확장한다.

## 2. 전체 구조
```
User
  ↓
Room
  ↓
RoomMember
  ↓
Speaker
  ↓
Message
  ↓
Persona Call
  ↓
Decision
  ↓
Room Memory
  ↓
Personal Memory
```

설명:
- User는 방의 소유자이자 참여자다.
- Room은 대화의 컨테이너다.
- RoomMember는 어떤 사용자가 어떤 방에 속해 있는지를 나타낸다.
- Speaker는 실제 발화 주체다. 사람일 수도 있고 시스템일 수도 있고, Persona 호출 결과일 수도 있다.
- Message는 Speaker를 통해 기록된다.
- Persona Call은 어떤 메시지에서 어떤 Persona가 호출되었는지를 분리해 저장한다.
- Decision은 방 안에서 합의되거나 정리된 판단이다.
- Room Memory는 방 단위 기억이다.
- Personal Memory는 개인 단위 기억이다.

## 3. rooms
### 목적
- 소규모 의사결정 대화방의 기본 단위다.
- 방의 이름, 타입, 설명, 소유자를 보관한다.

### 핵심 컬럼 예시
- `id`
- `title`
- `description`
- `owner_user_id`
- `room_type`
- `created_at`
- `updated_at`

### 메모
- `room_type`은 창업방, 투자방, 가족회의방, 친구 고민방 같은 분류를 담을 수 있다.
- 기존 1:1 대화와 별개로 Room 레이어를 식별하는 기준이 된다.

## 4. room_members
### 목적
- 어떤 사용자가 어떤 Room에 속하는지 저장한다.
- 초대, 참여, 퇴장 기록의 기본 단위가 된다.

### 핵심 컬럼 예시
- `id`
- `room_id`
- `user_id`
- `role`
- `joined_at`
- `left_at`

### 메모
- `role`은 owner, member, admin 같은 값으로 확장할 수 있다.
- 방 단위 권한과 참여 상태는 `room_members`에서 관리한다.

## 5. speaker
### 개념 설명
Speaker는 "누가 말했는가"를 나타내는 핵심 개념이다.
Memory보다 먼저 확정되어야 한다.

### 필드 초안
- `speaker_type`
  - 예: `user`, `persona`, `system`
- `speaker_id`
- `display_name`
- `persona_key` (nullable)

### 메모
- `speaker_type = user`면 실제 사용자 발화다.
- `speaker_type = persona`면 JACK / RAY / LUCIA / ECHO 같은 호출 결과다.
- `speaker_type = system`이면 시스템 공지, 초대 안내, 상태 메시지다.
- `persona_key`는 `speaker_type = persona`일 때만 의미가 있다.

## 6. room_messages
### 목적
- Room 안에서 발생한 모든 발화를 저장한다.
- 메시지 본문보다 speaker 정보를 먼저 보존한다.

### 핵심 컬럼 예시
- `id`
- `room_id`
- `speaker_type`
- `speaker_id`
- `persona_key`
- `content`
- `created_at`
- `reply_to`

### 메모
- `speaker_type`과 `speaker_id`는 메시지의 정체성을 결정한다.
- `persona_key`는 필요할 때만 채운다.
- `reply_to`는 특정 메시지에 대한 반응 흐름을 연결한다.

## 7. room_persona_calls
### 목적
- 어떤 메시지에서 어떤 Persona가 호출되었는지 저장한다.
- 호출 유형과 맥락을 분리해 나중에 분석할 수 있게 한다.

### 핵심 컬럼 예시
- `id`
- `room_id`
- `message_id`
- `called_personas`
- `trigger_type`
- `created_at`

### 메모
- `called_personas`는 배열 형태로 `JACK`, `RAY`, `LUCIA`, `ECHO`를 담을 수 있다.
- `trigger_type`은 `@mention`, 자연어 호출, 시스템 추천 호출 등으로 나눌 수 있다.

## 8. room_decisions
### 목적
- 방 안에서 나온 의사결정의 정리본을 저장한다.
- 단순 메시지와 달리 오래 살아야 하는 결과물이다.

### 핵심 컬럼 예시
- `id`
- `room_id`
- `decision_type`
- `summary`
- `reasons`
- `counter_views`
- `next_action`
- `review_date`
- `status`
- `importance`
- `created_at`

### 메모
- `summary`는 Decision Summary의 요약이다.
- `reasons`는 판단 이유, `counter_views`는 반대 의견, `next_action`은 다음 행동이다.
- `review_date`는 나중에 다시 논의해야 할 날짜다.
- `status`는 open, decided, in_review 같은 흐름으로 확장할 수 있다.

## 9. room_memories
### 목적
- 방 단위로 남길 기억만 따로 저장한다.
- 모든 대화를 기억하지 않고, 결정/기준/다음 행동 중심으로 남긴다.

### 핵심 컬럼 예시
- `id`
- `room_id`
- `decision_id`
- `memory_type`
- `content`
- `importance`
- `created_at`

### 메모
- `decision_id`를 통해 어떤 결정에서 파생된 기억인지 추적한다.
- `memory_type`은 `decision`, `criteria`, `next_action`, `review_note` 같은 값으로 나뉠 수 있다.
- 방 안의 반복 패턴과 합의 기준을 유지하는 용도다.

## 10. personal_memories
### 설명
- Personal Memory는 사용자 개인 단위의 기억이다.
- Room Memory와 섞지 않는다.
- Room에서 합의된 결정은 Room에 남기고, 개인 기억은 그 사람의 반복 패턴이나 개인적 선호를 보완하는 데만 쓴다.
- 분리 이유:
  - 방의 합의와 개인의 기억은 목적이 다르다.
  - Room은 공동 의사결정의 기록이고, Personal은 개인 맥락의 보조 기록이다.
  - 섞이면 누가 방에서 합의한 내용인지, 누가 개인적으로 선호하는 내용인지 흐려진다.

## 11. 관계도
```
Room
  ↓
Messages
  ↓
Decision
  ↓
Room Memory
  ↓
Review
```

확장 관점:
```
User
  ↓
Room
  ↓
RoomMember
  ↓
Speaker
  ↓
Message
  ↓
Persona Call
  ↓
Decision
  ↓
Room Memory
  ↓
Personal Memory
```

## 12. 구현 순서
### Phase 1
- Room
- Member
- Messages
- Speaker

### Phase 2
- Persona Call
- Decision

### Phase 3
- Room Memory
- Review

## 13. 확장 가능성
- 공개 Room
- AI만 있는 Room
- 전문가 Room
- 다국어 Room
- 음성 Room

설계 원칙:
- 지금은 소규모 그룹 의사결정에 최적화한다.
- 이후 확장 기능이 와도 Room / Speaker / Decision / Memory 구조가 깨지지 않도록 둔다.

## 14. 설계 원칙
- Speaker가 Memory보다 먼저다.
- Room Memory와 Personal Memory는 절대 섞지 않는다.
- Persona는 Speaker의 한 종류가 아니라 호출되는 참여자다.
- Decision은 Message보다 오래 살아야 한다.
- Memory는 Decision에서 파생된다.
- 기존 1:1 채팅 구조를 깨지 않고 Room을 얹는다.
- 메시지보다 먼저 발화 주체를 저장한다.

