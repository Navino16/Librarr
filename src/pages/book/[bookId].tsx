import React, { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import CoverImage from '../../components/Common/CoverImage';
import useSWR from 'swr';
import { useSettings } from '../../context/SettingsContext';
import StatusBadge from '../../components/StatusBadge';
import MediaCard from '../../components/MediaCard';
import MediaSlider from '../../components/MediaSlider';
import Modal from '../../components/Common/Modal';
import { fetcher, apiPost } from '../../hooks/useApi';

const RequestModal = dynamic(() => import('../../components/RequestModal'), {
  ssr: false,
});
import { ReportIssueButton } from '../../components/IssueModal';
import { useUser } from '../../context/UserContext';
import { Permission, hasPermission } from '../../constants/permissions';
import { RequestStatus } from '../../constants/media';
import { availableLanguages } from '../../constants/languages';
import { sourceName } from '../../utils/sourceName';
import DownloadProgress from '../../components/DownloadProgress';
import type {
  WorkDetail,
  BookLookupResponse,
  BookRequestDetail,
  BookResult,
} from '../../types/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Detect whether the route param is a numeric Work ID or a Hardcover ID */
function isNumericId(id: string): boolean {
  return /^\d+$/.test(id);
}

/** Parse genres from the JSON string stored in the Work entity */
function parseGenres(genresJson?: string): string[] {
  if (!genresJson) return [];
  try {
    const parsed = JSON.parse(genresJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Format a date string for display */
function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/** Capitalize first letter */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Star Rating component
// ---------------------------------------------------------------------------

function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  const stars = [];
  for (let i = 1; i <= max; i++) {
    const fill = Math.min(Math.max(rating - (i - 1), 0), 1);
    stars.push(
      <span key={i} className="relative inline-block w-4 h-4">
        {/* Empty star */}
        <svg
          className="absolute inset-0 w-4 h-4 text-librarr-bg-lighter"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
        {/* Filled star (clipped) */}
        <svg
          className="absolute inset-0 w-4 h-4 text-yellow-400"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
          style={{ clipPath: `inset(0 ${(1 - fill) * 100}% 0 0)` }}
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`${rating.toFixed(1)} / ${max}`}
    >
      {stars}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Format Status Card component
// ---------------------------------------------------------------------------

interface FormatCardProps {
  format: 'ebook' | 'audiobook';
  work?: WorkDetail | null;
  onRequestClick: (format: 'ebook' | 'audiobook') => void;
  t: ReturnType<typeof useTranslations>;
}

function FormatStatusCard({ format, work, onRequestClick, t }: FormatCardProps) {
  const { user: currentUser } = useUser();
  const canViewProfiles = currentUser && (
    hasPermission(currentUser.permissions, Permission.ADMIN) ||
    hasPermission(currentUser.permissions, Permission.MANAGE_USERS)
  );
  const isEbook = format === 'ebook';
  const isAvailable = isEbook ? !!work?.ebookAvailable : !!work?.audiobookAvailable;

  // Find active requests for this format
  const requests = work?.requests?.filter((r) => r.format === format) ?? [];
  const activeRequest = requests.find(
    (r) =>
      r.status === RequestStatus.PENDING ||
      r.status === RequestStatus.APPROVED
  );
  const completedRequest = requests.find(
    (r) => r.status === RequestStatus.COMPLETED
  );
  const failedRequest = requests.find(
    (r) => r.status === RequestStatus.FAILED
  );
  const declinedRequest = requests.find(
    (r) => r.status === RequestStatus.DECLINED
  );
  const downloadingRequest = requests.find(
    (r) => r.status === RequestStatus.APPROVED && r.downloadStatus
  );

  // Find availability entry for this format
  const availability = work?.availability?.find((a) => a.format === format);

  // Determine status
  let statusLabel: string;
  let statusColor: string;
  let statusIcon: React.ReactNode;

  if (isAvailable) {
    statusLabel = t('statusAvailable');
    statusColor = 'text-green-400';
    statusIcon = (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    );
  } else if (downloadingRequest) {
    const pct = downloadingRequest.downloadProgress ?? 0;
    statusLabel = t('statusDownloading', { progress: pct.toFixed(0) });
    statusColor = 'text-librarr-primary';
    statusIcon = (
      <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
    );
  } else if (activeRequest) {
    statusLabel = t('statusRequested');
    statusColor = 'text-yellow-400';
    statusIcon = (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    );
  } else if (completedRequest) {
    statusLabel = t('statusCompleted');
    statusColor = 'text-green-400';
    statusIcon = (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    );
  } else if (failedRequest) {
    statusLabel = t('statusFailed');
    statusColor = 'text-red-400';
    statusIcon = (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    );
  } else if (declinedRequest) {
    statusLabel = t('statusDeclined');
    statusColor = 'text-orange-400';
    statusIcon = (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
      </svg>
    );
  } else {
    statusLabel = t('statusNotRequested');
    statusColor = 'text-librarr-text-muted';
    statusIcon = (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    );
  }

  const formatIcon = isEbook ? (
    // Book/ebook icon
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ) : (
    // Headphones/audiobook icon
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  );

  const badgeColor = isEbook ? 'blue' : 'purple';

  return (
    <div className="card p-4 flex items-center gap-4">
      {/* Format icon + label */}
      <div className={`flex items-center gap-2 min-w-[120px] text-${badgeColor}-400`}>
        {formatIcon}
        <span className="font-medium text-sm">
          {isEbook ? t('formatEbook') : t('formatAudiobook')}
        </span>
      </div>

      {/* Status */}
      <div className={`flex items-center gap-2 flex-1 ${statusColor}`}>
        {statusIcon}
        <span className="text-sm font-medium">{statusLabel}</span>
      </div>

      {/* Download progress */}
      {downloadingRequest && (
        <div className="flex-1">
          <DownloadProgress
            progress={downloadingRequest.downloadProgress}
            status={downloadingRequest.downloadStatus}
            timeLeft={downloadingRequest.downloadTimeLeft}
          />
        </div>
      )}

      {/* Available: source + added date */}
      {isAvailable && availability?.addedAt && (
        <span className="text-xs text-librarr-text-muted hidden sm:block">
          {capitalize(availability.source)} · {t('addedOn', { date: formatDate(availability.addedAt) })}
        </span>
      )}

      {/* Requested by info */}
      {!isAvailable && (activeRequest || completedRequest || failedRequest || declinedRequest)?.requestedBy && !downloadingRequest && (() => {
        const req = (activeRequest || completedRequest || failedRequest || declinedRequest)!;
        const rb = req.requestedBy!;
        return (
          <span className="text-xs text-librarr-text-muted hidden sm:flex items-center gap-1">
            {t('requestedByPrefix')}{' '}
            {canViewProfiles ? (
              <Link href={`/users/${rb.id}`} className="hover:text-librarr-primary transition-colors">
                {rb.username}
              </Link>
            ) : (
              rb.username
            )}
            {' '}{t('requestedByDate', { date: formatDate(req.createdAt) })}
          </span>
        );
      })()}

      {/* Action button */}
      <div className="shrink-0">
        {isAvailable && availability?.sourceUrl ? (
          <a
            href={availability.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary bg-librarr-success hover:bg-librarr-success/80 text-sm px-3 py-1.5 inline-flex items-center gap-1.5"
          >
            {t('openInSource')}
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        ) : !isAvailable && !activeRequest && !completedRequest ? (
          <button
            onClick={() => onRequestClick(format)}
            className={`btn-primary text-sm px-3 py-1.5 ${failedRequest ? 'bg-red-600 hover:bg-red-500' : ''}`}
          >
            {failedRequest || declinedRequest ? t('retryRequest') : t('requestFormat')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function BookDetailPage() {
  const router = useRouter();
  const { bookId } = router.query;
  const { settings } = useSettings();
  const { user } = useUser();
  const t = useTranslations('book');
  const tr = useTranslations('requestButton');

  // Determine if this is a numeric Work ID or a Hardcover ID
  const idStr = typeof bookId === 'string' ? bookId : '';
  const isNumeric = isNumericId(idStr);
  const apiUrl = idStr
    ? isNumeric
      ? `/api/v1/book/${idStr}`
      : `/api/v1/book/lookup/${idStr}`
    : null;

  // Fetch work data
  const { data: rawData, isLoading, mutate } = useSWR<WorkDetail | BookLookupResponse>(
    apiUrl,
    fetcher,
    {
      refreshInterval: (data) => {
        // Auto-refresh when there are active downloads
        const work = resolveWork(data);
        const hasActiveDownload = work?.requests?.some(
          (r: BookRequestDetail) =>
            r.status === RequestStatus.APPROVED && r.downloadStatus
        );
        return hasActiveDownload ? 15000 : 0;
      },
    }
  );

  // Normalize: both endpoints can return either WorkDetail directly or { metadata, work }
  const work = resolveWork(rawData);
  const lookupMetadata = resolveLookupMetadata(rawData);

  // Fetch series and similar whenever we have any book data (local or metadata).
  // The backend resolves series via Hardcover even if the local work has no series stored.
  const hasBookData = work || lookupMetadata;
  const { data: seriesData } = useSWR<{ results: BookResult[]; seriesName: string }>(
    hasBookData ? `/api/v1/book/${idStr}/series` : null,
    fetcher
  );
  const { data: similarData } = useSWR<{ results: BookResult[] }>(
    hasBookData ? `/api/v1/book/${idStr}/similar` : null,
    fetcher
  );

  // Request modal state
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestDefaultFormat, setRequestDefaultFormat] = useState<'ebook' | 'audiobook' | undefined>();

  // Series request modal state
  const [seriesModalOpen, setSeriesModalOpen] = useState(false);
  const [seriesFormat, setSeriesFormat] = useState<'ebook' | 'audiobook' | 'both'>('ebook');
  const [seriesLanguage, setSeriesLanguage] = useState(() => user?.settings?.locale || 'en');
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [seriesProgress, setSeriesProgress] = useState<{ current: number; total: number } | null>(null);
  const [seriesResult, setSeriesResult] = useState<{ success: number; total: number } | null>(null);

  // Description expand/collapse
  const [descExpanded, setDescExpanded] = useState(false);

  // Derived data
  const genres = work?.genresJson
    ? parseGenres(work.genresJson)
    : lookupMetadata?.categories ?? [];

  const authors =
    work?.authors && work.authors.length > 0 ? work.authors : null;

  // Handle per-format request (opens the shared RequestModal with pre-selected format)
  const handleFormatRequest = (format: 'ebook' | 'audiobook') => {
    setRequestDefaultFormat(format);
    setRequestModalOpen(true);
  };

  // Handle series request
  const handleRequestSeries = async () => {
    if (!seriesData?.results || seriesLoading) return;
    setSeriesLoading(true);
    setSeriesModalOpen(false);
    setSeriesResult(null);

    let success = 0;
    const total = seriesData.results.length;
    const formats = seriesFormat === 'both' ? ['ebook', 'audiobook'] : [seriesFormat];

    setSeriesProgress({ current: 0, total });

    for (let i = 0; i < seriesData.results.length; i++) {
      const b = seriesData.results[i];
      setSeriesProgress({ current: i + 1, total });
      if (!b.goodreadsId) continue;
      for (const fmt of formats) {
        try {
          await apiPost('/request', {
            hardcoverId: b.goodreadsId,
            format: fmt,
            requestedLanguage: seriesLanguage,
          });
          success++;
        } catch {
          // Skip already-requested or failed books
        }
      }
    }

    setSeriesProgress(null);
    setSeriesResult({ success, total });
    setSeriesLoading(false);
    mutate();
  };

  // Loading state
  if (isLoading || !rawData) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-librarr-primary" />
      </div>
    );
  }

  // Error state: no work resolved
  if (!work && !lookupMetadata) {
    return (
      <div className="card p-8 text-center text-librarr-text-muted">
        <p>{t('notFound')}</p>
      </div>
    );
  }

  // Use work data when available, fall back to lookup metadata
  const title = work?.title || lookupMetadata?.title || '';
  const originalTitle = work?.originalTitle;
  const description = work?.description || lookupMetadata?.description;
  const coverUrl = work?.coverUrl || lookupMetadata?.coverUrl;
  const publishedDate = work?.publishedDate || lookupMetadata?.publishedDate;
  const pageCount = work?.pageCount || lookupMetadata?.pageCount;
  const averageRating = work?.averageRating || lookupMetadata?.averageRating;
  const ratingsCount = work?.ratingsCount;
  const sourceUrl = work?.sourceUrl || lookupMetadata?.sourceUrl;
  const seriesName = work?.series?.name || lookupMetadata?.series?.name || seriesData?.seriesName;
  const seriesPosition = work?.seriesPosition || lookupMetadata?.series?.position;

  return (
    <>
      <Head>
        <title>{title} - {settings?.appTitle || 'Librarr'}</title>
      </Head>
      <div>
        {/* ================================================================ */}
        {/* Hero Section */}
        {/* ================================================================ */}
        <div className="flex flex-col md:flex-row gap-8 mb-8">
          {/* Cover image */}
          <div className="flex-shrink-0 w-48 md:w-56 mx-auto md:mx-0">
            {coverUrl ? (
              <div className="relative w-full aspect-[2/3] rounded-lg shadow-xl overflow-hidden">
                <CoverImage
                  src={coverUrl}
                  alt={title}
                  sizes="(max-width: 768px) 192px, 224px"
                  className="object-cover"
                  priority
                  fallback={
                    <div className="w-full h-full bg-librarr-bg-lighter flex items-center justify-center text-librarr-text-muted">
                      <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
                    </div>
                  }
                />
              </div>
            ) : (
              <div className="w-full aspect-[2/3] bg-librarr-bg-lighter rounded-lg flex items-center justify-center text-librarr-text-muted">
                <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            {/* Title + status badge */}
            <div className="flex items-start gap-3 mb-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">{title}</h1>
              {work && work.status > 1 && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <StatusBadge status={work.status} />
                  {work.ebookAvailable && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500 text-white">
                      {t('formatEbook')}
                    </span>
                  )}
                  {work.audiobookAvailable && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500 text-white">
                      {t('formatAudiobook')}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Original title */}
            {originalTitle && originalTitle !== title && (
              <p className="text-sm text-librarr-text-muted mb-2 italic">
                {t('originalTitle', { title: originalTitle })}
              </p>
            )}

            {/* Authors */}
            {authors && authors.length > 0 && (
              <p className="text-lg text-librarr-text-muted mb-2">
                {t('by')}{' '}
                {authors.map((wa, i) => {
                  const author = wa.author;
                  const roleLabel = wa.role && wa.role !== 'author'
                    ? ` (${capitalize(wa.role)})`
                    : '';
                  return (
                    <React.Fragment key={wa.id || i}>
                      {i > 0 && ', '}
                      <Link
                        href={`/author/${author.hardcoverId}`}
                        className="text-librarr-primary hover:underline"
                      >
                        {author.name}
                      </Link>
                      {roleLabel && (
                        <span className="text-sm text-librarr-text-muted">{roleLabel}</span>
                      )}
                    </React.Fragment>
                  );
                })}
              </p>
            )}

            {/* Fallback: authors from lookup metadata */}
            {!authors && lookupMetadata?.authors && lookupMetadata.authors.length > 0 && (
              <p className="text-lg text-librarr-text-muted mb-2">
                {t('by')}{' '}
                {lookupMetadata.authors.map((author, i) => (
                  <React.Fragment key={author.id || i}>
                    {i > 0 && ', '}
                    {author.id ? (
                      <Link
                        href={`/author/${author.id}`}
                        className="text-librarr-primary hover:underline"
                      >
                        {author.name}
                      </Link>
                    ) : (
                      author.name
                    )}
                  </React.Fragment>
                ))}
              </p>
            )}

            {/* Series badge */}
            {seriesName && (
              <p className="text-sm text-librarr-text-muted mb-4">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-librarr-primary/15 text-librarr-primary rounded-full text-xs font-medium">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  {seriesPosition
                    ? t('seriesLabel', { name: seriesName, position: seriesPosition })
                    : t('seriesLabelNoPosition', { name: seriesName })}
                </span>
              </p>
            )}

            {/* Metadata row */}
            <div className="flex flex-wrap gap-4 text-sm text-librarr-text-muted mb-4">
              {publishedDate && <span>{t('published', { date: publishedDate })}</span>}
              {pageCount && <span>{t('pages', { count: pageCount })}</span>}
              {averageRating && (
                <span className="inline-flex items-center gap-1.5">
                  <StarRating rating={averageRating} />
                  <span>{averageRating.toFixed(1)}{t('ratingOf5')}</span>
                  {ratingsCount != null && ratingsCount > 0 && (
                    <span className="text-librarr-text-muted/60">
                      ({t('ratingsCount', { count: ratingsCount })})
                    </span>
                  )}
                </span>
              )}
            </div>

            {/* Source links */}
            <div className="flex flex-wrap gap-2 mb-4">
              {sourceUrl && (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-librarr-bg-lighter hover:bg-librarr-bg-lighter/80 rounded text-xs text-librarr-text-muted hover:text-librarr-text transition-colors"
                >
                  {sourceName(sourceUrl)}
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>
              )}
            </div>

            {/* Genres */}
            {genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {genres.slice(0, 10).map((genre) => (
                  <span
                    key={genre}
                    className="px-2 py-1 bg-librarr-bg-lighter rounded text-xs"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}

            {work && <ReportIssueButton workId={work.id} />}

          </div>
        </div>

        {/* ================================================================ */}
        {/* Format Status Cards — always visible */}
        {/* ================================================================ */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">{t('formatStatus')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormatStatusCard
              format="ebook"
              work={work}
              onRequestClick={handleFormatRequest}
              t={t}
            />
            <FormatStatusCard
              format="audiobook"
              work={work}
              onRequestClick={handleFormatRequest}
              t={t}
            />
          </div>
        </section>

        {/* ================================================================ */}
        {/* Description */}
        {/* ================================================================ */}
        {description && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-2">{t('description')}</h2>
            <div className="prose prose-invert max-w-none">
              <p
                className={`text-librarr-text-muted leading-relaxed whitespace-pre-line ${
                  !descExpanded && description.length > 500 ? 'line-clamp-5' : ''
                }`}
              >
                {description}
              </p>
              {description.length > 500 && (
                <button
                  onClick={() => setDescExpanded(!descExpanded)}
                  aria-expanded={descExpanded}
                  className="text-librarr-primary text-sm mt-1 hover:underline"
                >
                  {descExpanded ? t('showLess') : t('showMore')}
                </button>
              )}
            </div>
          </section>
        )}

        {/* ================================================================ */}
        {/* Series Books */}
        {/* ================================================================ */}
        {seriesData?.results && seriesData.results.length > 1 && (
          <MediaSlider
            title={t('booksInSeries')}
            action={
              <button
                onClick={() => setSeriesModalOpen(true)}
                disabled={seriesLoading || !!seriesResult}
                className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
              >
                {seriesLoading && seriesProgress
                  ? `${t('requestingSeries')} (${seriesProgress.current}/${seriesProgress.total})`
                  : seriesLoading
                    ? t('requestingSeries')
                    : seriesResult
                      ? t('seriesRequested', seriesResult)
                      : t('requestSeries')}
              </button>
            }
          >
            {seriesData.results.map((b) => {
              const isCurrent = b.goodreadsId === (work?.hardcoverId || idStr);
              return (
                <MediaCard
                  key={b.goodreadsId || b.title}
                  id={b.goodreadsId ?? ''}
                  type="book"
                  title={b.title}
                  subtitle={b.series?.position ? `#${b.series.position}` : b.authors?.[0]?.name}
                  coverUrl={b.coverUrl}
                  status={isCurrent ? work?.status : b.media?.status}
                  requests={
                    isCurrent && work?.requests
                      ? work.requests.map((r) => ({
                          format: r.format,
                          status: r.status,
                        }))
                      : b.media?.requests
                  }
                  ebookAvailable={isCurrent ? work?.ebookAvailable : b.media?.ebookAvailable}
                  audiobookAvailable={isCurrent ? work?.audiobookAvailable : b.media?.audiobookAvailable}
                />
              );
            })}
          </MediaSlider>
        )}

        {/* ================================================================ */}
        {/* Similar / More from Author */}
        {/* ================================================================ */}
        {similarData?.results && similarData.results.length > 0 && (
          <MediaSlider title={t('moreFromAuthor')}>
            {similarData.results.map((b) => (
              <MediaCard
                key={b.goodreadsId || b.title}
                id={b.goodreadsId ?? ''}
                type="book"
                title={b.title}
                subtitle={b.authors?.[0]?.name}
                coverUrl={b.coverUrl}
                status={b.media?.status}
                requests={b.media?.requests}
                ebookAvailable={b.media?.ebookAvailable}
                audiobookAvailable={b.media?.audiobookAvailable}
              />
            ))}
          </MediaSlider>
        )}

        {/* ================================================================ */}
        {/* Per-format Request Modal */}
        {/* ================================================================ */}
        <RequestModal
          open={requestModalOpen}
          onClose={() => setRequestModalOpen(false)}
          defaultFormat={requestDefaultFormat}
          workId={work?.id}
          hardcoverId={work?.hardcoverId || lookupMetadata?.hardcoverId || idStr}
          title={title}
          coverUrl={coverUrl}
          authors={
            authors
              ? authors.map((wa) => wa.author.name)
              : lookupMetadata?.authors?.map((a) => a.name)
          }
          hasEbookEdition={work?.hasEbookEdition ?? lookupMetadata?.hasEbookEdition}
          hasAudiobookEdition={work?.hasAudiobookEdition ?? lookupMetadata?.hasAudiobookEdition}
          ebookAvailable={work?.ebookAvailable}
          audiobookAvailable={work?.audiobookAvailable}
          existingRequests={
            work?.requests
              ?.filter(
                (r) =>
                  r.requestedBy?.id === user?.id &&
                  (r.status === RequestStatus.PENDING ||
                    r.status === RequestStatus.APPROVED ||
                    r.status === RequestStatus.COMPLETED)
              )
              .map((r) => ({
                format: r.format,
                status: r.status,
              })) ?? []
          }
          onSuccess={() => mutate()}
        />

        {/* ================================================================ */}
        {/* Series Request Modal */}
        {/* ================================================================ */}
        <Modal
          open={seriesModalOpen}
          onClose={() => setSeriesModalOpen(false)}
          title={t('requestSeries')}
        >
          <div className="space-y-5">
            {/* Format selection */}
            <div>
              <label className="block text-sm font-medium text-librarr-text-muted mb-2">
                {tr('chooseFormat')}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['ebook', 'audiobook', 'both'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setSeriesFormat(fmt)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
                      seriesFormat === fmt
                        ? 'border-librarr-primary bg-librarr-primary/10 text-librarr-primary'
                        : 'border-librarr-bg-lighter bg-librarr-bg-light text-librarr-text-muted hover:text-librarr-text'
                    }`}
                  >
                    {fmt === 'ebook'
                      ? tr('formatEbook')
                      : fmt === 'audiobook'
                        ? tr('formatAudiobook')
                        : tr('formatBoth')}
                  </button>
                ))}
              </div>
            </div>

            {/* Language selection */}
            <div>
              <label className="block text-sm font-medium text-librarr-text-muted mb-2">
                {tr('preferredLanguage')}
              </label>
              <select
                className="input-field w-full"
                value={seriesLanguage}
                onChange={(e) => setSeriesLanguage(e.target.value)}
              >
                {availableLanguages.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Action buttons */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setSeriesModalOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-librarr-text-muted hover:text-librarr-text transition-colors"
              >
                {tr('cancel')}
              </button>
              <button
                onClick={handleRequestSeries}
                className="btn-primary"
              >
                {tr('confirm')}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Helper functions to resolve work from different API response shapes
// ---------------------------------------------------------------------------

function resolveWork(data: unknown): WorkDetail | null {
  if (!data) return null;

  // Direct WorkDetail response (GET /api/v1/book/:id)
  if (typeof data === 'object' && 'hardcoverId' in (data as Record<string, unknown>)) {
    return data as WorkDetail;
  }

  // Lookup response (GET /api/v1/book/lookup/:hardcoverId)
  if (typeof data === 'object' && 'work' in (data as Record<string, unknown>)) {
    return (data as BookLookupResponse).work ?? null;
  }

  return null;
}

function resolveLookupMetadata(data: unknown): BookResult | null {
  if (!data) return null;

  // Lookup response
  if (typeof data === 'object' && 'metadata' in (data as Record<string, unknown>)) {
    return (data as BookLookupResponse).metadata ?? null;
  }

  return null;
}
