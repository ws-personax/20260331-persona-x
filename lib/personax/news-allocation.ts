export type NewsRaw = { title: string; link?: string; originallink?: string; url?: string };

export const filterInvestmentNews = (rawNews: unknown): NewsRaw[] => {
  // ✅ 뉴스 필터링 — 키워드와 무관한 뉴스 제거
  const NEWS_EXCLUDE_PATTERNS = [
    /홍콩\s*경찰/,/AI\s*양적거래/,/스파크/,/익명\s*지갑/,
    /초등생\s*시신/,/교토/,/미끼/,/사기/,/보이스피싱/,
  ];
  return (rawNews as Array<{ title: string }>).filter(n => {
    const title = n.title || '';
    return !NEWS_EXCLUDE_PATTERNS.some(p => p.test(title));
  });
};

export const allocatePersonaNews = (news: NewsRaw[]) => {
  // ─── 뉴스 배정 ───
  const cleanNewsItem = (n: NewsRaw) => ({
    title: (n.title || '')
      .replace(/<[^>]*>/g, '').replace(/\[.*?\]/g, '')
      .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
      .trim().slice(0, 20),
    url: n.originallink || n.link || n.url || '',
  });

  const scoredNews = (news as NewsRaw[]).map(n => {
    const t = n.title || '';
    const score =
      /(상승|호재|돌파|수익|최고|급등|반등|상회|개선|수혜|강세|폭증)/.test(t) ? 1 :
      /(하락|악재|급락|손실|우려|위기|긴장|폭락|둔화|하회|긴축|약세|경고)/.test(t) ? -1 : 0;
    return { ...n, score };
  }).filter(n => (n.originallink || n.link || n.url || '').startsWith('http'));

  // ─── 페르소나별 뉴스 배정 — URL 기준 중복 제거 ───
  //   RAY   : 최신순 상위 1건 (scoredNews는 Naver API date 정렬)
  //   JACK  : 긍정(score=1) 1건, 없으면 null
  //   LUCIA : 부정(score=-1) 1건, 없으면 null
  //   ECHO  : 위에서 사용되지 않은 URL 중 1건, 없으면 null
  const getUrl = (n: NewsRaw): string => n.originallink || n.link || n.url || '';
  const usedUrls = new Set<string>();

  const rayPick = scoredNews[0] || null;
  const rayNews = rayPick ? cleanNewsItem(rayPick) : null;
  if (rayPick) usedUrls.add(getUrl(rayPick));

  const jackPick = scoredNews.find(n => n.score === 1 && !usedUrls.has(getUrl(n))) ?? null;
  const jackNews = jackPick ? cleanNewsItem(jackPick) : null;
  if (jackPick) usedUrls.add(getUrl(jackPick));

  const luciaPick = scoredNews.find(n => n.score === -1 && !usedUrls.has(getUrl(n))) ?? null;
  const luciaNews = luciaPick ? cleanNewsItem(luciaPick) : null;
  if (luciaPick) usedUrls.add(getUrl(luciaPick));

  const echoPick = scoredNews.find(n => !usedUrls.has(getUrl(n))) ?? null;
  const echoNews = echoPick ? cleanNewsItem(echoPick) : null;

  return { rayNews, jackNews, luciaNews, echoNews };
};
