import React, { useRef, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';

interface MediaSliderProps {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  hasMore?: boolean;
  isLoading?: boolean;
  onLoadMore?: () => void;
}

export default function MediaSlider({
  title,
  children,
  action,
  hasMore,
  isLoading,
  onLoadMore,
}: MediaSliderProps) {
  const tc = useTranslations('common');
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.75;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  };

  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0]?.isIntersecting && onLoadMore) {
        onLoadMore();
      }
    },
    [onLoadMore]
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || !hasMore || !onLoadMore) return;

    // Preload one "click" ahead: rootMargin matches the scroll amount
    // so the fetch fires before the user actually runs out of items.
    const margin = Math.round(root.clientWidth * 0.75);
    const observer = new IntersectionObserver(handleIntersect, {
      root,
      rootMargin: `0px ${margin}px 0px 0px`,
    });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore, handleIntersect]);

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">{title}</h2>
        <div className="flex items-center gap-2">
          {action}
          <div className="flex gap-1">
            <button
              onClick={() => scroll('left')}
              aria-label={tc('scrollLeft')}
              className="p-1.5 rounded-lg bg-librarr-bg-light hover:bg-librarr-bg-lighter transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => scroll('right')}
              aria-label={tc('scrollRight')}
              className="p-1.5 rounded-lg bg-librarr-bg-light hover:bg-librarr-bg-lighter transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scrollbar-hide pt-1 pb-2 px-1 -mt-1 -mx-1 *:shrink-0 *:w-36 sm:*:w-40"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {children}
        {hasMore && onLoadMore && (
          <div
            ref={sentinelRef}
            className="flex items-center justify-center shrink-0 w-16"
          >
            {isLoading && (
              <div role="status" aria-label={tc('loading')}>
                <svg
                  className="w-6 h-6 animate-spin text-librarr-text-muted"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
