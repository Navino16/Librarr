import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AxiosInstance } from 'axios';

vi.mock('axios');
vi.mock('@server/logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import axios from 'axios';
import { OpenLibraryProvider } from '@server/api/metadata/OpenLibraryProvider';
import logger from '@server/logger';
import ExternalApi from '@server/api/externalapi';

const mockedAxiosCreate = vi.mocked(axios.create);

let mockAxiosInstance: {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  interceptors: { response: { use: ReturnType<typeof vi.fn> } };
};

function createProvider(): OpenLibraryProvider {
  return new OpenLibraryProvider();
}

beforeEach(() => {
  vi.resetAllMocks();

  // Clear rate limit state so tests don't interfere with each other
  (ExternalApi as never as { lastRequestTimeByHost: Map<string, number> })
    .lastRequestTimeByHost?.clear?.();

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

describe('OpenLibraryProvider — constructor', () => {
  it('has source "openlibrary" and uses correct base URL', () => {
    const provider = createProvider();
    expect(provider.source).toBe('openlibrary');
    expect(mockedAxiosCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://openlibrary.org',
      })
    );
  });
});

// ---------------------------------------------------------------------------
// searchByText
// ---------------------------------------------------------------------------

describe('OpenLibraryProvider — searchByText()', () => {
  it('calls /search.json with { q, limit: 20 }', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: {
        docs: [
          {
            key: '/works/OL123W',
            title: 'Test',
            author_name: ['Author'],
            cover_i: 456,
            subject: ['Fiction'],
          },
        ],
        numFound: 1,
      },
    });

    const provider = createProvider();
    await provider.searchByText('test query');

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/search.json',
      expect.objectContaining({
        params: { q: 'test query', limit: 20 },
      })
    );
  });

  it('includes language param when locale provided', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: { docs: [{ key: '/works/OL1W', title: 'Test' }], numFound: 1 },
    });

    const provider = createProvider();
    await provider.searchByText('test', 'fr');

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/search.json',
      expect.objectContaining({
        params: { q: 'test', limit: 20, language: 'fr' },
      })
    );
  });

  it('maps OLSearchDoc[] to WorkMetadata[]', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: {
        docs: [
          {
            key: '/works/OL45804W',
            title: 'Dune',
            author_name: ['Frank Herbert'],
            first_publish_year: 1965,
            cover_i: 8228691,
            number_of_pages_median: 412,
            subject: ['Science fiction', 'Ecology', 'Politics', 'Religion',
              'a', 'b', 'c', 'd', 'e', 'f', 'g'],
          },
        ],
        numFound: 1,
      },
    });

    const provider = createProvider();
    const results = await provider.searchByText('dune');

    expect(results).toHaveLength(1);
    const work = results![0];
    expect(work.openLibraryWorkId).toBe('OL45804W');
    expect(work.title).toBe('Dune');
    expect(work.authors).toEqual([{ name: 'Frank Herbert' }]);
    expect(work.publishedDate).toBe('1965');
    expect(work.coverUrl).toBe(
      'https://covers.openlibrary.org/b/id/8228691-L.jpg'
    );
    expect(work.pageCount).toBe(412);
    expect(work.genres).toHaveLength(10); // sliced to 10
    expect(work.source).toBe('openlibrary');
  });

  it('returns null when docs is empty', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: { docs: [], numFound: 0 },
    });

    const provider = createProvider();
    const result = await provider.searchByText('nothing');

    expect(result).toBeNull();
  });

  it('returns null when docs is undefined', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: { numFound: 0 },
    });

    const provider = createProvider();
    const result = await provider.searchByText('nothing');

    expect(result).toBeNull();
  });

  it('returns null and logs when throw', async () => {
    mockAxiosInstance.get.mockRejectedValue(new Error('network'));

    const provider = createProvider();
    const result = await provider.searchByText('fail');

    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      'OpenLibraryProvider.searchByText failed',
      expect.objectContaining({ query: 'fail' })
    );
  });
});

