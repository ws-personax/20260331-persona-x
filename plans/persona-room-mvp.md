# Plan: PersonaX Room / Speaker MVP

## 배경
PersonaX는 카톡 대체용 전체 메신저가 아니다.
우리가 먼저 풀어야 하는 것은, 지인/가족/팀이 한 방에서 대화하면서 JACK/RAY/LUCIA/ECHO를 자연스럽게 호출해 판단을 정리하는 소규모 그룹 메신저 MVP다.

이 문서는 기존 1:1 채팅을 유지한 채, Room과 Speaker를 새 레이어로 얹는 최소 설계를 정리한다.

## 제품 정의
- PersonaX Room은 의사결정을 위한 소규모 그룹 대화방이다.
- 목표는 지인, 가족, 팀이 대화 중 페르소나를 호출해 판단을 정리하고, 다음 행동을 합의하는 것이다.
- Room은 대화의 컨테이너이고, Speaker는 발화 주체의 정체성이다.
- Persona는 그 Speaker가 필요할 때 호출하는 판단 엔진이다.
- Memory는 개인 기억보다 Room 안의 결정 기억부터 시작한다.

## 핵심 원칙
- Room이 먼저다.
- Speaker가 Persona보다 먼저다.
- 누가 말했는지가 memory보다 먼저다.
- Persona 호출은 대화 흐름 안에서 자연스럽게 이뤄진다.
- 기존 1:1 채팅은 유지하고, Room은 신규 레이어로 추가한다.

## MVP 사용 시나리오
### 창업방
- 창업 멤버가 아이디어, 역할, 책임, 실행 순서를 논의한다.
- JACK이 선택과 대가를 정리하고, RAY가 검증 조건을 붙이고, LUCIA가 관계/감정 부담을 확인하고, ECHO가 반복 패턴을 판결한다.

### 투자방
- 가족이나 소규모 투자 모임이 종목, 기준, 리스크, 다음 행동을 함께 논의한다.
- 결정이 흔들릴 때 Persona를 호출해 판단 기준을 정리한다.

### 가족회의방
- 부모 부양, 이사, 교육, 생활비, 돌봄 같은 주제를 한 방에서 논의한다.
- 감정과 책임이 엉키는 문제를 방 안에서 정리하고 다음 행동을 남긴다.

### 친구 고민방
- 연애, 관계, 퇴사, 진로, 창업 같은 개인 고민을 친구들과 함께 검토한다.
- Persona 호출을 통해 의견을 정리하되, 최종 판단은 방의 합의로 남길 수 있게 한다.

## 핵심 사용자 흐름
1. 방 생성
2. 지인 초대
3. 일반 대화
4. Persona 호출
5. Persona 응답
6. Decision Summary 생성
7. Room Memory 저장
8. 나중에 Review

## Speaker 모델
Speaker는 Persona보다 앞선다. 모든 메시지는 반드시 speaker_id 또는 speaker_type을 가져야 한다.

### speaker_type 초안
- `user_speaker`
- `persona_speaker`
- `system_speaker`

### 의미
- `user_speaker`: 실제 방 구성원
- `persona_speaker`: JACK/RAY/LUCIA/ECHO 같은 호출된 판단 주체
- `system_speaker`: 시스템 공지, 초대 알림, 룸 상태 변경

### 원칙
- 메시지 저장 시 "무슨 내용인가"보다 먼저 "누가 말했는가"를 남긴다.
- Speaker가 정해져야 나중에 memory, summary, review가 분리된다.

## Persona 호출 규칙
Persona 호출은 별도 진입점이 아니라 대화 속 자연스러운 호출이어야 한다.

### 예시
- `@JACK`
- `@RAY`
- `@LUCIA`
- `@ECHO`
- `잭`
- `레이`
- `루시아`
- `에코`
- `잭과 루시아`
- `네 명 다 불러`

