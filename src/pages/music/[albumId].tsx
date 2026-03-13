import React from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import CoverImage from '../../components/Common/CoverImage';
import useSWR from 'swr';
import { useSettings } from '../../context/SettingsContext';
import StatusBadge from '../../components/StatusBadge';
import RequestButton from '../../components/RequestButton';
import { fetcher } from '../../hooks/useApi';
import { useUser } from '../../context/UserContext';
import { RequestStatus } from '../../constants/media';
import type { AlbumResult, ArtistSummary, TrackResult } from '../../types/api';
import { formatDuration } from '../../utils/formatDuration';
import DownloadProgress from '../../components/DownloadProgress';
import { ReportIssueButton } from '../../components/IssueModal';

export default function AlbumDetailPage() {
  const router = useRouter();
  const { albumId } = router.query;
  const { settings } = useSettings();
  const { user } = useUser();
  const t = useTranslations('music');

  const { data: album, isLoading, mutate } = useSWR<AlbumResult & { error?: string }>(
    albumId ? `/api/v1/music/${albumId}` : null,
    fetcher,
    {
      refreshInterval: (data) => {
        const hasActiveDownload = data?.media?.requests?.some(
          (r) => r.status === RequestStatus.APPROVED && r.downloadStatus
        );
        return hasActiveDownload ? 15000 : 0;
      },
    }
  );

  const { data: tracksData } = useSWR<{ results: TrackResult[] }>(
    albumId ? `/api/v1/music/${albumId}/tracks` : null,
    fetcher
  );

  if (isLoading || !album) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-librarr-primary" />
      </div>
    );
  }

  if (album.error) {
    return (
      <div className="card p-8 text-center text-librarr-text-muted">
        <p>{t('notFound')}</p>
      </div>
    );
  }

  const tracks = tracksData?.results || [];

  return (
    <>
      <Head>
        <title>{album.title} - {settings?.appTitle || 'Librarr'}</title>
      </Head>
      <div>
        {/* Hero section */}
        <div className="flex flex-col md:flex-row gap-8 mb-8">
          <div className="flex-shrink-0 w-48 md:w-56">
            {album.coverUrl ? (
              <div className="relative w-full aspect-square rounded-lg shadow-xl overflow-hidden">
                <CoverImage
                  src={album.coverUrl}
                  alt={album.title}
                  sizes="(max-width: 768px) 192px, 224px"
                  className="object-cover"
                  priority
                  fallback={
                    <div className="w-full h-full bg-librarr-bg-lighter flex items-center justify-center text-librarr-text-muted">
                      <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                    </div>
                  }
                />
              </div>
            ) : (
              <div className="w-full aspect-square bg-librarr-bg-lighter rounded-lg flex items-center justify-center text-librarr-text-muted">
                <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
              </div>
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-start gap-3 mb-2">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">{album.title}</h1>
              {album.media && album.media.status > 1 && <StatusBadge status={album.media.status} />}
            </div>

            {album.artists?.length > 0 && (
              <p className="text-lg text-librarr-text-muted mb-4">
                {t('by')}{' '}
                {album.artists.map((artist: ArtistSummary, i: number) => (
                  <React.Fragment key={artist.id || i}>
                    {i > 0 && ', '}
                    {artist.id ? (
                      <Link
                        href={`/artist/${artist.id}`}
                        className="text-librarr-primary hover:underline"
                      >
                        {artist.name}
                      </Link>
                    ) : (
                      artist.name
                    )}
                  </React.Fragment>
                ))}
              </p>
            )}

            <div className="flex flex-wrap gap-4 text-sm text-librarr-text-muted mb-4">
              {album.releaseDate && <span>{t('released', { date: album.releaseDate })}</span>}
              {album.type && (
                <span className="capitalize">{album.type}</span>
              )}
              {album.trackCount && <span>{t('tracks', { count: album.trackCount })}</span>}
              {album.label && <span>{t('label', { name: album.label })}</span>}
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {album.musicBrainzId && (
                <a
                  href={`https://musicbrainz.org/release-group/${album.musicBrainzId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-librarr-bg-lighter hover:bg-librarr-bg-lighter/80 rounded text-xs text-librarr-text-muted hover:text-librarr-text transition-colors"
                >
                  MusicBrainz
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>
              )}
              {album.spotifyId && (
                <a
                  href={`https://open.spotify.com/album/${album.spotifyId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-librarr-bg-lighter hover:bg-librarr-bg-lighter/80 rounded text-xs text-librarr-text-muted hover:text-librarr-text transition-colors"
                >
                  Spotify
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>
              )}
            </div>

            {album.genres && album.genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {album.genres.map((genre: string) => (
                  <span
                    key={genre}
                    className="px-2 py-1 bg-librarr-bg-lighter rounded text-xs"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}

            <RequestButton
              mediaType="music"
              status={album.media?.status}
              existingRequest={album.media?.requests?.some(
                (r) => r.requestedBy?.id === user?.id &&
                  (r.status === RequestStatus.PENDING || r.status === RequestStatus.APPROVED)
              ) ?? false}
              externalId={album.musicBrainzId ?? ''}
              title={album.title}
              coverUrl={album.coverUrl}
              artistForeignId={album.artists?.[0]?.id}
              onSuccess={() => mutate()}
            />

            {/* Download progress for active requests */}
            {album.media?.requests
              ?.filter(
                (r) =>
                  r.status === RequestStatus.APPROVED && r.downloadStatus
              )
              .map((r) => (
                <div key={r.id} className="mt-3">
                  <DownloadProgress
                    progress={r.downloadProgress}
                    status={r.downloadStatus}
                    timeLeft={r.downloadTimeLeft}
                  />
                </div>
              ))}

            {album.media?.id && (
              <div className="mt-3">
                <ReportIssueButton musicAlbumId={album.media.id} />
              </div>
            )}
          </div>
        </div>

        {/* Track list */}
        {tracks.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-4">{t('trackList')}</h2>
            <div className="card overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-librarr-bg-lighter text-left text-sm text-librarr-text-muted">
                    <th className="px-4 py-3 w-12">#</th>
                    <th className="px-4 py-3">{t('title')}</th>
                    <th className="px-4 py-3 w-20 text-right">{t('duration')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tracks.map((track: TrackResult) => (
                    <tr
                      key={track.musicBrainzId || track.position}
                      className="border-b border-librarr-bg-lighter/50 hover:bg-librarr-bg-lighter/30"
                    >
                      <td className="px-4 py-3 text-sm text-librarr-text-muted">
                        {track.position}
                      </td>
                      <td className="px-4 py-3 text-sm">{track.title}</td>
                      <td className="px-4 py-3 text-sm text-librarr-text-muted text-right">
                        {track.duration ? formatDuration(track.duration) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
