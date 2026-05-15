/**
 * collectMarketFactPack 스모크 테스트
 * 실행: npx tsx test-option-d/market-facts.test.mjs
 */

const { collectMarketFactPack } = await import('../lib/personax/market-facts.ts');

const CASES = [
  {
    id: 1,
    label: '삼성전자 PBR',
    message: '삼성전자 PBR 어떤가요?',
    category: 'finance',
    expectNull: false,
  },
  {
    id: 2,
    label: '비트코인',
    message: '비트코인 어때요?',
    category: 'finance',
    expectNull: false,
  },
  {
    id: 3,
    label: '날씨 (종목 없음)',
    message: '오늘 날씨 어때?',
    category: 'general',
    expectNull: true,
  },
];

const assertPack = (pack, label) => {
  const errors = [];
  if (!pack || typeof pack !== 'object') {
    errors.push('MarketFactPack 객체가 아님');
    return errors;
  }
  if (!pack.keyword?.trim()) errors.push('keyword 비어 있음');
  if (!pack.asOf?.includes('+09:00')) errors.push('asOf KST 형식 아님');
  if (!pack.price?.trim()) errors.push('price 비어 있음');
  if (pack.change === undefined || pack.change === null) errors.push('change 없음');
  if (pack.pbr !== null) errors.push('pbr는 null 이어야 함');
  if (pack.per !== null) errors.push('per는 null 이어야 함');
  if (!Array.isArray(pack.missing) || !pack.missing.includes('pbr') || !pack.missing.includes('per')) {
    errors.push('missing에 pbr/per 없음');
  }
  if (errors.length) {
    return errors.map((e) => `[${label}] ${e}`);
  }
  return [];
};

let passed = 0;
let failed = 0;

console.log('=== market-facts.test.mjs ===\n');

for (const c of CASES) {
  const messages = [{ role: 'user', content: c.message }];
  let pack;
  let thrown;
  try {
    pack = await collectMarketFactPack(messages, c.category);
  } catch (err) {
    thrown = err;
  }

  if (thrown) {
    console.log(`❌ Case ${c.id} (${c.label}): 예외 — ${thrown.message}`);
    failed++;
    continue;
  }

  if (c.expectNull) {
    if (pack === null) {
      console.log(`✅ Case ${c.id} (${c.label}): null (기대대로)`);
      passed++;
    } else {
      console.log(`❌ Case ${c.id} (${c.label}): null 기대, 실제 keyword=${pack?.keyword}`);
      failed++;
    }
    continue;
  }

  if (pack === null) {
    console.log(`❌ Case ${c.id} (${c.label}): MarketFactPack 기대, null 반환 (API/키워드 실패 가능)`);
    failed++;
    continue;
  }

  const errs = assertPack(pack, c.label);
  if (errs.length) {
    console.log(`❌ Case ${c.id} (${c.label}):`);
    errs.forEach((e) => console.log(`   ${e}`));
    failed++;
  } else {
    console.log(`✅ Case ${c.id} (${c.label}): MarketFactPack`);
    console.log(`   keyword=${pack.keyword} price=${pack.price} change=${pack.change}% missing=[${pack.missing.join(', ')}]`);
    passed++;
  }
}

console.log(`\n=== 결과: ${passed}/${CASES.length} PASS, ${failed} FAIL ===`);
process.exit(failed > 0 ? 1 : 0);
