import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AxiosInstance } from 'axios';

vi.mock('axios');
vi.mock('@server/logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import axios from 'axios';
import AudiobookshelfApi from '@server/api/audiobookshelf/index';
import logger from '@server/logger';

const mockedAxiosCreate = vi.mocked(axios.create);

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

describe('AudiobookshelfApi — constructor', () => {
  it('passes baseUrl and Authorization Bearer header to axios.create', () => {
    new AudiobookshelfApi('http://abs:8000', 'my-api-key');

    expect(mockedAxiosCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'http://abs:8000',
        headers: expect.objectContaining({
          Authorization: 'Bearer my-api-key',
        }),
      })
    );
  });
});

describe('AudiobookshelfApi — getLibraries()', () => {
  it('returns data.libraries on success', async () => {
    const libraries = [
      { id: 'lib1', name: 'Audiobooks', mediaType: 'book', folders: [] },
    ];
    mockAxiosInstance.get.mockResolvedValue({ data: { libraries } });

    const api = new AudiobookshelfApi('http://abs:8000', 'key');
    const result = await api.getLibraries();

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/api/libraries',
      undefined
    );
    expect(result).toEqual(libraries);
  });

  it('returns [] and logs on error', async () => {
    mockAxiosInstance.get.mockRejectedValue(new Error('network'));

    const api = new AudiobookshelfApi('http://abs:8000', 'key');
    const result = await api.getLibraries();

    expect(result).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith(
      'Audiobookshelf libraries error',
      expect.any(Object)
    );
  });
});

describe('AudiobookshelfApi — getLibraryItems()', () => {
  it('calls /api/libraries/<id>/items with limit param', async () => {
    const results = [{ id: 'item1' }];
    mockAxiosInstance.get.mockResolvedValue({ data: { results } });

    const api = new AudiobookshelfApi('http://abs:8000', 'key');
    const result = await api.getLibraryItems('lib1', 50);

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/api/libraries/lib1/items',
      { params: { limit: '50' } }
    );
    expect(result).toEqual(results);
  });

  it('uses limit=100 by default', async () => {
    mockAxiosInstance.get.mockResolvedValue({ data: { results: [] } });

    const api = new AudiobookshelfApi('http://abs:8000', 'key');
    await api.getLibraryItems('lib1');

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/api/libraries/lib1/items',
      { params: { limit: '100' } }
    );
  });

  it('returns [] when results is undefined', async () => {
    mockAxiosInstance.get.mockResolvedValue({ data: {} });

    const api = new AudiobookshelfApi('http://abs:8000', 'key');
    const result = await api.getLibraryItems('lib1');

    expect(result).toEqual([]);
  });

  it('returns [] and logs on error', async () => {
    mockAxiosInstance.get.mockRejectedValue(new Error('fail'));

    const api = new AudiobookshelfApi('http://abs:8000', 'key');
    const result = await api.getLibraryItems('lib1');

    expect(result).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith(
      'Audiobookshelf library items error',
      expect.any(Object)
    );
  });
});

describe('AudiobookshelfApi — getItem()', () => {
  it('returns the item on success', async () => {
    const item = { id: 'item1', ino: '123' };
    mockAxiosInstance.get.mockResolvedValue({ data: item });

    const api = new AudiobookshelfApi('http://abs:8000', 'key');
    const result = await api.getItem('item1');

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/api/items/item1',
      undefined
    );
    expect(result).toEqual(item);
  });

  it('returns null and logs on error', async () => {
    mockAxiosInstance.get.mockRejectedValue(new Error('not found'));

    const api = new AudiobookshelfApi('http://abs:8000', 'key');
    const result = await api.getItem('item1');

    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      'Audiobookshelf item error',
      expect.any(Object)
    );
  });
});

describe('AudiobookshelfApi — testConnection()', () => {
  it('returns true when GET /api/me succeeds', async () => {
    mockAxiosInstance.get.mockResolvedValue({ data: { id: 'user1' } });

    const api = new AudiobookshelfApi('http://abs:8000', 'key');
    const result = await api.testConnection();

    expect(result).toBe(true);
    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/api/me',
      undefined
    );
  });

  it('returns false on error', async () => {
    mockAxiosInstance.get.mockRejectedValue(new Error('unauthorized'));

    const api = new AudiobookshelfApi('http://abs:8000', 'key');
    const result = await api.testConnection();

    expect(result).toBe(false);
  });
});
