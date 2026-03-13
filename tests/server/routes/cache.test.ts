import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReq, mockRes } from './_testHelper';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { handlers, mockGetAll, mockFlush, mockFlushAll } = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => any>,
  mockGetAll: vi.fn(),
  mockFlush: vi.fn(),
  mockFlushAll: vi.fn(),
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

vi.mock('@server/lib/cache', () => ({
  CacheRegistry: {
    getAll: mockGetAll,
    flush: mockFlush,
    flushAll: mockFlushAll,
  },
}));

vi.mock('@server/middleware/auth', () => ({
  isAuthenticated: vi.fn((_req: any, _res: any, next: any) => next()),
  requirePermission: vi.fn(() => (_req: any, _res: any, next: any) => next()),
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

await import('@server/routes/cache');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('routes/cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /', () => {
    const handler = handlers['GET /'];

    it('returns cache stats array', async () => {
      mockGetAll.mockReturnValue([
        {
          name: 'metadata',
          cache: {
            getStats: () => ({ keys: 10, hits: 50, misses: 5, ksize: 100, vsize: 200 }),
            getTtl: () => 300,
            getMaxKeys: () => 1000,
          },
        },
      ]);

      const res = mockRes();
      await handler(mockReq(), res);

      expect(res.json).toHaveBeenCalledWith([
        {
          name: 'metadata',
          keys: 10,
          hits: 50,
          misses: 5,
          ksize: 100,
          vsize: 200,
          ttl: 300,
          maxKeys: 1000,
        },
      ]);
    });

    it('returns empty array when no caches', async () => {
      mockGetAll.mockReturnValue([]);

      const res = mockRes();
      await handler(mockReq(), res);

      expect(res.json).toHaveBeenCalledWith([]);
    });
  });

  describe('POST /:name/flush', () => {
    const handler = handlers['POST /:name/flush'];

    it('flushes a named cache', async () => {
      mockFlush.mockReturnValue(true);

      const res = mockRes();
      await handler(mockReq({ params: { name: 'metadata' }, user: { id: 1 } }), res);

      expect(mockFlush).toHaveBeenCalledWith('metadata');
      expect(res.json).toHaveBeenCalledWith({ success: true, name: 'metadata' });
    });

    it('returns 404 when cache not found', async () => {
      mockFlush.mockReturnValue(false);

      const res = mockRes();
      await handler(mockReq({ params: { name: 'nonexistent' } }), res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Cache "nonexistent" not found' });
    });
  });

  describe('POST /flush', () => {
    const handler = handlers['POST /flush'];

    it('flushes all caches', async () => {
      const res = mockRes();
      await handler(mockReq({ user: { id: 1 } }), res);

      expect(mockFlushAll).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('logs userId', async () => {
      const { default: logger } = await import('@server/logger');

      const res = mockRes();
      await handler(mockReq({ user: { id: 42 } }), res);

      expect(logger.info).toHaveBeenCalledWith('All caches flushed', { userId: 42 });
    });
  });
});