### 호출 원칙
- 명시 호출과 자연어 호출을 모두 허용한다.
- 한 메시지에 여러 Persona 호출이 가능하다.
- 호출된 Persona만 응답 대상이 된다.
- 호출이 없더라도 Room의 맥락상 필요한 경우 시스템이 추천 호출을 제안할 수 있다.

## DB 초안
### rooms
- `id`
- `owner_id`
- `title`
- `description`
- `room_type`
- `created_at`
- `updated_at`

### room_members
- `id`
- `room_id`
- `user_id`
- `role`
- `nickname`
- `joined_at`

### room_messages
- `id`
- `room_id`
- `speaker_type`
- `speaker_id`
- `message_type`
- `content`
- `reply_to_message_id`
- `created_at`

### room_persona_calls
- `id`
- `room_id`
- `message_id`
- `persona_key`
- `call_reason`
- `created_at`

### room_decisions
- `id`
- `room_id`
- `source_message_id`
- `decision_summary`
- `decision_type`
- `status`
- `review_date`
- `created_at`

### room_memories
- `id`
- `room_id`
- `memory_scope`
- `memory_key`
- `memory_value`
- `source_message_id`
- `created_at`

## UI 초안
- Home에는 기존 1:1 시작 흐름을 유지한다.
- Room 탭 또는 Room 목록을 추가한다.
- Room 안은 카톡형 대화 UI로 유지한다.
- 하단 입력창은 그대로 유지한다.
- Persona 호출 버튼 또는 `@` 호출을 지원한다.
- Decision Summary는 대화 중 카드 형태로 표시한다.
- Review 화면에서는 방별 결정, 기준, 다음 행동을 다시 꺼내볼 수 있어야 한다.

## Memory 원칙
- 처음부터 모든 대화를 기억하지 않는다.
- 저장 대상은 결정, 기준, 다음 행동, Review 날짜가 우선이다.
- 방별 memory와 개인 memory를 분리한다.
- 개인 기억은 사용자가 여러 Room에서 반복하는 패턴을 보완하는 용도로만 쓴다.
- Room memory는 그 방에서 합의한 결정과 맥락을 유지하는 데 집중한다.

## MVP 제외 범위
- 완전한 SNS 피드
- 공개 프로필
- 친구 추천
- 대규모 단체방
- 실시간 음성/영상
- 푸시 알림 고도화
- 결제/유료화
- 카카오톡 완전 대체

## 2주 개발 순서
### Week 1
- [ ] DB 스키마 초안
- [ ] Room 목록
- [ ] Room detail
- [ ] 메시지 저장/조회
- [ ] speaker_type 적용

### Week 2
- [ ] Persona 호출 감지
- [ ] Persona 응답 삽입
- [ ] Room Decision Summary 저장
- [ ] 최소 QA

## 리스크
- SNS 범위 과확장
- Memory 과저장
- Persona 응답 비용 증가
- 기존 1:1 채팅 회귀
- 초대/로그인 복잡도

## 성공 지표
- 같은 방 재방문
- 2번째 Persona 호출
- 같은 주제 재논의
- Decision Summary 열람
- Review 재진입
- 지인 초대 유지율

## 향후 구현 순서
1. Room/Speaker 스키마와 타입 정의
2. Room 목록과 Room detail 화면 추가
3. 메시지 저장 시 speaker_type, speaker_id 반영
4. `@JACK` / `@RAY` / `@LUCIA` / `@ECHO` 호출 감지
5. Persona 응답 삽입과 Decision Summary 표시
6. Room Memory 저장과 Review UI 연결

## 설계 메모
- 이 MVP의 핵심은 "대화방 안에서 Persona를 부르는 경험"이다.
- 메신저를 넓히는 것이 아니라, 의사결정 방을 먼저 만든다.
- Room이 쌓이면 그때 memory와 summary가 살아난다.
- Persona는 방의 주인공이 아니라, 방의 결정을 정리하는 호출 가능한 역할이다.
