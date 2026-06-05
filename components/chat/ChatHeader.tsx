import AuthButton from '@/components/AuthButton';
import Logo from '@/components/Logo';

type ChatHeaderProps = {
  onOpenHistory: () => void;
};

export const ChatHeader = ({ onOpenHistory }: ChatHeaderProps) => (
  <header
    style={{
      background: '#E8DCC0',
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottom: '1px solid #C9A46A',
      position: 'sticky',
      top: 0,
      zIndex: 10,
      flexShrink: 0,
    }}
  >
    <Logo size="sm" />

    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      <AuthButton />
      <button
        type="button"
        onClick={onOpenHistory}
        style={{
          background: '#FFF8E8',
          padding: '5px 12px',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 700,
          color: '#5C3D1E',
          border: '1px solid #C9A46A',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          cursor: 'pointer',
          touchAction: 'manipulation',
        }}
      >
        History
      </button>
    </div>
  </header>
);
