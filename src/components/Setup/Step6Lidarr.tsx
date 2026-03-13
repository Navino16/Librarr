import React from 'react';
import { StepNavigation } from './StepNavigation';

interface Step6LidarrProps {
  onNext: () => void;
  onBack: () => void;
  t: (key: string) => string;
  ts: (key: string) => string;
  tc: (key: string) => string;
  // Keep unused props in interface for backwards compatibility with setup.tsx
  form?: unknown;
  setForm?: unknown;
  servers?: unknown;
  setServers?: unknown;
  showForm?: unknown;
  setShowForm?: unknown;
  testResult?: unknown;
  setTestResult?: unknown;
  testLoading?: unknown;
  setTestLoading?: unknown;
}

export const Step6Lidarr: React.FC<Step6LidarrProps> = ({
  onNext,
  onBack,
  t,
  ts,
  tc,
}) => {
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-lg font-semibold">{t('lidarrTitle')}</h2>
          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
            {ts('musicComingSoon')}
          </span>
        </div>
        <p className="text-librarr-text-muted text-sm">{t('lidarrDescription')}</p>
      </div>

      <div className="card p-8 text-center">
        <svg className="w-10 h-10 mx-auto text-librarr-text-muted mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
        </svg>
        <p className="text-librarr-text-muted text-sm">{ts('lidarrComingSoonDescription')}</p>
      </div>

      <StepNavigation onBack={onBack} onNext={onNext} showSkip={false} t={tc} />
    </div>
  );
};
