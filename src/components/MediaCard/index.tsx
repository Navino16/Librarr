import React, { useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import CoverImage from '../Common/CoverImage';
import { RequestStatus, WorkStatus } from '../../constants/media';

// --- Icons ---

/** Small book icon for ebook badge */
function EbookIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
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
}

/** Small headphones icon for audiobook badge */
function AudiobookIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  );
}

/** Music note icon for music cards fallback */
function MusicIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

/** Book icon for book cards fallback */
function BookFallbackIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

// --- Types ---

interface RequestInfo {
  format: string;
  status: number;
}

interface MediaCardProps {
  id: string;
  type: 'book' | 'music';
  title: string;
  subtitle?: string;
  coverUrl?: string;
  /** Work status (WorkStatus enum) */
  status?: number;
  /** Active requests with per-format status */
  requests?: RequestInfo[];
  /** Whether ebook is available in library */
  ebookAvailable?: boolean;
  /** Whether audiobook is available in library */
  audiobookAvailable?: boolean;
}

// --- Format badge state ---

type FormatState = 'available' | 'downloading' | 'pending' | 'failed' | 'none';

/** Dot color class for each format state */
const dotColors: Record<FormatState, string> = {
  available: 'bg-green-400',
  downloading: 'bg-blue-400',
  pending: 'bg-yellow-400',
  failed: 'bg-red-400',
  none: 'bg-gray-500',
};

/** Badge background + text style per format state */
const badgeStyles: Record<string, Record<FormatState, string>> = {
  ebook: {
    available: 'bg-blue-500/90 text-white',
    downloading: 'border border-blue-500/70 text-blue-400 bg-blue-500/10',
    pending: 'border border-yellow-500/70 text-yellow-400 bg-yellow-500/20',
    failed: 'bg-red-500/90 text-white',
    none: 'bg-gray-600/50 text-gray-400',
  },
  audiobook: {
    available: 'bg-purple-500/90 text-white',
    downloading: 'border border-purple-500/70 text-purple-400 bg-purple-500/10',
    pending: 'border border-yellow-500/70 text-yellow-400 bg-yellow-500/20',
    failed: 'bg-red-500/90 text-white',
    none: 'bg-gray-600/50 text-gray-400',
  },
};

/** Status ring CSS class by Work status */
const statusRingClasses: Record<number, string> = {
  [WorkStatus.PENDING]: 'ring-[3px] ring-yellow-500',
  [WorkStatus.PROCESSING]: 'ring-[3px] ring-librarr-primary',
  [WorkStatus.PARTIALLY_AVAILABLE]: 'ring-[3px] ring-librarr-accent',
  [WorkStatus.AVAILABLE]: 'ring-[3px] ring-librarr-success',
};

/** i18n key mapping for tooltip labels */
const formatStateLabelKeys: Record<FormatState, string> = {
  available: 'available',
  downloading: 'downloading',
  pending: 'pending',
  failed: 'failed',
  none: 'notRequested',
};

// --- Helpers ---

function getFormatState(
  format: 'ebook' | 'audiobook',
  isAvailable: boolean,
  requests: RequestInfo[]
): FormatState {
  // Available in library takes priority
  if (isAvailable) return 'available';

  // Check requests for this format
  const formatRequests = requests.filter((r) => r.format === format);
  if (formatRequests.length === 0) return 'none';

  // Find the most advanced status among requests for this format
  const hasCompleted = formatRequests.some((r) => r.status === RequestStatus.COMPLETED);
  if (hasCompleted) return 'available';

  const hasApproved = formatRequests.some((r) => r.status === RequestStatus.APPROVED);
  if (hasApproved) return 'downloading';

  const hasPending = formatRequests.some((r) => r.status === RequestStatus.PENDING);
  if (hasPending) return 'pending';

  const hasFailed = formatRequests.some(
    (r) => r.status === RequestStatus.FAILED || r.status === RequestStatus.DECLINED
  );
  if (hasFailed) return 'failed';

  return 'none';
}

