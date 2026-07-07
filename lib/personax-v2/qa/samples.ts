export type QaCategory = 'invest' | 'emotional' | 'action' | 'knowledge' | 'principle';

export interface QaSample {
  id: string;
  category: QaCategory;
  question: string;
}

export const QA_SAMPLES: QaSample[] = [
  // --- original baseline (10) ---
  { id: 'invest-1', category: 'invest', question: '삼성전자 지금 사도 될까요?' },
  { id: 'invest-2', category: 'invest', question: '이더리움 지금 사도 될까요?' },
  { id: 'emotional-1', category: 'emotional', question: '누군가 나를 시기할 때 어떻게 해야 할까요?' },
  { id: 'emotional-2', category: 'emotional', question: '요즘 아무것도 하기 싫습니다' },
  { id: 'action-1', category: 'action', question: '재취업을 해야 할까요, 창업을 해야 할까요?' },
  { id: 'action-2', category: 'action', question: '오늘 당장 뭘 먼저 해야 할까요?' },
  { id: 'knowledge-1', category: 'knowledge', question: '금리가 내려가면 집값은 왜 오르나요?' },
  { id: 'knowledge-2', category: 'knowledge', question: '인플레이션이 정확히 뭔가요?' },
  { id: 'principle-1', category: 'principle', question: '좋은 배우자를 고르는 기준은 무엇인가요?' },
  { id: 'principle-2', category: 'principle', question: '선택할 때 가장 중요한 원칙은 무엇인가요?' },
  // --- PR302: v1/v2 parallel QA regression set (10) ---
  { id: 'invest-3', category: 'invest', question: '삼성전자 지금 사도 될까?' },
  { id: 'invest-4', category: 'invest', question: '이더리움 지금 들어가도 될까?' },
  { id: 'emotional-3', category: 'emotional', question: '누군가 나를 시기할 때 어떻게 해야 할까?' },
  { id: 'action-3', category: 'action', question: '창업을 할까 재취업을 할까?' },
  { id: 'knowledge-3', category: 'knowledge', question: '인플레이션이 뭐야?' },
  { id: 'principle-3', category: 'principle', question: '행복이란 무엇일까?' },
  { id: 'knowledge-4', category: 'knowledge', question: '홍명보 감독 체제는 무엇이 문제였을까?' },
  { id: 'knowledge-5', category: 'knowledge', question: '서울 집값은 금리 인하가 시작되면 다시 오를까?' },
  { id: 'action-4', category: 'action', question: '이 사람 계속 만나도 될까?' },
  { id: 'knowledge-6', category: 'knowledge', question: '50대 대표가 가장 많이 하는 고민 3가지는 뭐야?' },
];

export function samplesByCategory(category: QaCategory): QaSample[] {
  return QA_SAMPLES.filter((sample) => sample.category === category);
}

export function oneSamplePerCategory(): QaSample[] {
  const seen = new Set<QaCategory>();
  const picked: QaSample[] = [];
  for (const sample of QA_SAMPLES) {
    if (seen.has(sample.category)) continue;
    seen.add(sample.category);
    picked.push(sample);
  }
  return picked;
}
