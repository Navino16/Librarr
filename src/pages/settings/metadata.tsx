import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import { useSettings } from '../../context/SettingsContext';
import { apiPost, fetcher } from '../../hooks/useApi';
import { useRequirePermission } from '../../hooks/usePermission';
import { Permission } from '../../constants/permissions';
import LoadingSpinner from '../../components/Common/LoadingSpinner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MetadataSource = 'hardcover' | 'openlibrary' | 'googlebooks';

type PriorityField = 'search' | 'description' | 'cover' | 'editions' | 'ratings';

interface MetadataProviderSettings {
  hardcover: { enabled: boolean };
  openlibrary: { enabled: boolean };
  googlebooks: { enabled: boolean };
  priority: Record<PriorityField, MetadataSource[]>;
}

interface CacheStats {
  name: string;
  keys: number;
  hits: number;
  misses: number;
  ttl: number;
  maxKeys: number;
}

// ---------------------------------------------------------------------------
// Provider metadata (descriptions & colors)
// ---------------------------------------------------------------------------

const PROVIDERS: {
  key: MetadataSource;
  color: string;
  iconColor: string;
}[] = [
  {
    key: 'hardcover',
    color: 'bg-amber-500/15 text-amber-400',
    iconColor: 'text-amber-400',
  },
  {
    key: 'openlibrary',
    color: 'bg-green-500/15 text-green-400',
    iconColor: 'text-green-400',
  },
  {
    key: 'googlebooks',
    color: 'bg-blue-500/15 text-blue-400',
    iconColor: 'text-blue-400',
  },
];

const PRIORITY_FIELDS: PriorityField[] = [
  'search',
  'description',
  'cover',
  'editions',
  'ratings',
];

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

