import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReq, mockRes } from './_testHelper';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  handlers,
  mockGetAuthor,
  mockGetAuthorBooks,
  mockGetInstance,
  mockAuthorFindOne,
  mockEnrichBookResults,
} = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => any>,
  mockGetAuthor: vi.fn(),
  mockGetAuthorBooks: vi.fn(),
  mockGetInstance: vi.fn(),
  mockAuthorFindOne: vi.fn(),
  mockEnrichBookResults: vi.fn(),
}));

// Sentinel class for getRepository dispatch
class MockAuthor {}

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
    getAuthor: mockGetAuthor,
    getAuthorBooks: mockGetAuthorBooks,
  })),
}));

vi.mock('@server/lib/settings', () => ({
  default: { getInstance: mockGetInstance },
}));

vi.mock('@server/datasource', () => ({
  default: {
    getRepository: vi.fn((entity: any) => {
      if (entity === MockAuthor) {
        return { findOne: mockAuthorFindOne };
      }
      return {};
    }),
  },
}));

vi.mock('@server/entity/Author', () => ({ Author: MockAuthor }));

vi.mock('@server/routes/book', () => ({
  enrichBookResults: mockEnrichBookResults,
}));

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

await import('@server/routes/author');

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

/** A minimal local Author-like object returned by findOne */
function fakeLocalAuthor(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    hardcoverId: 'hc-author-1',
    name: 'Local Author',
    bio: 'Local bio',
    photoUrl: 'http://local/photo.jpg',
    sourceUrl: 'http://local/source',
    works: [
      { work: { id: 10, title: 'Work A' } },
      { work: { id: 20, title: 'Work B' } },
    ],
    ...overrides,
  };
}

