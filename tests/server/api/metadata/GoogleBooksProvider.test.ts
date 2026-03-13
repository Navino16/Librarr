import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AxiosInstance } from 'axios';

vi.mock('axios');
vi.mock('@server/logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import axios from 'axios';
import { GoogleBooksProvider } from '@server/api/metadata/GoogleBooksProvider';
import logger from '@server/logger';

const mockedAxiosCreate = vi.mocked(axios.create);

let mockAxiosInstance: {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  interceptors: { response: { use: ReturnType<typeof vi.fn> } };
};

function createProvider(): GoogleBooksProvider {
  return new GoogleBooksProvider();
}

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

describe('GoogleBooksProvider — constructor', () => {
  it('has source "googlebooks" and uses correct base URL', () => {
    const provider = createProvider();
    expect(provider.source).toBe('googlebooks');
    expect(mockedAxiosCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://www.googleapis.com/books/v1',
      })
    );
  });
});

// ---------------------------------------------------------------------------
// searchByText
// ---------------------------------------------------------------------------

describe('GoogleBooksProvider — searchByText()', () => {
  it('calls /volumes with { q, maxResults: "10" }', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: {
        totalItems: 1,
        items: [
          {
            id: 'gb1',
            volumeInfo: {
              title: 'Test Book',
              authors: ['Author'],
              description: 'A book',
              categories: ['Fiction'],
              imageLinks: { thumbnail: 'https://books.google.com/img.jpg' },
            },
          },
        ],
      },
    });

    const provider = createProvider();
    await provider.searchByText('test query');

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/volumes',
      expect.objectContaining({
        params: { q: 'test query', maxResults: '10' },
      })
    );
  });

  it('includes langRestrict when locale provided', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: {
        totalItems: 1,
        items: [
          {
            id: 'gb1',
            volumeInfo: { title: 'Test' },
          },
        ],
      },
    });

    const provider = createProvider();
    await provider.searchByText('test', 'fr');

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/volumes',
      expect.objectContaining({
        params: { q: 'test', maxResults: '10', langRestrict: 'fr' },
      })
    );
  });

  it('maps GBVolume[] to WorkMetadata[]', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: {
        totalItems: 1,
        items: [
          {
            id: 'gb1',
            volumeInfo: {
              title: 'Dune',
              description: 'Sci-fi classic',
              authors: ['Frank Herbert'],
              categories: ['Science Fiction'],
              publishedDate: '1965',
              pageCount: 412,
              imageLinks: { thumbnail: 'https://books.google.com/dune.jpg' },
            },
          },
        ],
      },
    });

    const provider = createProvider();
    const results = await provider.searchByText('dune');

    expect(results).toHaveLength(1);
    const work = results![0];
    expect(work.title).toBe('Dune');
    expect(work.description).toBe('Sci-fi classic');
    expect(work.authors).toEqual([{ name: 'Frank Herbert' }]);
    expect(work.genres).toEqual(['Science Fiction']);
    expect(work.coverUrl).toBe('https://books.google.com/dune.jpg');
    expect(work.source).toBe('googlebooks');
  });

  it('converts http: to https: for cover URLs', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: {
        totalItems: 1,
        items: [
          {
            id: 'gb1',
            volumeInfo: {
              title: 'Test',
              imageLinks: { thumbnail: 'http://books.google.com/img.jpg' },
            },
          },
        ],
      },
    });

    const provider = createProvider();
    const results = await provider.searchByText('test');

    expect(results![0].coverUrl).toBe('https://books.google.com/img.jpg');
  });

  it('handles volumes without imageLinks', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: {
        totalItems: 1,
        items: [
          {
            id: 'gb1',
            volumeInfo: { title: 'No Cover' },
          },
        ],
      },
    });

    const provider = createProvider();
    const results = await provider.searchByText('test');

    expect(results![0].coverUrl).toBeUndefined();
  });

  it('handles volumes with imageLinks but no thumbnail', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: {
        totalItems: 1,
        items: [
          {
            id: 'gb1',
            volumeInfo: {
              title: 'Test',
              imageLinks: { smallThumbnail: 'http://small.jpg' },
            },
          },
        ],
      },
    });

    const provider = createProvider();
    const results = await provider.searchByText('test');

    expect(results![0].coverUrl).toBeUndefined();
  });

  it('returns null when items is empty', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: { totalItems: 0, items: [] },
    });

    const provider = createProvider();
    const result = await provider.searchByText('nothing');

    expect(result).toBeNull();
  });

  it('returns null when items is undefined', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: { totalItems: 0 },
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
      'GoogleBooksProvider.searchByText failed',
      expect.objectContaining({ query: 'fail' })
    );
  });
});

// ---------------------------------------------------------------------------
// searchByIsbn
// ---------------------------------------------------------------------------

describe('GoogleBooksProvider — searchByIsbn()', () => {
  it('prefixes isbn: to query param with maxResults "1"', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: {
        totalItems: 1,
        items: [{ id: 'gb1', volumeInfo: { title: 'Test' } }],
      },
    });

    const provider = createProvider();
    await provider.searchByIsbn('9780000000001');

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/volumes',
      expect.objectContaining({
        params: { q: 'isbn:9780000000001', maxResults: '1' },
      })
    );
  });

  it('includes langRestrict when locale provided', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: {
        totalItems: 1,
        items: [{ id: 'gb1', volumeInfo: { title: 'Test' } }],
      },
    });

    const provider = createProvider();
    await provider.searchByIsbn('9780000000001', 'en');

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/volumes',
      expect.objectContaining({
        params: { q: 'isbn:9780000000001', maxResults: '1', langRestrict: 'en' },
      })
    );
  });

  it('returns null when no results', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: { totalItems: 0 },
    });

    const provider = createProvider();
    const result = await provider.searchByIsbn('0000000000');

    expect(result).toBeNull();
  });

  it('returns null and logs when throw', async () => {
    mockAxiosInstance.get.mockRejectedValue(new Error('timeout'));

    const provider = createProvider();
    const result = await provider.searchByIsbn('9780000000001');

    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      'GoogleBooksProvider.searchByIsbn failed',
      expect.objectContaining({ isbn: '9780000000001' })
    );
  });
});

// ---------------------------------------------------------------------------
// Stub methods
// ---------------------------------------------------------------------------

describe('GoogleBooksProvider — stub methods', () => {
  it('getWork returns null', async () => {
    const provider = createProvider();
    expect(await provider.getWork('id')).toBeNull();
  });

  it('getDescription returns null', async () => {
    const provider = createProvider();
    expect(await provider.getDescription('id')).toBeNull();
  });

  it('getCover returns null', async () => {
    const provider = createProvider();
    expect(await provider.getCover('id')).toBeNull();
  });

  it('getRating returns null', async () => {
    const provider = createProvider();
    expect(await provider.getRating('id')).toBeNull();
  });

  it('getEditions returns []', async () => {
    const provider = createProvider();
    expect(await provider.getEditions({})).toEqual([]);
  });
});
