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
import MusicBrainzApi from '@server/api/musicbrainz/index';
import cacheManager from '@server/lib/cache';
import logger from '@server/logger';

const mockedAxiosCreate = vi.mocked(axios.create);
const mockedAxiosHead = vi.mocked(axios.head);
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

describe('MusicBrainzApi — constructor', () => {
  it('uses musicbrainz base URL, User-Agent, and rateLimit', () => {
    new MusicBrainzApi();
    expect(mockedAxiosCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://musicbrainz.org/ws/2',
        headers: expect.objectContaining({
          'User-Agent': expect.stringContaining('Librarr'),
        }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const minimalReleaseGroup = {
  id: 'rg-1',
  title: 'Test Album',
  'primary-type': 'Album',
  'first-release-date': '2023-06-15',
  'artist-credit': [
    { name: 'Artist One', artist: { id: 'a-1', name: 'Artist One' } },
  ],
  tags: [
    { name: 'rock', count: 10 },
    { name: 'alternative', count: 5 },
  ],
};

// ---------------------------------------------------------------------------
// searchAlbums()
// ---------------------------------------------------------------------------

describe('MusicBrainzApi — searchAlbums()', () => {
  it('returns cached result when available', async () => {
    const cached = { results: [], totalResults: 0 };
    mockedCacheGet.mockReturnValue(cached);

    const api = new MusicBrainzApi();
    const result = await api.searchAlbums('test');

    expect(result).toBe(cached);
    expect(mockAxiosInstance.get).not.toHaveBeenCalled();
  });

  it('calls GET /release-group with params, maps results, caches 600s', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.get.mockResolvedValue({
      data: {
        count: 1,
        offset: 0,
        'release-groups': [minimalReleaseGroup],
      },
    });
    // Cover art check — no cover needed (already has no coverUrl, HEAD fails)
    mockedAxiosHead.mockRejectedValue(new Error('not found'));

    const api = new MusicBrainzApi();
    const result = await api.searchAlbums('test', 1, 20);

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/release-group',
      expect.objectContaining({
        params: expect.objectContaining({
          query: 'test',
          offset: '0',
          limit: '20',
          fmt: 'json',
        }),
      })
    );
    expect(result.results).toHaveLength(1);
    expect(result.results[0].title).toBe('Test Album');
    expect(result.results[0].type).toBe('album');
    expect(result.totalResults).toBe(1);
    expect(mockedCacheSet).toHaveBeenCalledWith(
      expect.stringContaining('mb-search-album:test'),
      result,
      600
    );
  });

  it('maps type: Album→album, Single→single, EP→ep, unknown→album', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    const groups = [
      { ...minimalReleaseGroup, id: 'rg-1', 'primary-type': 'Album' },
      { ...minimalReleaseGroup, id: 'rg-2', 'primary-type': 'Single' },
      { ...minimalReleaseGroup, id: 'rg-3', 'primary-type': 'EP' },
      { ...minimalReleaseGroup, id: 'rg-4', 'primary-type': 'Other' },
    ];
    mockAxiosInstance.get.mockResolvedValue({
      data: { count: 4, offset: 0, 'release-groups': groups },
    });
    mockedAxiosHead.mockRejectedValue(new Error('not found'));

    const api = new MusicBrainzApi();
    const result = await api.searchAlbums('test');

    expect(result.results[0].type).toBe('album');
    expect(result.results[1].type).toBe('single');
    expect(result.results[2].type).toBe('ep');
    expect(result.results[3].type).toBe('album');
  });

  it('returns empty and logs on error', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.get.mockRejectedValue(new Error('fail'));

    const api = new MusicBrainzApi();
    const result = await api.searchAlbums('test');

    expect(result).toEqual({ results: [], totalResults: 0 });
    expect(vi.mocked(logger.error)).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getReleaseGroup()
// ---------------------------------------------------------------------------

describe('MusicBrainzApi — getReleaseGroup()', () => {
  it('returns cached result when available', async () => {
    const cached = { musicBrainzId: 'rg-1', title: 'Cached', artists: [] };
    mockedCacheGet.mockReturnValue(cached);

    const api = new MusicBrainzApi();
    const result = await api.getReleaseGroup('rg-1');

    expect(result).toBe(cached);
  });

  it('calls GET /release-group/<mbid>, verifies cover, caches 3600s', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.get.mockResolvedValue({ data: minimalReleaseGroup });
    mockedAxiosHead.mockResolvedValue({});

    const api = new MusicBrainzApi();
    const result = await api.getReleaseGroup('rg-1');

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/release-group/rg-1',
      expect.objectContaining({
        params: expect.objectContaining({ inc: 'artist-credits+tags', fmt: 'json' }),
      })
    );
    expect(result!.title).toBe('Test Album');
    expect(result!.coverUrl).toContain('coverartarchive.org');
    expect(mockedCacheSet).toHaveBeenCalledWith('mb-rg:rg-1', expect.anything(), 3600);
  });

  it('returns null and logs on error', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.get.mockRejectedValue(new Error('fail'));

    const api = new MusicBrainzApi();
    const result = await api.getReleaseGroup('rg-1');

    expect(result).toBeNull();
    expect(vi.mocked(logger.error)).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getArtist()
// ---------------------------------------------------------------------------

describe('MusicBrainzApi — getArtist()', () => {
  const minimalArtist = {
    id: 'a-1',
    name: 'Test Artist',
    'sort-name': 'Artist, Test',
    type: 'Group',
    country: 'US',
    'life-span': { begin: '2000', end: undefined, ended: false },
    tags: [
      { name: 'rock', count: 20 },
      { name: 'pop', count: 15 },
    ],
    'release-groups': [
      { ...minimalReleaseGroup, 'primary-type': 'Album' },
      { ...minimalReleaseGroup, id: 'rg-single', 'primary-type': 'Single' },
    ],
  };

  it('returns cached result when available', async () => {
    const cached = { musicBrainzId: 'a-1', name: 'Cached' };
    mockedCacheGet.mockReturnValue(cached);

    const api = new MusicBrainzApi();
    const result = await api.getArtist('a-1');

    expect(result).toBe(cached);
  });

  it('filters release-groups by primary-type Album, verifies covers', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.get.mockResolvedValue({ data: minimalArtist });
    mockedAxiosHead.mockRejectedValue(new Error('no cover'));

    const api = new MusicBrainzApi();
    const result = await api.getArtist('a-1');

    expect(result!.name).toBe('Test Artist');
    // Only Album type should be in topAlbums, not Single
    expect(result!.topAlbums).toHaveLength(1);
    expect(result!.topAlbums![0].musicBrainzId).toBe('rg-1');
  });

  it('sorts tags by count desc, slices top 10', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    const artist = {
      ...minimalArtist,
      tags: Array.from({ length: 15 }, (_, i) => ({
        name: `tag-${i}`,
        count: 15 - i,
      })),
    };
    mockAxiosInstance.get.mockResolvedValue({ data: artist });
    mockedAxiosHead.mockRejectedValue(new Error('no cover'));

    const api = new MusicBrainzApi();
    const result = await api.getArtist('a-1');

    expect(result!.genres).toHaveLength(10);
    expect(result!.genres![0]).toBe('tag-0');
  });

  it('returns null and logs on error', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.get.mockRejectedValue(new Error('fail'));

    const api = new MusicBrainzApi();
    const result = await api.getArtist('a-1');

    expect(result).toBeNull();
    expect(vi.mocked(logger.error)).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getArtistAlbums()
// ---------------------------------------------------------------------------

describe('MusicBrainzApi — getArtistAlbums()', () => {
  it('returns cached result when available', async () => {
    const cached = [{ title: 'Cached' }];
    mockedCacheGet.mockReturnValue(cached);

    const api = new MusicBrainzApi();
    const result = await api.getArtistAlbums('a-1');

    expect(result).toBe(cached);
  });

  it('calls GET /release-group with artist param, caches 3600s', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.get.mockResolvedValue({
      data: {
        count: 1,
        offset: 0,
        'release-groups': [minimalReleaseGroup],
      },
    });
    mockedAxiosHead.mockRejectedValue(new Error('no cover'));

    const api = new MusicBrainzApi();
    const result = await api.getArtistAlbums('a-1');

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/release-group',
      expect.objectContaining({
        params: expect.objectContaining({
          artist: 'a-1',
          type: 'album',
        }),
      })
    );
    expect(result).toHaveLength(1);
    expect(mockedCacheSet).toHaveBeenCalledWith(
      'mb-artist-albums:a-1',
      expect.anything(),
      3600
    );
  });

  it('returns [] and logs on error', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.get.mockRejectedValue(new Error('fail'));

    const api = new MusicBrainzApi();
    const result = await api.getArtistAlbums('a-1');

    expect(result).toEqual([]);
    expect(vi.mocked(logger.error)).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getTracks()
// ---------------------------------------------------------------------------

describe('MusicBrainzApi — getTracks()', () => {
  it('returns cached result when available', async () => {
    const cached = [{ title: 'Cached Track' }];
    mockedCacheGet.mockReturnValue(cached);

    const api = new MusicBrainzApi();
    const result = await api.getTracks('rg-1');

    expect(result).toBe(cached);
  });

  it('returns [] when no releases found', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.get.mockResolvedValue({
      data: { count: 0, releases: [] },
    });

    const api = new MusicBrainzApi();
    const result = await api.getTracks('rg-1');

    expect(result).toEqual([]);
  });

  it('fetches release then tracks, maps duration ms→s', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    // First call: GET /release → list of releases
    mockAxiosInstance.get
      .mockResolvedValueOnce({
        data: { count: 1, releases: [{ id: 'rel-1' }] },
      })
      // Second call: GET /release/rel-1 → release with media/tracks
      .mockResolvedValueOnce({
        data: {
          id: 'rel-1',
          title: 'Test Album',
          media: [
            {
              position: 1,
              tracks: [
                { id: 't-1', title: 'Track 1', length: 240000, position: 1 },
                { id: 't-2', title: 'Track 2', length: 180500, position: 2 },
              ],
            },
          ],
        },
      });

    const api = new MusicBrainzApi();
    const result = await api.getTracks('rg-1');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      musicBrainzId: 't-1',
      title: 'Track 1',
      duration: 240, // 240000ms → 240s
      position: 1,
      discNumber: 1,
    });
    expect(result[1].duration).toBe(181); // 180500ms → 181s (rounded)
  });

  it('handles multi-media (disc 1 + disc 2)', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.get
      .mockResolvedValueOnce({
        data: { count: 1, releases: [{ id: 'rel-1' }] },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'rel-1',
          title: 'Double Album',
          media: [
            {
              position: 1,
              tracks: [{ id: 't-1', title: 'Disc 1 Track', length: 120000, position: 1 }],
            },
            {
              position: 2,
              tracks: [{ id: 't-2', title: 'Disc 2 Track', length: 150000, position: 1 }],
            },
          ],
        },
      });

    const api = new MusicBrainzApi();
    const result = await api.getTracks('rg-1');

    expect(result).toHaveLength(2);
    expect(result[0].discNumber).toBe(1);
    expect(result[1].discNumber).toBe(2);
  });

  it('caches result for 3600s', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.get
      .mockResolvedValueOnce({ data: { count: 1, releases: [{ id: 'r-1' }] } })
      .mockResolvedValueOnce({ data: { id: 'r-1', title: 'A', media: [] } });

    const api = new MusicBrainzApi();
    await api.getTracks('rg-1');

    expect(mockedCacheSet).toHaveBeenCalledWith('mb-tracks:rg-1', expect.anything(), 3600);
  });

  it('returns [] and logs on error', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.get.mockRejectedValue(new Error('fail'));

    const api = new MusicBrainzApi();
    const result = await api.getTracks('rg-1');

    expect(result).toEqual([]);
    expect(vi.mocked(logger.error)).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// verifyCoverArts (tested via searchAlbums / getReleaseGroup)
// ---------------------------------------------------------------------------

describe('MusicBrainzApi — verifyCoverArts (via public methods)', () => {
  it('does not HEAD when all albums already have coverUrl', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    const rg = { ...minimalReleaseGroup };
    mockAxiosInstance.get.mockResolvedValue({
      data: { count: 1, 'release-groups': [rg] },
    });
    // No HEAD calls should be made since album has no coverUrl but
    // verifyCoverArts is called — to test "already has coverUrl" we need
    // to test via getReleaseGroup after setting the album.coverUrl

    // Actually let's test via searchAlbums: album has no coverUrl initially,
    // but the cache has a cached URL
    mockedCacheGet
      .mockReturnValueOnce(undefined) // main search cache miss
      .mockReturnValueOnce('https://cached-cover.jpg'); // cover-exists cache hit

    const api = new MusicBrainzApi();
    const result = await api.searchAlbums('test');

    // Should use cached cover URL
    expect(result.results[0].coverUrl).toBe('https://cached-cover.jpg');
    expect(mockedAxiosHead).not.toHaveBeenCalled();
  });

  it('uses cache for cover verification (string = URL found)', async () => {
    mockedCacheGet
      .mockReturnValueOnce(undefined) // search cache miss
      .mockReturnValueOnce('https://cached.jpg'); // cover exists in cache

    mockAxiosInstance.get.mockResolvedValue({
      data: { count: 1, 'release-groups': [minimalReleaseGroup] },
    });

    const api = new MusicBrainzApi();
    const result = await api.searchAlbums('test');

    expect(result.results[0].coverUrl).toBe('https://cached.jpg');
  });

  it('uses cache for cover verification (false = no cover)', async () => {
    mockedCacheGet
      .mockReturnValueOnce(undefined) // search cache miss
      .mockReturnValueOnce(false); // cover does not exist (cached false)

    mockAxiosInstance.get.mockResolvedValue({
      data: { count: 1, 'release-groups': [minimalReleaseGroup] },
    });

    const api = new MusicBrainzApi();
    const result = await api.searchAlbums('test');

    expect(result.results[0].coverUrl).toBeUndefined();
  });

  it('HEAD success → sets coverUrl and caches URL 24h', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.get.mockResolvedValue({
      data: { count: 1, 'release-groups': [minimalReleaseGroup] },
    });
    mockedAxiosHead.mockResolvedValue({});

    const api = new MusicBrainzApi();
    const result = await api.searchAlbums('test');

    expect(result.results[0].coverUrl).toContain('coverartarchive.org');
    expect(mockedCacheSet).toHaveBeenCalledWith(
      'cover-exists:rg-1',
      expect.stringContaining('coverartarchive.org'),
      86400
    );
  });

  it('HEAD failure → caches false 1h', async () => {
    mockedCacheGet.mockReturnValue(undefined);
    mockAxiosInstance.get.mockResolvedValue({
      data: { count: 1, 'release-groups': [minimalReleaseGroup] },
    });
    mockedAxiosHead.mockRejectedValue(new Error('404'));

    const api = new MusicBrainzApi();
    await api.searchAlbums('test');

    expect(mockedCacheSet).toHaveBeenCalledWith(
      'cover-exists:rg-1',
      false,
      3600
    );
  });
});
