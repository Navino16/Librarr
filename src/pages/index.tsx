import React from 'react';
import Head from 'next/head';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import { useSettings } from '../context/SettingsContext';
import { useUser } from '../context/UserContext';
import { fetcher } from '../hooks/useApi';
import { useTrendingBooks, useTrendingMusic } from '../hooks/useDiscover';
import MediaSlider from '../components/MediaSlider';
import MediaCard from '../components/MediaCard';
import {
  WorkStatus,
} from '../types/api';
import type {
  RecentRequestItem,
} from '../types/api';

export default function HomePage() {
  const { settings } = useSettings();
  const { user } = useUser();
  const t = useTranslations('home');

  const booksEnabled = !!settings?.bookEnabled && (settings.enableEbookRequests !== false || settings.enableAudiobookRequests !== false);
  const musicEnabled = settings?.enableMusicRequests !== false;
  const hideAvailable = settings?.hideAvailable ?? false;
  const books = useTrendingBooks(booksEnabled);
  const music = useTrendingMusic(musicEnabled);
  const { data: recentData } = useSWR<{ results: RecentRequestItem[] }>(
    '/api/v1/discover/recent',
    fetcher
  );

  // Deduplicate requests by work ID so each book appears only once
  const dedupeByWork = (items: RecentRequestItem[]) => {
    const seen = new Set<number>();
    return items.filter((r) => {
      if (!r.work?.id) return true;
      if (seen.has(r.work.id)) return false;
      seen.add(r.work.id);
      return true;
    });
  };

  // A book is "fully available" when all enabled formats have availability
  const ebookEnabled = settings?.enableEbookRequests !== false;
  const audiobookEnabled = settings?.enableAudiobookRequests !== false;

  const isFullyAvailable = (item: RecentRequestItem) => {
    if (!item.work) return false;
    if (item.work.status === WorkStatus.AVAILABLE) {
      if (ebookEnabled && !item.work.ebookAvailable) return false;
      if (audiobookEnabled && !item.work.audiobookAvailable) return false;
      return true;
    }
    return false;
  };

  const recentlyAdded = recentData?.results
    ? dedupeByWork(recentData.results.filter(
        (r) => (r.work?.status === WorkStatus.AVAILABLE || r.work?.status === WorkStatus.PARTIALLY_AVAILABLE) && (!hideAvailable || !isFullyAvailable(r))
      ))
    : undefined;
  const recentRequests = recentData?.results
    ? dedupeByWork(
        hideAvailable
          ? recentData.results.filter((r) => !isFullyAvailable(r))
          : recentData.results
      )
    : undefined;

  return (
    <>
      <Head>
        <title>{settings?.appTitle || 'Librarr'}</title>
      </Head>
      <div>
        <div className="mb-8">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-2">
            {t('welcomeBack', { username: user?.username ?? '' })}
          </h1>
          <p className="text-librarr-text-muted">
            {t('discoverDescription')}
          </p>
        </div>

        <div className="space-y-8">
          {/* Skeleton loading */}
          {!recentData && books.items.length === 0 && music.items.length === 0 && (
            <>
              {[1, 2].map((section) => (
                <div key={section} className="mb-8">
                  <div className="h-6 w-48 bg-librarr-bg-lighter rounded animate-pulse mb-4" />
                  <div className="flex gap-4 overflow-hidden">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="shrink-0 w-36 sm:w-40">
                        <div className="aspect-[2/3] bg-librarr-bg-lighter rounded-lg animate-pulse mb-2" />
                        <div className="h-4 bg-librarr-bg-lighter rounded animate-pulse mb-1 w-3/4" />
                        <div className="h-3 bg-librarr-bg-lighter rounded animate-pulse w-1/2" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Empty state when no sliders have content */}
          {recentData &&
           (!recentRequests || recentRequests.length === 0) &&
           (!recentlyAdded || recentlyAdded.length === 0) &&
           books.items.length === 0 &&
           music.items.length === 0 && (
            <div className="card p-8 text-center text-librarr-text-muted">
              <p>{t('noMedia')}</p>
            </div>
          )}

          {recentRequests && recentRequests.length > 0 && (
            <MediaSlider title={t('recentRequests')}>
              {recentRequests.map((item) => (
                <MediaCard
                  key={item.request.id}
                  id={String(item.work.id)}
                  type="book"
                  title={item.work.title}
                  coverUrl={item.work.coverUrl}
                  status={item.work.status}
                  requests={item.requests ?? [{
                    format: item.request.format,
                    status: item.request.status,
                  }]}
                  ebookAvailable={item.work.ebookAvailable}
                  audiobookAvailable={item.work.audiobookAvailable}
                />
              ))}
            </MediaSlider>
          )}

          {recentlyAdded && recentlyAdded.length > 0 && (
            <MediaSlider title={t('recentlyAdded')}>
              {recentlyAdded.map((item) => (
                <MediaCard
                  key={item.request.id}
                  id={String(item.work.id)}
                  type="book"
                  title={item.work.title}
                  coverUrl={item.work.coverUrl}
                  status={item.work.status}
                  requests={item.requests ?? [{
                    format: item.request.format,
                    status: item.request.status,
                  }]}
                  ebookAvailable={item.work.ebookAvailable}
                  audiobookAvailable={item.work.audiobookAvailable}
                />
              ))}
            </MediaSlider>
          )}

          {books.items.length > 0 && (
            <MediaSlider
              title={t('trendingBooks')}
              hasMore={!books.isReachingEnd}
              isLoading={books.isLoadingMore}
              onLoadMore={books.loadMore}
            >
              {books.items.map((book) => (
                <MediaCard
                  key={book.goodreadsId ?? book.isbn ?? book.title}
                  id={book.goodreadsId ?? ''}
                  type="book"
                  title={book.title}
                  subtitle={book.authors[0]?.name}
                  coverUrl={book.coverUrl}
                  status={book.media?.status}
                  requests={book.media?.requests}
                  ebookAvailable={book.media?.ebookAvailable}
                  audiobookAvailable={book.media?.audiobookAvailable}
                />
              ))}
            </MediaSlider>
          )}

          {music.items.length > 0 && (
            <MediaSlider
              title={t('trendingMusic')}
              hasMore={!music.isReachingEnd}
              isLoading={music.isLoadingMore}
              onLoadMore={music.loadMore}
            >
              {music.items.map((album) => (
                <MediaCard
                  key={album.musicBrainzId ?? album.spotifyId ?? album.title}
                  id={album.musicBrainzId ?? ''}
                  type="music"
                  title={album.title}
                  subtitle={album.artists[0]?.name}
                  coverUrl={album.coverUrl}
                  status={album.media?.status}
                />
              ))}
            </MediaSlider>
          )}
        </div>
      </div>
    </>
  );
}
