import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useTranslations } from 'next-intl';

/**
 * Detect whether a string looks like an ISBN-10 or ISBN-13.
 * Strips hyphens and spaces before checking.
 */
function isIsbn(value: string): boolean {
  const stripped = value.replace(/[-\s]/g, '');
  return /^\d{10}(\d{3})?$/.test(stripped);
}

export default function SearchInput() {
  const router = useRouter();
  const [query, setQuery] = useState(() => {
    const urlQuery = router.query.query;
    return typeof urlQuery === 'string' ? urlQuery : '';
  });
  const t = useTranslations('search');

  // Sync input when URL changes externally (e.g. back/forward navigation)
  const urlQuery = typeof router.query.query === 'string' ? router.query.query : undefined;
  useEffect(() => {
    if (urlQuery !== undefined) {
      setQuery(urlQuery);
    } else if (router.pathname !== '/search') {
      setQuery('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only sync on URL change
  }, [urlQuery]);

  const isbnDetected = useMemo(() => isIsbn(query.trim()), [query]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?query=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="relative">
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-librarr-text-muted"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={isbnDetected ? t('isbnDetected') : t('placeholder')}
        aria-label={t('placeholder')}
        className="input-field pl-10 pr-16"
      />
      {isbnDetected && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-librarr-primary/20 text-librarr-primary border border-librarr-primary/30">
          ISBN
        </span>
      )}
    </form>
  );
}
