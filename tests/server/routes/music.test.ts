import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReq, mockRes } from './_testHelper';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { handlers, mockGetReleaseGroup, mockGetTracks, mockFindOne } = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => any>,
  mockGetReleaseGroup: vi.fn(),
  mockGetTracks: vi.fn(),
  mockFindOne: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('express', async (importOriginal) => {
  const actual = await importOriginal<typeof import('express')>();
  return {
    ...actual,
    Router: vi.fn(() => {
      const r: any = {};
      for (const m of ['get', 'post', 'put', 'delete', 'patch']) {
        r[m] = vi.fn((...args: any[]) => {
          handlers[`${m.toUpperCase()} ${args[0]}`] = args[args.length - 1];
          return r;
        });
      }
      r.use = vi.fn().mockReturnValue(r);
      return r;
    }),
  };
});

vi.mock('@server/lib/search', () => ({
  musicBrainz: {
    getReleaseGroup: mockGetReleaseGroup,
    getTracks: mockGetTracks,
  },
}));

vi.mock('@server/datasource', () => ({
  default: {
    getRepository: vi.fn(() => ({
      findOne: mockFindOne,
    })),
  },
}));

vi.mock('@server/entity/MusicAlbum', () => ({
  MusicAlbum: class MusicAlbum {},
}));

vi.mock('@server/middleware/auth', () => ({
  isAuthenticated: vi.fn((_req: any, _res: any, next: any) => next()),
}));

vi.mock('@server/middleware/asyncHandler', () => ({
  asyncHandler: vi.fn((fn: (...args: any[]) => any) => fn),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

await import('@server/routes/music');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('routes/music', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /:id', () => {
    const handler = handlers['GET /:id'];

    it('returns album with local media data', async () => {
      const album = { id: 'rg-1', title: 'Test Album' };
      const localAlbum = { id: 1, musicBrainzId: 'rg-1', requests: [] };
      mockGetReleaseGroup.mockResolvedValue(album);
      mockFindOne.mockResolvedValue(localAlbum);

      const res = mockRes();
      await handler(mockReq({ params: { id: 'rg-1' } }), res);

      expect(res.json).toHaveBeenCalledWith({ ...album, media: localAlbum });
    });

    it('returns album with media: undefined when no local match', async () => {
      const album = { id: 'rg-1', title: 'Test Album' };
      mockGetReleaseGroup.mockResolvedValue(album);
      mockFindOne.mockResolvedValue(null);

      const res = mockRes();
      await handler(mockReq({ params: { id: 'rg-1' } }), res);

      expect(res.json).toHaveBeenCalledWith({ ...album, media: undefined });
    });

    it('returns 404 when not found', async () => {
      mockGetReleaseGroup.mockResolvedValue(null);

      const res = mockRes();
      await handler(mockReq({ params: { id: 'unknown' } }), res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Album not found' });
    });
  });

  describe('GET /:id/tracks', () => {
    const handler = handlers['GET /:id/tracks'];

    it('returns tracks', async () => {
      const tracks = [{ title: 'Track 1' }, { title: 'Track 2' }];
      mockGetTracks.mockResolvedValue(tracks);

      const res = mockRes();
      await handler(mockReq({ params: { id: 'rg-1' } }), res);

      expect(mockGetTracks).toHaveBeenCalledWith('rg-1');
      expect(res.json).toHaveBeenCalledWith({ results: tracks });
    });

    it('returns empty array', async () => {
      mockGetTracks.mockResolvedValue([]);

      const res = mockRes();
      await handler(mockReq({ params: { id: 'rg-1' } }), res);

      expect(res.json).toHaveBeenCalledWith({ results: [] });
    });
  });
});
