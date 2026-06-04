type QuickQuestion = {
  level: string;
  color: string;
  bg: string;
  text: string;
};

type AdvancedQuestion = {
  level: string;
  color: string;
  bg: string;
  text: string;
};

type QuickQuestionPanelProps = {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  quickQuestions: QuickQuestion[];
  advancedQuestions: AdvancedQuestion[];
  isLoading: boolean;
  onClose: () => void;
  onSelectQuestion: (text: string, advanced?: boolean) => void;
};

export const QuickQuestionPanel = ({
  activeTab,
  setActiveTab,
  quickQuestions,
  advancedQuestions,
  isLoading,
  onClose,
  onSelectQuestion,
}: QuickQuestionPanelProps) => (

        <div style={{
          background: '#fff',
          borderTop: '1px solid #e5e7eb',
          position: 'fixed',
          bottom: 92,
          left: 0,
          right: 0,
          zIndex: 40,
          boxShadow: '0 -4px 12px rgba(0,0,0,0.08)',
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <button
            type="button"
            onClick={() => onClose()}
            style={{
              alignSelf: 'flex-start',
              background: 'none',
              border: 'none',
              padding: '8px 12px',
              fontSize: 12.5,
              fontWeight: 700,
              color: '#6b7280',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            ← 처음으로
          </button>

          <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
            {(['뉴스', '추천', '고급'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  fontSize: 13,
                  fontWeight: activeTab === tab ? 800 : 500,
                  color: activeTab === tab ? '#111827' : '#9ca3af',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === tab ? '2px solid #FAE100' : '2px solid transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                {tab === '뉴스' ? '📰 주요 뉴스' : tab === '추천' ? '💡 추천 질문' : '🎯 고급 질문'}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 32px 12px' }}>
            {activeTab === '추천' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(['시장', '분석', '전략'] as const).map(section => {
                  const items = quickQuestions.filter(q => q.level === section);
                  if (items.length === 0) return null;
                  const sectionColor = section === '시장' ? '#16a34a' : section === '분석' ? '#d97706' : '#dc2626';
                  return (
                    <div key={section} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 11,
                        fontWeight: 800,
                        color: sectionColor,
                        paddingTop: 4,
                      }}>
                        <span style={{
                          display: 'inline-block',
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: sectionColor,
                        }} />
                        {section} ({items.length})
                        <span style={{ flex: 1, height: 1, background: `${sectionColor}22`, marginLeft: 4 }} />
                      </div>
                      {items.map((q, i) => (
                        <button
                          key={`${section}-${i}`}
                          onClick={() => {
                            onClose();
                            onSelectQuestion(q.text);
                          }}
                          disabled={isLoading}
                          style={{
                            background: q.bg,
                            border: `1px solid ${q.color}22`,
                            borderRadius: 10,
                            padding: '8px 12px',
                            textAlign: 'left',
                            fontSize: 13,
                            fontWeight: 500,
                            color: '#111827',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                            opacity: isLoading ? 0.5 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <span style={{
                            fontSize: 10,
                            fontWeight: 800,
                            color: q.color,
                            background: '#fff',
                            border: `1px solid ${q.color}`,
                            borderRadius: 4,
                            padding: '1px 5px',
                            minWidth: 24,
                            textAlign: 'center',
                          }}>{q.level}</span>
                          {q.text}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === '고급' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(['전략형', '시장분석형', '심리판단형', '40-50대 특화형'] as const).map(section => {
                  const items = advancedQuestions.filter(q => q.level === section);
                  if (items.length === 0) return null;
                  const sectionColor =
                    section === '전략형' ? '#db2777'
                    : section === '시장분석형' ? '#16a34a'
                    : section === '심리판단형' ? '#9333ea'
                    : '#ea580c';
                  return (
                    <div key={section} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 11,
                        fontWeight: 800,
                        color: sectionColor,
                        paddingTop: 4,
                      }}>
                        <span style={{
                          display: 'inline-block',
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: sectionColor,
                        }} />
                        {section} ({items.length})
                        <span style={{ flex: 1, height: 1, background: `${sectionColor}22`, marginLeft: 4 }} />
                      </div>
                      {items.map((q, i) => (
                        <button
                          key={`${section}-${i}`}
                          onClick={() => {
                            onClose();
                            onSelectQuestion(q.text, true);
                          }}
                          disabled={isLoading}
                          style={{
                            background: q.bg,
                            border: `1px solid ${q.color}22`,
                            borderRadius: 10,
                            padding: '8px 12px',
                            textAlign: 'left',
                            fontSize: 13,
                            fontWeight: 500,
                            color: '#111827',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                            opacity: isLoading ? 0.5 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <span style={{
                            fontSize: 10,
                            fontWeight: 800,
                            color: q.color,
                            background: '#fff',
                            border: `1px solid ${q.color}`,
                            borderRadius: 4,
                            padding: '1px 5px',
                            minWidth: 24,
                            textAlign: 'center',
                          }}>{q.level}</span>
                          {q.text}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === '뉴스' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  {
                    title: '美 관세 협상 재개...코스피 반등 기대',
                    summary: '미중 협상 재개 소식에 외국인 매수세 유입 예상',
                    prompt: '美 관세 협상 재개 소식이 있어요. 코스피에 어떤 영향을 줄까요?',
                  },
                  {
                    title: '삼성전자 2분기 실적 전망 상향',
                    summary: '반도체 업황 회복으로 영업이익 개선 기대',
                    prompt: '삼성전자 2분기 실적 전망이 상향됐어요. 지금 어떻게 봐야 할까요?',
                  },
                  {
                    title: '부동산 PF 리스크 완화...건설주 강세',
                    summary: '정부 지원책 발표로 건설사 유동성 우려 완화',
                    prompt: '부동산 PF 리스크 완화 소식이에요. 건설주 지금 들어가도 될까요?',
                  },
                ].map((news, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      onClose();
                      onSelectQuestion(news.prompt);
                    }}
                    disabled={isLoading}
                    style={{
                      background: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: 12,
                      padding: '12px 14px',
                      textAlign: 'left',
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      opacity: isLoading ? 0.5 : 1,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                      <span style={{ fontSize: 14, lineHeight: 1.3 }}>📰</span>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: '#111827', lineHeight: 1.4 }}>
                        {news.title}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5, paddingLeft: 22 }}>
                      {news.summary}
                    </span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1d4ed8', alignSelf: 'flex-end', marginTop: 2 }}>
                      4명에게 물어보기 →
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
);
