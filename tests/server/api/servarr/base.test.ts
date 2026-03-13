import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AxiosInstance } from 'axios';

vi.mock('axios');
vi.mock('@server/logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import axios from 'axios';
import ServarrApi from '@server/api/servarr/base';

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

describe('ServarrApi — constructor', () => {
  it('passes X-Api-Key header to ExternalApi', () => {
    new ServarrApi('http://localhost:8787', 'test-api-key');
    expect(mockedAxiosCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'http://localhost:8787',
        headers: expect.objectContaining({
          'X-Api-Key': 'test-api-key',
        }),
      })
    );
  });
});

describe('ServarrApi — getProfiles()', () => {
  it('calls GET on the provided endpoint and returns profiles', async () => {
    const profiles = [{ id: 1, name: 'HD' }];
    mockAxiosInstance.get.mockResolvedValue({ data: profiles });

    const api = new ServarrApi('http://localhost:8787', 'key');
    const result = await api.getProfiles('/api/v1/qualityprofile');

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/api/v1/qualityprofile',
      undefined
    );
    expect(result).toEqual(profiles);
  });
});

describe('ServarrApi — getRootFolders()', () => {
  it('calls GET /api/v1/rootfolder', async () => {
    const folders = [{ id: 1, path: '/books', freeSpace: 1000 }];
    mockAxiosInstance.get.mockResolvedValue({ data: folders });

    const api = new ServarrApi('http://localhost:8787', 'key');
    const result = await api.getRootFolders();

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/api/v1/rootfolder',
      undefined
    );
    expect(result).toEqual(folders);
  });
});

describe('ServarrApi — getTags()', () => {
  it('calls GET /api/v1/tag', async () => {
    const tags = [{ id: 1, label: 'librarr' }];
    mockAxiosInstance.get.mockResolvedValue({ data: tags });

    const api = new ServarrApi('http://localhost:8787', 'key');
    const result = await api.getTags();

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/api/v1/tag',
      undefined
    );
    expect(result).toEqual(tags);
  });
});

describe('ServarrApi — getQueue()', () => {
  it('returns all records when single page (records < 50)', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: {
        records: [
          {
            id: 1,
            title: 'Book 1',
            status: 'downloading',
            size: 100,
            sizeleft: 50,
          },
        ],
        totalRecords: 1,
      },
    });

    const api = new ServarrApi('http://localhost:8787', 'key');
    const result = await api.getQueue();

    expect(result).toHaveLength(1);
    expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v1/queue', {
      params: {
        pageSize: '50',
        page: '1',
        includeUnknownAuthorItems: 'true',
      },
    });
  });

  it('paginates when first page is full (50 records)', async () => {
    const page1Records = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      title: `Item ${i}`,
      status: 'ok',
      size: 100,
      sizeleft: 0,
    }));
    const page2Records = [
      { id: 50, title: 'Item 50', status: 'ok', size: 100, sizeleft: 0 },
    ];

    mockAxiosInstance.get
      .mockResolvedValueOnce({
        data: { records: page1Records, totalRecords: 51 },
      })
      .mockResolvedValueOnce({
        data: { records: page2Records, totalRecords: 51 },
      });

    const api = new ServarrApi('http://localhost:8787', 'key');
    const result = await api.getQueue();

    expect(result).toHaveLength(51);
    expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
    expect(mockAxiosInstance.get).toHaveBeenLastCalledWith('/api/v1/queue', {
      params: {
        pageSize: '50',
        page: '2',
        includeUnknownAuthorItems: 'true',
      },
    });
  });

  it('returns empty array when records is empty', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: { records: [], totalRecords: 0 },
    });

    const api = new ServarrApi('http://localhost:8787', 'key');
    const result = await api.getQueue();

    expect(result).toEqual([]);
  });

  it('stops pagination when allRecords.length >= totalRecords', async () => {
    const page1Records = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      title: `Item ${i}`,
      status: 'ok',
      size: 100,
      sizeleft: 0,
    }));

    mockAxiosInstance.get.mockResolvedValue({
      data: { records: page1Records, totalRecords: 50 },
    });

    const api = new ServarrApi('http://localhost:8787', 'key');
    const result = await api.getQueue();

    expect(result).toHaveLength(50);
    expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
  });
});

describe('ServarrApi — testConnection()', () => {
  it('returns true when GET succeeds', async () => {
    mockAxiosInstance.get.mockResolvedValue({ data: { version: '1.0' } });

    const api = new ServarrApi('http://localhost:8787', 'key');
    expect(await api.testConnection()).toBe(true);
    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/api/v1/system/status',
      undefined
    );
  });

  it('returns false when GET throws', async () => {
    mockAxiosInstance.get.mockRejectedValue(new Error('connection refused'));

    const api = new ServarrApi('http://localhost:8787', 'key');
    expect(await api.testConnection()).toBe(false);
  });
});
