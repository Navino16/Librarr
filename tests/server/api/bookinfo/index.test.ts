import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AxiosInstance } from 'axios';

vi.mock('axios');
vi.mock('@server/logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@server/lib/cache', () => ({
  default: { get: vi.fn(), set: vi.fn() },
}));

import axios from 'axios';
import BookInfoApi from '@server/api/bookinfo/index';
import cacheManager from '@server/lib/cache';
import logger from '@server/logger';

const mockedAxiosCreate = vi.mocked(axios.create);
const mockedCacheGet = vi.mocked(cacheManager.get);
const mockedCacheSet = vi.mocked(cacheManager.set);

let mockAxiosInstance: {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  interceptors: { response: { use: ReturnType<typeof vi.fn> } };
};

beforeEach(() => {
  vi.resetAllMocks();
  mockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: { response: { use: vi.fn() } },
  };
  mockedAxiosCreate.mockReturnValue(
    mockAxiosInstance as unknown as AxiosInstance
  );
});

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('BookInfoApi — constructor', () => {
  it('uses hardcover base URL and rateLimit', () => {
    new BookInfoApi();
    expect(mockedAxiosCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://api.hardcover.app/v1',
      })
    );
  });

  it('adds Bearer token when token provided', () => {
    new BookInfoApi('my-token');
    expect(mockedAxiosCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer my-token',
        }),
      })
    );
  });

  it('does not double-prefix Bearer', () => {
    new BookInfoApi('Bearer already-prefixed');
    expect(mockedAxiosCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer already-prefixed',
        }),
      })
    );
  });

  it('sends no authorization header when no token', () => {
    new BookInfoApi();
    const callArgs = mockedAxiosCreate.mock.calls[0][0];
    expect(callArgs?.headers).not.toHaveProperty('authorization');
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSearchResponse(hits: Array<Record<string, unknown>>, found = 1) {
  return {
    data: {
      data: {
        search: {
          results: {
            hits: hits.map((doc) => ({ document: doc })),
            found,
          },
        },
      },
    },
  };
}

function makeBookResponse(books: Array<Record<string, unknown>>) {
  return { data: { data: { books } } };
}

function makeAuthorResponse(authors: Array<Record<string, unknown>>) {
  return { data: { data: { authors } } };
}

function makeAuthorBooksResponse(
  authors: Array<Record<string, unknown>>
) {
  return { data: { data: { authors } } };
}

const minimalDoc = {
  id: 42,
  title: 'Test Book',
  slug: 'test-book',
  image: { url: 'https://img/cover.jpg' },
  author_names: ['Author One'],
  release_year: 2023,
  cached_tags: ['Fiction'],
  rating: 4.5,
  ratings_count: 100,
  pages: 300,
};

const minimalBook = {
  id: 42,
  title: 'Test Book',
  slug: 'test-book',
  description: 'A description',
  pages: 300,
  release_date: '2023-01-15',
  image: { url: 'https://img/cover.jpg' },
  contributions: [
    { author: { id: 1, name: 'Author One', slug: 'author-one' } },
  ],
  cached_tags: { Genre: [{ tag: 'Fiction' }, { tag: 'Fantasy' }] },
  editions: [
    {
      isbn_13: '9781234567890',
      isbn_10: '1234567890',
      asin: 'B001',
      edition_format: 'Hardcover',
      language: { language: 'English' },
    },
  ],
  rating: 4.5,
  ratings_count: 100,
};

// ---------------------------------------------------------------------------
// getTrending()
// ---------------------------------------------------------------------------

describe('BookInfoApi — getTrending()', () => {
  it('returns cached result when available', async () => {
    const cached = { results: [], totalResults: 0 };
    mockedCacheGet.mockReturnValue(cached);

    const api = new BookInfoApi();
    const result = await api.getTrending();

    expect(result).toBe(cached);
    expect(mockAxiosInstance.post).not.toHaveBeenCalled();
  });

  it('fetches via GraphQL, maps results, caches 600s', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.post.mockResolvedValue(
      makeSearchResponse([minimalDoc], 1)
    );

    const api = new BookInfoApi();
    const result = await api.getTrending(20, 1, 'en');

    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/graphql',
      expect.objectContaining({ query: expect.stringContaining('Trending') }),
      undefined
    );
    expect(result.results).toHaveLength(1);
    expect(result.results[0].title).toBe('Test Book');
    expect(result.totalResults).toBe(1);
    expect(mockedCacheSet).toHaveBeenCalledWith(
      expect.stringContaining('hc-trending'),
      result,
      600
    );
  });

  it('returns empty and logs on error', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.post.mockRejectedValue(new Error('Network fail'));

    const api = new BookInfoApi();
    const result = await api.getTrending();

    expect(result).toEqual({ results: [], totalResults: 0 });
    expect(vi.mocked(logger.error)).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// searchBooks()
// ---------------------------------------------------------------------------

describe('BookInfoApi — searchBooks()', () => {
  it('returns cached result when available', async () => {
    const cached = { results: [], totalResults: 0 };
    mockedCacheGet.mockReturnValue(cached);

    const api = new BookInfoApi();
    const result = await api.searchBooks('dune');

    expect(result).toBe(cached);
    expect(mockAxiosInstance.post).not.toHaveBeenCalled();
  });

  it('fetches via GraphQL with query and limit', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.post.mockResolvedValue(
      makeSearchResponse([minimalDoc], 5)
    );

    const api = new BookInfoApi();
    const result = await api.searchBooks('dune', 1, 10, 'en');

    expect(result.results).toHaveLength(1);
    expect(result.totalResults).toBe(5);
    expect(mockedCacheSet).toHaveBeenCalledWith(
      expect.stringContaining('hc-search:dune'),
      result,
      600
    );
  });

  it('returns empty and logs on error', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.post.mockRejectedValue(new Error('fail'));

    const api = new BookInfoApi();
    const result = await api.searchBooks('dune');

    expect(result).toEqual({ results: [], totalResults: 0 });
    expect(vi.mocked(logger.error)).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getWork()
// ---------------------------------------------------------------------------

describe('BookInfoApi — getWork()', () => {
  it('returns cached result when available', async () => {
    const cached = { goodreadsId: '42', title: 'Cached', authors: [] };
    mockedCacheGet.mockReturnValue(cached);

    const api = new BookInfoApi();
    const result = await api.getWork('42');

    expect(result).toBe(cached);
    expect(mockAxiosInstance.post).not.toHaveBeenCalled();
  });

  it('returns null when no book found', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.post.mockResolvedValue(makeBookResponse([]));

    const api = new BookInfoApi();
    const result = await api.getWork('42');

    expect(result).toBeNull();
  });

  it('maps book with edition priority (localizedDigital > digital > localized > fallback)', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    const book = {
      ...minimalBook,
      localizedDigitalEditions: [
        {
          title: 'Localized Digital Title',
          isbn_13: '9780000000001',
          image: { url: 'https://img/ld.jpg' },
          language: { language: 'French' },
        },
      ],
      digitalEditions: [
        { isbn_13: '9780000000002', language: { language: 'English' } },
      ],
      localizedEditions: [
        {
          title: 'Localized Title',
          isbn_13: '9780000000003',
          image: { url: 'https://img/loc.jpg' },
        },
      ],
    };
    mockAxiosInstance.post.mockResolvedValue(makeBookResponse([book]));

    const api = new BookInfoApi();
    const result = await api.getWork('42');

    expect(result!.isbn).toBe('9780000000001');
    expect(result!.title).toBe('Localized Digital Title');
    expect(result!.coverUrl).toBe('https://img/ld.jpg');
  });

  it('extracts genres from cached_tags.Genre', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.post.mockResolvedValue(makeBookResponse([minimalBook]));

    const api = new BookInfoApi();
    const result = await api.getWork('42');

    expect(result!.categories).toEqual(['Fiction', 'Fantasy']);
  });

  it('returns series when book_series present', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    const book = {
      ...minimalBook,
      book_series: [
        {
          position: 1,
          series: { id: 10, name: 'Dune Series', slug: 'dune', books_count: 6 },
        },
      ],
    };
    mockAxiosInstance.post.mockResolvedValue(makeBookResponse([book]));

    const api = new BookInfoApi();
    const result = await api.getWork('42');

    expect(result!.series).toEqual({
      id: '10',
      name: 'Dune Series',
      position: 1,
      booksCount: 6,
    });
  });

  it('returns hasEbookEdition and hasAudiobookEdition', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    const book = {
      ...minimalBook,
      ebookEditions: [{ edition_format: 'ebook' }],
      audiobookEditions: [{ edition_format: 'Audiobook' }],
    };
    mockAxiosInstance.post.mockResolvedValue(makeBookResponse([book]));

    const api = new BookInfoApi();
    const result = await api.getWork('42');

    expect(result!.hasEbookEdition).toBe(true);
    expect(result!.hasAudiobookEdition).toBe(true);
  });

  it('collects allEditionIdentifiers', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    const book = {
      ...minimalBook,
      allEditions: [
        { isbn_13: '9781111111111', isbn_10: '1111111111', asin: 'BAAA' },
        { isbn_13: '9782222222222' },
      ],
    };
    mockAxiosInstance.post.mockResolvedValue(makeBookResponse([book]));

    const api = new BookInfoApi();
    const result = await api.getWork('42');

    expect(result!.allEditionIdentifiers).toEqual(
      expect.arrayContaining([
        'isbn:9781111111111',
        'isbn:1111111111',
        'asin:BAAA',
        'isbn:9782222222222',
      ])
    );
  });

  it('caches result for 3600s', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.post.mockResolvedValue(makeBookResponse([minimalBook]));

    const api = new BookInfoApi();
    await api.getWork('42');

    expect(mockedCacheSet).toHaveBeenCalledWith(
      expect.stringContaining('hc-work:42'),
      expect.anything(),
      3600
    );
  });

  it('returns null and logs on error', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.post.mockRejectedValue(new Error('fail'));

    const api = new BookInfoApi();
    const result = await api.getWork('42');

    expect(result).toBeNull();
    expect(vi.mocked(logger.error)).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getAuthor()
// ---------------------------------------------------------------------------

describe('BookInfoApi — getAuthor()', () => {
  const minimalAuthor = {
    id: 5,
    name: 'Frank Herbert',
    bio: 'An author',
    slug: 'frank-herbert',
    image: { url: 'https://img/author.jpg' },
    contributions: [
      {
        book: {
          id: 1,
          title: 'Dune',
          slug: 'dune',
          pages: 400,
          release_date: '1965-08-01',
          image: { url: 'https://img/dune.jpg' },
          rating: 4.8,
          ratings_count: 5000,
          users_read_count: 10000,
          contributions: [{ author: { id: 5, name: 'Frank Herbert', slug: 'frank-herbert' } }],
        },
      },
    ],
  };

  it('returns cached result when available', async () => {
    const cached = { goodreadsId: '5', name: 'Cached', topBooks: [] };
    mockedCacheGet.mockReturnValue(cached);

    const api = new BookInfoApi();
    const result = await api.getAuthor('5');

    expect(result).toBe(cached);
    expect(mockAxiosInstance.post).not.toHaveBeenCalled();
  });

  it('returns null when no author found', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.post.mockResolvedValue(makeAuthorResponse([]));

    const api = new BookInfoApi();
    const result = await api.getAuthor('5');

    expect(result).toBeNull();
  });

  it('deduplicates topBooks by ID and normalized title', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    const author = {
      ...minimalAuthor,
      contributions: [
        {
          book: {
            id: 1, title: 'Dune', slug: 'dune', users_read_count: 10000,
            contributions: [{ author: { id: 5, name: 'Frank Herbert', slug: 'fh' } }],
          },
        },
        {
          book: {
            id: 1, title: 'Dune', slug: 'dune', users_read_count: 10000,
            contributions: [{ author: { id: 5, name: 'Frank Herbert', slug: 'fh' } }],
          },
        },
        {
          book: {
            id: 2, title: 'Dune: Special Edition', slug: 'dune-special', users_read_count: 5000,
            contributions: [{ author: { id: 5, name: 'Frank Herbert', slug: 'fh' } }],
          },
        },
        {
          book: {
            id: 3, title: 'Dune Messiah', slug: 'dune-messiah', users_read_count: 8000,
            contributions: [{ author: { id: 5, name: 'Frank Herbert', slug: 'fh' } }],
          },
        },
      ],
    };
    mockAxiosInstance.post.mockResolvedValue(makeAuthorResponse([author]));

    const api = new BookInfoApi();
    const result = await api.getAuthor('5');

    // id=1 Dune, id=2 "Dune: Special Edition" deduped (same base "dune"), id=3 "Dune Messiah" distinct
    expect(result!.topBooks).toHaveLength(2);
    expect(result!.topBooks![0].title).toBe('Dune');
    expect(result!.topBooks![1].title).toBe('Dune Messiah');
  });

  it('sorts by users_read_count desc', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    const author = {
      ...minimalAuthor,
      contributions: [
        {
          book: {
            id: 1, title: 'Book A', slug: 'a', users_read_count: 100,
            contributions: [{ author: { id: 5, name: 'Author', slug: 'a' } }],
          },
        },
        {
          book: {
            id: 2, title: 'Book B', slug: 'b', users_read_count: 500,
            contributions: [{ author: { id: 5, name: 'Author', slug: 'a' } }],
          },
        },
      ],
    };
    mockAxiosInstance.post.mockResolvedValue(makeAuthorResponse([author]));

    const api = new BookInfoApi();
    const result = await api.getAuthor('5');

    expect(result!.topBooks![0].title).toBe('Book B');
    expect(result!.topBooks![1].title).toBe('Book A');
  });

  it('caches result for 3600s', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.post.mockResolvedValue(
      makeAuthorResponse([minimalAuthor])
    );

    const api = new BookInfoApi();
    await api.getAuthor('5');

    expect(mockedCacheSet).toHaveBeenCalledWith('hc-author:5', expect.anything(), 3600);
  });

  it('returns null and logs on error', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.post.mockRejectedValue(new Error('fail'));

    const api = new BookInfoApi();
    const result = await api.getAuthor('5');

    expect(result).toBeNull();
    expect(vi.mocked(logger.error)).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getAuthorBooks()
// ---------------------------------------------------------------------------

describe('BookInfoApi — getAuthorBooks()', () => {
  it('returns cached result when available', async () => {
    const cached = { results: [], totalResults: 0 };
    mockedCacheGet.mockReturnValue(cached);

    const api = new BookInfoApi();
    const result = await api.getAuthorBooks('5');

    expect(result).toBe(cached);
  });

  it('returns empty when author not found', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.post.mockResolvedValue(makeAuthorBooksResponse([]));

    const api = new BookInfoApi();
    const result = await api.getAuthorBooks('5');

    expect(result).toEqual({ results: [], totalResults: 0 });
  });

  it('deduplicates by ID and normalized title, slices to limit', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    const authorData = {
      contributions_aggregate: { aggregate: { count: 10 } },
      contributions: [
        {
          book: {
            id: 1, title: 'Dune', slug: 'dune', users_read_count: 100,
            contributions: [{ author: { id: 5, name: 'A', slug: 'a' } }],
          },
        },
        {
          book: {
            id: 2, title: 'Dune: Extended', slug: 'dune-ext', users_read_count: 50,
            contributions: [{ author: { id: 5, name: 'A', slug: 'a' } }],
          },
        },
        {
          book: {
            id: 3, title: 'Messiah', slug: 'messiah', users_read_count: 80,
            contributions: [{ author: { id: 5, name: 'A', slug: 'a' } }],
          },
        },
      ],
    };
    mockAxiosInstance.post.mockResolvedValue(
      makeAuthorBooksResponse([authorData])
    );

    const api = new BookInfoApi();
    const result = await api.getAuthorBooks('5', 1, 2, 'en');

    // id=1 "Dune", id=2 "Dune: Extended" deduped, id=3 "Messiah" kept, limit=2
    expect(result.results).toHaveLength(2);
    expect(result.totalResults).toBe(10);
  });

  it('caches result for 600s', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.post.mockResolvedValue(
      makeAuthorBooksResponse([
        {
          contributions_aggregate: { aggregate: { count: 0 } },
          contributions: [],
        },
      ])
    );

    const api = new BookInfoApi();
    await api.getAuthorBooks('5', 1, 20, 'en');

    expect(mockedCacheSet).toHaveBeenCalledWith(
      expect.stringContaining('hc-author-books:5'),
      expect.anything(),
      600
    );
  });

  it('returns empty and logs on error', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.post.mockRejectedValue(new Error('fail'));

    const api = new BookInfoApi();
    const result = await api.getAuthorBooks('5');

    expect(result).toEqual({ results: [], totalResults: 0 });
    expect(vi.mocked(logger.error)).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getSeriesBooks()
// ---------------------------------------------------------------------------

describe('BookInfoApi — getSeriesBooks()', () => {
  const makeSeriesResponse = (
    series: Record<string, unknown> | null
  ) => ({
    data: { data: { series_by_pk: series } },
  });

  it('returns cached result when available', async () => {
    const cached = [{ title: 'Cached' }];
    mockedCacheGet.mockReturnValue(cached);

    const api = new BookInfoApi();
    const result = await api.getSeriesBooks('10');

    expect(result).toBe(cached);
  });

  it('returns [] when series_by_pk is null', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.post.mockResolvedValue(makeSeriesResponse(null));

    const api = new BookInfoApi();
    const result = await api.getSeriesBooks('10');

    expect(result).toEqual([]);
  });

  it('deduplicates by position, prefers locale > English > first', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    const series = {
      id: 10,
      name: 'Dune',
      slug: 'dune',
      books_count: 3,
      book_series: [
        {
          position: 1,
          book: {
            id: 1, title: 'Dune (French)', slug: 'dune-fr',
            editions: [{ language: { language: 'French' }, score: 10 }],
            contributions: [{ author: { id: 5, name: 'FH', slug: 'fh' } }],
          },
        },
        {
          position: 1,
          book: {
            id: 11, title: 'Dune (English)', slug: 'dune-en',
            editions: [{ language: { language: 'English' }, score: 10 }],
            contributions: [{ author: { id: 5, name: 'FH', slug: 'fh' } }],
          },
        },
        {
          position: 2,
          book: {
            id: 2, title: 'Dune Messiah', slug: 'dune-messiah',
            contributions: [{ author: { id: 5, name: 'FH', slug: 'fh' } }],
          },
        },
      ],
    };
    mockAxiosInstance.post.mockResolvedValue(makeSeriesResponse(series));

    const api = new BookInfoApi();
    // locale=fr → targetLang=French
    const result = await api.getSeriesBooks('10', 'fr');

    expect(result).toHaveLength(2);
    // position=1 should pick French edition
    expect(result[0].title).toBe('Dune (French)');
    expect(result[1].title).toBe('Dune Messiah');
  });

  it('caches result for 3600s', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    const series = {
      id: 10, name: 'S', slug: 's', books_count: 0, book_series: [],
    };
    mockAxiosInstance.post.mockResolvedValue(makeSeriesResponse(series));

    const api = new BookInfoApi();
    await api.getSeriesBooks('10');

    expect(mockedCacheSet).toHaveBeenCalledWith(
      expect.stringContaining('hc-series:10'),
      expect.anything(),
      3600
    );
  });

  it('returns [] and logs on error', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.post.mockRejectedValue(new Error('fail'));

    const api = new BookInfoApi();
    const result = await api.getSeriesBooks('10');

    expect(result).toEqual([]);
    expect(vi.mocked(logger.error)).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getEditionIdentifiers()
// ---------------------------------------------------------------------------

describe('BookInfoApi — getEditionIdentifiers()', () => {
  it('returns cached result when available', async () => {
    const cached = ['isbn:111'];
    mockedCacheGet.mockReturnValue(cached);

    const api = new BookInfoApi();
    const result = await api.getEditionIdentifiers('42');

    expect(result).toBe(cached);
  });

  it('returns identifiers via GraphQL', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.post.mockResolvedValue({
      data: {
        data: {
          books: [
            {
              editions: [
                { isbn_13: '9781111', isbn_10: '1111', asin: 'AAAA' },
              ],
            },
          ],
        },
      },
    });

    const api = new BookInfoApi();
    const result = await api.getEditionIdentifiers('42');

    expect(result).toEqual(
      expect.arrayContaining(['isbn:9781111', 'isbn:1111', 'asin:AAAA'])
    );
    expect(mockedCacheSet).toHaveBeenCalledWith(
      'hc-edition-ids:42',
      expect.anything(),
      86400
    );
  });

  it('returns undefined when no editions', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.post.mockResolvedValue({
      data: { data: { books: [{ editions: [] }] } },
    });

    const api = new BookInfoApi();
    const result = await api.getEditionIdentifiers('42');

    expect(result).toBeUndefined();
  });

  it('returns undefined and logs on error', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.post.mockRejectedValue(new Error('fail'));

    const api = new BookInfoApi();
    const result = await api.getEditionIdentifiers('42');

    expect(result).toBeUndefined();
    expect(vi.mocked(logger.error)).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getLocalizedData()
// ---------------------------------------------------------------------------

describe('BookInfoApi — getLocalizedData()', () => {
  it('returns empty map when locale is "en"', async () => {
    const api = new BookInfoApi();
    const result = await api.getLocalizedData(['1', '2'], 'en');

    expect(result.size).toBe(0);
    expect(mockAxiosInstance.post).not.toHaveBeenCalled();
  });

  it('returns empty map when locale is not mapped', async () => {
    const api = new BookInfoApi();
    const result = await api.getLocalizedData(['1'], 'xx');

    expect(result.size).toBe(0);
  });

  it('returns cached entries without API call', async () => {
    mockedCacheGet.mockReturnValue({ title: 'Titre FR', coverUrl: 'https://img/fr.jpg' });

    const api = new BookInfoApi();
    const result = await api.getLocalizedData(['1'], 'fr');

    expect(result.get('1')).toEqual({ title: 'Titre FR', coverUrl: 'https://img/fr.jpg' });
    expect(mockAxiosInstance.post).not.toHaveBeenCalled();
  });

  it('skips cached null entries (no localization)', async () => {
    mockedCacheGet.mockReturnValue(null);

    const api = new BookInfoApi();
    const result = await api.getLocalizedData(['1'], 'fr');

    expect(result.size).toBe(0);
    expect(mockAxiosInstance.post).not.toHaveBeenCalled();
  });

  it('fetches from GraphQL for cache-miss IDs', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.post.mockResolvedValue({
      data: {
        data: {
          books: [
            {
              id: 1,
              localizedEditions: [{ title: 'Le Titre', image: { url: 'https://img/fr.jpg' } }],
            },
          ],
        },
      },
    });

    const api = new BookInfoApi();
    const result = await api.getLocalizedData(['1'], 'fr');

    expect(result.get('1')).toEqual({ title: 'Le Titre', coverUrl: 'https://img/fr.jpg' });
    expect(mockedCacheSet).toHaveBeenCalledWith(
      'hc-l10n:1:fr',
      { title: 'Le Titre', coverUrl: 'https://img/fr.jpg' },
      86400
    );
  });

  it('caches null for IDs without localization', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.post.mockResolvedValue({
      data: {
        data: {
          books: [{ id: 1, localizedEditions: [] }],
        },
      },
    });

    const api = new BookInfoApi();
    const result = await api.getLocalizedData(['1'], 'fr');

    expect(result.size).toBe(0);
    expect(mockedCacheSet).toHaveBeenCalledWith('hc-l10n:1:fr', null, 86400);
  });

  it('caches null for IDs not returned by the API', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.post.mockResolvedValue({
      data: { data: { books: [] } },
    });

    const api = new BookInfoApi();
    await api.getLocalizedData(['1'], 'fr');

    expect(mockedCacheSet).toHaveBeenCalledWith('hc-l10n:1:fr', null, 86400);
  });

  it('returns partial result and logs on error', async () => {
    // First call: cache miss for id=1 and id=2
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.post.mockRejectedValue(new Error('fail'));

    const api = new BookInfoApi();
    const result = await api.getLocalizedData(['1', '2'], 'fr');

    // Should return empty map (no cache hits, API failed)
    expect(result.size).toBe(0);
    expect(vi.mocked(logger.error)).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// localizeResults()
// ---------------------------------------------------------------------------

describe('BookInfoApi — localizeResults()', () => {
  it('returns results unchanged when localizedMap is empty', async () => {
    const results = [
      { goodreadsId: '1', title: 'Original', authors: [] },
    ];

    const api = new BookInfoApi();
    // locale=en returns empty map
    const localized = await api.localizeResults(results, 'en');

    expect(localized).toEqual(results);
  });

  it('replaces title and coverUrl when localization available', async () => {
    // Mock cache to return localized data
    mockedCacheGet.mockImplementation((key: string) => {
      if (key === 'hc-l10n:1:fr') {
        return { title: 'Titre FR', coverUrl: 'https://img/fr.jpg' };
      }
      return undefined;
    });

    const results = [
      {
        goodreadsId: '1',
        title: 'Original Title',
        authors: [],
        coverUrl: 'https://img/en.jpg',
      },
    ];

    const api = new BookInfoApi();
    const localized = await api.localizeResults(results, 'fr');

    expect(localized[0].title).toBe('Titre FR');
    expect(localized[0].coverUrl).toBe('https://img/fr.jpg');
  });
});
