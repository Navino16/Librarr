import React from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import CoverImage from '../../components/Common/CoverImage';
import { useSettings } from '../../context/SettingsContext';
import MediaCard from '../../components/MediaCard';
import { fetcher } from '../../hooks/useApi';
import type { ArtistResult, AlbumResult } from '../../types/api';

export default function ArtistDetailPage() {
  const router = useRouter();
  const { artistId } = router.query;
  const { settings } = useSettings();
  const t = useTranslations('artist');

  const { data: artist, isLoading } = useSWR<ArtistResult & { error?: string }>(
    artistId ? `/api/v1/artist/${artistId}` : null,
    fetcher
  );

  const { data: albumsData } = useSWR<{ results: AlbumResult[] }>(
    artistId ? `/api/v1/artist/${artistId}/albums` : null,
    fetcher
  );

  if (isLoading || !artist) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-librarr-primary" />
      </div>
    );
  }

  if (artist.error) {
    return (
      <div className="card p-8 text-center text-librarr-text-muted">
        <p>{t('notFound')}</p>
      </div>
    );
  }

  const albums = albumsData?.results || [];

  return (
    <>
      <Head>
        <title>{artist.name} - {settings?.appTitle || 'Librarr'}</title>
      </Head>
      <div>
        <div className="flex flex-col md:flex-row gap-8 mb-8">
          <div className="flex-shrink-0 w-40 md:w-48">
            {artist.photoUrl ? (
              <div className="relative w-full aspect-square rounded-full shadow-xl overflow-hidden">
                <CoverImage
                  src={artist.photoUrl}
                  alt={artist.name}
                  sizes="(max-width: 768px) 160px, 192px"
                  className="object-cover"
                  fallback={
                    <div className="w-full h-full bg-librarr-bg-lighter flex items-center justify-center text-5xl">
                      🎤
                    </div>
                  }
                />
              </div>
            ) : (
              <div className="w-full aspect-square bg-librarr-bg-lighter rounded-full flex items-center justify-center text-5xl">
                🎤
              </div>
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-2">{artist.name}</h1>
            <div className="flex flex-wrap gap-4 text-sm text-librarr-text-muted mb-4">
              {artist.type && <span>{artist.type}</span>}
              {artist.country && <span>{artist.country}</span>}
              {artist.beginDate && <span>{t('activeSince', { date: artist.beginDate })}</span>}
            </div>
            {artist.genres && artist.genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {artist.genres.map((genre: string) => (
                  <span
                    key={genre}
                    className="px-2 py-1 bg-librarr-bg-lighter rounded text-xs"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}
            {artist.bio && (
              <p className="text-librarr-text-muted leading-relaxed max-w-5xl">
                {artist.bio}
              </p>
            )}
          </div>
        </div>

        {albums.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold mb-4">{t('discography')}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-4">
              {albums.map((album) => (
                <MediaCard
                  key={album.musicBrainzId}
                  id={album.musicBrainzId ?? ''}
                  type="music"
                  title={album.title}
                  subtitle={album.releaseDate}
                  coverUrl={album.coverUrl}
                  status={album.media?.status}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
