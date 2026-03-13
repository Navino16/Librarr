import React, { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import CoverImage from '../../components/Common/CoverImage';
import { useSettings } from '../../context/SettingsContext';
import MediaCard from '../../components/MediaCard';
import { fetcher } from '../../hooks/useApi';
import { useAuthorBooks } from '../../hooks/useDiscover';
import type { AuthorResult } from '../../types/api';
import { sourceName } from '../../utils/sourceName';

export default function AuthorDetailPage() {
  const router = useRouter();
  const { authorId } = router.query;
  const { settings } = useSettings();
  const t = useTranslations('author');

  const { data: author, isLoading } = useSWR<AuthorResult & { error?: string }>(
    authorId ? `/api/v1/author/${authorId}` : null,
    fetcher
  );

  const books = useAuthorBooks(authorId as string | undefined);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const { loadMore, isReachingEnd } = books;
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [loadMore, isReachingEnd]);

  if (isLoading || !author) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-librarr-primary" />
      </div>
    );
  }

  if (author.error) {
    return (
      <div className="card p-8 text-center text-librarr-text-muted">
        <p>{t('notFound')}</p>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{author.name} - {settings?.appTitle || 'Librarr'}</title>
      </Head>
      <div>
        <div className="flex flex-col md:flex-row gap-8 mb-8">
          <div className="flex-shrink-0 w-40 md:w-48">
            {author.photoUrl ? (
              <div className="relative w-full aspect-[3/4] rounded-lg shadow-xl overflow-hidden">
                <CoverImage
                  src={author.photoUrl}
                  alt={author.name}
                  sizes="(max-width: 768px) 160px, 192px"
                  className="object-cover"
                  priority
                  fallback={
                    <div className="w-full h-full bg-librarr-bg-lighter flex items-center justify-center text-librarr-text-muted">
                      <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                    </div>
                  }
                />
              </div>
            ) : (
              <div className="w-full aspect-square bg-librarr-bg-lighter rounded-lg flex items-center justify-center text-librarr-text-muted">
                <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
              </div>
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-2">{author.name}</h1>
            {author.sourceUrl && (
              <div className="flex flex-wrap gap-2 mb-3">
                <a
                  href={author.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-librarr-bg-lighter hover:bg-librarr-bg-lighter/80 rounded text-xs text-librarr-text-muted hover:text-librarr-text transition-colors"
                >
                  {sourceName(author.sourceUrl)}
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>
              </div>
            )}
            <div className="flex flex-wrap gap-4 text-sm text-librarr-text-muted mb-4">
              {author.birthDate && <span>{t('born', { date: author.birthDate })}</span>}
              {author.deathDate && <span>{t('died', { date: author.deathDate })}</span>}
            </div>
            {author.bio && (
              <p className="text-librarr-text-muted leading-relaxed max-w-5xl">
                {author.bio.length > 500
                  ? `${author.bio.substring(0, 500)}...`
                  : author.bio}
              </p>
            )}
          </div>
        </div>

        {books.items.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold mb-4">{t('books')}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-4">
              {books.items.map((book) => (
                <MediaCard
                  key={book.goodreadsId}
                  id={book.goodreadsId ?? ''}
                  type="book"
                  title={book.title}
                  subtitle={book.publishedDate}
                  coverUrl={book.coverUrl}
                  status={book.media?.status}
                  requests={book.media?.requests}
                  ebookAvailable={book.media?.ebookAvailable}
                  audiobookAvailable={book.media?.audiobookAvailable}
                />
              ))}
            </div>
            {!books.isReachingEnd && (
              <div ref={sentinelRef} className="flex justify-center py-8">
                {books.isLoadingMore && (
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-librarr-primary" />
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </>
  );
}
