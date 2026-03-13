import React, { useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import useSWR, { useSWRConfig } from 'swr';
import Modal from '../Common/Modal';
import CoverImage from '../Common/CoverImage';
import { apiPost, fetcher } from '../../hooks/useApi';
import { useUser } from '../../context/UserContext';
import { useSettings } from '../../context/SettingsContext';
import { Permission, hasPermission } from '../../constants/permissions';
import { availableLanguages } from '../../constants/languages';
import { RequestStatus } from '../../constants/media';
import type { UserQuotaResponse } from '../../types/api';

type BookFormat = 'ebook' | 'audiobook' | 'both';

export interface RequestModalProps {
  open: boolean;
  onClose: () => void;
  // Book info
  workId?: number;
  hardcoverId?: string;
  title: string;
  coverUrl?: string;
  authors?: string[];
  // Identifiers for the request payload
  authorForeignId?: string;
  isbn?: string;
  asin?: string;
  allEditionIdentifiers?: string[];
  // Edition format availability
  hasEbookEdition?: boolean;
  hasAudiobookEdition?: boolean;
  // Current status (to disable already available/requested formats)
  ebookAvailable?: boolean;
  audiobookAvailable?: boolean;
  existingRequests?: Array<{ format: string; status: number }>;
  // Pre-select a format when opening the modal
  defaultFormat?: 'ebook' | 'audiobook';
  // Callback after successful request
  onSuccess?: () => void;
}

export default function RequestModal({
  open,
  onClose,
  workId,
  hardcoverId,
  title,
  coverUrl,
  authors,
  authorForeignId: _authorForeignId,
  isbn: _isbn,
  asin: _asin,
  allEditionIdentifiers: _allEditionIdentifiers,
  hasEbookEdition,
  hasAudiobookEdition,
  ebookAvailable,
  audiobookAvailable,
  existingRequests = [],
  defaultFormat,
  onSuccess,
}: RequestModalProps) {
  const { user } = useUser();
  const { settings } = useSettings();
  const { mutate: globalMutate } = useSWRConfig();
  const t = useTranslations('requestModal');

  // Fetch quota
  const { data: quota } = useSWR<UserQuotaResponse>(
    user?.id && open ? `/api/v1/user/${user.id}/quota` : null,
    fetcher
  );
  const ebookQuota = quota?.ebook;
  const audiobookQuota = quota?.audiobook;
  const ebookQuotaExceeded = ebookQuota?.limit !== null && ebookQuota?.limit !== undefined && ebookQuota?.remaining === 0;
  const audiobookQuotaExceeded = audiobookQuota?.limit !== null && audiobookQuota?.limit !== undefined && audiobookQuota?.remaining === 0;
  const quotaExceeded = ebookQuotaExceeded && audiobookQuotaExceeded;
  const [selectedFormat, setSelectedFormat] = useState<BookFormat | null>(defaultFormat ?? null);
  const [selectedLanguage, setSelectedLanguage] = useState(
    () => user?.settings?.locale || 'en'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const userPerms = user?.permissions ?? 0;
  const canRequestEbook = hasPermission(userPerms, Permission.REQUEST_EBOOK);
  const canRequestAudiobook = hasPermission(userPerms, Permission.REQUEST_AUDIOBOOK);

  const ebookEnabled = settings?.enableEbookRequests !== false && canRequestEbook;
  const audiobookEnabled = settings?.enableAudiobookRequests !== false && canRequestAudiobook;

  // Determine which formats are already covered (available or requested)
  const coveredFormats = useMemo(() => {
    const covered = new Set<string>();
    if (ebookAvailable) covered.add('ebook');
    if (audiobookAvailable) covered.add('audiobook');
    for (const req of existingRequests) {
      if (
        req.status === RequestStatus.PENDING ||
        req.status === RequestStatus.APPROVED ||
        req.status === RequestStatus.COMPLETED
      ) {
        covered.add(req.format);
      }
    }
    return covered;
  }, [ebookAvailable, audiobookAvailable, existingRequests]);

  const ebookCovered = coveredFormats.has('ebook');
  const audiobookCovered = coveredFormats.has('audiobook');

  // Build available format options
  const availableFormats = useMemo((): BookFormat[] => {
    const formats: BookFormat[] = [];
    if (!ebookCovered && ebookEnabled) formats.push('ebook');
    if (!audiobookCovered && audiobookEnabled) formats.push('audiobook');
    if (formats.length === 2) formats.push('both');
    return formats;
  }, [ebookCovered, audiobookCovered, ebookEnabled, audiobookEnabled]);

  // Effective selection: user choice > defaultFormat prop > first available
  const effectiveSelected =
    selectedFormat && availableFormats.includes(selectedFormat)
      ? selectedFormat
      : defaultFormat && availableFormats.includes(defaultFormat)
        ? defaultFormat
        : availableFormats[0] ?? null;

  // Format status labels for display
  const formatStatusLabel = useCallback(
    (fmt: 'ebook' | 'audiobook') => {
      if (fmt === 'ebook' && ebookAvailable) return t('statusAvailable');
      if (fmt === 'audiobook' && audiobookAvailable) return t('statusAvailable');
      const req = existingRequests.find(
        (r) =>
          r.format === fmt &&
          (r.status === RequestStatus.PENDING ||
            r.status === RequestStatus.APPROVED)
      );
      if (req) return t('statusRequested');
      return null;
    },
    [ebookAvailable, audiobookAvailable, existingRequests, t]
  );

  const handleSubmit = async () => {
    if (!effectiveSelected) return;
    setLoading(true);
    setError('');
    try {
      // Build the payload: for "both", submit two separate requests
      const formats: string[] =
        effectiveSelected === 'both' ? ['ebook', 'audiobook'] : [effectiveSelected];

      for (const fmt of formats) {
        const payload: Record<string, unknown> = {
          format: fmt,
          requestedLanguage:
            selectedLanguage !== 'any' ? selectedLanguage : undefined,
        };
        if (workId) {
          payload.workId = workId;
        } else if (hardcoverId) {
          payload.hardcoverId = hardcoverId;
        }
        await apiPost('/request', payload);
      }
      // Revalidate SWR caches that might contain this book
      globalMutate(
        (key: string) =>
          typeof key === 'string' &&
          (key.includes('/api/v1/book/') || key.includes('/api/v1/search') || key.includes('/api/v1/request')),
        undefined,
        { revalidate: true }
      );
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setError('');
      setSelectedFormat(null);
      onClose();
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title={t('title')}>
      <div className="space-y-5">
        {/* Book info header */}
        <div className="flex gap-4 items-start">
          <div className="w-16 h-24 rounded overflow-hidden bg-librarr-bg-lighter flex-shrink-0 relative">
            {coverUrl ? (
              <CoverImage
                src={coverUrl}
                alt={title}
                sizes="64px"
                className="object-cover"
                fallback={
                  <div className="w-full h-full flex items-center justify-center text-librarr-text-muted">
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
                  </div>
                }
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-librarr-text-muted">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm leading-snug truncate">{title}</h3>
            {authors && authors.length > 0 && (
              <p className="text-xs text-librarr-text-muted mt-0.5 truncate">
                {authors.join(', ')}
              </p>
            )}
          </div>
        </div>

        {/* Format selector */}
        {availableFormats.length > 0 ? (
          <div>
            <label className="block text-sm font-medium text-librarr-text-muted mb-2">
              {t('chooseFormat')}
            </label>
            <div
              className={`grid gap-2 ${
                availableFormats.length === 1
                  ? 'grid-cols-1'
                  : availableFormats.length === 2
                    ? 'grid-cols-2'
                    : 'grid-cols-3'
              }`}
            >
              {availableFormats.map((fmt) => {
                const isSelected = effectiveSelected === fmt;
                return (
                  <button
                    key={fmt}
                    onClick={() => setSelectedFormat(fmt)}
                    aria-pressed={isSelected}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
                      isSelected
                        ? 'border-librarr-primary bg-librarr-primary/10 text-librarr-primary'
                        : 'border-librarr-bg-lighter bg-librarr-bg-light text-librarr-text-muted hover:text-librarr-text'
                    }`}
                  >
                    {fmt === 'ebook'
                      ? t('formatEbook')
                      : fmt === 'audiobook'
                        ? t('formatAudiobook')
                        : t('formatBoth')}
                  </button>
                );
              })}
            </div>

            {/* Status indicators for disabled formats */}
            {(ebookCovered || audiobookCovered) && (
              <div className="mt-2 space-y-1">
                {ebookCovered && (
                  <p className="text-xs text-librarr-text-muted flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    {t('formatEbook')}: {formatStatusLabel('ebook')}
                  </p>
                )}
                {audiobookCovered && (
                  <p className="text-xs text-librarr-text-muted flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                    {t('formatAudiobook')}: {formatStatusLabel('audiobook')}
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="px-3 py-2.5 rounded-lg bg-librarr-bg-light border border-librarr-bg-lighter text-librarr-text-muted text-sm">
            {t('allFormatsCovered')}
          </div>
        )}

        {/* Format availability warning */}
        {effectiveSelected &&
          (() => {
            const wantsEbook = effectiveSelected === 'ebook' || effectiveSelected === 'both';
            const wantsAudiobook = effectiveSelected === 'audiobook' || effectiveSelected === 'both';
            const missingEbook = wantsEbook && hasEbookEdition === false;
            const missingAudiobook = wantsAudiobook && hasAudiobookEdition === false;
            if (!missingEbook && !missingAudiobook) return null;
            const message =
              missingEbook && missingAudiobook
                ? t('noDigitalWarning')
                : missingEbook
                  ? t('noEbookWarning')
                  : t('noAudiobookWarning');
            return (
              <div className="px-3 py-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm flex items-center gap-2">
                <svg
                  className="w-4 h-4 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                {message}
              </div>
            );
          })()}

        {/* Language selector */}
        <div>
          <label className="block text-sm font-medium text-librarr-text-muted mb-2">
            {t('selectLanguage')}
          </label>
          <select
            className="input-field w-full"
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
          >
            {availableLanguages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>

        {/* Quota warning */}
        {(ebookQuotaExceeded || audiobookQuotaExceeded) && (
          <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start gap-2">
            <svg className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div className="space-y-0.5">
              {ebookQuotaExceeded && ebookQuota && (
                <p>{t('quotaExceeded', { used: ebookQuota.used, limit: ebookQuota.limit! })} (ebook)</p>
              )}
              {audiobookQuotaExceeded && audiobookQuota && (
                <p>{t('quotaExceeded', { used: audiobookQuota.used, limit: audiobookQuota.limit! })} (audiobook)</p>
              )}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={handleClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium text-librarr-text-muted hover:text-librarr-text transition-colors"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!effectiveSelected || loading || availableFormats.length === 0 || quotaExceeded}
            className="btn-primary disabled:opacity-50 flex items-center gap-2"
          >
            {loading && (
              <div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-b-2 border-white" />
            )}
            {loading ? t('requesting') : t('submit')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
