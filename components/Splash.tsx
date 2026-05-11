'use client';

import { useEffect } from 'react';
import Logo from './Logo';

export default function Splash({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 1500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 bg-white flex items-center justify-center z-50">
      <div className="animate-fade-in">
        <Logo size="lg" />
      </div>
    </div>
  );
}
