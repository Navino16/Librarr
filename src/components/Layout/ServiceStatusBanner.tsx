import React from 'react';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import { fetcher } from '../../hooks/useApi';

interface HealthResponse {
  providers: Record<string, boolean>;
}

const PROVIDER_LABELS: Record<string, string> = {
  hardcover: 'Hardcover',
  openlibrary: 'OpenLibrary',
  googlebooks: 'Google Books',
};

export default function ServiceStatusBanner() {
  const t = useTranslations('common');
  const { data } = useSWR<HealthResponse>(
    '/api/v1/service/health',
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false }
  );

  if (!data) return null;

  const downProviders = Object.entries(data.providers)
    .filter(([, ok]) => !ok)
    .map(([name]) => PROVIDER_LABELS[name] || name);

  if (downProviders.length === 0) return null;

  return (
    <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2 flex items-center gap-2 text-sm text-yellow-300">
      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <span>
        {t('providerDown', { providers: downProviders.join(', ') })}
      </span>
    </div>
  );
}
