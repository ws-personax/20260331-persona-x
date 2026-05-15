/**
 * route.ts detectCategory + 페르소나 직접 호출 감지 (테스트 전용, 프로덕션 미연동)
 * route.ts 907~932행 CATEGORY_MAP / detectCategory 와 동일 우선순위.
 */

const CATEGORY_MAP = {
  finance:  /주식|펀드|ETF|종목|코스피|코스닥|나스닥|NASDAQ|S&P500|SP500|S&P|다우존스|다우|항셍|닛케이|원달러|달러|금|채권|포트폴리오|수익|손절|매수|매도|배당|금리|환율|가상화폐|비트코인|저축|예금|적금|퇴직금|연금|삼성전자|SK하이닉스|카카오뱅크|카카오게임즈|카카오|네이버|현대차|기아차|기아|LG전자|LG|엘지전자|엘지|삼성바이오|셀트리온|포스코|크래프톤|넷마블|하이브|두산|롯데|한화|SK|KT|CJ|GS|KB금융|신한지주|하나금융|테슬라|애플|엔비디아|구글|아마존|마이크로소프트|돈이|돈은|돈을|살까|팔까|투자할까|넣을까|빼야|수익|손실|올랐|떨어졌|물렸|상승|하락/,
  sports:   /야구|축구|농구|배구|골프|올림픽|경기|이길|승부|우승|선수|리그|기아|삼성라이온즈|두산|LG트윈스|롯데|한화|KT|SSG|NC|키움/,
  news:     /정세|뉴스|전쟁|분쟁|중동|러시아|우크라이나|미중|외교|정치|대통령|선거|경제뉴스|시황|금융뉴스|증시|환경|기후|재난|사건|사고|테러|유가|원유|석유|에너지|OPEC|산유국|천연가스|인플레이션|금리정책|연준|Fed|미연준|기준금리|호르무즈|이란|이스라엘|하마스|헤즈볼라|가자|레바논|트럼프|바이든|시진핑|푸틴|북한|미사일|핵|제재|관세|무역전쟁|환율전쟁|HMM|화물선|해운|공급망|반도체규제|AI규제|빅테크|실리콘밸리|연방|의회|상원|하원|탄핵|대선|총선|보궐|여당|야당|국회|법안|정책/,
  life:     /명퇴|명예퇴직|희망퇴직|퇴직 권유|권고사직|은퇴|조기퇴직|퇴직 후|제2인생|요양원|치매|부모님 건강|어머니 건강|아버지 건강|무릎|허리|혈압|당뇨|갱년기|근감소|건강검진|병원|아이 대학|자녀 취업|자녀 결혼|아들 걱정|딸 걱정|황혼이혼|부부 갈등|노후|노후준비|노후자금|은퇴자금|막막|가장으로서|생계|카드론|노후파산|노후빈곤|황혼육아|손자|손녀|며느리|사위|시댁|처가|이혼숙려|졸혼|별거/,
  legal:    /세금|법률|계약|소송|이혼|상속|증여|부동산등기|임대차|보증금|노동|퇴직|해고|세무|신고|명퇴|권고사직|퇴직금|실업급여|노동부|노무사/,
  tech:     /자동차|전기차|배터리|반도체|AI|인공지능|스마트폰|앱|소프트웨어|하드웨어|IT|클라우드/,
  emotion:  /힘들|외로|슬프|우울|화나|기쁘|설레|불안|걱정|스트레스|피곤|지쳐|고민|마음|감정|위로|공감|재테크고민|투자고민|노후걱정/,
};

const HEALTH_KEYWORDS = /피부과|병원|시술|성형|약|치료|수술|검사|진료|의사|한의원|치과|안과|이비인후과|내과|외과|정신과|MRI|CT|항암|투약|처방|입원|외래/;

/** route.ts detectCategory 동일 */
export const detectCategoryRoute = (text) => {
  if (HEALTH_KEYWORDS.test(text)) return 'life';
  if (CATEGORY_MAP.emotion.test(text)) return 'emotion';
  if (CATEGORY_MAP.finance.test(text)) return 'finance';
  if (CATEGORY_MAP.news.test(text)) return 'news';
  if (CATEGORY_MAP.sports.test(text)) return 'sports';
  if (CATEGORY_MAP.life.test(text)) return 'life';
  if (CATEGORY_MAP.legal.test(text)) return 'legal';
  if (CATEGORY_MAP.tech.test(text)) return 'tech';
  return 'general';
};

const COMPLEX_SIGNALS = {
  job: /짤렸|해고|퇴사|실직|명퇴|권고|권고사직|권고퇴직|실업/,
  money: /돈|생계|빚|대출|연금|생활비|수입|지출|어떻게 해야/,
  emotion: /힘들|막막|불안|걱정|우울|외로|지쳐/,
};

/** 테스트 스펙용 카테고리 라벨 (route 원본 + 복합 주제) */
export const mapTestCategory = (text) => {
  const routeCat = detectCategoryRoute(text);
  const job = COMPLEX_SIGNALS.job.test(text);
  const money = COMPLEX_SIGNALS.money.test(text);
  const emo = COMPLEX_SIGNALS.emotion.test(text);
  const themeCount = [job, money, emo].filter(Boolean).length;
  if (themeCount >= 2 || (job && money)) {
    return { testCategory: 'complex', routeCategory: routeCat };
  }
  if (routeCat === 'finance') return { testCategory: 'invest', routeCategory: routeCat };
  if (routeCat === 'emotion') return { testCategory: 'emotional', routeCategory: routeCat };
  if (routeCat === 'general') return { testCategory: 'casual', routeCategory: routeCat };
  return { testCategory: routeCat, routeCategory: routeCat };
};

/**
 * 유저가 특정 페르소나를 직접 부른 경우 (route.ts 에는 미구현 — isExplicitPersonaPick=false 고정)
 */
export const detectExplicitPersonaCall = (text) => {
  const t = (text || '').trim();
  if (!t) return null;

  const names = ['ECHO', 'LUCIA', 'JACK', 'RAY'];
  for (const name of names) {
    const re = new RegExp(
      `(?:^|[\\s,，])${name}(?:\\s*님)?\\s*[,，]?(?:\\s*(?:어떻게|생각|의견|봐|말|뭐))`,
      'i',
    );
    if (re.test(t)) return name;
    const reShort = new RegExp(`(?:^|[\\s,，])${name}\\s*[,，]`, 'i');
    if (reShort.test(t)) return name;
    const reHonorific = new RegExp(`(?:^|[\\s,，])${name}\\s*님\\s`, 'i');
    if (reHonorific.test(t)) return name;
  }
  return null;
};

export const routeMessage = (text) => {
  const personaCall = detectExplicitPersonaCall(text);
  const { testCategory, routeCategory } = mapTestCategory(text);
  return {
    personaCall,
    testCategory,
    routeCategory,
    mode: personaCall ? 'single-persona' : 'multi-persona',
  };
};
