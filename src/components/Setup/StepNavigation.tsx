import React from 'react';

interface StepNavigationProps {
  onBack?: () => void;
  onNext: () => void;
  showSkip?: boolean;
  nextLabel?: string;
  skipLabel?: string;
  nextDisabled?: boolean;
  t: (key: string) => string;
}

const BackArrow = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

const NextArrow = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

export const StepNavigation: React.FC<StepNavigationProps> = ({
  onBack,
  onNext,
  showSkip = false,
  nextLabel,
  skipLabel,
  nextDisabled = false,
  t,
}) => (
  <div className="border-t border-librarr-bg-lighter pt-4 mt-4 flex items-center justify-between">
    {onBack ? (
      <button onClick={onBack} className="btn-secondary flex items-center gap-2">
        <BackArrow />
        {t('back')}
      </button>
    ) : (
      <div />
    )}
    <div className="flex items-center gap-4">
      {showSkip && (
        <button
          onClick={onNext}
          className="text-sm text-librarr-text-muted hover:text-librarr-text transition-colors"
        >
          {skipLabel || t('skip')}
        </button>
      )}
      <button
        onClick={onNext}
        disabled={nextDisabled}
        className="btn-primary flex items-center gap-2 disabled:opacity-50"
      >
        {nextLabel || t('next')}
        <NextArrow />
      </button>
    </div>
  </div>
);
