import React, { useState } from 'react';
import Head from 'next/head';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import { useSettings } from '../../context/SettingsContext';
import { useLocale } from '../../context/LocaleContext';
import { apiDelete, fetcher } from '../../hooks/useApi';
import { useRequirePermission } from '../../hooks/usePermission';
import { Permission } from '../../constants/permissions';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import type { PaginatedResponse, UnmatchedMediaItem } from '../../types/api';

const PAGE_SIZE = 25;

export default function UnmatchedSettingsPage() {
  const hasAccess = useRequirePermission(Permission.MANAGE_SETTINGS_MEDIA_SERVERS);
  const { settings } = useSettings();
  const { locale } = useLocale();
  const t = useTranslations('settings');
  const [page, setPage] = useState(1);
  const [dismissing, setDismissing] = useState<Set<number>>(new Set());

  const skip = (page - 1) * PAGE_SIZE;
  const { data, isLoading, mutate } = useSWR<PaginatedResponse<UnmatchedMediaItem>>(
    hasAccess ? `/api/v1/settings/unmatched?take=${PAGE_SIZE}&skip=${skip}` : null,
    fetcher
  );

  const dismiss = async (id: number) => {
    setDismissing((prev) => new Set(prev).add(id));
    try {
      await apiDelete(`/settings/unmatched/${id}`);
      mutate();
    } finally {
      setDismissing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  if (!hasAccess) return null;

  const totalPages = data?.pageInfo.pages ?? 0;
  const totalResults = data?.pageInfo.results ?? 0;
  const items = data?.results ?? [];

  const formatBadgeColor: Record<string, string> = {
    ebook: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    audiobook: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
    both: 'bg-green-500/15 text-green-400 border-green-500/20',
  };

  const reasonBadgeColor: Record<string, string> = {
    unmatched: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
    duplicate: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  };

  const reasonLabel: Record<string, string> = {
    unmatched: t('unmatchedReasonUnmatched'),
    duplicate: t('unmatchedReasonDuplicate'),
  };

  return (
    <>
      <Head>
        <title>{t('unmatchedItemsTitle')} - {settings?.appTitle || 'Librarr'}</title>
      </Head>
      <div>
        <div className="mb-8">
          <h1 className="text-2xl font-bold">{t('unmatchedItemsTitle')}</h1>
          <p className="text-sm text-librarr-text-muted mt-1">
            {t('unmatchedItemsSubtitle')}
          </p>
        </div>

        {isLoading ? (
          <LoadingSpinner />
        ) : items.length === 0 && page === 1 ? (
          /* Empty state */
          <div className="card p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-1">{t('unmatchedNoItems')}</h3>
            <p className="text-sm text-librarr-text-muted">{t('unmatchedNoItemsDescription')}</p>
          </div>
        ) : (
          <>
            {/* Results count */}
            <p className="text-sm text-librarr-text-muted mb-4">
              {totalResults} item{totalResults !== 1 ? 's' : ''}
            </p>

            <div className="grid gap-3">
              {items.map((item) => {
                const isDismissing = dismissing.has(item.id);

                return (
                  <div
                    key={item.id}
                    className={`card p-5 flex items-start gap-4 ${isDismissing ? 'opacity-50' : ''}`}
                  >
                    {/* Status icon */}
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      item.reason === 'duplicate' ? 'bg-orange-500/15 text-orange-400' : 'bg-yellow-500/15 text-yellow-400'
                    }`}>
                      {item.reason === 'duplicate' ? (
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="8" y="2" width="13" height="13" rx="2" />
                          <path d="M5 8H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          <line x1="12" y1="9" x2="12" y2="13" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                      )}
                    </div>

                    {/* Item info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold truncate">{item.title}</span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${formatBadgeColor[item.format] || 'bg-gray-500/15 text-gray-400 border-gray-500/20'}`}>
                          {item.format}
                        </span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${reasonBadgeColor[item.reason] || reasonBadgeColor.unmatched}`}>
                          {reasonLabel[item.reason] || item.reason}
                        </span>
                      </div>

                      {item.authors && (
                        <p className="text-sm text-librarr-text-muted mt-0.5 truncate">{item.authors}</p>
                      )}

                      <div className="flex items-center gap-4 mt-2 text-xs text-librarr-text-muted flex-wrap">
                        {item.isbn && (
                          <span>ISBN: <code>{item.isbn}</code></span>
                        )}
                        {item.asin && (
                          <span>ASIN: <code>{item.asin}</code></span>
                        )}
                        {item.libraryName && (
                          <span className="flex items-center gap-1">
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                            </svg>
                            {item.libraryName}
                          </span>
                        )}
                        <span>{t('unmatchedFirstSeen')}: {new Date(item.firstSeenAt).toLocaleDateString(locale)}</span>
                        <span>{t('unmatchedLastAttempt')}: {new Date(item.lastAttemptedAt).toLocaleDateString(locale)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {item.sourceUrl && (
                        <a
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2.5 rounded-lg text-librarr-primary hover:bg-librarr-primary/10 transition-colors"
                          title={t('unmatchedOpenInAbs')}
                        >
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </a>
                      )}
                      <button
                        onClick={() => dismiss(item.id)}
                        disabled={isDismissing}
                        className="p-2.5 rounded-lg text-librarr-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title={t('unmatchedDismiss')}
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-6">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-librarr-bg-lighter hover:bg-librarr-bg-lighter/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4 inline mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  Previous
                </button>
                <span className="text-sm text-librarr-text-muted">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-librarr-bg-lighter hover:bg-librarr-bg-lighter/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                  <svg className="w-4 h-4 inline ml-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
