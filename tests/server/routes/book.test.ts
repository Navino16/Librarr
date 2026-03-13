import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReq, mockRes } from './_testHelper';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  handlers,
  mockResolveWork,
  mockGetWork,
  mockGetAuthorBooks,
  mockGetSeriesBooks,
  mockGetInstance,
  mockWorkFindOne,
  mockEditionFind,
  mockRequestFind,
  mockWorkQb,
  mockRequestQb,
} = vi.hoisted(() => {
  const mockWorkQb: any = {};
  mockWorkQb.leftJoinAndSelect = vi.fn().mockReturnValue(mockWorkQb);
  mockWorkQb.where = vi.fn().mockReturnValue(mockWorkQb);
  mockWorkQb.getMany = vi.fn().mockResolvedValue([]);

  const mockRequestQb: any = {};
  mockRequestQb.leftJoinAndSelect = vi.fn().mockReturnValue(mockRequestQb);
  mockRequestQb.where = vi.fn().mockReturnValue(mockRequestQb);
  mockRequestQb.getMany = vi.fn().mockResolvedValue([]);

  return {
    handlers: {} as Record<string, (...args: any[]) => any>,
    mockResolveWork: vi.fn(),
    mockGetWork: vi.fn(),
    mockGetAuthorBooks: vi.fn(),
    mockGetSeriesBooks: vi.fn(),
    mockGetInstance: vi.fn(),
    mockWorkFindOne: vi.fn(),
    mockEditionFind: vi.fn(),
    mockRequestFind: vi.fn(),
    mockWorkQb,
    mockRequestQb,
  };
});

// Sentinel classes for getRepository dispatch
class MockWork {}
class MockEdition {}
class MockBookRequest {}
class MockUser {}

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
    resolveWork: mockResolveWork,
  })),
}));

vi.mock('@server/lib/search', () => ({
  getBookInfo: vi.fn(() => ({
    getWork: mockGetWork,
    getAuthorBooks: mockGetAuthorBooks,
    getSeriesBooks: mockGetSeriesBooks,
  })),
}));

vi.mock('@server/lib/settings', () => ({
  default: { getInstance: mockGetInstance },
}));

vi.mock('@server/datasource', () => ({
  default: {
    getRepository: vi.fn((entity: any) => {
      if (entity === MockWork) {
        return {
          findOne: mockWorkFindOne,
          createQueryBuilder: vi.fn().mockReturnValue(mockWorkQb),
        };
      }
      if (entity === MockEdition) {
        return { find: mockEditionFind };
      }
      if (entity === MockBookRequest) {
        return {
          find: mockRequestFind,
          createQueryBuilder: vi.fn().mockReturnValue(mockRequestQb),
        };
      }
      // MockUser — not used directly, but imported by the route
      return {};
    }),
  },
}));

vi.mock('@server/entity/Work', () => ({ Work: MockWork }));
vi.mock('@server/entity/Edition', () => ({ Edition: MockEdition }));
vi.mock('@server/entity/BookRequest', () => ({ BookRequest: MockBookRequest }));
vi.mock('@server/entity/User', () => ({ User: MockUser }));

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

await import('@server/routes/book');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultSettings(overrides: Record<string, any> = {}) {
  return {
    main: {
      hardcoverToken: 'tok123',
      ...overrides,
    },
  };
}

/** A minimal Work-like object returned by findOne */
function fakeWork(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    hardcoverId: 'hc-1',
    title: 'Test Book',
    status: 1,
    ebookAvailable: false,
    audiobookAvailable: false,
    hasEbookEdition: true,
    hasAudiobookEdition: false,
    authors: [],
    editions: [],
    availability: [],
    series: null,
    ...overrides,
  };
}

