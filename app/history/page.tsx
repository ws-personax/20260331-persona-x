'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface HistoryItem {
  id: number;
  created_at: string;
  keyword: string;
  verdict: string;
  confidence: number;
  entry_price_num: number | null;
  target_price_num: number | null;
  stop_loss_num: number | null;
  currency: string | null;
  result_status: string;
  asset_type: string;
  question: string;
}

interface CurrentPrice {
  price: number | null;
  change: string | null;
}

const VERDICT_COLOR: Record<string, string> = {
  '매수 우위': '#16a34a',
  '매도 우위': '#dc2626',
  '관망': '#6b7280',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: '판정 대기',
  SUCCESS: '성공',
  FAIL: '실패',
  HOLD: '홀딩',
  INVALID: '무효',
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatPrice = (n: number | null, currency: string) => {
  if (n === null) return '-';
  const cur = currency || 'KRW';
  return cur === 'KRW'
    ? Math.round(n).toLocaleString('ko-KR') + '원'
    : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' USD';
};

const ProfitBadge = ({
  entry,
  current,
  verdict,
}: {
  entry: number | null;
  current: number | null;
  verdict: string;
}) => {
  // ✅ 관망 판정은 수익률 표시 안 함 (직접 투자 지시 없음)
  if (verdict === '관망') {
    return <span style={{ fontSize: 11, color: '#9ca3af' }}>관망 (수익률 해당 없음)</span>;
  }
  if (entry === null || current === null) {
    return <span style={{ fontSize: 11, color: '#9ca3af' }}>현재가 로딩 중</span>;
  }
  if (entry === 0) {
    return <span style={{ fontSize: 11, color: '#9ca3af' }}>수익률 계산 불가</span>;
  }
  const rate = ((current - entry) / entry) * 100;
  const isPos = rate >= 0;
  return (
    <span style={{
      fontSize: 12,
      fontWeight: 700,
      color: isPos ? '#16a34a' : '#dc2626',
      background: isPos ? '#dcfce7' : '#fee2e2',
      padding: '2px 8px',
      borderRadius: 6,
    }}>
      {isPos ? '+' : ''}{rate.toFixed(2)}%
    </span>
  );
};

export default function HistoryPage() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPrices, setCurrentPrices] = useState<Record<number, CurrentPrice>>({});
  const [user, setUser] = useState<{ email?: string | null } | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);

        // ✅ 삼성 브라우저 등 storage 제한 환경 대비 — 자동 갱신 루프 시작 후 잠시 대기
        try {
          await supabase.auth.startAutoRefresh();
        } catch {
          // 무시 — 이미 시작됐거나 환경 미지원
        }
        await new Promise(resolve => setTimeout(resolve, 500));

        // ✅ 모바일 쿠키 동기화 지연 대비 — refreshSession()으로 토큰 갱신 시도 후 getUser() 확인
        //    refreshSession은 만료 토큰을 갱신하고, 세션이 아예 없으면 무해하게 패스
        try {
          await supabase.auth.refreshSession();
        } catch (refreshErr) {
          console.warn('[history] refreshSession 무시 가능한 오류:', refreshErr);
        }

        // ✅ getSession()이 아닌 getUser() 사용 — Supabase 서버에 토큰을 직접 검증해
        //    캐시 잔존/위변조 영향을 받지 않음 (모바일에서 더 신뢰성 높음)
        const { data: { user: authUser }, error: userError } = await supabase.auth.getUser();
        if (userError || !authUser) {
          console.error('[history] getUser 실패:', userError ? {
            message: userError.message,
            name: userError.name,
            status: (userError as { status?: number }).status,
          } : 'user is null');
          setError('NO_SESSION');
          return;
        }
        setUser({ email: authUser.email });

        const { data, error: dbError } = await supabase
          .from('user_analysis_history')
          .select('id, created_at, keyword, verdict, confidence, entry_price_num, target_price_num, stop_loss_num, currency, result_status, asset_type, question')
          .eq('user_id', authUser.id)
          .order('created_at', { ascending: false })
          .limit(50);
        if (dbError) {
          console.error('[history] DB 쿼리 실패:', {
            message: dbError.message,
            code: dbError.code,
            details: dbError.details,
            hint: dbError.hint,
            user_id: authUser.id,
          });
          throw dbError;
        }
        setItems(data || []);
      } catch (e) {
        // 상세 로깅 — message/stack까지 출력해야 모바일 원인 파악 가능
        console.error('[history] loadData 실패:', {
          error: e,
          message: e instanceof Error ? e.message : String(e),
          name: e instanceof Error ? e.name : undefined,
          stack: e instanceof Error ? e.stack : undefined,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        });
        setError('히스토리를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [supabase]);

  useEffect(() => {
    if (!items.length) return;
    let alive = true;
    const fetchPrices = async () => {
      const results: Record<number, CurrentPrice> = {};
      const uniqueKeywords = Array.from(new Set(items.map((i) => i.keyword).filter(Boolean)));
      await Promise.all(
        uniqueKeywords.map(async (keyword) => {
          try {
            const res = await fetch(`/api/price?keyword=${encodeURIComponent(keyword)}`);
            const data = await res.json();
            // ✅ 실패 시에도 null로 명시 초기화 (이전 값 오염 방지)
            items.filter((i) => i.keyword === keyword).forEach((i) => {
              results[i.id] = {
                price: (res.ok && typeof data.rawPrice === 'number') ? data.rawPrice : null,
                change: (res.ok && typeof data.change === 'string') ? data.change : null,
              };
            });
          } catch {
            // 실패 시 null로 초기화
            items.filter((i) => i.keyword === keyword).forEach((i) => {
              results[i.id] = { price: null, change: null };
            });
          }
        })
      );
      if (alive) setCurrentPrices(results);
    };
    fetchPrices();
    return () => { alive = false; };
  }, [items]);

  const [filterDays, setFilterDays] = useState<7 | 30 | 0>(0); // 0 = 전체

  const filteredItems = useMemo(() => {
    if (!filterDays) return items;
    const cutoff = new Date(Date.now() - filterDays * 24 * 60 * 60 * 1000);
    return items.filter(i => new Date(i.created_at) >= cutoff);
  }, [items, filterDays]);

  const stats = useMemo(() => {
    const target = filteredItems;
    const withResult = target.filter((i) => i.result_status === 'SUCCESS' || i.result_status === 'FAIL');
    const success = withResult.filter((i) => i.result_status === 'SUCCESS').length;

    // ✅ 자산군별 승률
    const byAsset: Record<string, { success: number; total: number }> = {};
    withResult.forEach(i => {
      const type = i.asset_type === 'CRYPTO' ? '코인'
        : i.asset_type === 'KOREAN_STOCK' ? '한국주식'
        : i.asset_type === 'US_STOCK' ? '미국주식' : '기타';
      if (!byAsset[type]) byAsset[type] = { success: 0, total: 0 };
      byAsset[type].total++;
      if (i.result_status === 'SUCCESS') byAsset[type].success++;
    });

    // ✅ 종목별 성과 상위 3개
    const byKeyword: Record<string, { success: number; total: number }> = {};
    withResult.forEach(i => {
      if (!byKeyword[i.keyword]) byKeyword[i.keyword] = { success: 0, total: 0 };
      byKeyword[i.keyword].total++;
      if (i.result_status === 'SUCCESS') byKeyword[i.keyword].success++;
    });
    const topKeywords = Object.entries(byKeyword)
      .map(([k, v]) => ({ keyword: k, rate: Math.round(v.success / v.total * 100), total: v.total }))
      .sort((a, b) => b.rate - a.rate || b.total - a.total)
      .slice(0, 3);

    // ✅ 연속 성공 스트릭
    let streak = 0;
    for (const i of [...target].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())) {
      if (i.result_status === 'SUCCESS') streak++;
      else if (i.result_status === 'FAIL') break;
    }

    return {
      total: target.length,
      withResult: withResult.length,
      successRate: withResult.length > 0 ? Math.round((success / withResult.length) * 100) : null,
      byAsset,
      topKeywords,
      streak,
    };
  }, [filteredItems]);

  if (loading) return (
    <div style={{ minHeight: '100dvh', background: '#b2c7da', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <p style={{ color: '#374151', fontWeight: 700 }}>히스토리 불러오는 중...</p>
    </div>
  );

  // ✅ 세션 없음 — 에러 대신 친절한 로그인 안내 (모바일 쿠키 미동기화 대응)
  if (error === 'NO_SESSION') return (
    <div style={{ minHeight: '100dvh', background: '#b2c7da', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, overflow: 'auto', WebkitOverflowScrolling: 'touch', padding: '0 24px' }}>
      <p style={{ color: '#374151', fontWeight: 700, textAlign: 'center', fontSize: 15, margin: 0, marginTop: 200 }}>
        로그인 후 히스토리를 볼 수 있어요.
      </p>
      <Link href="/" style={{ background: '#111827', color: '#fff', padding: '10px 20px', borderRadius: 10, textDecoration: 'none', fontWeight: 700 }}>
        홈으로
      </Link>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100dvh', background: '#b2c7da', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <p style={{ color: '#dc2626', fontWeight: 700, marginTop: 200 }}>{error}</p>
      <Link href="/" style={{ background: '#111827', color: '#fff', padding: '10px 20px', borderRadius: 10, textDecoration: 'none', fontWeight: 700 }}>
        홈으로
      </Link>
    </div>
  );

  return (
    // ✅ 모바일 대응: 100dvh로 iOS Safari dynamic toolbar 대응, overflow:auto 명시,
    //    iOS momentum scrolling 활성화로 스크롤 끊김 방지
    <div style={{ minHeight: '100dvh', background: '#b2c7da', fontFamily: 'sans-serif', overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <header style={{ background: 'rgba(178,199,218,0.95)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.06)', position: 'sticky', top: 0, zIndex: 10 }}>
        <Link href="/" style={{ fontWeight: 800, fontSize: 18, color: '#1f2937', textDecoration: 'none' }}>
          ← PersonaX
        </Link>
        <span style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>{user?.email || ''}</span>
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px', paddingBottom: 'max(40px, env(safe-area-inset-bottom))' }}>
        {/* ✅ 기간 필터 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {([0, 7, 30] as const).map(d => (
            <button key={d} onClick={() => setFilterDays(d)} style={{
              padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 12,
              background: filterDays === d ? '#111827' : '#fff',
              color: filterDays === d ? '#fff' : '#6b7280',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}>
              {d === 0 ? '전체' : `최근 ${d}일`}
            </button>
          ))}
        </div>

        {/* ✅ 승률 대시보드 */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '20px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>

          {/* 메인 지표 */}
          <div style={{ display: 'flex', gap: 20, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center', minWidth: 60 }}>
              <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 4px', fontWeight: 600 }}>총 분석</p>
              <p style={{ fontSize: 28, fontWeight: 800, color: '#111827', margin: 0 }}>{stats.total}</p>
            </div>
            <div style={{ textAlign: 'center', minWidth: 60 }}>
              <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 4px', fontWeight: 600 }}>판정 완료</p>
              <p style={{ fontSize: 28, fontWeight: 800, color: '#111827', margin: 0 }}>{stats.withResult}</p>
            </div>
            <div style={{ textAlign: 'center', minWidth: 60 }}>
              <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 4px', fontWeight: 600 }}>승률</p>
              <p style={{ fontSize: 28, fontWeight: 800, color: stats.successRate !== null ? '#16a34a' : '#9ca3af', margin: 0 }}>
                {stats.successRate !== null ? `${stats.successRate}%` : '-'}
              </p>
            </div>
            {stats.streak > 1 && (
              <div style={{ textAlign: 'center', minWidth: 60 }}>
                <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 4px', fontWeight: 600 }}>연속 성공</p>
                <p style={{ fontSize: 28, fontWeight: 800, color: '#f59e0b', margin: 0 }}>{stats.streak}🔥</p>
              </div>
            )}
          </div>

          {/* 자산군별 승률 */}
          {Object.keys(stats.byAsset).length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, margin: '0 0 8px' }}>자산군별 승률</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Object.entries(stats.byAsset).map(([type, v]) => {
                  const rate = Math.round(v.success / v.total * 100);
                  return (
                    <div key={type} style={{
                      background: rate >= 70 ? '#dcfce7' : rate >= 50 ? '#fef9c3' : '#fee2e2',
                      borderRadius: 10, padding: '8px 14px', textAlign: 'center',
                    }}>
                      <p style={{ fontSize: 11, color: '#374151', margin: '0 0 2px', fontWeight: 600 }}>{type}</p>
                      <p style={{ fontSize: 18, fontWeight: 800, color: rate >= 70 ? '#16a34a' : rate >= 50 ? '#d97706' : '#dc2626', margin: 0 }}>
                        {rate}%
                      </p>
                      <p style={{ fontSize: 10, color: '#9ca3af', margin: 0 }}>{v.success}/{v.total}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 종목별 성과 TOP 3 */}
          {stats.topKeywords.length > 0 && (
            <div>
              <p style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, margin: '0 0 8px' }}>🏆 종목별 성과 TOP {stats.topKeywords.length}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {stats.topKeywords.map((k, idx) => (
                  <div key={k.keyword} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: idx === 0 ? '#f59e0b' : idx === 1 ? '#9ca3af' : '#cd7f32' }}>
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#111827', flex: 1 }}>{k.keyword}</span>
                    <div style={{ width: 80, height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${k.rate}%`, height: '100%', background: k.rate >= 70 ? '#16a34a' : '#f59e0b', borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: k.rate >= 70 ? '#16a34a' : '#d97706', minWidth: 36 }}>{k.rate}%</span>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>{k.total}회</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 히스토리 목록 */}
        {filteredItems.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, textAlign: 'center' }}>
            <p style={{ color: '#6b7280', fontWeight: 600 }}>분석 기록이 없습니다.</p>
            <Link href="/" style={{ display: 'inline-block', marginTop: 12, background: '#111827', color: '#fff', padding: '10px 20px', borderRadius: 10, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
              첫 분석 시작하기
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredItems.map((item) => (
              <div key={item.id} style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>{item.keyword}</span>
                    <span style={{ fontSize: 11, background: VERDICT_COLOR[item.verdict] || '#6b7280', color: '#fff', padding: '2px 8px', borderRadius: 5, fontWeight: 700 }}>
                      {item.verdict}
                    </span>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>신뢰도 {item.confidence}%</span>
                  </div>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>{formatDate(item.created_at)}</span>
                </div>

                {item.question && (
                  <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    💬 {item.question}
                  </p>
                )}

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  {item.entry_price_num !== null && (
                    <span style={{ fontSize: 12, color: '#374151' }}>
                      진입 <strong>{formatPrice(item.entry_price_num, item.currency || 'KRW')}</strong>
                    </span>
                  )}
                  {item.target_price_num !== null && (
                    <span style={{ fontSize: 12, color: '#16a34a' }}>
                      목표 {formatPrice(item.target_price_num, item.currency || 'KRW')}
                    </span>
                  )}
                  {item.stop_loss_num !== null && (
                    <span style={{ fontSize: 12, color: '#dc2626' }}>
                      손절 {formatPrice(item.stop_loss_num, item.currency || 'KRW')}
                    </span>
                  )}
                  <ProfitBadge
                    entry={item.entry_price_num}
                    current={currentPrices[item.id]?.price ?? null}
                    verdict={item.verdict}
                  />
                  <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>
                    {STATUS_LABEL[item.result_status] || item.result_status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
