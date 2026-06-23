export type DecisionType =
  | 'startup_vs_job'
  | 'relationship'
  | 'career'
  | 'real_estate_recommendation'
  | 'buy_or_wait'
  | 'knowledge'
  | 'generic';

/**
 * decisionType 단일 판별기 — message-router.ts의 inferDecisionSummaryType()
 * 우선순위/정규식을 그대로 이전한 정본. 순서를 바꾸면 분류 결과가 달라지므로
 * 임의로 재배열하지 않는다.
 */
export function inferDecisionType(
  question: string,
  categoryV3?: string,
): DecisionType {
  const hasRealEstateRecommendationIntent =
    /아파트|부동산|단지|입지|학군|교통|직주근접|실거주|전세|청약|재건축|재개발/.test(question) &&
    /추천|지역|어디|괜찮|좋을까|10억|9억|8억|7억|6억/.test(question);

  if (/창업.*재취업|재취업.*창업|창업\s*vs\s*재취업/i.test(question)) {
    return 'startup_vs_job';
  }
  if (/계속\s*만나|헤어|이 사람|관계|연애|이혼|시기|질투|무시|비난|뒷담|견제|상처|거리두기|경계|대인관계|친구|동료|직장동료|상사|부하|갈등|트러블|미워|싫어|눈치|왕따|따돌림|험담/.test(question)) {
    return 'relationship';
  }
  if (/명퇴|명예퇴직|희망퇴직|권고사직|퇴직|퇴직\s*후|은퇴\s*후|재취업|이직|커리어|진로|퇴사|회사|직장|창업/.test(question)) {
    return 'career';
  }
  if (hasRealEstateRecommendationIntent) {
    return 'real_estate_recommendation';
  }
  if (categoryV3 === 'knowledge') {
    return 'knowledge';
  }
  if (categoryV3 === 'invest' || /사야|매수|팔아야|매도|비트코인|XRP|xrp|리플|이더리움|ETH|eth|솔라나|SOL|sol|삼성전자|주식|코인|투자/.test(question)) {
    return 'buy_or_wait';
  }

  return 'generic';
}
