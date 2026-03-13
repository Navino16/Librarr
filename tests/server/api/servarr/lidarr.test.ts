import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AxiosInstance } from 'axios';

vi.mock('axios');
vi.mock('@server/logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import axios from 'axios';
import LidarrApi from '@server/api/servarr/lidarr';
import type { LidarrAddOptions } from '@server/api/servarr/lidarr';
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

describe('LidarrApi — getQualityProfiles()', () => {
  it('calls GET /api/v1/qualityprofile', async () => {
    const profiles = [{ id: 1, name: 'Lossless' }];
    mockAxiosInstance.get.mockResolvedValue({ data: profiles });

    const api = new LidarrApi('http://localhost:8686', 'key');
    const result = await api.getQualityProfiles();

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/api/v1/qualityprofile',
      undefined
    );
    expect(result).toEqual(profiles);
  });
});

describe('LidarrApi — getMetadataProfiles()', () => {
  it('calls GET /api/v1/metadataprofile', async () => {
    const profiles = [{ id: 1, name: 'Standard' }];
    mockAxiosInstance.get.mockResolvedValue({ data: profiles });

    const api = new LidarrApi('http://localhost:8686', 'key');
    const result = await api.getMetadataProfiles();

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/api/v1/metadataprofile',
      undefined
    );
    expect(result).toEqual(profiles);
  });
});

describe('LidarrApi — getAlbums()', () => {
  it('calls GET /api/v1/album', async () => {
    const albums = [{ id: 1, title: 'Album', foreignAlbumId: 'fa1', monitored: true, grabbed: false, added: '2024-01-01' }];
    mockAxiosInstance.get.mockResolvedValue({ data: albums });

    const api = new LidarrApi('http://localhost:8686', 'key');
    const result = await api.getAlbums();

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/api/v1/album',
      undefined
    );
    expect(result).toEqual(albums);
  });
});

describe('LidarrApi — getAlbum()', () => {
  it('calls GET /api/v1/album/:id', async () => {
    const album = { id: 42, title: 'Specific Album', foreignAlbumId: 'fa42', monitored: true, grabbed: false, added: '2024-01-01' };
    mockAxiosInstance.get.mockResolvedValue({ data: album });

    const api = new LidarrApi('http://localhost:8686', 'key');
    const result = await api.getAlbum(42);

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/api/v1/album/42',
      undefined
    );
    expect(result).toEqual(album);
  });
});

describe('LidarrApi — lookupAlbum()', () => {
  it('calls GET /api/v1/album/lookup with term param', async () => {
    const albums = [{ id: 1, title: 'Found Album', foreignAlbumId: 'fa1', monitored: false, grabbed: false, added: '2024-01-01' }];
    mockAxiosInstance.get.mockResolvedValue({ data: albums });

    const api = new LidarrApi('http://localhost:8686', 'key');
    const result = await api.lookupAlbum('Dark Side of the Moon');

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/api/v1/album/lookup',
      { params: { term: 'Dark Side of the Moon' } }
    );
    expect(result).toEqual(albums);
  });
});

describe('LidarrApi — addAlbum()', () => {
  const addOptions: LidarrAddOptions = {
    title: 'New Album',
    foreignAlbumId: 'fa-new',
    qualityProfileId: 1,
    rootFolderPath: '/music',
    monitored: true,
    addOptions: { searchForNewAlbum: true },
    artist: {
      foreignArtistId: 'far-1',
      qualityProfileId: 1,
      rootFolderPath: '/music',
      monitored: true,
    },
  };

  it('calls POST /api/v1/album with options and returns result', async () => {
    const created = { id: 99, title: 'New Album', foreignAlbumId: 'fa-new', monitored: true, grabbed: false, added: '2024-01-01' };
    mockAxiosInstance.post.mockResolvedValue({ data: created });

    const api = new LidarrApi('http://localhost:8686', 'key');
    const result = await api.addAlbum(addOptions);

    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/api/v1/album',
      addOptions,
      undefined
    );
    expect(result).toEqual(created);
  });

  it('logs the error and re-throws when POST fails', async () => {
    const error = new Error('conflict');
    mockAxiosInstance.post.mockRejectedValue(error);

    const api = new LidarrApi('http://localhost:8686', 'key');
    await expect(api.addAlbum(addOptions)).rejects.toThrow('conflict');
    expect(logger.error).toHaveBeenCalledWith('Lidarr add album error', {
      error,
    });
  });
});

describe('LidarrApi — getArtists()', () => {
  it('calls GET /api/v1/artist', async () => {
    const artists = [{ id: 1, artistName: 'Pink Floyd', foreignArtistId: 'far1', monitored: true }];
    mockAxiosInstance.get.mockResolvedValue({ data: artists });

    const api = new LidarrApi('http://localhost:8686', 'key');
    const result = await api.getArtists();

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/api/v1/artist',
      undefined
    );
    expect(result).toEqual(artists);
  });
});
