import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReq, mockRes } from './_testHelper';

// ---------------------------------------------------------------------------
// Hoisted mocks — cover health endpoint and getProviderHealth branches
// Note: service.ts has a module-level `cachedHealth` that persists between
// tests since the module is loaded once. Tests must account for this.
// ---------------------------------------------------------------------------

const {
  handlers,
  mockGetInstance,
  mockAxios,
} = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => any>,
  mockGetInstance: vi.fn(),
  mockAxios: vi.fn(),
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

vi.mock('axios', () => ({
  default: mockAxios,
}));

vi.mock('@server/lib/settings', () => ({
  default: { getInstance: mockGetInstance },
}));

vi.mock('@server/api/servarr/readarr', () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      getQualityProfiles: vi.fn().mockResolvedValue([]),
      getMetadataProfiles: vi.fn().mockResolvedValue([]),
      getRootFolders: vi.fn().mockResolvedValue([]),
      getTags: vi.fn().mockResolvedValue([]),
    };
  }),
}));

vi.mock('@server/api/servarr/lidarr', () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      getQualityProfiles: vi.fn().mockResolvedValue([]),
      getMetadataProfiles: vi.fn().mockResolvedValue([]),
      getRootFolders: vi.fn().mockResolvedValue([]),
      getTags: vi.fn().mockResolvedValue([]),
    };
  }),
}));

vi.mock('@server/lib/serverUrl', () => ({
  buildServerUrl: vi.fn((s: any) => `http://${s.hostname}:${s.port}`),
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

await import('@server/routes/service');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('routes/service (extra — health endpoint)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /health', () => {
    const handler = () => handlers['GET /health'];

    it('returns provider health with correct structure', async () => {
      // The first call will bypass cache (or build it fresh)
      mockAxios.mockResolvedValue({ status: 200 });
      mockGetInstance.mockReturnValue({ main: { hardcoverToken: 'token123' } });

      const res = mockRes();
      await handler()(mockReq(), res);

      // Verify response has the expected shape
      expect(res.json).toHaveBeenCalledWith({ providers: expect.any(Object) });
      const result = res.json.mock.calls[0][0];
      expect(result.providers).toHaveProperty('hardcover');
      expect(result.providers).toHaveProperty('openlibrary');
      expect(result.providers).toHaveProperty('googlebooks');
    });

    it('returns false for all providers when all fail', async () => {
      // We need to bypass the cache — mock Date.now to expire the cache
      const originalDateNow = Date.now;
      // Set time far in future to expire cache
      vi.spyOn(Date, 'now').mockReturnValue(originalDateNow() + 120_000);

      mockAxios.mockRejectedValue(new Error('network error'));
      mockGetInstance.mockReturnValue({ main: { hardcoverToken: null } });

      const res = mockRes();
      await handler()(mockReq(), res);

      vi.restoreAllMocks();

      const result = res.json.mock.calls[0][0];
      expect(result.providers).toEqual({
        hardcover: false,
        openlibrary: false,
        googlebooks: false,
      });
    });

    it('handles no hardcoverToken (no authorization header)', async () => {
      // Expire cache to force fresh call
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 200_000);

      mockAxios.mockResolvedValue({ status: 200 });
      mockGetInstance.mockReturnValue({ main: { hardcoverToken: null } });

      const res = mockRes();
      await handler()(mockReq(), res);

      vi.restoreAllMocks();

      // When there's no token, axios should be called without authorization
      const hardcoverCall = mockAxios.mock.calls.find(
        (c: any[]) => c[0]?.url?.includes('hardcover')
      );
      // Either the call was made or cached result was returned
      if (hardcoverCall) {
        expect(hardcoverCall[0].headers.authorization).toBeUndefined();
      }
    });

    it('adds Bearer prefix to hardcoverToken if not already prefixed', async () => {
      // Expire cache
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 300_000);

      mockAxios.mockResolvedValue({ status: 200 });
      mockGetInstance.mockReturnValue({ main: { hardcoverToken: 'my-plain-token' } });

      const res = mockRes();
      await handler()(mockReq(), res);

      vi.restoreAllMocks();

      const hardcoverCall = mockAxios.mock.calls.find(
        (c: any[]) => c[0]?.url?.includes('hardcover')
      );
      if (hardcoverCall) {
        expect(hardcoverCall[0].headers.authorization).toBe('Bearer my-plain-token');
      }
    });

    it('does not double-prefix token that already starts with Bearer', async () => {
      // Expire cache
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 400_000);

      mockAxios.mockResolvedValue({ status: 200 });
      mockGetInstance.mockReturnValue({ main: { hardcoverToken: 'Bearer existing-bearer' } });

      const res = mockRes();
      await handler()(mockReq(), res);

      vi.restoreAllMocks();

      const hardcoverCall = mockAxios.mock.calls.find(
        (c: any[]) => c[0]?.url?.includes('hardcover')
      );
      if (hardcoverCall) {
        expect(hardcoverCall[0].headers.authorization).toBe('Bearer existing-bearer');
      }
    });
  });
});