/** A minimal external author returned by getAuthor */
function fakeExternalAuthor(overrides: Record<string, any> = {}) {
  return {
    goodreadsId: 'hc-author-1',
    name: 'External Author',
    bio: 'External bio',
    photoUrl: 'http://external/photo.jpg',
    sourceUrl: 'http://external/source',
    topBooks: [{ title: 'Top Book 1' }, { title: 'Top Book 2' }],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('routes/author', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthorFindOne.mockResolvedValue(null);
    mockGetInstance.mockReturnValue(defaultSettings());
  });

  // =========================================================================
  // GET /:id
  // =========================================================================

  describe('GET /:id', () => {
    const handler = handlers['GET /:id'];

    it('503 when hardcoverToken not set', async () => {
      mockGetInstance.mockReturnValue(defaultSettings({ hardcoverToken: '' }));

      const res = mockRes();
      await handler(mockReq({ params: { id: '1' } }), res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({ error: 'Book metadata not configured' });
    });

    it('returns local author enriched with external metadata (numeric ID)', async () => {
      const localAuthor = fakeLocalAuthor();
      const externalAuthor = fakeExternalAuthor();
      mockAuthorFindOne.mockResolvedValue(localAuthor);
      mockGetAuthor.mockResolvedValue(externalAuthor);

      const res = mockRes();
      await handler(
        mockReq({ params: { id: '1' }, user: { settings: { locale: 'fr' } } }),
        res
      );

      // Should look up local author by numeric ID
      expect(mockAuthorFindOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          relations: ['works', 'works.work'],
        })
      );
      // Should fetch external author using local author's hardcoverId
      expect(mockGetAuthor).toHaveBeenCalledWith('hc-author-1', 'fr');

      const body = res.json.mock.calls[0][0];
      expect(body.id).toBe(1);
      expect(body.hardcoverId).toBe('hc-author-1');
      expect(body.name).toBe('Local Author');
      // External metadata takes priority
      expect(body.bio).toBe('External bio');
      expect(body.photoUrl).toBe('http://external/photo.jpg');
      expect(body.sourceUrl).toBe('http://external/source');
      expect(body.works).toEqual([
        { id: 10, title: 'Work A' },
        { id: 20, title: 'Work B' },
      ]);
      expect(body.topBooks).toEqual(externalAuthor.topBooks);
    });

    it('uses local author fallback fields when external returns null fields', async () => {
      const localAuthor = fakeLocalAuthor({
        bio: 'Fallback bio',
        photoUrl: 'http://fallback/photo.jpg',
        sourceUrl: 'http://fallback/source',
      });
      // External author exists but has null/empty fields
      const externalAuthor = fakeExternalAuthor({
        bio: null,
        photoUrl: null,
        sourceUrl: null,
        topBooks: [],
      });
      mockAuthorFindOne.mockResolvedValue(localAuthor);
      mockGetAuthor.mockResolvedValue(externalAuthor);

      const res = mockRes();
      await handler(mockReq({ params: { id: '1' } }), res);

      const body = res.json.mock.calls[0][0];
      // Should fall back to local author fields
      expect(body.bio).toBe('Fallback bio');
      expect(body.photoUrl).toBe('http://fallback/photo.jpg');
      expect(body.sourceUrl).toBe('http://fallback/source');
      expect(body.topBooks).toEqual([]);
    });

    it('uses local author fallback fields when external returns null', async () => {
      const localAuthor = fakeLocalAuthor({
        bio: 'Fallback bio',
        photoUrl: 'http://fallback/photo.jpg',
        sourceUrl: 'http://fallback/source',
      });
      // External author call returns null entirely
      mockAuthorFindOne.mockResolvedValue(localAuthor);
      mockGetAuthor.mockResolvedValue(null);

      const res = mockRes();
      await handler(mockReq({ params: { id: '1' } }), res);

      const body = res.json.mock.calls[0][0];
      expect(body.bio).toBe('Fallback bio');
      expect(body.photoUrl).toBe('http://fallback/photo.jpg');
      expect(body.sourceUrl).toBe('http://fallback/source');
      expect(body.topBooks).toEqual([]);
    });

    it('filters out null works from local author', async () => {
      const localAuthor = fakeLocalAuthor({
        works: [
          { work: { id: 10, title: 'Work A' } },
          { work: null }, // should be filtered out
          { work: { id: 30, title: 'Work C' } },
        ],
      });
      mockAuthorFindOne.mockResolvedValue(localAuthor);
      mockGetAuthor.mockResolvedValue(fakeExternalAuthor());

      const res = mockRes();
      await handler(mockReq({ params: { id: '1' } }), res);

      const body = res.json.mock.calls[0][0];
      expect(body.works).toEqual([
        { id: 10, title: 'Work A' },
        { id: 30, title: 'Work C' },
      ]);
    });

    it('404 when not found locally and not found externally (non-numeric ID)', async () => {
      mockGetAuthor.mockResolvedValue(null);

      const res = mockRes();
      await handler(mockReq({ params: { id: 'unknown-hc-id' } }), res);

      expect(mockGetAuthor).toHaveBeenCalledWith('unknown-hc-id', undefined);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Author not found' });
    });

    it('returns external author with local data by hardcoverId', async () => {
      const externalAuthor = fakeExternalAuthor({
        goodreadsId: 'hc-ext-1',
        name: 'External Name',
        bio: 'External bio',
        photoUrl: 'http://ext/photo.jpg',
        sourceUrl: 'http://ext/source',
        topBooks: [{ title: 'Top 1' }],
      });
      const localByHardcover = fakeLocalAuthor({
        id: 5,
        hardcoverId: 'hc-ext-1',
        works: [{ work: { id: 99, title: 'Local Work' } }],
      });
      mockGetAuthor.mockResolvedValue(externalAuthor);
      // First call for numeric lookup returns null (non-numeric ID skips this)
      // getRepository.findOne for hardcoverId lookup
      mockAuthorFindOne.mockResolvedValue(localByHardcover);

      const res = mockRes();
      await handler(mockReq({ params: { id: 'hc-ext-1' } }), res);

      // Should have looked up by hardcoverId
      expect(mockAuthorFindOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { hardcoverId: 'hc-ext-1' },
          relations: ['works', 'works.work'],
        })
      );

      const body = res.json.mock.calls[0][0];
      expect(body.id).toBe(5);
      expect(body.hardcoverId).toBe('hc-ext-1');
      expect(body.name).toBe('External Name');
      expect(body.bio).toBe('External bio');
      expect(body.works).toEqual([{ id: 99, title: 'Local Work' }]);
      expect(body.topBooks).toEqual([{ title: 'Top 1' }]);
    });

    it('returns external author without local match', async () => {
      const externalAuthor = fakeExternalAuthor({
        goodreadsId: 'hc-new',
        name: 'New Author',
        bio: 'New bio',
        photoUrl: 'http://new/photo.jpg',
        sourceUrl: 'http://new/source',
        topBooks: [{ title: 'New Top Book' }],
      });
      mockGetAuthor.mockResolvedValue(externalAuthor);
      // No local match by hardcoverId
      mockAuthorFindOne.mockResolvedValue(null);

      const res = mockRes();
      await handler(mockReq({ params: { id: 'hc-new' } }), res);

      const body = res.json.mock.calls[0][0];
      expect(body.id).toBeUndefined();
      expect(body.hardcoverId).toBe('hc-new');
      expect(body.name).toBe('New Author');
      expect(body.bio).toBe('New bio');
      expect(body.works).toEqual([]);
      expect(body.topBooks).toEqual([{ title: 'New Top Book' }]);
    });

    it('passes user locale to external API', async () => {
      const localAuthor = fakeLocalAuthor();
      mockAuthorFindOne.mockResolvedValue(localAuthor);
      mockGetAuthor.mockResolvedValue(fakeExternalAuthor());

      const res = mockRes();
      await handler(
        mockReq({ params: { id: '1' }, user: { settings: { locale: 'de' } } }),
        res
      );

      expect(mockGetAuthor).toHaveBeenCalledWith('hc-author-1', 'de');
    });
  });

  // =========================================================================
  // GET /:id/books
  // =========================================================================

  describe('GET /:id/books', () => {
    const handler = handlers['GET /:id/books'];

    it('503 when hardcoverToken not set', async () => {
      mockGetInstance.mockReturnValue(defaultSettings({ hardcoverToken: '' }));

      const res = mockRes();
      await handler(mockReq({ params: { id: '1' } }), res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({ error: 'Book metadata not configured' });
    });

    it('returns enriched books with pagination', async () => {
      const rawResults = [{ title: 'Book A' }, { title: 'Book B' }];
      const enrichedResults = [
        { title: 'Book A', media: { id: 1 } },
        { title: 'Book B', media: { id: 2 } },
      ];
      mockGetAuthorBooks.mockResolvedValue({
        results: rawResults,
        totalResults: 50,
      });
      mockEnrichBookResults.mockResolvedValue(enrichedResults);

      const res = mockRes();
      await handler(
        mockReq({
          params: { id: 'hc-author-1' },
          query: { page: '2', limit: '10' },
          user: { settings: { locale: 'en' } },
        }),
        res
      );

      expect(mockGetAuthorBooks).toHaveBeenCalledWith('hc-author-1', 2, 10, 'en');
      expect(mockEnrichBookResults).toHaveBeenCalledWith(rawResults);
      expect(res.json).toHaveBeenCalledWith({
        results: enrichedResults,
        page: 2,
        totalResults: 50,
      });
    });

    it('resolves hardcoverAuthorId from local Author (numeric ID)', async () => {
      const localAuthor = { id: 5, hardcoverId: 'resolved-hc-id' };
      mockAuthorFindOne.mockResolvedValue(localAuthor);
      mockGetAuthorBooks.mockResolvedValue({ results: [], totalResults: 0 });
      mockEnrichBookResults.mockResolvedValue([]);

      const res = mockRes();
      await handler(
        mockReq({ params: { id: '5' }, query: {} }),
        res
      );

      // Should have resolved the local author
      expect(mockAuthorFindOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 5 } })
      );
      // Should use the resolved hardcoverId for the API call
      expect(mockGetAuthorBooks).toHaveBeenCalledWith('resolved-hc-id', 1, 20, undefined);
    });

    it('uses idStr as hardcoverAuthorId when not numeric', async () => {
      mockGetAuthorBooks.mockResolvedValue({ results: [], totalResults: 0 });
      mockEnrichBookResults.mockResolvedValue([]);

      const res = mockRes();
      await handler(
        mockReq({ params: { id: 'string-hc-id' }, query: {} }),
        res
      );

      // parseId('string-hc-id') returns null, so no DB lookup
      expect(mockAuthorFindOne).not.toHaveBeenCalled();
      expect(mockGetAuthorBooks).toHaveBeenCalledWith('string-hc-id', 1, 20, undefined);
    });

    it('uses idStr when numeric but local author not found', async () => {
      mockAuthorFindOne.mockResolvedValue(null);
      mockGetAuthorBooks.mockResolvedValue({ results: [], totalResults: 0 });
      mockEnrichBookResults.mockResolvedValue([]);

      const res = mockRes();
      await handler(
        mockReq({ params: { id: '42' }, query: {} }),
        res
      );

      // Local lookup returns null, so hardcoverAuthorId stays as '42'
      expect(mockGetAuthorBooks).toHaveBeenCalledWith('42', 1, 20, undefined);
    });

    it('clamps limit to 100', async () => {
      mockGetAuthorBooks.mockResolvedValue({ results: [], totalResults: 0 });
      mockEnrichBookResults.mockResolvedValue([]);

      const res = mockRes();
      await handler(
        mockReq({ params: { id: 'hc-1' }, query: { limit: '999' } }),
        res
      );

      // Math.min(999, 100) = 100
      expect(mockGetAuthorBooks).toHaveBeenCalledWith('hc-1', 1, 100, undefined);
    });

    it('defaults page to 1 and limit to 20', async () => {
      mockGetAuthorBooks.mockResolvedValue({ results: [], totalResults: 0 });
      mockEnrichBookResults.mockResolvedValue([]);

      const res = mockRes();
      await handler(
        mockReq({ params: { id: 'hc-1' }, query: {} }),
        res
      );

      expect(mockGetAuthorBooks).toHaveBeenCalledWith('hc-1', 1, 20, undefined);
    });

    it('enforces page minimum of 1', async () => {
      mockGetAuthorBooks.mockResolvedValue({ results: [], totalResults: 0 });
      mockEnrichBookResults.mockResolvedValue([]);

      const res = mockRes();
      await handler(
        mockReq({ params: { id: 'hc-1' }, query: { page: '0' } }),
        res
      );

      // Math.max(1, 0) = 1 — but safeInt('0', 1) returns 0, then Math.max(1, 0) = 1
      expect(mockGetAuthorBooks).toHaveBeenCalledWith('hc-1', 1, 20, undefined);
    });
  });
});
