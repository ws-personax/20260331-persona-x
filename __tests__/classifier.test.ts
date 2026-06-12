/**
 * c6caa9f 안정화 테스트 — detectCategoryV3 순수 함수 검증
 *
 * 검증 목적:
 *  1. 생활재무 좌절 문장(MONEY_FRUSTRATION_PATTERN)이 emotional로 라우팅되는지
 *  2. 투자 실행 신호(INVESTMENT_EXECUTION_PATTERN)가 함께 있으면 invest를 유지하는지
 *  3. 직장/커리어 문장이 action으로 라우팅되는지
 *
 * 실행: npx tsx __tests__/classifier.test.ts
 * 수정 금지 — classifier.ts 동작 고정 용도
 */

import { detectCategoryV3, type CategoryV3 } from '../lib/personax/classifier';

type Case = { msg: string; expected: CategoryV3; label: string };

const SUITE: { name: string; cases: Case[] }[] = [
  {
    name: '생활재무 좌절 → emotional (MONEY_FRUSTRATION 경로)',
    cases: [
      {
        msg: '돈을 못 모으겠어',
        expected: 'emotional',
        label: '돈+못 모으',
      },
      {
        msg: '저축이 안 돼',
        expected: 'emotional',
        label: '저축+안 돼',
      },
      {
        msg: '월급이 자꾸 새어나가',
        expected: 'emotional',
        label: '월급+새어나가',
      },
      {
        msg: '생활비가 감당이 안 돼',
        expected: 'emotional',
        label: '생활비+감당+안 돼',
      },
      {
        msg: '돈 관리가 안 돼',
        expected: 'emotional',
        label: '돈+관리+안 돼',
      },
      {
        msg: '카드값 감당이 안 돼',
        expected: 'emotional',
        label: '카드값+감당',
      },
    ],
  },
  {
    name: '투자 실행 신호 있으면 invest 유지',
    cases: [
      {
        msg: '돈 관리가 안 되는데 S&P500은 어때',
        expected: 'invest',
        label: 'MONEY_FRUSTRATION + S&P500 → invest',
      },
      {
        msg: '생활비가 힘든데 배당주 살까',
        expected: 'invest',
        label: '배당주+살까 → invest',
      },
      {
        msg: '퇴직금 2억을 어디에 넣을까',
        expected: 'invest',
        label: 'LUMP_SUM + 어디에 넣 → invest',
      },
    ],
  },
  {
    name: '직장/커리어 → action',
    cases: [
      {
        msg: '창업 vs 재취업',
        expected: 'action',
        label: '창업+재취업',
      },
      {
        msg: '상사가 책임을 떠넘겨서 퇴사하고 싶어',
        expected: 'action',
        label: '상사+퇴사+떠넘겨',
      },
    ],
  },
];

// ─── runner ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

for (const suite of SUITE) {
  console.log(`\n  ${suite.name}`);
  for (const { msg, expected, label } of suite.cases) {
    const actual = detectCategoryV3(msg);
    if (actual === expected) {
      console.log(`    ✓  [${label}]`);
      console.log(`       "${msg}"`);
      passed++;
    } else {
      console.error(`    ✗  [${label}]`);
      console.error(`       "${msg}"`);
      console.error(`       expected : ${expected}`);
      console.error(`       actual   : ${actual}`);
      failed++;
    }
  }
}

const total = passed + failed;
console.log('\n─────────────────────────────────────────────────');
if (failed === 0) {
  console.log(`  ✓  ${passed}/${total} passed`);
} else {
  console.error(`  ✗  ${passed} passed  ${failed} failed  (${total} total)`);
}
console.log('─────────────────────────────────────────────────\n');

if (failed > 0) process.exit(1);
