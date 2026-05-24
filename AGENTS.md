# PersonaX Codex 운영 규칙

1. 모든 변경은 작은 단위로 수행하고, 요청 범위 밖 파일은 수정하지 않는다.
2. promptfoo 회귀 결과는 반드시 26/26 PASS를 유지한다.
3. 수정 후 가능한 범위에서 `npx tsc --noEmit`을 실행해 TypeScript 오류를 확인한다.
4. `main` 브랜치에 직접 push하지 않는다.
5. `NAVER_CLIENT_SECRET`의 이름, 값, 참조 코드, 문서 예시는 수정하지 않는다.
6. `ChatWindow.tsx`, `route.ts` 등 대형 파일은 전체 리팩토링하지 않고 필요한 부분만 수정한다.
