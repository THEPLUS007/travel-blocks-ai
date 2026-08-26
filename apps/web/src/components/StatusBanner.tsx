import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';

interface StatusBannerProps {
  statusMessage: string;
  errorMessage: string;
}

export function StatusBanner({ statusMessage, errorMessage }: StatusBannerProps) {
  const hasError = Boolean(errorMessage);
  const message = hasError ? errorMessage : statusMessage;
  const [isVisible, setIsVisible] = useState(Boolean(message));

  useEffect(() => {
    if (!message) {
      setIsVisible(false);
      return;
    }

    setIsVisible(true);
    const fadeTimer = window.setTimeout(() => setIsVisible(false), 500);
    return () => window.clearTimeout(fadeTimer);
  }, [message]);

  if (!message) {
    return null;
  }

  return (
    <section
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg transition-all duration-700 ease-out ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
      } ${hasError ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-blue-100 bg-white text-blue-950'}`}
      aria-live="polite"
    >
      {hasError ? <AlertCircle size={20} aria-hidden="true" /> : <CheckCircle2 size={20} aria-hidden="true" />}
      <div>
        <p className="text-sm font-semibold">{hasError ? '오류' : '상태'}</p>
        <p className="mt-1 text-sm">{message}</p>
      </div>
    </section>
  );
}
