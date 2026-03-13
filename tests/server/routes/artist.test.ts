import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReq, mockRes } from './_testHelper';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { handlers, mockGetArtist, mockGetArtistAlbums, mockEnrichWithMedia } = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => any>,
  mockGetArtist: vi.fn(),
  mockGetArtistAlbums: vi.fn(),
  mockEnrichWithMedia: vi.fn(),
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
    getArtist: mockGetArtist,
    getArtistAlbums: mockGetArtistAlbums,
  },
}));

vi.mock('@server/lib/enrichMedia', () => ({
  enrichWithMedia: mockEnrichWithMedia,
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

await import('@server/routes/artist');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('routes/artist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /:id', () => {
    const handler = handlers['GET /:id'];

    it('returns artist', async () => {
      const artist = { id: 'abc-123', name: 'Test Artist' };
      mockGetArtist.mockResolvedValue(artist);

      const res = mockRes();
      await handler(mockReq({ params: { id: 'abc-123' } }), res);

      expect(mockGetArtist).toHaveBeenCalledWith('abc-123');
      expect(res.json).toHaveBeenCalledWith(artist);
    });

    it('returns 404 when not found', async () => {
      mockGetArtist.mockResolvedValue(null);

      const res = mockRes();
      await handler(mockReq({ params: { id: 'unknown' } }), res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Artist not found' });
    });
  });

  describe('GET /:id/albums', () => {
    const handler = handlers['GET /:id/albums'];

    it('returns enriched albums', async () => {
      const albums = [{ id: '1', title: 'Album 1' }];
      mockGetArtistAlbums.mockResolvedValue(albums);
      mockEnrichWithMedia.mockResolvedValue(albums);

      const res = mockRes();
      await handler(mockReq({ params: { id: 'abc-123' }, query: { limit: '10' } }), res);

      expect(mockGetArtistAlbums).toHaveBeenCalledWith('abc-123', 10);
      expect(mockEnrichWithMedia).toHaveBeenCalledWith(albums, 'music');
      expect(res.json).toHaveBeenCalledWith({ results: albums });
    });

    it('caps limit at 100', async () => {
      mockGetArtistAlbums.mockResolvedValue([]);
      mockEnrichWithMedia.mockResolvedValue([]);

      const res = mockRes();
      await handler(mockReq({ params: { id: 'abc-123' }, query: { limit: '500' } }), res);

      expect(mockGetArtistAlbums).toHaveBeenCalledWith('abc-123', 100);
    });

    it('defaults limit to 25', async () => {
      mockGetArtistAlbums.mockResolvedValue([]);
      mockEnrichWithMedia.mockResolvedValue([]);

      const res = mockRes();
      await handler(mockReq({ params: { id: 'abc-123' } }), res);

      expect(mockGetArtistAlbums).toHaveBeenCalledWith('abc-123', 25);
    });

    it('returns { results: [...] } shape', async () => {
      const enriched = [{ id: '1', title: 'A' }, { id: '2', title: 'B' }];
      mockGetArtistAlbums.mockResolvedValue([]);
      mockEnrichWithMedia.mockResolvedValue(enriched);

      const res = mockRes();
      await handler(mockReq({ params: { id: 'abc-123' } }), res);

      expect(res.json).toHaveBeenCalledWith({ results: enriched });
    });
  });
});
