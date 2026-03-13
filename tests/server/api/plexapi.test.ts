import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AxiosInstance } from 'axios';

vi.mock('axios');
vi.mock('@server/logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import axios from 'axios';
import PlexApi from '@server/api/plexapi';
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

describe('PlexApi — constructor', () => {
  it('passes serverUrl, X-Plex-Token and Accept headers', () => {
    new PlexApi('http://plex:32400', 'my-plex-token');

    expect(mockedAxiosCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'http://plex:32400',
        headers: expect.objectContaining({
          'X-Plex-Token': 'my-plex-token',
          Accept: 'application/json',
        }),
      })
    );
  });
});

describe('PlexApi — testConnection()', () => {
  it('GETs /identity and returns true on success', async () => {
    mockAxiosInstance.get.mockResolvedValue({ data: {} });

    const api = new PlexApi('http://plex:32400', 'token');
    const result = await api.testConnection();

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/identity',
      undefined
    );
    expect(result).toBe(true);
  });

  it('returns false and logs warn on error', async () => {
    mockAxiosInstance.get.mockRejectedValue(new Error('refused'));

    const api = new PlexApi('http://plex:32400', 'token');
    const result = await api.testConnection();

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      'Plex connection test failed',
      expect.any(Object)
    );
  });
});

describe('PlexApi — getLibraries()', () => {
  it('GETs /library/sections and unwraps MediaContainer.Directory', async () => {
    const directories = [
      { key: '1', title: 'Music', type: 'artist' },
      { key: '2', title: 'Books', type: 'photo' },
    ];
    mockAxiosInstance.get.mockResolvedValue({
      data: { MediaContainer: { Directory: directories } },
    });

    const api = new PlexApi('http://plex:32400', 'token');
    const result = await api.getLibraries();

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/library/sections',
      undefined
    );
    expect(result).toEqual(directories);
  });

  it('returns [] when Directory is undefined', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: { MediaContainer: {} },
    });

    const api = new PlexApi('http://plex:32400', 'token');
    const result = await api.getLibraries();

    expect(result).toEqual([]);
  });

  it('returns [] and logs error on error', async () => {
    mockAxiosInstance.get.mockRejectedValue(new Error('fail'));

    const api = new PlexApi('http://plex:32400', 'token');
    const result = await api.getLibraries();

    expect(result).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith(
      'Plex get libraries error',
      expect.any(Object)
    );
  });
});

describe('PlexApi — getLibraryItems()', () => {
  it('GETs /library/sections/<key>/all and unwraps Metadata', async () => {
    const metadata = [
      { ratingKey: '100', title: 'Album 1' },
      { ratingKey: '101', title: 'Album 2' },
    ];
    mockAxiosInstance.get.mockResolvedValue({
      data: { MediaContainer: { Metadata: metadata } },
    });

    const api = new PlexApi('http://plex:32400', 'token');
    const result = await api.getLibraryItems('3');

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/library/sections/3/all',
      undefined
    );
    expect(result).toEqual(metadata);
  });

  it('returns [] when Metadata is undefined', async () => {
    mockAxiosInstance.get.mockResolvedValue({
      data: { MediaContainer: {} },
    });

    const api = new PlexApi('http://plex:32400', 'token');
    const result = await api.getLibraryItems('3');

    expect(result).toEqual([]);
  });

  it('returns [] and logs error on error', async () => {
    mockAxiosInstance.get.mockRejectedValue(new Error('fail'));

    const api = new PlexApi('http://plex:32400', 'token');
    const result = await api.getLibraryItems('3');

    expect(result).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith(
      'Plex get library items error',
      expect.any(Object)
    );
  });
});
