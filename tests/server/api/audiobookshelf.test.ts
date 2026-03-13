import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AxiosInstance } from 'axios';

vi.mock('axios');
vi.mock('@server/logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import axios from 'axios';
import AudiobookshelfApi from '@server/api/audiobookshelf';
import logger from '@server/logger';

const mockedAxiosCreate = vi.mocked(axios.create);

let mockAxiosInstance: {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  defaults: { baseURL: string };
  interceptors: { response: { use: ReturnType<typeof vi.fn> } };
};

beforeEach(() => {
  vi.resetAllMocks();
  mockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
    defaults: { baseURL: 'http://abs:8000' },
    interceptors: { response: { use: vi.fn() } },
  };
  mockedAxiosCreate.mockReturnValue(
    mockAxiosInstance as unknown as AxiosInstance
  );
});

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('AudiobookshelfApi — constructor', () => {
  it('passes serverUrl and Bearer authorization header', () => {
    new AudiobookshelfApi('http://abs:8000', 'my-key');
    expect(mockedAxiosCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'http://abs:8000',
        headers: expect.objectContaining({
          Authorization: 'Bearer my-key',
        }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// testConnection()
// ---------------------------------------------------------------------------

describe('AudiobookshelfApi — testConnection()', () => {
  it('returns true when POST /api/authorize succeeds', async () => {
    mockAxiosInstance.post.mockResolvedValue({ data: {} });

    const api = new AudiobookshelfApi('http://abs:8000', 'key');
    const result = await api.testConnection();

    expect(result).toBe(true);
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/api/authorize',
      undefined,
      undefined
    );
  });

  it('returns false when POST throws', async () => {
    mockAxiosInstance.post.mockRejectedValue(new Error('unauthorized'));

    const api = new AudiobookshelfApi('http://abs:8000', 'key');
    const result = await api.testConnection();

    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getLibraries()
// ---------------------------------------------------------------------------

describe('AudiobookshelfApi — getLibraries()', () => {
  it('returns libraries on success', async () => {
    const libraries = [
      { id: 'lib-1', name: 'Audiobooks', mediaType: 'book' },
    ];
    mockAxiosInstance.get.mockResolvedValue({ data: { libraries } });

    const api = new AudiobookshelfApi('http://abs:8000', 'key');
    const result = await api.getLibraries();

    expect(result).toEqual(libraries);
  });

  it('returns [] when libraries undefined', async () => {
    mockAxiosInstance.get.mockResolvedValue({ data: {} });

    const api = new AudiobookshelfApi('http://abs:8000', 'key');
    const result = await api.getLibraries();

    expect(result).toEqual([]);
  });

  it('returns [] and logs on error', async () => {
    mockAxiosInstance.get.mockRejectedValue(new Error('fail'));

    const api = new AudiobookshelfApi('http://abs:8000', 'key');
    const result = await api.getLibraries();

    expect(result).toEqual([]);
    expect(vi.mocked(logger.error)).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getLibraryItems() — pagination
// ---------------------------------------------------------------------------

describe('AudiobookshelfApi — getLibraryItems()', () => {
  it('returns all items in one page (items < PAGE_SIZE)', async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ id: `item-${i}` }));
    mockAxiosInstance.get.mockResolvedValue({
      data: { results: items, total: 10 },
    });

    const api = new AudiobookshelfApi('http://abs:8000', 'key');
    const result = await api.getLibraryItems('lib-1');

    expect(result).toHaveLength(10);
    expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
  });

  it('paginates: first page 500 items, second page < 500 → stop', async () => {
    const page1Items = Array.from({ length: 500 }, (_, i) => ({ id: `p1-${i}` }));
    const page2Items = Array.from({ length: 100 }, (_, i) => ({ id: `p2-${i}` }));

    mockAxiosInstance.get
      .mockResolvedValueOnce({ data: { results: page1Items, total: 600 } })
      .mockResolvedValueOnce({ data: { results: page2Items, total: 600 } });

    const api = new AudiobookshelfApi('http://abs:8000', 'key');
    const result = await api.getLibraryItems('lib-1');

    expect(result).toHaveLength(600);
    expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
  });

  it('stops when allItems.length >= total', async () => {
    const page1Items = Array.from({ length: 500 }, (_, i) => ({ id: `p1-${i}` }));
    const page2Items = Array.from({ length: 500 }, (_, i) => ({ id: `p2-${i}` }));

    mockAxiosInstance.get
      .mockResolvedValueOnce({ data: { results: page1Items, total: 1000 } })
      .mockResolvedValueOnce({ data: { results: page2Items, total: 1000 } });

    const api = new AudiobookshelfApi('http://abs:8000', 'key');
    const result = await api.getLibraryItems('lib-1');

    expect(result).toHaveLength(1000);
    expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
  });

  it('returns items collected before error during mid-pagination', async () => {
    const page1Items = Array.from({ length: 500 }, (_, i) => ({ id: `p1-${i}` }));

    mockAxiosInstance.get
      .mockResolvedValueOnce({ data: { results: page1Items, total: 1000 } })
      .mockRejectedValueOnce(new Error('network error'));

    const api = new AudiobookshelfApi('http://abs:8000', 'key');
    const result = await api.getLibraryItems('lib-1');

    expect(result).toHaveLength(500);
    expect(vi.mocked(logger.error)).toHaveBeenCalled();
  });

  it('returns [] when error on first page', async () => {
    mockAxiosInstance.get.mockRejectedValue(new Error('fail'));

    const api = new AudiobookshelfApi('http://abs:8000', 'key');
    const result = await api.getLibraryItems('lib-1');

    expect(result).toEqual([]);
    expect(vi.mocked(logger.error)).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getCoverUrl()
// ---------------------------------------------------------------------------

describe('AudiobookshelfApi — getCoverUrl()', () => {
  it('returns {baseURL}/api/items/{id}/cover', () => {
    const api = new AudiobookshelfApi('http://abs:8000', 'key');
    expect(api.getCoverUrl('item-42')).toBe(
      'http://abs:8000/api/items/item-42/cover'
    );
  });
});

// ---------------------------------------------------------------------------
// getItemUrl()
// ---------------------------------------------------------------------------

describe('AudiobookshelfApi — getItemUrl()', () => {
  it('returns {baseURL}/item/{id}', () => {
    const api = new AudiobookshelfApi('http://abs:8000', 'key');
    expect(api.getItemUrl('item-42')).toBe('http://abs:8000/item/item-42');
  });
});
