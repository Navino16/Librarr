import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReq, mockRes } from './_testHelper';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  handlers,
  mockGetTrending,
  mockSearchAlbums,
  mockGetInstance,
  mockEnrichBookResults,
  mockGetLocalizedData,
  mockCreateQueryBuilder,
} = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => any>,
  mockGetTrending: vi.fn(),
  mockSearchAlbums: vi.fn(),
  mockGetInstance: vi.fn(),
  mockEnrichBookResults: vi.fn(),
  mockGetLocalizedData: vi.fn(),
  mockCreateQueryBuilder: vi.fn(),
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
  getBookInfo: vi.fn(() => ({
    getTrending: mockGetTrending,
    getLocalizedData: mockGetLocalizedData,
  })),
  musicBrainz: {
    searchAlbums: mockSearchAlbums,
  },
}));

vi.mock('@server/lib/settings', () => ({
  default: { getInstance: mockGetInstance },
}));

vi.mock('@server/routes/book', () => ({
  enrichBookResults: mockEnrichBookResults,
}));

vi.mock('@server/datasource', () => ({
  default: {
    getRepository: vi.fn(() => ({
      createQueryBuilder: mockCreateQueryBuilder,
    })),
  },
}));

vi.mock('@server/entity/BookRequest', () => ({
  BookRequest: class BookRequest {},
}));

