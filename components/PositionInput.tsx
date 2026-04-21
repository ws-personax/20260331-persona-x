'use client';

import { useMemo, useState } from 'react';

export type Position = {
  avgPrice: string;
  quantity: string;
  buyPrice: string;
  note: string;
};

export const sanitizePrice = (raw: string): string => {
  const cleaned = raw.replace(/,/g, '').replace(/[^\d.]/g, '');
  const parts = cleaned.split('.');
  return parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned;
};

export const sanitizeQuantity = (raw: string): string => {
  const cleaned = raw.replace(/,/g, '').replace(/[^\d.%]/g, '');
  const parts = cleaned.split('.');
  return parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned;
};

export const buildPositionContext = (pos: Position | null): string => {
  if (!pos) return '';
  const parts = [
    pos.avgPrice ? `평단가: ${pos.avgPrice}` : '',
    pos.quantity ? `수량: ${pos.quantity}` : '',
    pos.buyPrice ? `매수가: ${pos.buyPrice}` : '',
    pos.note ? `메모: ${pos.note}` : '',
  ].filter(Boolean);
  return parts.join('\n');
};

type Props = {
  keyword: string;
  currency: 'KRW' | 'USD';
  initial?: Partial<Position>;
  onSubmit: (pos: Position) => void;
  onSkip: () => void;
};

export function PositionInput({ keyword, currency, initial, onSubmit, onSkip }: Props) {
  const [avgPrice, setAvgPrice] = useState(initial?.avgPrice ?? '');
  const [quantity, setQuantity] = useState(initial?.quantity ?? '');
  const [buyPrice, setBuyPrice] = useState(initial?.buyPrice ?? '');
  const [note, setNote] = useState(initial?.note ?? '');

  const canSubmit = useMemo(() => {
    return avgPrice.trim() || quantity.trim() || buyPrice.trim() || note.trim();
  }, [avgPrice, quantity, buyPrice, note]);

  const handleSubmit = () => {
    onSubmit({
      avgPrice: avgPrice.trim(),
      quantity: quantity.trim(),
      buyPrice: buyPrice.trim(),
      note: note.trim(),
    });
  };

  // ✅ Enter 제출 / Shift+Enter 줄바꿈 유지
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && canSubmit) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        background: '#fff',
        borderTop: '1px solid #e5e7eb',
        boxShadow: '0 -8px 24px rgba(0,0,0,0.12)',
        zIndex: 50,
        padding: '14px 12px',
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>포지션 입력</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>
              {keyword} 기준으로 평단/수량을 입력하시면 더 정확히 분석합니다. ({currency})
            </div>
          </div>
          <button
            onClick={onSkip}
            style={{
              border: '1px solid #d1d5db',
              background: '#fff',
              borderRadius: 10,
              padding: '8px 12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            건너뛰기
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <input
            value={avgPrice}
            onChange={e => setAvgPrice(sanitizePrice(e.target.value))}
            onKeyDown={handleKeyDown}
            placeholder={`평단가 (${currency})`}
            inputMode="decimal"
            style={{
              border: '1px solid #d1d5db',
              borderRadius: 10,
              padding: '10px 12px',
              outline: 'none',
              fontSize: 14,
            }}
          />
          <input
            value={quantity}
            onChange={e => setQuantity(sanitizeQuantity(e.target.value))}
            onKeyDown={handleKeyDown}
            placeholder="수량 또는 비중(%)"
            inputMode="decimal"
            style={{
              border: '1px solid #d1d5db',
              borderRadius: 10,
              padding: '10px 12px',
              outline: 'none',
              fontSize: 14,
            }}
          />
          <input
            value={buyPrice}
            onChange={e => setBuyPrice(sanitizePrice(e.target.value))}
            onKeyDown={handleKeyDown}
            placeholder={`매수가 (${currency})`}
            inputMode="decimal"
            style={{
              border: '1px solid #d1d5db',
              borderRadius: 10,
              padding: '10px 12px',
              outline: 'none',
              fontSize: 14,
            }}
          />
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메모"
            style={{
              border: '1px solid #d1d5db',
              borderRadius: 10,
              padding: '10px 12px',
              outline: 'none',
              fontSize: 14,
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              flex: 1,
              border: 'none',
              background: canSubmit ? '#FAE100' : '#e5e7eb',
              borderRadius: 10,
              padding: '11px 14px',
              fontWeight: 800,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
            }}
          >
            분석에 반영
          </button>
        </div>
      </div>
    </div>
  );
}