import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReq, mockRes } from './_testHelper';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  handlers,
  mockGetInstance,
  mockWorkRepo,
  mockBookRequestRepo,
} = vi.hoisted(() => {
  const mockWorkRepo = {
    findOne: vi.fn(),
  };
  const mockBookRequestRepo = {
    find: vi.fn(),
    save: vi.fn(),
  };
  return {
    handlers: {} as Record<string, (...args: any[]) => any>,
    mockGetInstance: vi.fn(),
    mockWorkRepo,
    mockBookRequestRepo,
  };
});

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

vi.mock('typeorm', () => ({
  In: vi.fn((arr: any) => arr),
}));

vi.mock('@server/datasource', () => ({
  default: {
    getRepository: vi.fn((entity: any) => {
      if (entity === (Work as any)) return mockWorkRepo;
      if (entity === (BookRequest as any)) return mockBookRequestRepo;
      return {};
    }),
  },
}));

// Lazy references for entity matching — resolved after import
let Work: any;
let BookRequest: any;

vi.mock('@server/entity/Work', () => {
  const W = class Work {};
  Work = W;
  return { Work: W };
});

vi.mock('@server/entity/BookRequest', () => {
  const BR = class BookRequest {};
  BookRequest = BR;
  return { BookRequest: BR };
});

vi.mock('@server/constants/work', async (importOriginal) => {
  return await importOriginal();
});

vi.mock('@server/lib/settings', () => ({
  default: { getInstance: mockGetInstance },
  ReadarrSettings: {},
}));

vi.mock('@server/middleware/asyncHandler', () => ({
  asyncHandler: vi.fn((fn: (...args: any[]) => any) => fn),
}));