vi.mock('@server/entity/Work', () => ({
  Work: class Work {},
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

await import('@server/routes/discover');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupSettings(overrides: Record<string, any> = {}) {
  mockGetInstance.mockReturnValue({
    main: {
      hardcoverToken: 'token',
      enableEbookRequests: true,
      enableAudiobookRequests: true,
      enableMusicRequests: true,
      ...overrides,
    },
  });
}

function setupQueryBuilder(results: any[] = []) {
  const qb: any = {};
  qb.leftJoinAndSelect = vi.fn().mockReturnValue(qb);
  qb.orderBy = vi.fn().mockReturnValue(qb);
  qb.take = vi.fn().mockReturnValue(qb);
  qb.where = vi.fn().mockReturnValue(qb);
  qb.getMany = vi.fn().mockResolvedValue(results);
  mockCreateQueryBuilder.mockReturnValue(qb);
  return qb;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('routes/discover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // GET /books
  // =========================================================================

  describe('GET /books', () => {
    const handler = handlers['GET /books'];

    it('returns empty when no hardcover token', async () => {
      setupSettings({ hardcoverToken: '' });

      const res = mockRes();
      await handler(mockReq({ user: { settings: {} } }), res);

      expect(res.json).toHaveBeenCalledWith({ results: [], page: 1, totalResults: 0 });
    });

    it('returns empty when both ebook and audiobook requests disabled', async () => {
      setupSettings({ enableEbookRequests: false, enableAudiobookRequests: false });

      const res = mockRes();
      await handler(mockReq({ user: { settings: {} } }), res);

      expect(res.json).toHaveBeenCalledWith({ results: [], page: 1, totalResults: 0 });
    });

    it('returns trending books enriched', async () => {
      setupSettings();
      const trending = { results: [{ goodreadsId: '123', title: 'Book 1' }], totalResults: 1 };
      const enriched = [{ goodreadsId: '123', title: 'Book 1', media: { status: 1 } }];
      mockGetTrending.mockResolvedValue(trending);
      mockEnrichBookResults.mockResolvedValue(enriched);

      const res = mockRes();
      await handler(mockReq({ user: { settings: {} } }), res);

      expect(mockGetTrending).toHaveBeenCalledWith(20, 1, undefined);
      expect(mockEnrichBookResults).toHaveBeenCalledWith(trending.results);
      expect(res.json).toHaveBeenCalledWith({ results: enriched, page: 1, totalResults: 1 });
    });

    it('passes page and locale params', async () => {
      setupSettings();
      mockGetTrending.mockResolvedValue({ results: [], totalResults: 0 });
      mockEnrichBookResults.mockResolvedValue([]);

      const res = mockRes();
      await handler(mockReq({ query: { page: '3' }, user: { settings: { locale: 'fr' } } }), res);

      expect(mockGetTrending).toHaveBeenCalledWith(20, 3, 'fr');
    });
  });

  // =========================================================================
  // GET /music
  // =========================================================================

  describe('GET /music', () => {
    const handler = handlers['GET /music'];

    it('returns empty when music requests disabled', async () => {
      setupSettings({ enableMusicRequests: false });

      const res = mockRes();
      await handler(mockReq(), res);

      expect(res.json).toHaveBeenCalledWith({ results: [], page: 1, totalResults: 0 });
    });

    it('returns albums', async () => {
      setupSettings();
      const albums = { results: [{ id: 'rg-1', title: 'Album' }], totalResults: 1 };
      mockSearchAlbums.mockResolvedValue(albums);

      const res = mockRes();
      await handler(mockReq(), res);

      expect(mockSearchAlbums).toHaveBeenCalledWith('*', 1, 20);
      expect(res.json).toHaveBeenCalledWith({ results: albums.results, page: 1, totalResults: 1 });
    });

    it('passes page param', async () => {
      setupSettings();
      mockSearchAlbums.mockResolvedValue({ results: [], totalResults: 0 });

      const res = mockRes();
      await handler(mockReq({ query: { page: '5' } }), res);

      expect(mockSearchAlbums).toHaveBeenCalledWith('*', 5, 20);
    });
  });

  // =========================================================================
  // GET /recent
  // =========================================================================

  describe('GET /recent', () => {
    const handler = handlers['GET /recent'];

    it('admin sees all requests (no where clause)', async () => {
      // Permission.ADMIN = 2 (bit flag), hasPermission checks bit
      // Admin user with permissions including ADMIN bit
      const qb = setupQueryBuilder([]);

      const res = mockRes();
      await handler(
        mockReq({
          user: { id: 1, permissions: 2, settings: {} },
        }),
        res
      );

      expect(qb.where).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ results: [] });
    });

    it('non-privileged user sees only own requests', async () => {
      // Non-admin users: all requests are fetched but requestedBy is stripped
      // from requests that don't belong to the user (done in JS, not SQL).
      const otherUsersRequest = {
        id: 1, format: 'ebook', status: 1,
        work: { id: 10, hardcoverId: null },
        requestedBy: { id: 99, username: 'other' },
        createdAt: new Date(),
      };
      const ownRequest = {
        id: 2, format: 'audiobook', status: 1,
        work: { id: 11, hardcoverId: null },
        requestedBy: { id: 5, username: 'me' },
        createdAt: new Date(),
      };
      const qb = setupQueryBuilder([otherUsersRequest, ownRequest]);

      const res = mockRes();
      await handler(
        mockReq({
          user: { id: 5, permissions: 0, settings: {} },
        }),
        res
      );

      // No SQL-level filtering — query fetches all, app strips requestedBy
      expect(qb.where).not.toHaveBeenCalled();
      const body = res.json.mock.calls[0][0];
      // Other user's request has requestedBy stripped
      const otherResult = body.results.find((r: any) => r.work.id === 10);
      expect(otherResult.request.requestedBy).toBeUndefined();
      // Own request keeps requestedBy
      const ownResult = body.results.find((r: any) => r.work.id === 11);
      expect(ownResult.request.requestedBy).toEqual({ id: 5, username: 'me' });
    });

    it('groups requests by work', async () => {
      const work1 = { id: 10, hardcoverId: null };
      const requests = [
        { id: 1, format: 'ebook', status: 1, work: work1, requestedBy: { id: 1, username: 'u1' }, createdAt: new Date() },
        { id: 2, format: 'audiobook', status: 2, work: work1, requestedBy: { id: 2, username: 'u2' }, createdAt: new Date() },
      ];
      setupQueryBuilder(requests);

      const res = mockRes();
      await handler(
        mockReq({
          user: { id: 1, permissions: 2, settings: {} },
        }),
        res
      );

      const result = res.json.mock.calls[0][0];
      expect(result.results).toHaveLength(1);
      expect(result.results[0].requests).toHaveLength(2);
      expect(result.results[0].type).toBe('book');
    });

    it('localizes work titles when locale is set', async () => {
      const work = { id: 10, hardcoverId: 'hc-1', title: 'English Title', coverUrl: '/en.jpg' };
      const requests = [
        { id: 1, format: 'ebook', status: 1, work, requestedBy: { id: 1, username: 'u1' }, createdAt: new Date() },
      ];
      setupQueryBuilder(requests);

      mockGetLocalizedData.mockResolvedValue(
        new Map([['hc-1', { title: 'Titre Francais', coverUrl: '/fr.jpg' }]])
      );

      const res = mockRes();
      await handler(
        mockReq({
          user: { id: 1, permissions: 2, settings: { locale: 'fr' } },
        }),
        res
      );

      const result = res.json.mock.calls[0][0];
      expect(result.results[0].work.title).toBe('Titre Francais');
      expect(result.results[0].work.coverUrl).toBe('/fr.jpg');
    });

    it('returns empty results', async () => {
      setupQueryBuilder([]);

      const res = mockRes();
      await handler(
        mockReq({
          user: { id: 1, permissions: 2, settings: {} },
        }),
        res
      );

      expect(res.json).toHaveBeenCalledWith({ results: [] });
    });
  });
});
