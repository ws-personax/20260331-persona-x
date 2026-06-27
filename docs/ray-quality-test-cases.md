# RAY Quality Test Cases

## Purpose

This document checks whether RAY answers feel like insight, not generic advice.

The target answer structure is:

1. Missed fact
2. Counter scenario
3. Verification point
4. Final judgment

No API or LLM batch QA was run for this check. This is a static quality review using realistic user questions and the current RAY prompt/few-shot direction.

## Evaluation Criteria

- Does it create a "I did not think of that" moment?
- Is the counter scenario meaningful?
- Is the verification point actionable?
- Is the final judgment clear?

Rating:

- Good: All four criteria are clearly satisfied.
- Normal: The structure works, but the insight is not sharp enough.
- Weak: The answer risks becoming generic advice.

## Test Cases

### 1. Startup

Question:
"퇴사하고 6개월 안에 작은 카페를 열어도 될까요?"

Expected RAY angle:
The missed fact is not "cafe passion" but fixed burn: deposit, interior cost, monthly rent, minimum staff cost, and how long cash survives before repeat customers form.

Quality check:
- Missed fact: Strong. The user may not be thinking about cash survival before repeat demand.
- Counter scenario: Strong. Opening succeeds visually but cash runs out before retention forms.
- Verification point: Actionable. Monthly fixed cost, break-even sales, runway.
- Final judgment: Clear. Do not decide by desire; decide by runway and repeat demand.

Rating: Good

### 2. Startup

Question:
"친구랑 같이 온라인 쇼핑몰을 시작해도 될까요?"

Expected RAY angle:
The missed fact is partnership risk: role split, inventory burden, marketing budget, exit rule, and who absorbs loss if sales are delayed.

Quality check:
- Missed fact: Strong. Most users focus on item choice, not partner failure mode.
- Counter scenario: Strong. Friendship holds until inventory loss and role ambiguity appear.
- Verification point: Actionable. Written role split, loss cap, inventory limit, decision authority.
- Final judgment: Clear. Start only after the loss and exit rule are written.

Rating: Good

### 3. Job Change

Question:
"연봉은 비슷한데 더 큰 회사로 이직하는 게 맞을까요?"

Expected RAY angle:
The missed fact is not company size but role quality: decision authority, learning slope, promotion path, and whether the move increases future optionality.

Quality check:
- Missed fact: Strong. Bigger company can reduce scope.
- Counter scenario: Meaningful. Brand improves but actual work becomes narrower.
- Verification point: Actionable. Role scope, reporting line, promotion criteria, next job leverage.
- Final judgment: Clear. Move only if the role expands future options.

Rating: Good

### 4. Job Change

Question:
"지금 회사가 너무 힘든데 일단 아무 데나 옮겨도 될까요?"

Expected RAY angle:
The missed fact is that escape and improvement are different. The next company must be compared on workload, manager risk, compensation, commute, and recovery time.

Quality check:
- Missed fact: Strong. The user may confuse leaving pain with gaining a better condition.
- Counter scenario: Strong. Current pain ends, but a worse structure starts.
- Verification point: Actionable. Compare three concrete conditions before accepting.
- Final judgment: Clear. Escape is valid, but "anywhere" is not a decision standard.

Rating: Good

### 5. Investment

Question:
"요즘 많이 빠진 주식인데 지금 사면 반등하지 않을까요?"

Expected RAY angle:
The missed fact is that a fall is not evidence of rebound. Need earnings direction, liquidity, sector trend, and whether the fall is valuation compression or business deterioration.

Quality check:
- Missed fact: Strong. Cheap-looking price is not a rebound signal.
- Counter scenario: Strong. It falls because fundamentals are worsening.
- Verification point: Actionable. Earnings revision, volume, sector trend, holding period, loss limit.
- Final judgment: Clear. Rebound is not the base case until the cause of decline is verified.

Rating: Good

### 6. Investment

Question:
"비트코인 지금 들어가도 늦지 않았을까요?"

Expected RAY angle:
The missed fact is that "late" depends on time horizon and drawdown tolerance, not current fear. Need entry rule, split plan, invalidation point, and position size.

Quality check:
- Missed fact: Meaningful. The user frames timing emotionally.
- Counter scenario: Meaningful. Entry is not late, but sizing is too large and volatility forces a bad exit.
- Verification point: Actionable. Position size, split entry, loss tolerance, holding period.
- Final judgment: Clear. Timing cannot be judged without risk capacity.

Rating: Good

### 7. Relationship

Question:
"상대가 사과는 하는데 계속 같은 행동을 반복해요. 계속 만나도 될까요?"

Expected RAY angle:
The missed fact is that apology is not evidence. The evidence is behavior change after conflict: frequency, recovery time, repeat pattern, and cost to the user.

Quality check:
- Missed fact: Strong. Apology can hide unchanged behavior.
- Counter scenario: Strong. The relationship feels repaired after each apology but the pattern remains.
- Verification point: Actionable. Track repeat frequency, changed behavior, recovery pattern.
- Final judgment: Clear. Continue only if behavior changes, not if words improve.

Rating: Good

### 8. Relationship

Question:
"친구가 자꾸 돈을 빌려달라고 하는데 거절하면 제가 나쁜 사람인가요?"

Expected RAY angle:
The missed fact is that moral guilt and repayment risk are separate. Need past repayment behavior, amount cap, written repayment date, and relationship cost.

Quality check:
- Missed fact: Strong. The user is trapped in guilt rather than repayment evidence.
- Counter scenario: Strong. Lending avoids guilt now but damages the friendship later.
- Verification point: Actionable. Past repayment, amount cap, due date, refusal script.
- Final judgment: Clear. Refusal is valid if repayment evidence is weak.

Rating: Good

### 9. Health

Question:
"가슴이 가끔 답답한데 스트레스겠죠?"

Expected RAY angle:
The missed fact is that stress is a possible cause, not a diagnosis. Need symptom timing, duration, exertion link, pain radiation, and emergency warning signs.

Quality check:
- Missed fact: Strong. It blocks self-diagnosis.
- Counter scenario: Strong. Stress assumption delays care for a physical cause.
- Verification point: Actionable. Symptom log and medical consultation threshold.
- Final judgment: Clear. Do not label it stress before checking red flags.

Rating: Good

### 10. Health

Question:
"요즘 계속 피곤한데 그냥 잠을 더 자면 될까요?"

Expected RAY angle:
The missed fact is that fatigue has multiple sources: sleep duration, sleep quality, work load, diet, medication, mood, and medical indicators.

Quality check:
- Missed fact: Normal. The angle is useful but familiar.
- Counter scenario: Meaningful. More sleep does not solve fatigue if the source is sleep quality or medical.
- Verification point: Actionable. Track sleep hours, wake quality, caffeine, exercise, persistent symptoms.
- Final judgment: Mostly clear. Sleep is first check, not final answer.

Rating: Normal

## Summary

Overall result: 9 Good, 1 Normal, 0 Weak.

RAY's strongest areas:

- Startup
- Investment
- Relationship boundary questions
- Health red-flag separation

Areas to improve in the next PR:

- General fatigue and low-energy health questions can still become familiar advice.
- RAY should sharpen the "missed fact" for common health questions by separating symptom source, duration, and escalation threshold.

Recommendation:

No immediate prompt rollback is needed. The next improvement should add 2 to 3 health-specific few-shots for vague symptoms such as fatigue, headache, dizziness, and sleep quality.
