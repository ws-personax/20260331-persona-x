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
    : n.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' USD';
};

const ProfitBadge = ({
  entry,
  current,
}: {
  entry: number | null;
  current: number | null;
}) => {
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
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        const authUser = userData.user;
        if (!authUser) {
          setError('로그인이 필요합니다.');
          return;
        }
        setUser({ email: authUser.email });
        const { data, error: dbError } = await supabase
          .from('user_analysis_history')
          .select('id, created_at, keyword, verdict, confidence, entry_price_num, target_price_num, stop_loss_num, currency, result_status, asset_type, question')
          .eq('user_id', authUser.id)
          .order('created_at', { ascending: false })
          .limit(50);
        if (dbError) throw dbError;
        setItems(data || []);
      } catch (e) {
        console.error(e);
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
      const uniqueKeywords = [...new Set(items.map((i) => i.keyword).filter(Boolean))];
      await Promise.all(
        uniqueKeywords.map(async (keyword) => {
          try {
            const res = await fetch(`/api/price?keyword=${encodeURIComponent(keyword)}`);
            if (!res.ok) return;
            const data = await res.json();
            items.filter((i) => i.keyword === keyword).forEach((i) => {
              results[i.id] = {
                price: typeof data.rawPrice === 'number' ? data.rawPrice : null,
                change: typeof data.change === 'string' ? data.change : null,
              };
            });
          } catch { /* 조용히 실패 */ }
        })
      );
      if (alive) setCurrentPrices(results);
    };
    fetchPrices();
    return () => { alive = false; };
  }, [items]);

  const stats = useMemo(() => {
    const withResult = items.filter((i) => i.result_status === 'SUCCESS' || i.result_status === 'FAIL');
    const success = withResult.filter((i) => i.result_status === 'SUCCESS').length;
    return {
      total: items.length,
      withResult: withResult.length,
      successRate: withResult.length > 0 ? Math.round((success / withResult.length) * 100) : null,
    };
  }, [items]);

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#b2c7da', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#374151', fontWeight: 700 }}>히스토리 불러오는 중...</p>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', background: '#b2c7da', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <p style={{ color: '#dc2626', fontWeight: 700 }}>{error}</p>
      <Link href="/" style={{ background: '#111827', color: '#fff', padding: '10px 20px', borderRadius: 10, textDecoration: 'none', fontWeight: 700 }}>
        홈으로
      </Link>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#b2c7da', fontFamily: 'sans-serif' }}>
      <header style={{ background: 'rgba(178,199,218,0.95)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.06)', position: 'sticky', top: 0, zIndex: 10 }}>
        <Link href="/" style={{ fontWeight: 800, fontSize: 18, color: '#1f2937', textDecoration: 'none' }}>
          ← PersonaX
        </Link>
        <span style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>{user?.email || ''}</span>
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px' }}>
        {/* 승률 카드 */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '16px 20px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 4px', fontWeight: 600 }}>총 분석</p>
            <p style={{ fontSize: 24, fontWeight: 800, color: '#111827', margin: 0 }}>{stats.total}</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 4px', fontWeight: 600 }}>판정 완료</p>
            <p style={{ fontSize: 24, fontWeight: 800, color: '#111827', margin: 0 }}>{stats.withResult}</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 4px', fontWeight: 600 }}>승률</p>
            <p style={{ fontSize: 24, fontWeight: 800, color: stats.successRate !== null ? '#16a34a' : '#9ca3af', margin: 0 }}>
              {stats.successRate !== null ? `${stats.successRate}%` : '-'}
            </p>
          </div>
        </div>

        {/* 히스토리 목록 */}
        {items.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, textAlign: 'center' }}>
            <p style={{ color: '#6b7280', fontWeight: 600 }}>분석 기록이 없습니다.</p>
            <Link href="/" style={{ display: 'inline-block', marginTop: 12, background: '#111827', color: '#fff', padding: '10px 20px', borderRadius: 10, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
              첫 분석 시작하기
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((item) => (
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