// ---------------------------------------------------------------------------
// searchByIsbn
// ---------------------------------------------------------------------------

describe('OpenLibraryProvider — searchByIsbn()', () => {
  it('fetches edition by ISBN then work, returns enriched metadata', async () => {
    // First call: /isbn/<isbn>.json
    mockAxiosInstance.get.mockResolvedValueOnce({
      data: {
        key: '/books/OL1234M',
        title: 'Edition Title',
        works: [{ key: '/works/OL999W' }],
        covers: [111],
      },
    });
    // Second call: /works/OL999W.json
    mockAxiosInstance.get.mockResolvedValueOnce({
      data: {
        key: '/works/OL999W',
        title: 'Work Title',
        description: 'A great book',
        covers: [222],
        subjects: ['Fiction'],
      },
    });

    const provider = createProvider();
    const results = await provider.searchByIsbn('9780000000001');

    expect(results).toHaveLength(1);
    expect(results![0].title).toBe('Work Title');
    expect(results![0].description).toBe('A great book');
    expect(results![0].coverUrl).toBe(
      'https://covers.openlibrary.org/b/id/222-L.jpg'
    );
  });

  it('enriches coverUrl from edition when work has no covers', async () => {
    mockAxiosInstance.get.mockResolvedValueOnce({
      data: {
        key: '/books/OL1234M',
        works: [{ key: '/works/OL999W' }],
        covers: [111],
      },
    });
    mockAxiosInstance.get.mockResolvedValueOnce({
      data: {
        key: '/works/OL999W',
        title: 'Work Title',
        // no covers
      },
    });

    const provider = createProvider();
    const results = await provider.searchByIsbn('9780000000001');

    expect(results![0].coverUrl).toBe(
      'https://covers.openlibrary.org/b/id/111-L.jpg'
    );
  });

  it('returns minimal metadata when no work key', async () => {
    mockAxiosInstance.get.mockResolvedValueOnce({
      data: {
        key: '/books/OL1234M',
        title: 'Standalone Edition',
        // no works[]
      },
    });

    const provider = createProvider();
    const results = await provider.searchByIsbn('9780000000001');

    expect(results).toHaveLength(1);
    expect(results![0].title).toBe('Standalone Edition');
    expect(results![0].source).toBe('openlibrary');
  });

  it('returns minimal metadata when work fetch returns null', async () => {
    mockAxiosInstance.get.mockResolvedValueOnce({
      data: {
        key: '/books/OL1234M',
        title: 'Edition',
        works: [{ key: '/works/OL999W' }],
      },
    });
    mockAxiosInstance.get.mockResolvedValueOnce({ data: null });

    const provider = createProvider();
    const results = await provider.searchByIsbn('9780000000001');

    expect(results).toHaveLength(1);
    expect(results![0].title).toBe('Edition');
  });

  it('returns null on 404 (no log error)', async () => {
    const err = new Error('Not Found') as Error & { response?: { status: number } };
    err.response = { status: 404 };
    mockAxiosInstance.get.mockRejectedValue(err);

    const provider = createProvider();
    const result = await provider.searchByIsbn('0000000000');

    expect(result).toBeNull();
    expect(logger.error).not.toHaveBeenCalledWith(
      'OpenLibraryProvider.searchByIsbn failed',
      expect.anything()
    );
  });

  it('returns null and logs on non-404 error', async () => {
    const err = new Error('Server Error') as Error & { response?: { status: number } };
    err.response = { status: 500 };
    mockAxiosInstance.get.mockRejectedValue(err);

    const provider = createProvider();
    const result = await provider.searchByIsbn('9780000000001');

    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      'OpenLibraryProvider.searchByIsbn failed',
      expect.objectContaining({ isbn: '9780000000001' })
    );
  });
});

// ---------------------------------------------------------------------------
// getWork
// ---------------------------------------------------------------------------

