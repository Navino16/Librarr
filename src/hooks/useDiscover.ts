import useSWRInfinite from 'swr/infinite';
import { fetcher } from './useApi';
import type { BookResult, AlbumResult, PaginatedResponse } from '../types/api';

const PAGE_SIZE = 20;

interface InfiniteResult<T> {
  items: T[];
  isLoadingMore: boolean;
  isReachingEnd: boolean;
  loadMore: () => void;
}

function useInfiniteList<T>(
  getKey: (pageIndex: number, previousPageData: PaginatedResponse<T> | null) => string | null
): InfiniteResult<T> {
  const { data, size, setSize, isValidating } =
    useSWRInfinite<PaginatedResponse<T>>(getKey, fetcher, {
      revalidateFirstPage: false,
    });

  const items = data ? data.flatMap((page) => page.results) : [];
  const isLoadingMore =
    size > 0 && data !== undefined && typeof data[size - 1] === 'undefined';
  const isEmpty = data?.[0]?.results.length === 0;
  const isReachingEnd =
    isEmpty ||
    (data !== undefined && data[data.length - 1]?.results.length < PAGE_SIZE);

  return {
    items,
    isLoadingMore: isLoadingMore || isValidating,
    isReachingEnd: !!isReachingEnd,
    loadMore: () => {
      if (!isReachingEnd && !isLoadingMore) setSize(size + 1);
    },
  };
}

export function useTrendingBooks(enabled: boolean): InfiniteResult<BookResult> {
  return useInfiniteList<BookResult>((pageIndex, previousPageData) => {
    if (!enabled) return null;
    if (previousPageData && previousPageData.results.length < PAGE_SIZE) return null;
    return `/api/v1/discover/books?page=${pageIndex + 1}`;
  });
}

export function useAuthorBooks(authorId: string | undefined): InfiniteResult<BookResult> {
  return useInfiniteList<BookResult>((pageIndex, previousPageData) => {
    if (!authorId) return null;
    if (previousPageData && previousPageData.results.length < PAGE_SIZE) return null;
    return `/api/v1/author/${authorId}/books?page=${pageIndex + 1}`;
  });
}

export function useTrendingMusic(enabled: boolean): InfiniteResult<AlbumResult> {
  return useInfiniteList<AlbumResult>((pageIndex, previousPageData) => {
    if (!enabled) return null;
    if (previousPageData && previousPageData.results.length < PAGE_SIZE) return null;
    return `/api/v1/discover/music?page=${pageIndex + 1}`;
  });
}
