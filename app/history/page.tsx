"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── 타입 ─────────────────────────────────────────────────
interface HistoryItem {
  id:              number;
  keyword:         string;
  question:        string;
  verdict:         '매수 우위' | '매도 우위' | '관망';
  total_score:     number;
  asset_type:      string;
  entry_condition: string;
  price_at_time:   string;
  confidence:      number;
  result:          'success' | 'fail' | 'pending';
  result_price?:   number;
  profit_rate?:    number;
  created_at:      string;
  evaluated_at?:   string;
}

type FilterType = '전체' | '매수 우위' | '매도 우위' | '관망';

// ─── Supabase ─────────────────────────────────────────────
const getSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
};

// ─── 유틸 ─────────────────────────────────────────────────
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ko-KR', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });

const verdictStyle = (v: string) => {
  if (v === '매수 우위') return { bg: '#dcfce7', color: '#16a34a', label: '매수' };
  if (v === '매도 우위') return { bg: '#fee2e2', color: '#dc2626', label: '매도' };
  return { bg: '#f3f4f6', color: '#6b7280', label: '관망' };
};

const resultBadge = (r: string, profitRate?: number) => {
  if (r === 'success') return {
    icon: '✔', color: '#16a34a', bg: '#dcfce7',
    label: `예측 성공${profitRate !== undefined ? ` (${profitRate > 0 ? '+' : ''}${profitRate.toFixed(1)}%)` : ''}`,
  };
  if (r === 'fail') return {
    icon: '✗', color: '#dc2626', bg: '#fee2e2',
    label: `예측 실패${profitRate !== undefined ? ` (${profitRate > 0 ? '+' : ''}${profitRate.toFixed(1)}%)` : ''}`,
  };
  return null;
};

