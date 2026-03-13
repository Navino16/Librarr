import BookInfoApi from '../api/bookinfo';
import MusicBrainzApi from '../api/musicbrainz';
import { SearchResult, SearchResponse } from '../models/Search';
import { BookResult } from '../models/Book';
import { AlbumResult } from '../models/Music';
import Settings from './settings';
import logger from '../logger';
import { enrichWithMedia, type EnrichedMedia } from './enrichMedia';
import { isBookFullyAvailable, isMusicFullyAvailable } from './availability';

const musicBrainz = new MusicBrainzApi();

/**
 * Returns a BookInfoApi instance using the configured token.
 * Caches the instance and recreates only when token changes.
 */
let cachedBookInfo: BookInfoApi | null = null;
let cachedBookInfoToken: string | undefined;

function getBookInfo(): BookInfoApi {
  const token = Settings.getInstance().main.hardcoverToken || undefined;
  if (!cachedBookInfo || cachedBookInfoToken !== token) {
    cachedBookInfo = new BookInfoApi(token);
    cachedBookInfoToken = token;
  }
  return cachedBookInfo;
}

// ---------------------------------------------------------------------------
// Relevance scoring
// ---------------------------------------------------------------------------

function scoreTitle(title: string, query: string): number {
  const t = title.toLowerCase().trim();
  const q = query.toLowerCase().trim();

  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.includes(q)) return 60;

  const queryWords = q.split(/\s+/);
  const matched = queryWords.filter((w) => t.includes(w)).length;
  return Math.round((matched / queryWords.length) * 40);
}

function scoreBook(book: BookResult, query: string): number {
  let score = scoreTitle(book.title, query);

  const q = query.toLowerCase();
  if (
    book.authors.length > 0 &&
    book.authors.some(
      (a) => q.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(q)
    )
  ) {
    score += 15;
  }

  if (book.coverUrl) score += 5;
  if (book.averageRating && book.averageRating >= 3.5) score += 5;
  if (book.ratingsCount && book.ratingsCount > 0) {
    score += Math.min(10, Math.round(Math.log10(book.ratingsCount) * 3));
  }

  return score;
}

function scoreAlbum(album: AlbumResult, query: string): number {
  let score = scoreTitle(album.title, query);

  const q = query.toLowerCase();
  if (
    album.artists.length > 0 &&
    album.artists.some(
      (a) => q.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(q)
    )
  ) {
    score += 15;
  }

  if (album.coverUrl) score += 3;
  if (album.popularity) score += Math.min(10, Math.round(album.popularity / 10));

  return score;
}

function scoreResult(result: SearchResult, query: string): number {
  if (result.type === 'book' && result.book) return scoreBook(result.book, query);
  if (result.type === 'music' && result.album) return scoreAlbum(result.album, query);
  return 0;
}

// ---------------------------------------------------------------------------
// Unified search
// ---------------------------------------------------------------------------

export async function unifiedSearch(
  query: string,
  page = 1,
  type?: 'book' | 'music' | 'all',
  locale?: string
): Promise<SearchResponse> {
  const searchType = type || 'all';
  const limit = 20;
  const results: SearchResult[] = [];
  let totalResults = 0;

  try {
    const mainSettings = Settings.getInstance().main;
    const bookEnabled = (mainSettings.enableEbookRequests || mainSettings.enableAudiobookRequests) && !!mainSettings.hardcoverToken;
    const musicEnabled = mainSettings.enableMusicRequests;

    if ((searchType === 'all' || searchType === 'book') && bookEnabled) {
      const perSource = searchType === 'all' ? 10 : limit;
      const bookResults = await getBookInfo().searchBooks(query, page, perSource, locale);

      for (const book of bookResults.results) {
        results.push({ type: 'book', book });
      }
      totalResults += bookResults.totalResults;
    }

    if ((searchType === 'all' || searchType === 'music') && musicEnabled) {
      const musicResults = await musicBrainz.searchAlbums(
        query,
        page,
        searchType === 'all' ? 10 : limit
      );
      for (const album of musicResults.results) {
        results.push({ type: 'music', album });
      }
      totalResults += musicResults.totalResults;
    }
  } catch (e) {
    logger.error('Unified search error', { error: e, query, type });
  }

  // Sort all results by relevance to the query
  results.sort((a, b) => scoreResult(b, query) - scoreResult(a, query));

  // Enrich with local media data (status + active requests)
  const books = results.filter((r) => r.type === 'book' && r.book).map((r) => r.book!);
  const albums = results.filter((r) => r.type === 'music' && r.album).map((r) => r.album!);

  const [enrichedBooks, enrichedAlbums] = await Promise.all([
    books.length > 0 ? enrichWithMedia(books, 'book') : Promise.resolve(books),
    albums.length > 0 ? enrichWithMedia(albums, 'music') : Promise.resolve(albums),
  ]);

  const bookMap = new Map(enrichedBooks.map((b) => [b.goodreadsId, b]));
  const albumMap = new Map(enrichedAlbums.map((a) => [a.musicBrainzId, a]));

  const enrichedResults = results.map((r) => {
    if (r.type === 'book' && r.book) {
      return { ...r, book: bookMap.get(r.book.goodreadsId) ?? r.book };
    }
    if (r.type === 'music' && r.album) {
      return { ...r, album: albumMap.get(r.album.musicBrainzId) ?? r.album };
    }
    return r;
  });

  const mainSettings = Settings.getInstance().main;
  const finalResults = mainSettings.hideAvailable
    ? enrichedResults.filter((r) => {
        const item = r.type === 'book' ? r.book : r.album;
        const media = item && 'media' in item ? (item as { media?: EnrichedMedia }).media : undefined;
        if (!media) return true;
        if (r.type === 'book') {
          return !isBookFullyAvailable(media, mainSettings.enableEbookRequests, mainSettings.enableAudiobookRequests);
        }
        return !isMusicFullyAvailable(media);
      })
    : enrichedResults;

  const totalPages = Math.ceil(totalResults / limit);

  return {
    page,
    totalPages,
    totalResults,
    results: finalResults,
  };
}

export { getBookInfo, musicBrainz };