describe('OpenLibraryProvider — getWork()', () => {
  it('normalises work ID (strips /works/ prefix)', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: {
        key: '/works/OL123W',
        title: 'Test',
      },
    });

    const provider = createProvider();
    await provider.getWork('/works/OL123W');

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/works/OL123W.json',
      undefined
    );
  });

  it('returns WorkMetadata with description, coverUrl, genres', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: {
        key: '/works/OL123W',
        title: 'Great Work',
        description: 'A description',
        covers: [12345],
        subjects: ['Fantasy', 'Epic'],
      },
    });

    const provider = createProvider();
    const result = await provider.getWork('OL123W');

    expect(result).not.toBeNull();
    expect(result!.openLibraryWorkId).toBe('OL123W');
    expect(result!.title).toBe('Great Work');
    expect(result!.description).toBe('A description');
    expect(result!.coverUrl).toBe(
      'https://covers.openlibrary.org/b/id/12345-L.jpg'
    );
    expect(result!.genres).toEqual(['Fantasy', 'Epic']);
  });

  it('extracts description from object form { value: string }', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: {
        key: '/works/OL123W',
        title: 'Test',
        description: { value: 'Object description' },
      },
    });

    const provider = createProvider();
    const result = await provider.getWork('OL123W');

    expect(result!.description).toBe('Object description');
  });

  it('returns null on 404', async () => {
    const err = new Error('Not Found') as Error & { response?: { status: number } };
    err.response = { status: 404 };
    mockAxiosInstance.get.mockRejectedValue(err);

    const provider = createProvider();
    const result = await provider.getWork('OL999W');

    expect(result).toBeNull();
  });

  it('returns null and logs on non-404 error', async () => {
    const err = new Error('Server Error') as Error & { response?: { status: number } };
    err.response = { status: 500 };
    mockAxiosInstance.get.mockRejectedValue(err);

    const provider = createProvider();
    const result = await provider.getWork('OL1W');

    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      'OpenLibraryProvider.getWork failed',
      expect.objectContaining({ id: 'OL1W' })
    );
  });
});

// ---------------------------------------------------------------------------
// getDescription / getCover
// ---------------------------------------------------------------------------

describe('OpenLibraryProvider — getDescription()', () => {
  it('returns description when present', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: {
        key: '/works/OL1W',
        title: 'T',
        description: 'desc',
      },
    });

    const provider = createProvider();
    const result = await provider.getDescription('OL1W');

    expect(result).toBe('desc');
  });

  it('returns null when description is absent', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: { key: '/works/OL1W', title: 'T' },
    });

    const provider = createProvider();
    const result = await provider.getDescription('OL1W');

    expect(result).toBeNull();
  });

  it('returns null on 404', async () => {
    const err = new Error('Not Found') as Error & { response?: { status: number } };
    err.response = { status: 404 };
    mockAxiosInstance.get.mockRejectedValue(err);

    const provider = createProvider();
    const result = await provider.getDescription('OL999W');

    expect(result).toBeNull();
  });

  it('returns null and logs on non-404 error', async () => {
    const err = new Error('Server Error') as Error & { response?: { status: number } };
    err.response = { status: 500 };
    mockAxiosInstance.get.mockRejectedValue(err);

    const provider = createProvider();
    const result = await provider.getDescription('OL1W');

    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      'OpenLibraryProvider.getDescription failed',
      expect.objectContaining({ id: 'OL1W' })
    );
  });
});

