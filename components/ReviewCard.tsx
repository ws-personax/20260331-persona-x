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
  const title = item.title || '저장된 결정';
  const verdict = item.verdict || '당시 결론을 다시 확인해보세요';

  return (
    <div style={{ padding: '0 16px 8px', flexShrink: 0 }}>
      <button
        type="button"
        onClick={onOpenHistory}
        style={{
          width: '100%',
          textAlign: 'left',
          background: '#FFF9E6',
          border: '1px solid #F4D58D',
          borderLeft: '4px solid #F59E0B',
          borderRadius: 12,
          padding: '10px 42px 10px 12px',
          boxShadow: '0 1px 4px rgba(120,72,0,0.08)',
          cursor: 'pointer',
          position: 'relative',
          color: '#111827',
          minHeight: 72,
        }}
      >
        <span style={{ display: 'block', fontSize: 12, fontWeight: 900, color: '#92400e', marginBottom: 3 }}>
          결정 리뷰 알림
        </span>

        <span
          style={{
            display: 'block',
            fontSize: 12,
            color: '#6b7280',
            fontWeight: 700,
            marginBottom: 4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {buildRecordLabel(item.created_at)} · {title}
        </span>

        <span
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 1,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            fontSize: 12.5,
            color: '#374151',
            lineHeight: 1.35,
            marginBottom: 6,
          }}
        >
          당시 결론: {verdict}
        </span>

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
            borderRadius: 8,
            border: '1px solid #F4C763',
            background: '#fff',
            color: '#78350f',
            padding: '4px 8px',
            fontSize: 12,
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          다시 보기
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
            width: 24,
            height: 24,
            borderRadius: 8,
            border: '1px solid #F4D58D',
            background: '#fff',
            color: '#92400e',
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
