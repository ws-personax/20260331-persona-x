'use client';

import { useEffect, useState } from 'react';

type ReviewItem = {
  id: string;
  title: string | null;
  verdict: string | null;
  review_date: string | null;
  decision_type: string | null;
  review_status: string | null;
  created_at: string;
};

const KST_TIME_ZONE = 'Asia/Seoul';

const kstDayNumber = (value: string): number | null => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);

  if (!year || !month || !day) return null;
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
};

const buildRecordLabel = (createdAt: string | null): string => {
  if (!createdAt) return '과거의 내가 남긴 기록';

  const createdDay = kstDayNumber(createdAt);
  if (createdDay === null) return '과거의 내가 남긴 기록';

  const todayDay = kstDayNumber(new Date().toISOString());
  if (todayDay === null) return '과거의 내가 남긴 기록';

  const diff = Math.max(0, todayDay - createdDay);
  if (diff === 0) return '오늘 남긴 기록';
  if (diff === 1) return '어제의 내가 남긴 기록';
  return `${diff}일 전의 내가 남긴 기록`;
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
          {buildRecordLabel(item.created_at)}
        </span>

        <div style={{ display: 'block', fontSize: 15, color: '#111827', lineHeight: 1.55, marginBottom: 8 }}>
          <span style={{ display: 'block', fontWeight: 800 }}>그때 당신은</span>
          <span style={{ display: 'block', fontWeight: 800, margin: '2px 0' }}>
            {item.title || '이 결정을'}
          </span>
          <span style={{ display: 'block' }}>을 고민하고 있었습니다.</span>
        </div>

        {item.verdict && (
          <div style={{ display: 'block', fontSize: 13, color: '#374151', lineHeight: 1.55, marginBottom: 8 }}>
            <span style={{ display: 'block', fontWeight: 700, marginBottom: 2 }}>결론은</span>
            <span style={{ display: 'block' }}>{item.verdict}</span>
            <span style={{ display: 'block', marginTop: 2 }}>이었습니다.</span>
          </div>
        )}

        <span style={{ display: 'block', fontSize: 13, color: '#111827', lineHeight: 1.45, marginBottom: 6 }}>
          오늘 다시 그 결정을 봅니다.
        </span>

        {item.review_date && (
          <span style={{ display: 'block', fontSize: 12, color: '#6b7280', fontWeight: 700 }}>
            다시 보는 날: {item.review_date}
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