/** A minimal BookRequest-like object */
function fakeRequest(overrides: Record<string, any> = {}) {
  return {
    id: 100,
    status: 2,
    format: 'ebook',
    createdAt: new Date('2025-01-01'),
    requestedBy: { id: 5, username: 'testuser' },
    modifiedBy: null,
    work: { id: 1 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('routes/book', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-set chainable QB defaults after clearAllMocks
    mockWorkQb.leftJoinAndSelect.mockReturnValue(mockWorkQb);
    mockWorkQb.where.mockReturnValue(mockWorkQb);
    mockWorkQb.getMany.mockResolvedValue([]);
    mockRequestQb.leftJoinAndSelect.mockReturnValue(mockRequestQb);
    mockRequestQb.where.mockReturnValue(mockRequestQb);
    mockRequestQb.getMany.mockResolvedValue([]);
    // Default: no local work found, no requests
    mockWorkFindOne.mockResolvedValue(null);
    mockRequestFind.mockResolvedValue([]);
    mockEditionFind.mockResolvedValue([]);
    mockGetInstance.mockReturnValue(defaultSettings());
    // Default: resolveWork returns a Promise (null = not found); avoids .then() on undefined
    mockResolveWork.mockResolvedValue(null);
  });

  // =========================================================================
  // GET /:id
  // =========================================================================

  describe('GET /:id', () => {
    const handler = handlers['GET /:id'];

    it('returns local work by numeric ID', async () => {
      const work = fakeWork();
      const requests = [fakeRequest()];
      mockWorkFindOne.mockResolvedValue(work);
      mockRequestFind.mockResolvedValue(requests);

      const res = mockRes();
      await handler(mockReq({ params: { id: '1' }, user: { id: 5, permissions: 2, settings: { locale: 'en' } } }), res);

      expect(mockWorkFindOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          relations: ['authors', 'authors.author', 'editions', 'availability', 'series'],
        })
      );
      expect(mockRequestFind).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { work: { id: 1 } },
        })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Test Book', requests })
      );
    });

    it('fallback to hardcoverId when numeric ID not found', async () => {
      const work = fakeWork({ id: 7, hardcoverId: '42' });
      const requests = [fakeRequest({ work: { id: 7 } })];

      // First call: loadWorkWithRelations(42) → null
      // Second call: workRepo.findOne({ where: { hardcoverId: '42' } }) → work
      mockWorkFindOne
        .mockResolvedValueOnce(null) // loadWorkWithRelations(42)
        .mockResolvedValueOnce(work); // findOne by hardcoverId
      mockRequestFind.mockResolvedValue(requests);

      const res = mockRes();
      await handler(mockReq({ params: { id: '42' }, user: { id: 5, permissions: 2, settings: { locale: 'en' } } }), res);

      // Should have called findOne twice
      expect(mockWorkFindOne).toHaveBeenCalledTimes(2);
      expect(mockWorkFindOne).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ where: { hardcoverId: '42' } })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ id: 7, requests })
      );
    });

    it('fallback to external metadata when not found locally', async () => {
      // No local work at all
      mockWorkFindOne.mockResolvedValue(null);
      const metadata = { title: 'External Book', hardcoverId: 'ext-1' };
      mockResolveWork.mockResolvedValue(metadata);

      const res = mockRes();
      await handler(
        mockReq({ params: { id: '999' }, user: { settings: { locale: 'fr' } } }),
        res
      );

      expect(mockResolveWork).toHaveBeenCalledWith('999', 'fr');
      expect(res.json).toHaveBeenCalledWith({ metadata, work: null });
    });

    it('404 when external metadata returns null', async () => {
      mockWorkFindOne.mockResolvedValue(null);
      mockResolveWork.mockResolvedValue(null);

      const res = mockRes();
      await handler(mockReq({ params: { id: '999' } }), res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Book not found' });
    });

    it('non-numeric ID goes directly to hardcoverId lookup', async () => {
      const work = fakeWork({ hardcoverId: 'abc-def' });
      const requests = [fakeRequest()];
      mockWorkFindOne.mockResolvedValueOnce(work); // findOne by hardcoverId
      mockRequestFind.mockResolvedValue(requests);

      const res = mockRes();
      await handler(mockReq({ params: { id: 'abc-def' }, user: { id: 5, permissions: 2, settings: { locale: 'en' } } }), res);

      // parseInt('abc-def', 10) is NaN → skip loadWorkWithRelations
      // Go straight to hardcoverId lookup
      expect(mockWorkFindOne).toHaveBeenCalledTimes(1);
      expect(mockWorkFindOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { hardcoverId: 'abc-def' } })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ hardcoverId: 'abc-def', requests })
      );
    });

    it('uses default locale "en" when user has no locale setting', async () => {
      mockWorkFindOne.mockResolvedValue(null);
      mockResolveWork.mockResolvedValue(null);

      const res = mockRes();
      await handler(mockReq({ params: { id: 'unknown' } }), res);

      expect(mockResolveWork).toHaveBeenCalledWith('unknown', 'en');
    });
  });

  // =========================================================================
  // GET /:id/editions
  // =========================================================================

  describe('GET /:id/editions', () => {
    const handler = handlers['GET /:id/editions'];

    it('400 for invalid work ID (NaN)', async () => {
      const res = mockRes();
      await handler(mockReq({ params: { id: 'abc' } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid work ID' });
    });

    it('400 for id < 1', async () => {
      const res = mockRes();
      await handler(mockReq({ params: { id: '0' } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid work ID' });
    });

    it('returns editions', async () => {
      const editions = [
        { id: 1, isbn13: '9781234567890', format: 'ebook' },
        { id: 2, isbn13: '9780987654321', format: 'audiobook' },
      ];
      mockEditionFind.mockResolvedValue(editions);

      const res = mockRes();
      await handler(mockReq({ params: { id: '5' } }), res);

      expect(mockEditionFind).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { work: { id: 5 } },
          order: { createdAt: 'DESC' },
        })
      );
      expect(res.json).toHaveBeenCalledWith({ results: editions });
    });
  });

  // =========================================================================
  // GET /lookup/:hardcoverId
  // =========================================================================

  describe('GET /lookup/:hardcoverId', () => {
    const handler = handlers['GET /lookup/:hardcoverId'];

    it('returns metadata + local data when work exists locally', async () => {
      const work = fakeWork({
        id: 10,
        status: 3,
        ebookAvailable: true,
        audiobookAvailable: false,
        hasEbookEdition: true,
        hasAudiobookEdition: false,
        availability: [{ id: 1, source: 'audiobookshelf' }],
      });
      const requests = [
        fakeRequest({
          id: 200,
          status: 2,
          format: 'ebook',
          createdAt: new Date('2025-06-01'),
          requestedBy: { id: 5, username: 'alice' },
          work: { id: 10 },
        }),
      ];
      const metadata = { title: 'External Data', hardcoverId: 'hc-1' };

      mockWorkFindOne.mockResolvedValue(work);
      mockRequestFind.mockResolvedValue(requests);
      mockResolveWork.mockResolvedValue(metadata);

      const res = mockRes();
      await handler(
        mockReq({ params: { hardcoverId: 'hc-1' }, user: { id: 5, permissions: 2, settings: { locale: 'fr' } } }),
        res
      );

      expect(mockResolveWork).toHaveBeenCalledWith('hc-1', 'fr');
      const body = res.json.mock.calls[0][0];
      expect(body.metadata).toEqual(metadata);
      expect(body.work).toBeDefined();
      expect(body.work.id).toBe(10);
      expect(body.work.status).toBe(3);
      expect(body.work.ebookAvailable).toBe(true);
      expect(body.work.requests).toHaveLength(1);
      expect(body.work.requests[0].requestedBy.username).toBe('alice');
      expect(body.work.availability).toEqual([{ id: 1, source: 'audiobookshelf' }]);
    });

    it('404 when no metadata and no local work', async () => {
      mockWorkFindOne.mockResolvedValue(null);
      mockResolveWork.mockResolvedValue(null);

      const res = mockRes();
      await handler(mockReq({ params: { hardcoverId: 'nonexistent' }, user: { id: 5, permissions: 2, settings: { locale: 'en' } } }), res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Book not found' });
    });

    it('returns metadata only (work: null) when no local work', async () => {
      mockWorkFindOne.mockResolvedValue(null);
      const metadata = { title: 'Brand New Book' };
      mockResolveWork.mockResolvedValue(metadata);

      const res = mockRes();
      await handler(mockReq({ params: { hardcoverId: 'hc-new' }, user: { id: 5, permissions: 2, settings: { locale: 'en' } } }), res);

      expect(res.json).toHaveBeenCalledWith({ metadata, work: null });
    });

    it('returns local work when metadata null but work exists', async () => {
      const work = fakeWork({ id: 20 });
      const requests = [fakeRequest({ work: { id: 20 } })];
      mockWorkFindOne.mockResolvedValue(work);
      mockRequestFind.mockResolvedValue(requests);
      mockResolveWork.mockResolvedValue(null);

      const res = mockRes();
      await handler(mockReq({ params: { hardcoverId: 'hc-1' }, user: { id: 5, permissions: 2, settings: { locale: 'en' } } }), res);

      const body = res.json.mock.calls[0][0];
      expect(body.metadata).toBeNull();
      expect(body.work).toBeDefined();
      expect(body.work.id).toBe(20);
      expect(body.work.requests).toEqual(requests);
    });
  });

  // =========================================================================
  // GET /:id/similar
  // =========================================================================

  describe('GET /:id/similar', () => {
    const handler = handlers['GET /:id/similar'];

    it('503 when hardcoverToken not set', async () => {
      mockGetInstance.mockReturnValue(defaultSettings({ hardcoverToken: '' }));

      const res = mockRes();
      await handler(mockReq({ params: { id: '1' } }), res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({ error: 'Book metadata not configured' });
    });

    it('404 when book not found', async () => {
      mockGetWork.mockResolvedValue(null);

      const res = mockRes();
      await handler(mockReq({ params: { id: 'hc-unknown' } }), res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Book not found' });
    });

    it('returns similar books filtered by goodreadsId', async () => {
      const book = {
        title: 'Book A',
        authors: [{ id: 'author-1', name: 'Author One' }],
      };
      const authorBooks = {
        results: [
          { goodreadsId: 'hc-target', title: 'Book A' }, // same as target — should be filtered
          { goodreadsId: 'hc-other', title: 'Book B' },
        ],
      };

      mockGetWork.mockResolvedValue(book);
      mockGetAuthorBooks.mockResolvedValue(authorBooks);

      const res = mockRes();
      await handler(
        mockReq({ params: { id: 'hc-target' }, user: { settings: { locale: 'en' } } }),
        res
      );

      expect(mockGetAuthorBooks).toHaveBeenCalledWith('author-1', 1, 10, 'en');
      const body = res.json.mock.calls[0][0];
      // Only 'hc-other' remains after filtering out 'hc-target'
      expect(body.results).toHaveLength(1);
      expect(body.results[0].goodreadsId).toBe('hc-other');
    });

    it('returns empty when no authors', async () => {
      const book = { title: 'Authorless Book', authors: [] };
      mockGetWork.mockResolvedValue(book);

      const res = mockRes();
      await handler(mockReq({ params: { id: 'hc-1' } }), res);

      expect(res.json).toHaveBeenCalledWith({ results: [] });
    });

    it('resolves hardcoverId from local Work ID', async () => {
      const work = fakeWork({ id: 5, hardcoverId: 'resolved-hc' });
      mockWorkFindOne.mockResolvedValueOnce(work); // findOne by numeric id

      const book = { title: 'Resolved Book', authors: [] };
      mockGetWork.mockResolvedValue(book);

      const res = mockRes();
      await handler(mockReq({ params: { id: '5' } }), res);

      // Should have resolved to 'resolved-hc' and called getWork with it
      expect(mockGetWork).toHaveBeenCalledWith('resolved-hc', undefined);
    });

    it('falls back to hardcoverId field when numeric ID not found as Work', async () => {
      // First findOne by id → null, second findOne by hardcoverId → work with different hcId
      const work = fakeWork({ id: 10, hardcoverId: 'fallback-hc' });
      mockWorkFindOne
        .mockResolvedValueOnce(null) // findOne by id: 42
        .mockResolvedValueOnce(work); // findOne by hardcoverId: '42'

      const book = { title: 'Fallback Book', authors: [] };
      mockGetWork.mockResolvedValue(book);

      const res = mockRes();
      await handler(mockReq({ params: { id: '42' } }), res);

      expect(mockGetWork).toHaveBeenCalledWith('fallback-hc', undefined);
    });
  });

  // =========================================================================
  // GET /:id/series
  // =========================================================================

  describe('GET /:id/series', () => {
    const handler = handlers['GET /:id/series'];

    it('503 when hardcoverToken not set', async () => {
      mockGetInstance.mockReturnValue(defaultSettings({ hardcoverToken: '' }));

      const res = mockRes();
      await handler(mockReq({ params: { id: '1' } }), res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({ error: 'Book metadata not configured' });
    });

    it('returns series books with seriesName', async () => {
      const book = {
        title: 'Series Book 1',
        series: { id: 'series-1', name: 'Epic Series' },
      };
      const seriesBooks = [
        { goodreadsId: 'hc-s1', title: 'Series Book 1' },
        { goodreadsId: 'hc-s2', title: 'Series Book 2' },
      ];

      mockGetWork.mockResolvedValue(book);
      mockGetSeriesBooks.mockResolvedValue(seriesBooks);

      const res = mockRes();
      await handler(
        mockReq({ params: { id: 'hc-s1' }, user: { settings: { locale: 'fr' } } }),
        res
      );

      expect(mockGetSeriesBooks).toHaveBeenCalledWith('series-1', 'fr');
      const body = res.json.mock.calls[0][0];
      expect(body.seriesName).toBe('Epic Series');
      expect(body.results).toHaveLength(2);
    });

    it('returns empty when no series', async () => {
      mockGetWork.mockResolvedValue({ title: 'Standalone', series: null });

      const res = mockRes();
      await handler(mockReq({ params: { id: 'hc-1' } }), res);

      expect(res.json).toHaveBeenCalledWith({ results: [], seriesName: null });
    });

    it('returns empty when book not found', async () => {
      mockGetWork.mockResolvedValue(null);

      const res = mockRes();
      await handler(mockReq({ params: { id: 'hc-nope' } }), res);

      expect(res.json).toHaveBeenCalledWith({ results: [], seriesName: null });
    });

    it('resolves hardcoverId from local Work ID', async () => {
      const work = fakeWork({ id: 3, hardcoverId: 'series-hc' });
      mockWorkFindOne.mockResolvedValueOnce(work);

      mockGetWork.mockResolvedValue({ title: 'X', series: null });

      const res = mockRes();
      await handler(mockReq({ params: { id: '3' } }), res);

      expect(mockGetWork).toHaveBeenCalledWith('series-hc', undefined);
    });

    it('fallback to hardcoverId field when numeric ID not found as Work', async () => {
      const work = fakeWork({ id: 8, hardcoverId: 'fb-hc' });
      mockWorkFindOne
        .mockResolvedValueOnce(null) // findOne by id: 77
        .mockResolvedValueOnce(work); // findOne by hardcoverId: '77'

      mockGetWork.mockResolvedValue({ title: 'FB Book', series: null });

      const res = mockRes();
      await handler(mockReq({ params: { id: '77' } }), res);

      expect(mockGetWork).toHaveBeenCalledWith('fb-hc', undefined);
    });
  });

  // =========================================================================
  // enrichBookResults (tested indirectly via similar/series)
  // =========================================================================

  describe('enrichBookResults', () => {
    it('returns unenriched when no goodreadsIds', async () => {
      const book = { title: 'Book', authors: [{ id: 'a1' }] };
      const authorBooks = {
        results: [
          { title: 'Other Book' }, // no goodreadsId
        ],
      };

      mockGetWork.mockResolvedValue(book);
      mockGetAuthorBooks.mockResolvedValue(authorBooks);

      const res = mockRes();
      await handler_similar(
        mockReq({ params: { id: 'hc-x' }, user: { settings: {} } }),
        res
      );

      const body = res.json.mock.calls[0][0];
      expect(body.results).toHaveLength(1);
      // No DB calls for enrichment since no goodreadsIds
      expect(mockWorkQb.where).not.toHaveBeenCalled();
      expect(body.results[0].media).toBeUndefined();
    });

    it('returns unenriched on DB error', async () => {
      const book = { title: 'Book', authors: [{ id: 'a1' }] };
      const authorBooks = {
        results: [
          { goodreadsId: 'hc-fail', title: 'Failing Book' },
        ],
      };

      mockGetWork.mockResolvedValue(book);
      mockGetAuthorBooks.mockResolvedValue(authorBooks);
      mockWorkQb.getMany.mockRejectedValue(new Error('DB connection lost'));

      const res = mockRes();
      await handler_similar(
        mockReq({ params: { id: 'hc-x' }, user: { settings: {} } }),
        res
      );

      const body = res.json.mock.calls[0][0];
      // Should still return results, just without media enrichment
      expect(body.results).toHaveLength(1);
      expect(body.results[0].media).toBeUndefined();
    });

    it('enriches with local work data and requests', async () => {
      const book = {
        title: 'Book',
        authors: [{ id: 'a1' }],
        series: { id: 'ser-1', name: 'My Series' },
      };
      const seriesBooks = [
        { goodreadsId: 'hc-match', title: 'Matched Book' },
        { goodreadsId: 'hc-nomatch', title: 'Unmatched Book' },
      ];

      mockGetWork.mockResolvedValue(book);
      mockGetSeriesBooks.mockResolvedValue(seriesBooks);

      // enrichBookResults: workRepo.createQueryBuilder → finds one match
      mockWorkQb.getMany.mockResolvedValue([
        {
          id: 50,
          hardcoverId: 'hc-match',
          status: 1,
          ebookAvailable: true,
          audiobookAvailable: false,
          hasEbookEdition: true,
          hasAudiobookEdition: false,
        },
      ]);
      // enrichBookResults: requestRepo.createQueryBuilder → one request for work 50
      mockRequestQb.getMany.mockResolvedValue([
        { id: 300, status: 2, format: 'ebook', work: { id: 50 } },
      ]);

      const res = mockRes();
      // Use the series handler to exercise enrichBookResults
      await handler_series(
        mockReq({ params: { id: 'hc-1' }, user: { settings: { locale: 'en' } } }),
        res
      );

      const body = res.json.mock.calls[0][0];
      expect(body.results).toHaveLength(2);

      // First result matched a local Work
      const matched = body.results.find((r: any) => r.goodreadsId === 'hc-match');
      expect(matched.media).toBeDefined();
      expect(matched.media.id).toBe(50);
      expect(matched.media.status).toBe(1);
      expect(matched.media.ebookAvailable).toBe(true);
      expect(matched.media.requests).toHaveLength(1);
      expect(matched.media.requests[0]).toEqual({ id: 300, status: 2, format: 'ebook' });

      // Second result had no local match
      const unmatched = body.results.find((r: any) => r.goodreadsId === 'hc-nomatch');
      expect(unmatched.media).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Handler references for enrichBookResults tests
// ---------------------------------------------------------------------------

const handler_similar = handlers['GET /:id/similar'];
const handler_series = handlers['GET /:id/series'];
