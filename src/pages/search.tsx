import React from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import { useSettings } from '../context/SettingsContext';
import { fetcher } from '../hooks/useApi';
import MediaCard from '../components/MediaCard';
import LoadingSpinner from '../components/Common/LoadingSpinner';
import type { SearchResponse } from '../types/api';
import { allTabs } from '../constants/search';

type TabType = 'all' | 'book' | 'music';

export default function SearchPage() {
  const router = useRouter();
  const { settings } = useSettings();
  const { query, type } = router.query;
  const bookEnabled = (settings?.bookEnabled ?? true) && (settings?.enableEbookRequests !== false || settings?.enableAudiobookRequests !== false);
  const musicEnabled = settings?.enableMusicRequests !== false;
  const tabs = allTabs.filter((tab) => {
    if (tab.key === 'book' && !bookEnabled) return false;
    if (tab.key === 'music' && !musicEnabled) return false;
    return true;
  });
  const t = useTranslations('search');

  // Derive active tab directly from URL — no state needed
  const rawTab = typeof type === 'string' ? type as TabType : 'all';
  const activeTab: TabType =
    (!bookEnabled && rawTab === 'book') || (!musicEnabled && rawTab === 'music')
      ? 'all'
      : rawTab;

  const setActiveTab = (tab: TabType) => {
    router.push(
      { pathname: '/search', query: { ...(query ? { query: query as string } : {}), type: tab } }
    );
  };

  const searchUrl = query
    ? `/api/v1/search?query=${encodeURIComponent(query as string)}&type=${activeTab}`
    : null;

  const { data, isLoading } = useSWR<SearchResponse>(searchUrl, fetcher);

  return (
    <>
      <Head>
        <title>{t('title')} - {settings?.appTitle || 'Librarr'}</title>
      </Head>
      <div>
        <h1 className="text-2xl font-bold mb-6">
          {query ? t('resultsFor', { query: query as string }) : t('title')}
        </h1>

        {/* Tab filter */}
        <div className="flex gap-1 mb-6 bg-librarr-bg-light rounded-lg p-1 w-fit">
          {tabs.map(({ key, labelKey }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              aria-current={activeTab === key ? 'true' : undefined}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === key
                  ? 'bg-librarr-primary text-white'
                  : 'text-librarr-text-muted hover:text-librarr-text'
              }`}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>

        {!query ? (
          <div className="card p-8 text-center text-librarr-text-muted">
            <p>{t('typeToSearch')}</p>
          </div>
        ) : isLoading ? (
          <LoadingSpinner />
        ) : data?.results?.length ? (
          <>
            <p className="text-sm text-librarr-text-muted mb-4">
              {t('resultsFound', { count: data.totalResults })}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4">
              {data.results.map((result, index) => {
                if (result.type === 'book' && result.book) {
                  // Search API returns `work` for local data (not `media`)
                  const book = result.book;
                  return (
                    <MediaCard
                      key={`book-${book.hardcoverId || index}`}
                      id={book.work?.id ? String(book.work.id) : (book.hardcoverId ?? '')}
                      type="book"
                      title={book.title}
                      subtitle={book.authors?.[0]?.name}
                      coverUrl={book.coverUrl}
                      status={book.work?.status}
                      requests={book.work?.requests}
                      ebookAvailable={book.work?.ebookAvailable}
                      audiobookAvailable={book.work?.audiobookAvailable}
                    />
                  );
                }
                if (result.type === 'music' && result.album) {
                  return (
                    <MediaCard
                      key={`music-${result.album.musicBrainzId || index}`}
                      id={result.album.musicBrainzId ?? ''}
                      type="music"
                      title={result.album.title}
                      subtitle={result.album.artists?.[0]?.name}
                      coverUrl={result.album.coverUrl}
                      status={result.album.media?.status}
                    />
                  );
                }
                return null;
              })}
            </div>
          </>
        ) : (
          <div className="card p-8 text-center text-librarr-text-muted">
            <p>{t('noResults', { query: query as string })}</p>
          </div>
        )}
      </div>
    </>
  );
}
