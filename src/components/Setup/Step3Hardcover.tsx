import React from 'react';
import { StepNavigation } from './StepNavigation';

interface Step3HardcoverProps {
  hardcoverToken: string;
  setHardcoverToken: (token: string) => void;
  onNext: () => void;
  onBack: () => void;
  t: (key: string) => string;
  tc: (key: string) => string;
}

export const Step3Hardcover: React.FC<Step3HardcoverProps> = ({
  hardcoverToken,
  setHardcoverToken,
  onNext,
  onBack,
  t,
  tc,
}) => (
  <div className="space-y-4">
    <div>
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-lg font-semibold">{t('hardcoverTitle')}</h2>
        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-librarr-bg-lighter text-librarr-text-muted">
          {t('optional')}
        </span>
      </div>
      <p className="text-librarr-text-muted text-sm">
        {t('hardcoverDescription')}
      </p>
    </div>
    <div>
      <label className="block text-sm font-medium text-librarr-text-muted mb-1.5">
        {tc('apiToken')}
      </label>
      <input
        type="password"
        className="input-field"
        value={hardcoverToken}
        onChange={(e) => setHardcoverToken(e.target.value)}
        placeholder={t('hardcoverTokenPlaceholder')}
      />
      <p className="text-xs text-librarr-text-muted mt-2">
        <a
          href="https://hardcover.app/account/api"
          target="_blank"
          rel="noopener noreferrer"
          className="text-librarr-primary hover:underline"
        >
          {t('hardcoverLink')}
        </a>
      </p>
    </div>
    <StepNavigation
      onBack={onBack}
      onNext={onNext}
      showSkip
      nextDisabled={!hardcoverToken.trim()}
      t={tc}
      skipLabel={t('skip')}
    />
  </div>
);