// ─── 통계 박스 ────────────────────────────────────────────
const StatsSummary = ({ items }: { items: HistoryItem[] }) => {
  const total   = items.length;
  const buy     = items.filter(i => i.verdict === '매수 우위').length;
  const sell    = items.filter(i => i.verdict === '매도 우위').length;
  const watch   = items.filter(i => i.verdict === '관망').length;
  const success = items.filter(i => i.result === 'success').length;
  const fail    = items.filter(i => i.result === 'fail').length;
  const checked = success + fail;
  const rate    = checked > 0 ? Math.round(success / checked * 100) : null;

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 14, border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px', fontWeight: 600 }}>
        📊 분석 통계 (최근 {total}건)
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {[
          { label: '매수 우위', value: buy,   color: '#16a34a', bg: '#dcfce7' },
          { label: '매도 우위', value: sell,  color: '#dc2626', bg: '#fee2e2' },
          { label: '관망',     value: watch, color: '#6b7280', bg: '#f3f4f6' },
          { label: '에코 적중률', value: rate !== null ? `${rate}%` : '-', color: '#2563eb', bg: '#dbeafe' },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center', background: s.bg, borderRadius: 8, padding: '10px 4px' }}>
            <p style={{ fontSize: 18, fontWeight: 800, color: s.color, margin: 0 }}>{s.value}</p>
            <p style={{ fontSize: 9, color: s.color, margin: '3px 0 0', fontWeight: 600 }}>{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── 히스토리 카드 ────────────────────────────────────────
const HistoryCard = ({ item }: { item: HistoryItem }) => {
  const [expanded, setExpanded] = useState(false);
  const vs = verdictStyle(item.verdict);
  const rb = resultBadge(item.result, item.profit_rate ?? undefined);

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', marginBottom: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb', cursor: 'pointer' }}
    >
      {/* 상단 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{item.keyword}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: vs.color, background: vs.bg, padding: '2px 8px', borderRadius: 6 }}>
            {vs.label}
          </span>
          {rb ? (
            <span style={{ fontSize: 11, fontWeight: 700, color: rb.color, background: rb.bg, padding: '2px 8px', borderRadius: 6 }}>
              {rb.icon} {rb.label}
            </span>
          ) : (
            <span style={{ fontSize: 10, color: '#9ca3af', background: '#f9fafb', padding: '2px 7px', borderRadius: 6 }}>
              확인 중
            </span>
          )}
        </div>
        <span style={{ fontSize: 10, color: '#9ca3af' }}>{formatDate(item.created_at)}</span>
      </div>

      {/* 질문 */}
      <p style={{ fontSize: 13, color: '#374151', margin: '0 0 8px', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: expanded ? 'normal' : 'nowrap' }}>
        {item.question}
      </p>

      {/* 분석 시점 가격 */}
      {item.price_at_time && item.price_at_time !== '미수급' && (
        <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 8px' }}>
          📌 분석 시점 가격: {item.price_at_time}
          {item.result_price && (
            <span style={{ marginLeft: 8, color: item.profit_rate && item.profit_rate > 0 ? '#16a34a' : '#dc2626' }}>
              → 현재: {item.result_price.toLocaleString()}
            </span>
          )}
        </p>
      )}

      {/* 점수 바 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 10, color: '#9ca3af', flexShrink: 0 }}>신호</span>
        <div style={{ flex: 1, height: 4, background: '#f3f4f6', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2,
            width: `${Math.min(100, Math.abs(item.total_score) / 6 * 100)}%`,
            background: item.total_score >= 2 ? '#16a34a' : item.total_score <= -2 ? '#dc2626' : '#9ca3af',
          }} />
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, minWidth: 28, textAlign: 'right', color: item.total_score >= 2 ? '#16a34a' : item.total_score <= -2 ? '#dc2626' : '#6b7280' }}>
          {item.total_score > 0 ? '+' : ''}{item.total_score}
        </span>
      </div>

      {/* 펼쳐진 내용: 진입 조건 */}
      {expanded && item.entry_condition && (
        <div style={{ marginTop: 10, background: '#f8fafc', borderRadius: 8, padding: '10px 12px', border: '1px solid #e2e8f0' }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: '#64748b', margin: '0 0 6px' }}>에코의 진입 조건</p>
          <p style={{ fontSize: 12, color: '#374151', margin: 0, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
            {item.entry_condition}
          </p>
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: 4 }}>
        <span style={{ fontSize: 10, color: '#d1d5db' }}>{expanded ? '▲' : '▼'}</span>
      </div>
    </div>
  );
};

// ─── 메인 페이지 ──────────────────────────────────────────
export default function HistoryPage() {
  const [items,   setItems]   = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<FilterType>('전체');

  useEffect(() => { loadHistory(); }, []);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const { data, error } = await getSupabase()
        .from('user_analysis_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setItems(data || []);
    } catch (e) {
      console.error('히스토리 로드 실패:', e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = filter === '전체' ? items : items.filter(i => i.verdict === filter);

  return (
    <div style={{ height: '100vh', background: '#b2c7da', display: 'flex', flexDirection: 'column', fontFamily: "'Apple SD Gothic Neo','Malgun Gothic',sans-serif" }}>

      {/* 헤더 */}
      <div style={{ background: 'rgba(178,199,218,0.95)', backdropFilter: 'blur(10px)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.06)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#1f2937', margin: 0 }}>📋 분석 히스토리</p>
          <p style={{ fontSize: 11, color: '#6b7280', margin: '2px 0 0' }}>에코의 예측과 결과를 확인하세요</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a href="/" style={{ fontSize: 11, color: '#374151', background: 'rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, padding: '5px 10px', textDecoration: 'none', fontWeight: 600 }}>
            💬 채팅
          </a>
          <button onClick={loadHistory} style={{ background: '#FAE100', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            새로고침
          </button>
        </div>
      </div>

      {/* 본문 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 12px' }}>

        {loading ? (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <p style={{ fontSize: 13, color: '#9ca3af' }}>로딩 중...</p>
          </div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <p style={{ fontSize: 36, margin: 0 }}>📭</p>
            <p style={{ fontSize: 14, color: '#6b7280', marginTop: 12 }}>아직 분석 기록이 없습니다</p>
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>채팅에서 종목을 분석하면 여기에 기록됩니다</p>
            <a href="/" style={{ display: 'inline-block', marginTop: 16, background: '#FAE100', color: '#1a1a1a', padding: '10px 20px', borderRadius: 10, textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
              분석 시작하기 →
            </a>
          </div>
        ) : (
          <>
            <StatsSummary items={items} />

            {/* 필터 탭 */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto' }}>
              {(['전체', '매수 우위', '매도 우위', '관망'] as FilterType[]).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', flexShrink: 0, background: filter === f ? '#1f2937' : '#f3f4f6', color: filter === f ? '#fff' : '#6b7280' }}>
                  {f}
                </button>
              ))}
            </div>

            {/* 안내 */}
            <div style={{ background: 'rgba(250,225,0,0.15)', borderRadius: 8, padding: '10px 12px', marginBottom: 14, border: '1px solid rgba(250,225,0,0.4)' }}>
              <p style={{ fontSize: 11, color: '#92400e', margin: 0, lineHeight: 1.5 }}>
                💡 매일 오전 9시 자동으로 예측 결과를 업데이트합니다. ✔ 성공 / ✗ 실패 표시가 순차적으로 나타납니다.
              </p>
            </div>

            {filtered.length === 0 ? (
              <p style={{ textAlign: 'center', fontSize: 13, color: '#9ca3af', paddingTop: 30 }}>해당 조건의 기록이 없습니다</p>
            ) : (
              filtered.map(item => <HistoryCard key={item.id} item={item} />)
            )}
          </>
        )}
      </div>
    </div>
  );
}
