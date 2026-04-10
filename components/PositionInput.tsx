"use client";

import { useState } from "react";

// ─── 타입 정의 ───────────────────────────────────────────
export interface Position {
  keyword:     string;
  hasPosition: boolean;
  avgPrice:    string;  // 평단가 (문자열, ChatWindow에서 sanitize 후 전달)
  quantity:    string;  // 보유 수량/비중 (%, 개수 모두 허용)
  currency:    'KRW' | 'USD';
}

interface PositionInputProps {
  keyword:  string;
  currency: 'KRW' | 'USD';
  onSubmit: (position: Position) => void;
  onSkip:   () => void;
}

// ─── 포지션 입력 UI ──────────────────────────────────────
export function PositionInput({ keyword, currency, onSubmit, onSkip }: PositionInputProps) {
  const [hasPosition, setHasPosition] = useState<boolean | null>(null);
  const [avgPrice,    setAvgPrice]    = useState('');
  const [quantity,    setQuantity]    = useState('');

  const handleSubmit = () => {
    onSubmit({
      keyword,
      hasPosition: hasPosition === true,
      avgPrice:    avgPrice || '0',
      quantity:    quantity || '0',
      currency,
    });
  };

  const priceLabel  = currency === 'KRW' ? '평단가 (원)' : '평단가 (USD)';
  const placeholder = currency === 'KRW' ? '예: 63500' : '예: 182.50';

  return (
    <div style={{
      background: 'rgba(255,255,255,0.95)',
      borderRadius: 14,
      padding: '16px',
      margin: '8px 12px',
      border: '1px solid #e5e7eb',
      boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
    }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#1f2937', margin: 0 }}>
            📊 {keyword} 포지션 있으신가요?
          </p>
          <p style={{ fontSize: 11, color: '#6b7280', margin: '3px 0 0' }}>
            입력하시면 맞춤 분석을 드립니다
          </p>
        </div>
        <button onClick={onSkip}
          style={{ fontSize: 11, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>
          건너뛰기
        </button>
      </div>

      {/* 보유 여부 선택 */}
      {hasPosition === null && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setHasPosition(true)}
            style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1.5px solid #FAE100', background: '#fffbeb', color: '#92400e', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            ✅ 보유 중
          </button>
          <button
            onClick={() => onSubmit({ keyword, hasPosition: false, avgPrice: '0', quantity: '0', currency })}
            style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#f9fafb', color: '#374151', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            ❌ 미보유
          </button>
        </div>
      )}

      {/* 평단가 + 수량 입력 */}
      {hasPosition === true && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
              {priceLabel}
            </label>
            {/* ✅ type="text" — 자유 입력 허용, ChatWindow에서 sanitize */}
            <input
              type="text"
              value={avgPrice}
              onChange={e => setAvgPrice(e.target.value)}
              placeholder={placeholder}
              inputMode="decimal"
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: 14, color: '#1f2937', outline: 'none', boxSizing: 'border-box' }}
              onFocus={e => (e.target.style.borderColor = '#FAE100')}
              onBlur={e =>  (e.target.style.borderColor = '#d1d5db')}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
              보유 비중 (%) 또는 수량
            </label>
            <input
              type="text"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              placeholder="예: 20% 또는 0.5개"
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: 14, color: '#1f2937', outline: 'none', boxSizing: 'border-box' }}
              onFocus={e => (e.target.style.borderColor = '#FAE100')}
              onBlur={e =>  (e.target.style.borderColor = '#d1d5db')}
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={!avgPrice}
            style={{
              padding: '11px', borderRadius: 10, border: 'none',
              background: avgPrice ? '#FAE100' : '#e5e7eb',
              color: avgPrice ? '#1a1a1a' : '#9ca3af',
              fontSize: 13, fontWeight: 700,
              cursor: avgPrice ? 'pointer' : 'not-allowed',
            }}>
            분석 요청 →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── 포지션 컨텍스트 문자열 생성 ─────────────────────────
/**
 * 포지션 데이터를 프롬프트용 문자열로 변환합니다.
 * ChatWindow에서 sanitize 완료된 값이 전달됩니다.
 * route.ts 프롬프트에 삽입됩니다.
 */
export const buildPositionContext = (position: Position | null): string => {
  if (!position || !position.hasPosition) {
    return '[포지션] 미보유 — 신규 진입 관점으로 분석';
  }

  // ✅ ChatWindow에서 이미 sanitize 완료 — 중복 정제 불필요
  const price = position.avgPrice;
  if (!price || price === '0') return '[포지션] 미보유';

  const unit = position.currency === 'KRW' ? '원' : ' USD';

  return [
    `[포지션] 보유 중`,
    `평단가: ${price}${unit}`,
    position.quantity && position.quantity !== '0' ? `보유 비중/수량: ${position.quantity}` : '',
    `→ 에코는 반드시 이 평단가 기준으로 손익 분석을 포함하라`,
    `→ 현재가 대비 손익률을 계산하여 제시하라`,
    `→ 손절/홀딩/추가매수 중 하나를 명확히 권고하라`,
  ].filter(Boolean).join('\n');
};