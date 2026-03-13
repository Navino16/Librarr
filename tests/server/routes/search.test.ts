import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReq, mockRes } from './_testHelper';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  handlers,
  mockSearch,
  mockSearchAlbums,
  mockGetInstance,
  mockWorkQb,
  mockRequestQb,
} = vi.hoisted(() => {
  const mockWorkQb: any = {};
  mockWorkQb.where = vi.fn().mockReturnValue(mockWorkQb);
  mockWorkQb.getMany = vi.fn().mockResolvedValue([]);

  const mockRequestQb: any = {};
  mockRequestQb.leftJoinAndSelect = vi.fn().mockReturnValue(mockRequestQb);
  mockRequestQb.where = vi.fn().mockReturnValue(mockRequestQb);
  mockRequestQb.getMany = vi.fn().mockResolvedValue([]);

  return {
    handlers: {} as Record<string, (...args: any[]) => any>,
    mockSearch: vi.fn().mockResolvedValue([]),
    mockSearchAlbums: vi.fn().mockResolvedValue({ results: [], totalResults: 0 }),
    mockGetInstance: vi.fn(),
    mockWorkQb,
    mockRequestQb,
  };
});

// Sentinel classes for getRepository dispatch
class MockWork {}
class MockBookRequest {}

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

vi.mock('@server/lib/metadataResolverInstance', () => ({
  getMetadataResolver: vi.fn(() => ({
    search: mockSearch,
  })),
}));

vi.mock('@server/lib/search', () => ({
  musicBrainz: {
    searchAlbums: mockSearchAlbums,
  },
}));

vi.mock('@server/lib/settings', () => ({
  default: { getInstance: mockGetInstance },
}));

vi.mock('@server/datasource', () => ({
  default: {
    getRepository: vi.fn((entity: any) => {
      if (entity === MockWork) {
        return { createQueryBuilder: vi.fn().mockReturnValue(mockWorkQb) };
      }
      return { createQueryBuilder: vi.fn().mockReturnValue(mockRequestQb) };
    }),
  },
}));

vi.mock('@server/entity/Work', () => ({ Work: MockWork }));
vi.mock('@server/entity/BookRequest', () => ({ BookRequest: MockBookRequest }));
vi.mock('@server/models/Music', () => ({}));

vi.mock('@server/middleware/auth', () => ({
  isAuthenticated: vi.fn((_req: any, _res: any, next: any) => next()),
}));

vi.mock('@server/middleware/asyncHandler', () => ({
  asyncHandler: vi.fn((fn: (...args: any[]) => any) => fn),
}));