vi.mock('@server/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

await import('@server/routes/webhook');

// Re-wire dataSource getRepository now that entity classes are resolved
const dataSourceMod = await import('@server/datasource');
(dataSourceMod.default.getRepository as any) = vi.fn((entity: any) => {
  if (entity === Work) return mockWorkRepo;
  if (entity === BookRequest) return mockBookRequestRepo;
  return {};
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WEBHOOK_SECRET = 'test-webhook-secret-for-hmac';

function setupSettings(overrides: Record<string, any> = {}) {
  const base = {
    webhookSecret: WEBHOOK_SECRET,
    main: { applicationUrl: 'http://localhost:5055' },
    readarr: [],
    save: vi.fn(),
    ...overrides,
  };
  mockGetInstance.mockReturnValue(base);
  return base;
}

function makeReadarrPayload(overrides: Partial<{
  eventType: string;
  book: { id: number; title: string; foreignBookId: string } | undefined;
  bookFile: { id: number; path: string } | undefined;
  downloadClient: string;
  downloadId: string;
  message: string;
}> = {}) {
  return {
    eventType: 'Grab',
    book: { id: 1, title: 'Test Book', foreignBookId: 'hc-123' },
    ...overrides,
  };
}

function makeWork(overrides: Record<string, any> = {}) {
  return { id: 42, title: 'Test Work', hardcoverId: 'hc-123', ...overrides };
}

function makeRequest(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    downloadStatus: null,
    downloadProgress: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('routes/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // POST /readarr
  // =========================================================================

  describe('POST /readarr', () => {
    const handler = handlers['POST /readarr'];

    it('returns 401 for invalid token', async () => {
      setupSettings();

      const req = mockReq({
        query: { token: 'wrong-token' },
        body: makeReadarrPayload(),
      });
      const res = mockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid webhook token' });
    });

    it('returns 401 when token query param is missing', async () => {
      setupSettings();

      const req = mockReq({
        query: {},
        body: makeReadarrPayload(),
      });
      const res = mockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid webhook token' });
    });

    it('returns 200 ignored when book.foreignBookId is missing', async () => {
      setupSettings();

      const req = mockReq({
        query: { token: WEBHOOK_SECRET },
        body: makeReadarrPayload({ book: undefined }),
      });
      const res = mockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'ignored',
        reason: 'no book reference',
      });
    });

    it('returns 200 ignored when book has no foreignBookId', async () => {
      setupSettings();

      const req = mockReq({
        query: { token: WEBHOOK_SECRET },
        body: makeReadarrPayload({
          book: { id: 1, title: 'No ID Book', foreignBookId: '' },
        }),
      });
      const res = mockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'ignored',
        reason: 'no book reference',
      });
    });

    it('returns 200 ignored when work not found', async () => {
      setupSettings();
      mockWorkRepo.findOne.mockResolvedValue(null);

      const req = mockReq({
        query: { token: WEBHOOK_SECRET },
        body: makeReadarrPayload(),
      });
      const res = mockRes();

      await handler(req, res);

      expect(mockWorkRepo.findOne).toHaveBeenCalledWith({
        where: { hardcoverId: 'hc-123' },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'ignored',
        reason: 'work not found',
      });
    });

    it('returns 200 ignored when no active requests', async () => {
      setupSettings();
      mockWorkRepo.findOne.mockResolvedValue(makeWork());
      mockBookRequestRepo.find.mockResolvedValue([]);

      const req = mockReq({
        query: { token: WEBHOOK_SECRET },
        body: makeReadarrPayload(),
      });
      const res = mockRes();

      await handler(req, res);

      expect(mockBookRequestRepo.find).toHaveBeenCalledWith({
        where: {
          work: { id: 42 },
          status: expect.anything(),
        },
        relations: ['work'],
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'ignored',
        reason: 'no active requests',
      });
    });

    it('Grab: updates downloadStatus to downloading and downloadProgress to 0', async () => {
      setupSettings();
      mockWorkRepo.findOne.mockResolvedValue(makeWork());
      const request1 = makeRequest({ id: 1 });
      const request2 = makeRequest({ id: 2 });
      mockBookRequestRepo.find.mockResolvedValue([request1, request2]);
      mockBookRequestRepo.save.mockResolvedValue([request1, request2]);

      const req = mockReq({
        query: { token: WEBHOOK_SECRET },
        body: makeReadarrPayload({ eventType: 'Grab' }),
      });
      const res = mockRes();

      await handler(req, res);

      expect(request1.downloadStatus).toBe('downloading');
      expect(request1.downloadProgress).toBe(0);
      expect(request2.downloadStatus).toBe('downloading');
      expect(request2.downloadProgress).toBe(0);
      expect(mockBookRequestRepo.save).toHaveBeenCalledWith([request1, request2]);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ status: 'ok' });
    });

    it('Download: sets downloadProgress to 100 and downloadStatus to imported', async () => {
      setupSettings();
      mockWorkRepo.findOne.mockResolvedValue(makeWork());
      const request = makeRequest();
      mockBookRequestRepo.find.mockResolvedValue([request]);
      mockBookRequestRepo.save.mockResolvedValue([request]);

      const req = mockReq({
        query: { token: WEBHOOK_SECRET },
        body: makeReadarrPayload({ eventType: 'Download' }),
      });
      const res = mockRes();

      await handler(req, res);

      expect(request.downloadProgress).toBe(100);
      expect(request.downloadStatus).toBe('imported');
      expect(mockBookRequestRepo.save).toHaveBeenCalledWith([request]);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ status: 'ok' });
    });

    it('BookFileImport: sets downloadProgress to 100 and downloadStatus to imported', async () => {
      setupSettings();
      mockWorkRepo.findOne.mockResolvedValue(makeWork());
      const request = makeRequest();
      mockBookRequestRepo.find.mockResolvedValue([request]);
      mockBookRequestRepo.save.mockResolvedValue([request]);

      const req = mockReq({
        query: { token: WEBHOOK_SECRET },
        body: makeReadarrPayload({ eventType: 'BookFileImport' }),
      });
      const res = mockRes();

      await handler(req, res);

      expect(request.downloadProgress).toBe(100);
      expect(request.downloadStatus).toBe('imported');
      expect(mockBookRequestRepo.save).toHaveBeenCalledWith([request]);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ status: 'ok' });
    });

    it('DownloadFailed: sets downloadStatus to failed and downloadProgress to 0', async () => {
      setupSettings();
      mockWorkRepo.findOne.mockResolvedValue(makeWork());
      const request = makeRequest({ downloadStatus: 'downloading', downloadProgress: 50 });
      mockBookRequestRepo.find.mockResolvedValue([request]);
      mockBookRequestRepo.save.mockResolvedValue([request]);

      const req = mockReq({
        query: { token: WEBHOOK_SECRET },
        body: makeReadarrPayload({ eventType: 'DownloadFailed', message: 'Timeout' }),
      });
      const res = mockRes();

      await handler(req, res);

      expect(request.downloadStatus).toBe('failed');
      expect(request.downloadProgress).toBe(0);
      expect(mockBookRequestRepo.save).toHaveBeenCalledWith([request]);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ status: 'ok' });
    });

    it('Test: returns ok without changing requests', async () => {
      setupSettings();
      mockWorkRepo.findOne.mockResolvedValue(makeWork());
      const request = makeRequest({ downloadStatus: null, downloadProgress: null });
      mockBookRequestRepo.find.mockResolvedValue([request]);

      const req = mockReq({
        query: { token: WEBHOOK_SECRET },
        body: makeReadarrPayload({ eventType: 'Test' }),
      });
      const res = mockRes();

      await handler(req, res);

      expect(request.downloadStatus).toBeNull();
      expect(request.downloadProgress).toBeNull();
      expect(mockBookRequestRepo.save).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ status: 'ok' });
    });

    it('Unknown event: returns ok without changing requests', async () => {
      setupSettings();
      mockWorkRepo.findOne.mockResolvedValue(makeWork());
      const request = makeRequest({ downloadStatus: null, downloadProgress: null });
      mockBookRequestRepo.find.mockResolvedValue([request]);

      const req = mockReq({
        query: { token: WEBHOOK_SECRET },
        body: makeReadarrPayload({ eventType: 'SomethingUnknown' }),
      });
      const res = mockRes();

      await handler(req, res);

      expect(request.downloadStatus).toBeNull();
      expect(request.downloadProgress).toBeNull();
      expect(mockBookRequestRepo.save).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ status: 'ok' });
    });

    it('creates webhook secret if not set and persists it', async () => {
      const settings = setupSettings({ webhookSecret: '' });

      const req = mockReq({
        query: { token: 'will-not-match' },
        body: makeReadarrPayload(),
      });
      const res = mockRes();

      await handler(req, res);

      // The secret should have been generated (64 hex chars = 32 bytes)
      expect(settings.webhookSecret).toMatch(/^[a-f0-9]{64}$/);
      expect(settings.save).toHaveBeenCalled();
      // Token won't match the newly generated secret, so expect 401
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('Grab: updates multiple active requests', async () => {
      setupSettings();
      mockWorkRepo.findOne.mockResolvedValue(makeWork());
      const requests = [
        makeRequest({ id: 1 }),
        makeRequest({ id: 2 }),
        makeRequest({ id: 3 }),
      ];
      mockBookRequestRepo.find.mockResolvedValue(requests);
      mockBookRequestRepo.save.mockResolvedValue(requests);

      const req = mockReq({
        query: { token: WEBHOOK_SECRET },
        body: makeReadarrPayload({ eventType: 'Grab' }),
      });
      const res = mockRes();

      await handler(req, res);

      for (const r of requests) {
        expect(r.downloadStatus).toBe('downloading');
        expect(r.downloadProgress).toBe(0);
      }
      expect(mockBookRequestRepo.save).toHaveBeenCalledWith(requests);
    });
  });

});
