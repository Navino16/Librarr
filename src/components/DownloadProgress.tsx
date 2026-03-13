import React from 'react';
import { useTranslations } from 'next-intl';

interface Props {
  progress?: number;
  status?: string;
  timeLeft?: string;
}

export default function DownloadProgress({ progress, status, timeLeft }: Props) {
  const t = useTranslations('download');

  if (!status) return null;

  if (status === 'queued') {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">
          {t('queued')}
        </span>
      </div>
    );
  }

  if (status === 'completed') {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-400 border border-green-500/20">
          {t('completed')}
        </span>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/20">
          {t('failed')}
        </span>
      </div>
    );
  }

  if (status === 'warning') {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-500/15 text-orange-400 border border-orange-500/20">
          {t('warning')}
        </span>
      </div>
    );
  }

  if (status === 'paused') {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/15 text-gray-400 border border-gray-500/20">
          {t('paused')}
        </span>
      </div>
    );
  }

  // downloading
  const pct = progress ?? 0;

  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="flex-1 min-w-[80px] max-w-[200px]">
        <div
          className="h-1.5 rounded-full bg-librarr-bg-lighter overflow-hidden"
          role="progressbar"
          aria-label={t('progress', { progress: pct.toFixed(1) })}
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-librarr-primary transition-all duration-500"
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </div>
      <span className="text-xs text-librarr-text-muted whitespace-nowrap">
        {t('progress', { progress: pct.toFixed(1) })}
        {timeLeft && (
          <span className="ml-1.5 text-librarr-text-muted/70">
            {timeLeft} {t('timeRemaining')}
          </span>
        )}
      </span>
    </div>
  );
}
