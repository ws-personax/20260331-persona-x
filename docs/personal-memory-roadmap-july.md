# Personal Memory Roadmap for July

## 1. Current Baseline

- PersonaX = Decision OS.
- July's core goal is to ship Personal Memory v0.
- `route.ts` refactoring has progressed from 3568 lines to about 2912 lines.
- User identity/account linking documentation is complete.
- Keep the cost explosion prevention rule: no API/LLM calls during structural cleanup.

## 2. Personal Memory Goal

Personal Memory is not simple chat storage. It should remember the user's decisions, concern patterns, and execution outcomes.

- History = Decision Session Archive.
- Review Card = Outcome Check.
- Personal Memory = Long-term User Understanding.

## 3. Memory Stages

### Memory v0: Read-only Memory Without Extra LLM Calls

Use existing stored data without adding new LLM calls.

- `conversations`
- `messages`
- Decision summary fields
- Review-card fields

### Memory v1: Decision Memory

Capture decision-oriented patterns.

- Repeated concerns
- Decision tendencies
- Execution/defer patterns

### Memory v2: Personal Memory

Capture long-term user understanding.

- Values
- Preferences
- Long-term goals
- Advice patterns to avoid

### Memory v3: Decision Network / Life Graph

Connect decisions, outcomes, values, and long-term direction into a broader decision network.

## 4. Prerequisites Before July

- Fix the meaning of `user_id` and `provider_user_id`.
- Design `users` and `user_identities`.
- Stabilize saving `conversations.user_id`.
- Clarify lookup criteria for history/review-card data.
- Design `memory-store.ts` and `memory-context.ts`.
- Do not add memory logic directly to `route.ts`.

## 5. Suggested July Implementation Order

1. Finalize Memory v0 DB design.
2. Create `memory-store.ts`.
3. Create `memory-context.ts`.
4. Query recent/important decision memory.
5. Decide where to inject memory context before Stage 2 or Stage 3.
6. Connect Review Card outcomes as memory candidates.
7. Run internal manual tests.
8. Review LLM-summarized memory afterward.

## 6. Rules and Cautions

- Do not introduce vector search/embedding from the beginning.
- Do not introduce LLM-summarized memory from the beginning.
- Do not remove `provider_user_id` immediately.
- Do not implement memory save/query logic directly in `route.ts`.
- Run promptfoo only for large changes.
- Limit real LLM tests to the final 1-2 runs.

## 7. August-September Goals

- Reach a level where general users feel that "this app remembers me."
- Kakao Channel can be prepared in July, but full user acquisition should be decided after quality validation in August-September.
- Once Memory v0 actually works, the possibility of general user adoption increases.

## 8. Checklist

- [ ] User identity documentation merged
- [ ] Personal memory roadmap document written
- [ ] DB draft finalized
- [ ] `memory-store.ts` designed
- [ ] `memory-context.ts` designed
- [ ] History/review-card query helpers organized
- [ ] Memory v0 internally tested
- [ ] Kakao Channel readiness decided
