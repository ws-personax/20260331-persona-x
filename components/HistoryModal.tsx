'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

type HistoryItem = {
  id: string;
  created_at: string;
  category: string | null;
  title: string | null;
  verdict: string | null;
  verdict_strength: number | null;
  reasons: string[] | null;
  counter_views: string[] | null;
  next_action: string | null;
  decision_type: string | null;
  review_date: string | null;
  review_status: string | null;
  result: string | null;
  executed: boolean | null;
  decision_importance: number | null;
};

type HistoryResponse = {
  items?: HistoryItem[];
  error?: string;
};

interface HistoryModalProps {
  onClose: () => void;
  supabaseClient?: SupabaseClient;
}

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatReviewDate = (date: string | null) => {
  if (!date) return '-';
  return new Date(`${date}T00:00:00`).toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
  });
};

const statusLabel = (status: string | null) => {
  if (status === 'pending') return 'review pending';
  if (status === 'done') return 'review done';
  return status || '-';
};

export default function HistoryModal({ onClose }: HistoryModalProps) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError('');

        const res = await fetch('/api/history', {
          credentials: 'include',
          cache: 'no-store',
        });
        const data = (await res.json()) as HistoryResponse;

        if (!res.ok) {
          console.warn('[history-modal] /api/history non-200:', res.status, data.error);
        }

        if (data.error) {
          console.warn('[history-modal] /api/history warning:', data.error);
        }

        setItems(Array.isArray(data.items) ? data.items : []);
      } catch (e) {
        console.error('[history-modal] loadData failed:', e);
        setError('History를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const [filterDays, setFilterDays] = useState<7 | 30 | 0>(0);

  const filteredItems = useMemo(() => {
    if (!filterDays) return items;
    const cutoff = new Date(Date.now() - filterDays * 24 * 60 * 60 * 1000);
    return items.filter((item) => new Date(item.created_at) >= cutoff);
  }, [items, filterDays]);

  const stats = useMemo(() => {
    return {
      total: filteredItems.length,
      pending: filteredItems.filter((item) => item.review_status === 'pending').length,
      executed: filteredItems.filter((item) => item.executed).length,
    };
  }, [filteredItems]);

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    background: '#E8DCC0',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  };

  const headerStyle: React.CSSProperties = {
    background: 'rgba(178,199,218,0.95)',
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid rgba(0,0,0,0.06)',
    flexShrink: 0,
  };

  const closeBtnStyle: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    width: 32,
    height: 32,
    fontSize: 18,
    fontWeight: 700,
    cursor: 'pointer',
    color: '#374151',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  };

  const ModalHeader = () => (
    <header style={headerStyle}>
      <span style={{ fontWeight: 800, fontSize: 18, color: '#1f2937' }}>History</span>
      <button type="button" onClick={onClose} aria-label="닫기" style={closeBtnStyle}>x</button>
    </header>
  );

  if (loading) {
    return (
      <div style={overlayStyle}>
        <ModalHeader />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#374151', fontWeight: 700 }}>History 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={overlayStyle}>
        <ModalHeader />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
          <p style={{ color: '#dc2626', fontWeight: 700 }}>{error}</p>
          <button type="button" onClick={onClose} style={{ background: '#111827', color: '#fff', padding: '10px 20px', borderRadius: 10, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            닫기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle}>
      <ModalHeader />

      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px', paddingBottom: 'max(40px, env(safe-area-inset-bottom))' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {([0, 7, 30] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setFilterDays(days)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: 12,
                  background: filterDays === days ? '#111827' : '#fff',
                  color: filterDays === days ? '#fff' : '#6b7280',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}
              >
                {days === 0 ? '전체' : `최근 ${days}일`}
              </button>
            ))}
          </div>

          <div style={{ background: '#fff', borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center', minWidth: 60 }}>
                <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 4px', fontWeight: 600 }}>결정</p>
                <p style={{ fontSize: 28, fontWeight: 800, color: '#111827', margin: 0 }}>{stats.total}</p>
              </div>
              <div style={{ textAlign: 'center', minWidth: 60 }}>
                <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 4px', fontWeight: 600 }}>리뷰 대기</p>
                <p style={{ fontSize: 28, fontWeight: 800, color: '#111827', margin: 0 }}>{stats.pending}</p>
              </div>
              <div style={{ textAlign: 'center', minWidth: 60 }}>
                <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 4px', fontWeight: 600 }}>실행</p>
                <p style={{ fontSize: 28, fontWeight: 800, color: '#111827', margin: 0 }}>{stats.executed}</p>
              </div>
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 16, padding: 32, textAlign: 'center' }}>
              <p style={{ color: '#6b7280', fontWeight: 600 }}>저장된 Decision Memory가 없습니다.</p>
              <button type="button" onClick={onClose} style={{ display: 'inline-block', marginTop: 12, background: '#111827', color: '#fff', padding: '10px 20px', borderRadius: 10, fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer' }}>
                닫기
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredItems.map((item) => (
                <div key={item.id} style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 16, fontWeight: 800, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.title || 'Untitled decision'}
                      </p>
                      <p style={{ fontSize: 11, color: '#9ca3af', margin: '4px 0 0' }}>
                        {formatDate(item.created_at)} · {item.decision_type || item.category || 'decision'}
                      </p>
                    </div>
                    <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>{statusLabel(item.review_status)}</span>
                  </div>

                  {item.verdict && (
                    <span style={{ display: 'inline-block', fontSize: 11, background: '#111827', color: '#fff', padding: '3px 8px', borderRadius: 5, fontWeight: 700, marginBottom: 8 }}>
                      {item.verdict}
                    </span>
                  )}

                  {item.next_action && (
                    <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.5, margin: '0 0 8px' }}>
                      {item.next_action}
                    </p>
                  )}

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>리뷰: {formatReviewDate(item.review_date)}</span>
                    {item.reasons?.slice(0, 1).map((reason) => (
                      <span key={reason} style={{ fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                        {reason}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
