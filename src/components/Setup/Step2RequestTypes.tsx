import React from 'react';
import { StepNavigation } from './StepNavigation';

interface Step2RequestTypesProps {
  requestTypes: { ebook: boolean; audiobook: boolean; music: boolean };
  setRequestTypes: (types: Step2RequestTypesProps['requestTypes']) => void;
  onNext: () => void;
  onBack: () => void;
  t: (key: string) => string;
  ts: (key: string) => string;
  tc: (key: string) => string;
}

export const Step2RequestTypes: React.FC<Step2RequestTypesProps> = ({
  requestTypes,
  setRequestTypes,
  onNext,
  onBack,
  t,
  ts,
  tc,
}) => (
  <div className="space-y-4">
    <div>
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-lg font-semibold">{t('requestTypesTitle')}</h2>
        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-librarr-bg-lighter text-librarr-text-muted">
          {t('optional')}
        </span>
      </div>
      <p className="text-librarr-text-muted text-sm">
        {t('requestTypesDescription')}
      </p>
    </div>
    <div className="space-y-1">
      <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-librarr-bg-lighter/30 transition-colors cursor-pointer">
        <input
          type="checkbox"
          checked={requestTypes.ebook}
          onChange={(e) =>
            setRequestTypes({ ...requestTypes, ebook: e.target.checked })
          }
          className="rounded border-librarr-bg-lighter text-librarr-primary focus:ring-librarr-primary"
        />
        <span className="text-sm font-medium">{ts('enableEbookRequests')}</span>
      </label>
      <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-librarr-bg-lighter/30 transition-colors cursor-pointer">
        <input
          type="checkbox"
          checked={requestTypes.audiobook}
          onChange={(e) =>
            setRequestTypes({ ...requestTypes, audiobook: e.target.checked })
          }
          className="rounded border-librarr-bg-lighter text-librarr-primary focus:ring-librarr-primary"
        />
        <span className="text-sm font-medium">
          {ts('enableAudiobookRequests')}
        </span>
      </label>
      <label className="flex items-center gap-3 p-3 rounded-lg cursor-not-allowed">
        <input
          type="checkbox"
          checked={false}
          disabled
          className="rounded border-librarr-bg-lighter text-librarr-primary focus:ring-librarr-primary opacity-50"
        />
        <span className="text-sm font-medium text-librarr-text-muted">{ts('enableMusicRequests')}</span>
        <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
          {ts('musicComingSoon')}
        </span>
      </label>
    </div>
    <StepNavigation onBack={onBack} onNext={onNext} showSkip t={tc} skipLabel={t('skip')} />
  </div>
);
