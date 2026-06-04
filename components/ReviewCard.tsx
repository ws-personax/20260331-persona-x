'use client';

import { useEffect, useState } from 'react';

type ReviewItem = {
  id: string;
  title: string | null;
  verdict: string | null;
  review_date: string | null;
  decision_type: string | null;
  review_status: string | null;
};

type ReviewCardProps = {
  onOpenHistory: () => void;
  onOpenConversation?: (conversationId: string) => void;
};

export default function ReviewCard({ onOpenHistory, onOpenConversation }: ReviewCardProps) {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const res = await fetch('/api/review-card', {
          credentials: 'include',
          cache: 'no-store',
        });
        const data = await res.json();
        if (!alive) return;
        setItems(Array.isArray(data?.items) ? data.items : []);
      } catch {
        if (alive) setItems([]);
      }
    };

    void load();
    return () => {
      alive = false;
    };
  }, []);

  if (hidden || items.length === 0) return null;

  const item = items[0];

  return (
    <div style={{ padding: '0 16px 14px', flexShrink: 0 }}>
      <button
        type="button"
        onClick={onOpenHistory}
        style={{
          width: '100%',
          textAlign: 'left',
          background: '#fff',
          border: '1px solid rgba(17,24,39,0.12)',
          borderRadius: 14,
          padding: '14px 44px 14px 16px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          cursor: 'pointer',
          position: 'relative',
          color: '#111827',
        }}
      >
        <span style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#6b7280', marginBottom: 6 }}>
          지난번 결정이 있어요
        </span>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 800, lineHeight: 1.35, marginBottom: 6 }}>
          {item.title || '저장된 결정'}
        </span>
        {item.verdict && (
          <span style={{ display: 'block', fontSize: 13, color: '#374151', lineHeight: 1.45, marginBottom: item.review_date ? 6 : 0 }}>
            {item.verdict}
          </span>
        )}
        {item.review_date && (
          <span style={{ display: 'block', fontSize: 12, color: '#6b7280', fontWeight: 700 }}>
            리뷰 예정: {item.review_date}
          </span>
        )}
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onOpenConversation?.(item.id);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onOpenConversation?.(item.id);
            }
          }}
          style={{
            display: 'inline-flex',
            marginTop: 10,
            borderRadius: 8,
            border: '1px solid #d1d5db',
            background: '#f9fafb',
            color: '#374151',
            padding: '6px 10px',
            fontSize: 12,
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          당시 대화 보기
        </span>
        <span
          role="button"
          tabIndex={0}
          aria-label="카드 숨기기"
          onClick={(e) => {
            e.stopPropagation();
            setHidden(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              setHidden(true);
            }
          }}
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 28,
            height: 28,
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            background: '#f9fafb',
            color: '#6b7280',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          x
        </span>
      </button>
    </div>
  );
}