const BookIcon = () => (
  <svg
    className="w-4 h-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);

const ArrowUpIcon = () => (
  <svg
    className="w-4 h-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="18 15 12 9 6 15" />
  </svg>
);

const ArrowDownIcon = () => (
  <svg
    className="w-4 h-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const DatabaseIcon = () => (
  <svg
    className="w-4 h-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
  </svg>
);

const TrashIcon = () => (
  <svg
    className="w-4 h-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

const ListIcon = () => (
  <svg
    className="w-4 h-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTtl(seconds: number): string {
  if (seconds <= 0) return '-';
  if (seconds >= 86400) {
    const h = seconds / 86400;
    return `${Math.round(h)}d`;
  }
  if (seconds >= 3600) {
    const h = seconds / 3600;
    return `${Math.round(h)}h`;
  }
  if (seconds >= 60) {
    const m = seconds / 60;
    return `${Math.round(m)}m`;
  }
  return `${seconds}s`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MetadataSettingsPage() {
  const hasAccess = useRequirePermission(Permission.MANAGE_SETTINGS_METADATA);
  const { settings: publicSettings } = useSettings();
  const tm = useTranslations('metadata');
  const tc = useTranslations('common');

  // Fetch metadata provider settings
  const {
    data: providerSettings,
    mutate: mutateProviders,
    isLoading: loadingProviders,
  } = useSWR<MetadataProviderSettings>(
    hasAccess ? '/api/v1/settings/metadata-providers' : null,
    fetcher
  );

  // Fetch cache stats
  const {
    data: caches,
    mutate: mutateCaches,
    isLoading: loadingCaches,
  } = useSWR<CacheStats[]>(hasAccess ? '/api/v1/cache' : null, fetcher);

  // ---------------------------------------------------------------------------
  // Form state
  // ---------------------------------------------------------------------------

  const [form, setForm] = useState<MetadataProviderSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [flushingCache, setFlushingCache] = useState<string | null>(null);
  const [flushingAll, setFlushingAll] = useState(false);

  useEffect(() => {
    if (providerSettings) {
      setForm(structuredClone(providerSettings));
    }
  }, [providerSettings]);

  // ---------------------------------------------------------------------------
  // Provider toggle
  // ---------------------------------------------------------------------------

  const toggleProvider = useCallback(
    (source: MetadataSource) => {
      if (!form) return;

      const newEnabled = !form[source].enabled;

      // Prevent disabling all providers
      if (!newEnabled) {
        const others = PROVIDERS.filter((p) => p.key !== source);
        const anyOtherEnabled = others.some((p) => form[p.key].enabled);
        if (!anyOtherEnabled) {
          setError(tm('atLeastOneProvider'));
          setTimeout(() => setError(''), 3000);
          return;
        }
      }

      setForm((prev) => {
        if (!prev) return prev;

        const updated = structuredClone(prev);
        updated[source] = { enabled: newEnabled };

        // Remove from priority lists when disabled
        if (!newEnabled) {
          for (const field of PRIORITY_FIELDS) {
            updated.priority[field] = updated.priority[field].filter(
              (s) => s !== source
            );
          }
        } else {
          // Add back to end of priority lists when enabled
          for (const field of PRIORITY_FIELDS) {
            if (!updated.priority[field].includes(source)) {
              updated.priority[field] = [...updated.priority[field], source];
            }
          }
        }

        return updated;
      });
    },
    [form, tm]
  );

  // ---------------------------------------------------------------------------
  // Priority reorder
  // ---------------------------------------------------------------------------

  const movePriority = useCallback(
    (field: PriorityField, index: number, direction: 'up' | 'down') => {
      setForm((prev) => {
        if (!prev) return prev;

        const updated = structuredClone(prev);
        const list = updated.priority[field];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= list.length) return prev;

        // Swap
        [list[index], list[targetIndex]] = [list[targetIndex], list[index]];
        return updated;
      });
    },
    []
  );

  // ---------------------------------------------------------------------------
  // Save / Reset
  // ---------------------------------------------------------------------------

  const handleSave = async () => {
    if (!form) return;
    setError('');
    try {
      await apiPost('/settings/metadata-providers', form);
      mutateProviders();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : tm('saveFailed')
      );
    }
  };

  const handleReset = async () => {
    setError('');
    try {
      const result = await apiPost<MetadataProviderSettings>(
        '/settings/metadata-providers/reset'
      );
      setForm(structuredClone(result));
      mutateProviders();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : tm('resetFailed'));
    }
  };

  // ---------------------------------------------------------------------------
  // Cache flush
  // ---------------------------------------------------------------------------

  const flushCache = async (name: string) => {
    setFlushingCache(name);
    try {
      await apiPost(`/cache/${encodeURIComponent(name)}/flush`);
      mutateCaches();
    } finally {
      setFlushingCache(null);
    }
  };

  const flushAllCaches = async () => {
    setFlushingAll(true);
    try {
      await apiPost('/cache/flush');
      mutateCaches();
    } finally {
      setFlushingAll(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!hasAccess) return null;

  return (
    <>
      <Head>
        <title>
          {tm('pageTitle')} - {publicSettings?.appTitle || 'Librarr'}
        </title>
      </Head>
      <div>
        <h1 className="text-2xl font-bold mb-8">{tm('pageTitle')}</h1>

        {/* Feedback toasts */}
        {saved && (
          <div className="mb-6 px-4 py-2.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm flex items-center gap-2">
            <svg
              className="w-4 h-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
            {tc('settingsSaved')}
          </div>
        )}
        {error && (
          <div className="mb-6 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
            <svg
              className="w-4 h-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            {error}
          </div>
        )}

        {loadingProviders ? (
          <LoadingSpinner />
        ) : form ? (
          <>
            {/* ================================================================
                SECTION 1 — Metadata Providers
            ================================================================ */}
            <div className="card overflow-hidden mb-6">
              <div className="px-5 py-4 border-b border-librarr-bg-lighter bg-librarr-bg-lighter/30">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center">
                    <BookIcon />
                  </div>
                  <div>
                    <h2 className="font-semibold">{tm('providersTitle')}</h2>
                    <p className="text-xs text-librarr-text-muted mt-0.5">
                      {tm('providersDescription')}
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-5 space-y-3">
                {PROVIDERS.map(({ key, color }) => (
                  <div
                    key={key}
                    className="flex items-center justify-between p-4 rounded-lg border border-librarr-bg-lighter hover:bg-librarr-bg-lighter/20 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}
                      >
                        <BookIcon />
                      </div>
                      <div>
                        <span className="font-medium">{tm(`provider_${key}`)}</span>
                        <p className="text-xs text-librarr-text-muted mt-0.5">
                          {tm(`provider_${key}_desc`)}
                        </p>
                      </div>
                    </div>
                    {/* Toggle switch */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={form[key].enabled}
                      onClick={() => toggleProvider(key)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-librarr-primary focus:ring-offset-2 focus:ring-offset-librarr-bg ${
                        form[key].enabled
                          ? 'bg-librarr-primary'
                          : 'bg-librarr-bg-lighter'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200 ease-in-out ${
                          form[key].enabled
                            ? 'translate-x-5'
                            : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* ================================================================
                SECTION 2 — Priority Configuration
            ================================================================ */}
            <div className="card overflow-hidden mb-6">
              <div className="px-5 py-4 border-b border-librarr-bg-lighter bg-librarr-bg-lighter/30">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-violet-500/15 text-violet-400 flex items-center justify-center">
                    <ListIcon />
                  </div>
                  <div>
                    <h2 className="font-semibold">{tm('priorityTitle')}</h2>
                    <p className="text-xs text-librarr-text-muted mt-0.5">
                      {tm('priorityDescription')}
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {PRIORITY_FIELDS.map((field) => {
                    const list = form.priority[field];

                    return (
                      <div
                        key={field}
                        className="rounded-lg border border-librarr-bg-lighter overflow-hidden"
                      >
                        <div className="px-4 py-2.5 bg-librarr-bg-lighter/30 border-b border-librarr-bg-lighter">
                          <span className="text-sm font-medium">
                            {tm(`priority_${field}`)}
                          </span>
                        </div>
                        <div className="p-2 space-y-1">
                          {list.length === 0 ? (
                            <p className="text-xs text-librarr-text-muted p-2 text-center">
                              {tm('noEnabledProviders')}
                            </p>
                          ) : (
                            list.map((source, idx) => {
                              const provider = PROVIDERS.find(
                                (p) => p.key === source
                              );
                              return (
                                <div
                                  key={source}
                                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-librarr-bg-lighter/20 hover:bg-librarr-bg-lighter/40 transition-colors"
                                >
                                  <span className="text-xs font-mono text-librarr-text-muted w-5 text-center shrink-0">
                                    {idx + 1}
                                  </span>
                                  <div
                                    className={`w-2 h-2 rounded-full shrink-0 ${
                                      provider?.color
                                        .split(' ')[0]
                                        .replace('/15', '') || ''
                                    }`}
                                    style={{
                                      backgroundColor:
                                        source === 'hardcover'
                                          ? '#f59e0b'
                                          : source === 'openlibrary'
                                          ? '#22c55e'
                                          : '#3b82f6',
                                    }}
                                  />
                                  <span className="text-sm flex-1">
                                    {tm(`provider_${source}`)}
                                  </span>
                                  <div className="flex gap-0.5 shrink-0">
                                    <button
                                      type="button"
                                      disabled={idx === 0}
                                      onClick={() =>
                                        movePriority(field, idx, 'up')
                                      }
                                      className="p-1 rounded text-librarr-text-muted hover:text-white hover:bg-librarr-bg-lighter disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                      title={tm('moveUp')}
                                    >
                                      <ArrowUpIcon />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={idx === list.length - 1}
                                      onClick={() =>
                                        movePriority(field, idx, 'down')
                                      }
                                      className="p-1 rounded text-librarr-text-muted hover:text-white hover:bg-librarr-bg-lighter disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                      title={tm('moveDown')}
                                    >
                                      <ArrowDownIcon />
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Save / Reset buttons */}
            <div className="flex gap-3 mb-8">
              <button
                onClick={handleSave}
                className="btn-primary flex items-center gap-2"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                {tc('saveChanges')}
              </button>
              <button
                onClick={handleReset}
                className="btn-secondary flex items-center gap-2"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
                {tm('resetDefaults')}
              </button>
            </div>
          </>
        ) : null}

        {/* ================================================================
            SECTION 3 — Cache Management
        ================================================================ */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-librarr-bg-lighter bg-librarr-bg-lighter/30">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/15 text-cyan-400 flex items-center justify-center">
                <DatabaseIcon />
              </div>
              <div>
                <h2 className="font-semibold">{tm('cacheTitle')}</h2>
                <p className="text-xs text-librarr-text-muted mt-0.5">
                  {tm('cacheDescription')}
                </p>
              </div>
            </div>
          </div>

          {loadingCaches ? (
            <div className="p-5">
              <LoadingSpinner />
            </div>
          ) : caches && caches.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b border-librarr-bg-lighter text-librarr-text-muted">
                    <th className="px-5 py-3 text-left font-medium">
                      {tm('cacheName')}
                    </th>
                    <th className="px-5 py-3 text-right font-medium">
                      {tm('cacheItems')}
                    </th>
                    <th className="px-5 py-3 text-right font-medium">
                      {tm('cacheMax')}
                    </th>
                    <th className="px-5 py-3 text-right font-medium">
                      {tm('cacheHitRate')}
                    </th>
                    <th className="px-5 py-3 text-right font-medium">TTL</th>
                    <th className="px-5 py-3 text-right font-medium">
                      {tm('cacheActions')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {caches.map((cache) => {
                    const total = cache.hits + cache.misses;
                    const hitRate =
                      total > 0
                        ? Math.round((cache.hits / total) * 100)
                        : 0;

                    return (
                      <tr
                        key={cache.name}
                        className="border-b border-librarr-bg-lighter/50 hover:bg-librarr-bg-lighter/20 transition-colors"
                      >
                        <td className="px-5 py-3 font-medium capitalize">
                          {cache.name}
                        </td>
                        <td className="px-5 py-3 text-right text-librarr-text-muted">
                          {cache.keys.toLocaleString()}
                        </td>
                        <td className="px-5 py-3 text-right text-librarr-text-muted">
                          {cache.maxKeys > 0
                            ? cache.maxKeys.toLocaleString()
                            : '-'}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span
                            className={`${
                              hitRate >= 70
                                ? 'text-green-400'
                                : hitRate >= 30
                                ? 'text-yellow-400'
                                : 'text-librarr-text-muted'
                            }`}
                          >
                            {total > 0 ? `${hitRate}%` : '-'}
                          </span>
                          {total > 0 && (
                            <span className="text-librarr-text-muted ml-1.5 text-xs">
                              ({cache.hits}/{total})
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right text-librarr-text-muted">
                          {formatTtl(cache.ttl)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => flushCache(cache.name)}
                            disabled={
                              flushingCache === cache.name || flushingAll
                            }
                            className="p-1.5 rounded-lg text-librarr-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title={tm('flushCache')}
                          >
                            {flushingCache === cache.name ? (
                              <div className="w-4 h-4 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                            ) : (
                              <TrashIcon />
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Flush All button */}
              <div className="p-5 border-t border-librarr-bg-lighter/50 flex justify-end">
                <button
                  onClick={flushAllCaches}
                  disabled={flushingAll || flushingCache !== null}
                  className="btn-secondary flex items-center gap-2 text-red-400 hover:text-red-300 border-red-400/20 hover:border-red-400/40"
                >
                  {flushingAll ? (
                    <div className="w-4 h-4 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                  ) : (
                    <TrashIcon />
                  )}
                  {tm('flushAll')}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center">
              <p className="text-librarr-text-muted">{tm('noCaches')}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
