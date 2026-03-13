import React, { useState, useMemo } from 'react';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import { apiPost, fetcher } from '../../hooks/useApi';
import { WorkStatus } from '../../constants/media';
import { useUser } from '../../context/UserContext';
import { useSettings } from '../../context/SettingsContext';
import { Permission, hasPermission } from '../../constants/permissions';
import type { UserQuotaResponse } from '../../types/api';
import RequestModal from '../RequestModal';

interface RequestButtonProps {
  mediaType: 'book' | 'music';
  status?: number;
  existingRequest?: boolean;
  existingFormats?: string[];
  // New Work-centric fields (used for book requests)
  workId?: number;
  hardcoverId?: string;
  // Legacy fields (used for music or backward-compat book requests)
  externalId?: string;
  title?: string;
  coverUrl?: string;
  authors?: string[];
  authorForeignId?: string;
  artistForeignId?: string;
  isbn?: string;
  asin?: string;
  allEditionIdentifiers?: string[];
  hasEbookEdition?: boolean;
  hasAudiobookEdition?: boolean;
  ebookAvailable?: boolean;
  audiobookAvailable?: boolean;
  onSuccess?: () => void;
}

export default function RequestButton({
  mediaType,
  status,
  existingRequest,
  existingFormats = [],
  workId,
  hardcoverId,
  externalId,
  title,
  coverUrl,
  authors,
  authorForeignId,
  artistForeignId,
  isbn,
  asin,
  allEditionIdentifiers,
  hasEbookEdition,
  hasAudiobookEdition,
  ebookAvailable,
  audiobookAvailable,
  onSuccess,
}: RequestButtonProps) {
  const { user } = useUser();
  const { settings } = useSettings();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const t = useTranslations('requestButton');

  // Fetch current user quota
  const { data: quota } = useSWR<UserQuotaResponse>(
    user?.id ? `/api/v1/user/${user.id}/quota` : null,
    fetcher
  );
  // For books, check if BOTH ebook and audiobook quotas are exceeded
  // For music, check music quota
  const getQuotaExceeded = () => {
    if (!quota) return false;
    if (mediaType === 'music') {
      return quota.music.limit !== null && quota.music.remaining === 0;
    }
    // Book: blocked only if all requestable formats are exceeded
    const ebookExceeded = quota.ebook.limit !== null && quota.ebook.remaining === 0;
    const audiobookExceeded = quota.audiobook.limit !== null && quota.audiobook.remaining === 0;
    // If only one format is enabled, check only that one
    if (ebookEnabled && !audiobookEnabled) return ebookExceeded;
    if (!ebookEnabled && audiobookEnabled) return audiobookExceeded;
    return ebookExceeded && audiobookExceeded;
  };
  const quotaExceeded = getQuotaExceeded();
  const quotaInfo = mediaType === 'music' ? quota?.music : quota?.ebook;

  const userPerms = user?.permissions ?? 0;
  const canRequestEbook = hasPermission(userPerms, Permission.REQUEST_EBOOK);
  const canRequestAudiobook = hasPermission(userPerms, Permission.REQUEST_AUDIOBOOK);
  const canRequestMusic = hasPermission(userPerms, Permission.REQUEST_MUSIC);

  const ebookEnabled = settings?.enableEbookRequests !== false && canRequestEbook;
  const audiobookEnabled = settings?.enableAudiobookRequests !== false && canRequestAudiobook;
  const musicRequestsEnabled = settings?.enableMusicRequests !== false && canRequestMusic;

  // Compute which individual formats are already covered
  const coveredFormats = useMemo(() => {
    const covered = new Set<string>();
    for (const fmt of existingFormats) {
      covered.add(fmt);
    }
    return covered;
  }, [existingFormats]);

  const ebookCovered = coveredFormats.has('ebook');
  const audiobookCovered = coveredFormats.has('audiobook');
  const allCovered = ebookCovered && audiobookCovered;

  // If music requests are disabled, don't show the button
  if (mediaType === 'music' && !musicRequestsEnabled) {
    return null;
  }

  // If both book formats are disabled, don't show the button
  if (mediaType === 'book' && !ebookEnabled && !audiobookEnabled) {
    return null;
  }

  if (status === WorkStatus.AVAILABLE && allCovered) {
    return (
      <button disabled className="btn-primary opacity-75 cursor-default bg-librarr-success hover:bg-librarr-success">
        {t('available')}
      </button>
    );
  }

  // Fully blocked: all formats covered or legacy boolean flag
  if (allCovered || (existingRequest && existingFormats.length === 0)) {
    return (
      <button disabled className="btn-primary opacity-75 cursor-default">
        {t('requested')}
      </button>
    );
  }

  // Resolve the book external id: prefer hardcoverId, then externalId
  const bookExternalId = hardcoverId || externalId;

  // For book requests, require workId or an external id
  if (mediaType === 'book' && !workId && !bookExternalId) {
    return (
      <button disabled className="btn-primary opacity-50 cursor-not-allowed">
        {t('notAvailable')}
      </button>
    );
  }

  // For music requests, require externalId
  if (mediaType === 'music' && !externalId) {
    return (
      <button disabled className="btn-primary opacity-50 cursor-not-allowed">
        {t('notAvailable')}
      </button>
    );
  }

  // Quota exceeded — block the request button
  if (quotaExceeded) {
    return (
      <button
        disabled
        className="btn-primary opacity-50 cursor-not-allowed"
        title={t('quotaExceeded', { used: quotaInfo!.used, limit: quotaInfo!.limit! })}
      >
        {t('quotaExceededLabel')}
      </button>
    );
  }

  // Music request handler (no modal needed)
  const handleMusicRequest = async () => {
    setLoading(true);
    setError('');
    try {
      await apiPost('/request', {
        mediaType,
        externalId,
        title,
        coverUrl,
        artistForeignId,
      });
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  if (mediaType === 'book') {
    // Build existingRequests array for RequestModal from the covered formats
    const existingReqArray = existingFormats.map((fmt) => ({
      format: fmt,
      status: 1, // Treat all existing formats as active (pending/approved)
    }));

    return (
      <div>
        <button
          onClick={() => setShowModal(true)}
          disabled={loading}
          className="btn-primary disabled:opacity-50"
        >
          {loading ? t('requesting') : t('requestBook')}
        </button>
        {error && <p className="text-librarr-danger text-sm mt-1">{error}</p>}

        <RequestModal
          open={showModal}
          onClose={() => setShowModal(false)}
          workId={workId}
          hardcoverId={bookExternalId}
          title={title ?? ''}
          coverUrl={coverUrl}
          authors={authors}
          authorForeignId={authorForeignId}
          isbn={isbn}
          asin={asin}
          allEditionIdentifiers={allEditionIdentifiers}
          hasEbookEdition={hasEbookEdition}
          hasAudiobookEdition={hasAudiobookEdition}
          ebookAvailable={ebookAvailable}
          audiobookAvailable={audiobookAvailable}
          existingRequests={existingReqArray}
          onSuccess={onSuccess}
        />
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={handleMusicRequest}
        disabled={loading}
        className="btn-primary disabled:opacity-50"
      >
        {loading ? t('requesting') : t('requestAlbum')}
      </button>
      {error && <p className="text-librarr-danger text-sm mt-1">{error}</p>}
    </div>
  );
}