describe('OpenLibraryProvider — getCover()', () => {
  it('returns coverUrl when covers present', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: { key: '/works/OL1W', title: 'T', covers: [999] },
    });

    const provider = createProvider();
    const result = await provider.getCover('OL1W');

    expect(result).toBe('https://covers.openlibrary.org/b/id/999-L.jpg');
  });

  it('returns null when no covers', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: { key: '/works/OL1W', title: 'T' },
    });

    const provider = createProvider();
    const result = await provider.getCover('OL1W');

    expect(result).toBeNull();
  });

  it('returns null on 404', async () => {
    const err = new Error('Not Found') as Error & { response?: { status: number } };
    err.response = { status: 404 };
    mockAxiosInstance.get.mockRejectedValue(err);

    const provider = createProvider();
    const result = await provider.getCover('OL999W');

    expect(result).toBeNull();
  });

  it('returns null and logs on non-404 error', async () => {
    const err = new Error('Server Error') as Error & { response?: { status: number } };
    err.response = { status: 500 };
    mockAxiosInstance.get.mockRejectedValue(err);

    const provider = createProvider();
    const result = await provider.getCover('OL1W');

    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      'OpenLibraryProvider.getCover failed',
      expect.objectContaining({ id: 'OL1W' })
    );
  });
});

// ---------------------------------------------------------------------------
// getRating
// ---------------------------------------------------------------------------

describe('OpenLibraryProvider — getRating()', () => {
  it('returns null (not supported)', async () => {
    const provider = createProvider();
    const result = await provider.getRating('OL1W');

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getEditions
// ---------------------------------------------------------------------------

describe('OpenLibraryProvider — getEditions()', () => {
  it('returns [] when no openLibraryWorkId', async () => {
    const provider = createProvider();
    const result = await provider.getEditions({});

    expect(result).toEqual([]);
  });

  it('fetches and maps editions with isbn, publisher, language, format, coverUrl', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: {
        entries: [
          {
            key: '/books/OL1M',
            title: 'Edition 1',
            isbn_13: ['9781111111111'],
            isbn_10: ['1111111111'],
            publishers: ['Publisher A'],
            publish_date: '2020',
            languages: [{ key: '/languages/fre' }],
            physical_format: 'Paperback',
            number_of_pages: 200,
            covers: [555],
          },
        ],
      },
    });

    const provider = createProvider();
    const result = await provider.getEditions({ openLibraryWorkId: 'OL123W' });

    expect(result).toHaveLength(1);
    expect(result[0].isbn13).toBe('9781111111111');
    expect(result[0].isbn10).toBe('1111111111');
    expect(result[0].publisher).toBe('Publisher A');
    expect(result[0].publishedDate).toBe('2020');
    expect(result[0].language).toBe('fr');
    expect(result[0].format).toBe('paperback');
    expect(result[0].pageCount).toBe(200);
    expect(result[0].coverUrl).toBe(
      'https://covers.openlibrary.org/b/id/555-L.jpg'
    );
    expect(result[0].source).toBe('openlibrary');
  });

  it('filters editions without ISBN', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: {
        entries: [
          { key: '/books/OL1M', title: 'No ISBN' },
          { key: '/books/OL2M', title: 'Has ISBN', isbn_13: ['9781111111111'] },
        ],
      },
    });

    const provider = createProvider();
    const result = await provider.getEditions({ openLibraryWorkId: 'OL123W' });

    expect(result).toHaveLength(1);
    expect(result[0].isbn13).toBe('9781111111111');
  });

  it('returns [] when entries is empty', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: { entries: [] },
    });

    const provider = createProvider();
    const result = await provider.getEditions({ openLibraryWorkId: 'OL123W' });

    expect(result).toEqual([]);
  });

  it('returns undefined for unknown language (/languages/xyz)', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: {
        entries: [
          {
            key: '/books/OL1M',
            isbn_13: ['9781111111111'],
            languages: [{ key: '/languages/xyz' }],
          },
        ],
      },
    });

    const provider = createProvider();
    const result = await provider.getEditions({ openLibraryWorkId: 'OL123W' });

    expect(result[0].language).toBeUndefined();
  });

  it('returns [] and logs when api throws', async () => {
    mockAxiosInstance.get.mockRejectedValue(new Error('boom'));

    const provider = createProvider();
    const result = await provider.getEditions({ openLibraryWorkId: 'OL123W' });

    expect(result).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith(
      'OpenLibraryProvider.getEditions failed',
      expect.anything()
    );
  });
});