vi.mock('@server/logger', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

await import('@server/routes/search');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultSettings(overrides: Record<string, any> = {}) {
  return {
    main: {
      enableEbookRequests: true,
      enableAudiobookRequests: true,
      enableMusicRequests: true,
      hardcoverToken: 'tok123',
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('routes/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-set defaults after clearAllMocks
    mockWorkQb.where.mockReturnValue(mockWorkQb);
    mockWorkQb.getMany.mockResolvedValue([]);
    mockRequestQb.leftJoinAndSelect.mockReturnValue(mockRequestQb);
    mockRequestQb.where.mockReturnValue(mockRequestQb);
    mockRequestQb.getMany.mockResolvedValue([]);
    mockSearch.mockResolvedValue([]);
    mockSearchAlbums.mockResolvedValue({ results: [], totalResults: 0 });
    mockGetInstance.mockReturnValue(defaultSettings());
  });

  const handler = handlers['GET /'];

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  describe('validation', () => {
    it('400 when query missing', async () => {
      const res = mockRes();
      await handler(mockReq({ query: {}, user: { id: 1 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('400 when query > 500 chars', async () => {
      const res = mockRes();
      await handler(mockReq({ query: { query: 'a'.repeat(501) }, user: { id: 1 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  // -------------------------------------------------------------------------
  // Feature flags
  // -------------------------------------------------------------------------

  describe('feature flags', () => {
    it('empty results when both book + music disabled', async () => {
      mockGetInstance.mockReturnValue(defaultSettings({
        enableEbookRequests: false,
        enableAudiobookRequests: false,
        enableMusicRequests: false,
      }));
      const res = mockRes();
      await handler(mockReq({ query: { query: 'test' }, user: { id: 1 } }), res);

      expect(mockSearch).not.toHaveBeenCalled();
      expect(mockSearchAlbums).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ results: [], totalResults: 0 }));
    });

    it('book search only when music disabled', async () => {
      mockGetInstance.mockReturnValue(defaultSettings({ enableMusicRequests: false }));
      mockSearch.mockResolvedValue([{ hardcoverId: 'hc1', title: 'Book' }]);
      const res = mockRes();
      await handler(mockReq({ query: { query: 'test' }, user: { id: 1 } }), res);

      expect(mockSearch).toHaveBeenCalled();
      expect(mockSearchAlbums).not.toHaveBeenCalled();
    });

    it('music search only when books disabled', async () => {
      mockGetInstance.mockReturnValue(defaultSettings({
        enableEbookRequests: false,
        enableAudiobookRequests: false,
      }));
      mockSearchAlbums.mockResolvedValue({ results: [{ id: 'mb1' }], totalResults: 1 });
      const res = mockRes();
      await handler(mockReq({ query: { query: 'test' }, user: { id: 1 } }), res);

      expect(mockSearch).not.toHaveBeenCalled();
      expect(mockSearchAlbums).toHaveBeenCalled();
    });

    it('books disabled when no hardcoverToken', async () => {
      mockGetInstance.mockReturnValue(defaultSettings({ hardcoverToken: '' }));
      const res = mockRes();
      await handler(mockReq({ query: { query: 'test' }, user: { id: 1 } }), res);

      expect(mockSearch).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Book search
  // -------------------------------------------------------------------------

  describe('book search', () => {
    it('returns enriched book results', async () => {
      mockSearch.mockResolvedValue([
        { hardcoverId: 'hc1', title: 'Book 1' },
      ]);
      mockWorkQb.getMany.mockResolvedValue([
        { id: 10, hardcoverId: 'hc1', status: 1, ebookAvailable: true, audiobookAvailable: false, hasEbookEdition: true, hasAudiobookEdition: false },
      ]);
      mockRequestQb.getMany.mockResolvedValue([
        { id: 100, status: 2, format: 'ebook', work: { id: 10 } },
      ]);

      const res = mockRes();
      await handler(mockReq({ query: { query: 'book', type: 'book' }, user: { id: 1 } }), res);

      const body = res.json.mock.calls[0][0];
      expect(body.results).toHaveLength(1);
      expect(body.results[0].type).toBe('book');
      expect(body.results[0].book.work).toBeDefined();
      expect(body.results[0].book.work.id).toBe(10);
      expect(body.results[0].book.work.requests).toHaveLength(1);
    });

    it('catches book search error, returns music only', async () => {
      mockSearch.mockRejectedValue(new Error('API down'));
      mockSearchAlbums.mockResolvedValue({ results: [{ id: 'mb1' }], totalResults: 1 });
      const res = mockRes();
      await handler(mockReq({ query: { query: 'test' }, user: { id: 1 } }), res);

      const body = res.json.mock.calls[0][0];
      expect(body.results).toHaveLength(1);
      expect(body.results[0].type).toBe('music');
    });
  });

  // -------------------------------------------------------------------------
  // Music search
  // -------------------------------------------------------------------------

  describe('music search', () => {
    it('limit 10 when type=all, 20 when type=music', async () => {
      // type=all → limit 10
      mockSearchAlbums.mockResolvedValue({ results: [], totalResults: 0 });
      const res1 = mockRes();
      await handler(mockReq({ query: { query: 'test', type: 'all' }, user: { id: 1 } }), res1);
      expect(mockSearchAlbums).toHaveBeenCalledWith('test', 1, 10);

      vi.clearAllMocks();
      mockSearch.mockResolvedValue([]);
      mockSearchAlbums.mockResolvedValue({ results: [], totalResults: 0 });
      mockGetInstance.mockReturnValue(defaultSettings());
      mockWorkQb.where.mockReturnValue(mockWorkQb);
      mockWorkQb.getMany.mockResolvedValue([]);
      mockRequestQb.leftJoinAndSelect.mockReturnValue(mockRequestQb);
      mockRequestQb.where.mockReturnValue(mockRequestQb);
      mockRequestQb.getMany.mockResolvedValue([]);

      // type=music → limit 20
      const res2 = mockRes();
      await handler(mockReq({ query: { query: 'test', type: 'music' }, user: { id: 1 } }), res2);
      expect(mockSearchAlbums).toHaveBeenCalledWith('test', 1, 20);
    });

    it('catches music search error, returns books only', async () => {
      mockSearch.mockResolvedValue([{ hardcoverId: 'hc1', title: 'Book' }]);
      mockSearchAlbums.mockRejectedValue(new Error('MB down'));
      const res = mockRes();
      await handler(mockReq({ query: { query: 'test' }, user: { id: 1 } }), res);

      const body = res.json.mock.calls[0][0];
      expect(body.results.every((r: any) => r.type === 'book')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Combined / enrichment
  // -------------------------------------------------------------------------

  describe('combined results and enrichment', () => {
    it('mixed book + music results with correct totalResults/totalPages', async () => {
      mockSearch.mockResolvedValue([
        { hardcoverId: 'hc1', title: 'Book' },
      ]);
      mockSearchAlbums.mockResolvedValue({
        results: [{ id: 'mb1', title: 'Album' }],
        totalResults: 5,
      });
      const res = mockRes();
      await handler(mockReq({ query: { query: 'test' }, user: { id: 1 } }), res);

      const body = res.json.mock.calls[0][0];
      expect(body.results).toHaveLength(2);
      expect(body.totalResults).toBe(6); // 1 book + 5 music
      expect(body.totalPages).toBe(1);
    });

    it('enrichment returns unenriched when no hardcoverIds', async () => {
      mockSearch.mockResolvedValue([
        { title: 'No HC ID Book' }, // no hardcoverId
      ]);
      const res = mockRes();
      await handler(mockReq({ query: { query: 'test', type: 'book' }, user: { id: 1 } }), res);

      const body = res.json.mock.calls[0][0];
      expect(body.results).toHaveLength(1);
      expect(body.results[0].book.work).toBeUndefined();
    });

    it('enrichment returns unenriched on error', async () => {
      mockSearch.mockResolvedValue([
        { hardcoverId: 'hc1', title: 'Book' },
      ]);
      // Make workQb.getMany throw
      mockWorkQb.getMany.mockRejectedValue(new Error('DB error'));
      const res = mockRes();
      await handler(mockReq({ query: { query: 'test', type: 'book' }, user: { id: 1 } }), res);

      const body = res.json.mock.calls[0][0];
      expect(body.results).toHaveLength(1);
      expect(body.results[0].book.work).toBeUndefined();
    });

    it('no matching local works returns unenriched', async () => {
      mockSearch.mockResolvedValue([
        { hardcoverId: 'hc999', title: 'Unknown Book' },
      ]);
      mockWorkQb.getMany.mockResolvedValue([]); // no matching works
      const res = mockRes();
      await handler(mockReq({ query: { query: 'test', type: 'book' }, user: { id: 1 } }), res);

      const body = res.json.mock.calls[0][0];
      expect(body.results).toHaveLength(1);
      expect(body.results[0].book.work).toBeUndefined();
    });
  });
});