function deriveRingClass(
  status: number | undefined,
  ebookState: FormatState,
  audiobookState: FormatState
): string {
  // If we have per-format info, derive a combined ring
  const states = [ebookState, audiobookState];
  const hasAvailable = states.includes('available');
  const hasInProgress = states.includes('downloading') || states.includes('pending') || states.includes('failed');

  if (hasAvailable && hasInProgress) {
    return statusRingClasses[WorkStatus.PARTIALLY_AVAILABLE] || '';
  }

  // Fall back to the Work-level status for the ring
  if (status && status > WorkStatus.UNKNOWN) {
    return statusRingClasses[status] || '';
  }

  return '';
}

// --- Component ---

export default function MediaCard({
  id,
  type,
  title,
  subtitle,
  coverUrl,
  status,
  requests = [],
  ebookAvailable = false,
  audiobookAvailable = false,
}: MediaCardProps) {
  const tm = useTranslations('mediaCard');
  const href = type === 'book' ? `/book/${id}` : `/music/${id}`;

  // Compute per-format states
  const ebookState = useMemo(
    () => (type === 'book' ? getFormatState('ebook', ebookAvailable, requests) : 'none'),
    [type, ebookAvailable, requests]
  );
  const audiobookState = useMemo(
    () => (type === 'book' ? getFormatState('audiobook', audiobookAvailable, requests) : 'none'),
    [type, audiobookAvailable, requests]
  );

  // Only show badges for formats that are relevant (at least requested or available)
  const showEbook = type === 'book' && ebookState !== 'none';
  const showAudiobook = type === 'book' && audiobookState !== 'none';
  const hasBadges = showEbook || showAudiobook;

  // Ring class
  const ringClass = useMemo(() => {
    if (type === 'music') {
      // Music: simple status ring
      return status && status > WorkStatus.UNKNOWN
        ? statusRingClasses[status] || ''
        : '';
    }
    return deriveRingClass(status, ebookState, audiobookState);
  }, [type, status, ebookState, audiobookState]);

  // Tooltip text
  const tooltipText = useMemo(() => {
    if (type !== 'book') return undefined;
    if (!showEbook && !showAudiobook) return undefined;
    const parts: string[] = [];
    if (showEbook) parts.push(`Ebook: ${tm(formatStateLabelKeys[ebookState])}`);
    if (showAudiobook) parts.push(`Audiobook: ${tm(formatStateLabelKeys[audiobookState])}`);
    return parts.join('\n');
  }, [type, showEbook, showAudiobook, ebookState, audiobookState, tm]);

  const FallbackIcon = type === 'book' ? BookFallbackIcon : MusicIcon;

  return (
    <Link href={href} className="group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-librarr-primary rounded-lg" title={tooltipText}>
      <div
        className={`relative aspect-[2/3] rounded-lg overflow-hidden bg-librarr-bg-lighter mb-2 ${ringClass}`}
      >
        {coverUrl ? (
          <CoverImage
            src={coverUrl}
            alt={title}
            sizes="160px"
            className="object-cover group-hover:scale-105 transition-transform duration-200"
            fallback={
              <div className="w-full h-full flex items-center justify-center text-librarr-text-muted text-3xl">
                <FallbackIcon className="w-8 h-8" />
              </div>
            }
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-librarr-text-muted">
            <FallbackIcon className="w-8 h-8" />
          </div>
        )}

        {/* Hover gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

        {/* Dual format badges */}
        {hasBadges && (
          <div className="absolute bottom-1.5 left-1.5 flex gap-1">
            {showEbook && (
              <span
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold leading-tight shadow-sm ${
                  badgeStyles.ebook[ebookState]
                }`}
              >
                <EbookIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                <span
                  className={`w-1.5 h-1.5 rounded-full ${dotColors[ebookState]}`}
                />
              </span>
            )}
            {showAudiobook && (
              <span
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold leading-tight shadow-sm ${
                  badgeStyles.audiobook[audiobookState]
                }`}
              >
                <AudiobookIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                <span
                  className={`w-1.5 h-1.5 rounded-full ${dotColors[audiobookState]}`}
                />
              </span>
            )}
          </div>
        )}
      </div>
      <h3 className="text-sm font-medium truncate">{title}</h3>
      {subtitle && (
        <p className="text-xs text-librarr-text-muted truncate">{subtitle}</p>
      )}
    </Link>
  );
}
