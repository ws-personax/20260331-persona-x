/**
 * 키워드·페르소나 라우팅 스모크 테스트
 * 실행: node test-option-d/router-test.mjs
 *
 * 기준:
 * - detectCategory: route.ts CATEGORY_MAP 복제 (router-logic.mjs)
 * - personaCall: route.ts 미구현 → router-logic.mjs 신규 규칙
 */

import {
  detectCategoryRoute,
  detectExplicitPersonaCall,
  mapTestCategory,
  routeMessage,
} from './router-logic.mjs';

const CASES = [
  {
    id: 1,
    message: 'ECHO, 어떻게 생각해?',
    expectPersona: 'ECHO',
    expectCategory: null,
  },
  {
    id: 2,
    message: 'LUCIA 님 의견은?',
    expectPersona: 'LUCIA',
    expectCategory: null,
  },
  {
    id: 3,
    message: 'RAY 어떻게 봐?',
    expectPersona: 'RAY',
    expectCategory: null,
  },
  {
    id: 4,
    message: '삼성전자 어때?',
    expectPersona: null,
    expectCategory: 'invest',
  },
  {
    id: 5,
    message: '힘들어요',
    expectPersona: null,
    expectCategory: 'emotional',
  },
  {
    id: 6,
    message: '오늘 점심 뭐 먹지',
    expectPersona: null,
    expectCategory: 'casual',
  },
  {
    id: 7,
    message: '회사 짤렸고 돈 어떻게 해야 해',
    expectPersona: null,
    expectCategory: 'complex',
  },
];

console.log('=== PersonaX router-test.mjs ===\n');
console.log('참고: route.ts 는 detectCategory 만 있고, 메시지 내 페르소나 직접 호출 감지는');
console.log('       isExplicitPersonaPick=false 로 고정되어 있음 (teaPersona 는 클라이언트 state).\n');

let passed = 0;
let failed = 0;
const routeOnlyResults = [];

for (const c of CASES) {
  const routed = routeMessage(c.message);
  const routeCatOnly = detectCategoryRoute(c.message);
  const personaOnly = detectExplicitPersonaCall(c.message);

  routeOnlyResults.push({
    id: c.id,
    message: c.message,
    routeCategory: routeCatOnly,
    personaCallNew: personaOnly,
  });

  const personaOk =
    c.expectPersona === null
      ? routed.personaCall === null
      : routed.personaCall === c.expectPersona;

  const categoryOk =
    c.expectCategory === null
      ? true
      : routed.testCategory === c.expectCategory;

  const ok = personaOk && categoryOk;

  if (ok) {
    console.log(`✅ Case ${c.id}: "${c.message}"`);
    console.log(
      `   personaCall=${routed.personaCall ?? 'null'} | testCategory=${routed.testCategory} | routeCategory=${routed.routeCategory} | mode=${routed.mode}`,
    );
    passed++;
  } else {
    console.log(`❌ Case ${c.id}: "${c.message}"`);
    if (!personaOk) {
      console.log(`   persona: 기대=${c.expectPersona ?? 'null'}, 실제=${routed.personaCall ?? 'null'}`);
    }
    if (!categoryOk) {
      console.log(`   category: 기대=${c.expectCategory}, 실제=${routed.testCategory} (route=${routed.routeCategory})`);
    }
    failed++;
  }
}

console.log('\n--- route.ts detectCategory 단독 (페르소나 호출 없음) ---');
for (const r of routeOnlyResults) {
  console.log(`  [${r.id}] routeCategory=${r.routeCategory} | 신규 personaCall=${r.personaCallNew ?? 'null'}`);
}

console.log(`\n=== 결과: ${passed}/${CASES.length} PASS, ${failed} FAIL ===`);

const suggestions = [
  'route.ts: isExplicitPersonaPick 을 detectExplicitPersonaCall 로 대체 검토',
  'ChatWindow: teaPersona state 를 메시지 파싱 결과와 동기화 (ECHO/LUCIA/RAY 직접 호출 시)',
  'complex 카테고리: route detectCategory 만으로는 Case 7 이 general — 복합 주제 규칙 별도 필요',
  'legal 키워드(해고)와 complex 규칙 우선순위 정의 (짤렸+돈 → complex vs legal)',
];

console.log('\n=== 개선 제안 ===');
suggestions.forEach((s, i) => console.log(`${i + 1}. ${s}`));

process.exit(failed > 0 ? 1 : 0);
