import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReq, mockRes } from './_testHelper';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  handlers,
  mockGetInstance,
  mockReadarrInstance,
  mockLidarrInstance,
  MockReadarrApi,
  MockLidarrApi,
} = vi.hoisted(() => {
  const mockReadarrInstance = {
    getQualityProfiles: vi.fn(),
    getMetadataProfiles: vi.fn(),
    getRootFolders: vi.fn(),
    getTags: vi.fn(),
  };
  const mockLidarrInstance = {
    getQualityProfiles: vi.fn(),
    getMetadataProfiles: vi.fn(),
    getRootFolders: vi.fn(),
    getTags: vi.fn(),
  };
  return {
    handlers: {} as Record<string, (...args: any[]) => any>,
    mockGetInstance: vi.fn(),
    mockReadarrInstance,
    mockLidarrInstance,
    MockReadarrApi: vi.fn().mockImplementation(function () { return mockReadarrInstance; }),
    MockLidarrApi: vi.fn().mockImplementation(function () { return mockLidarrInstance; }),
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

vi.mock('@server/lib/settings', () => ({
  default: { getInstance: mockGetInstance },
}));

vi.mock('@server/api/servarr/readarr', () => ({
  default: MockReadarrApi,
}));

vi.mock('@server/api/servarr/lidarr', () => ({
  default: MockLidarrApi,
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
// Helpers
// ---------------------------------------------------------------------------

function setupSettings(readarr: any[] = [], lidarr: any[] = []) {
  mockGetInstance.mockReturnValue({ readarr, lidarr });
}

function setupReadarrSuccess() {
  mockReadarrInstance.getQualityProfiles.mockResolvedValue([{ id: 1 }]);
  mockReadarrInstance.getMetadataProfiles.mockResolvedValue([{ id: 2 }]);
  mockReadarrInstance.getRootFolders.mockResolvedValue([{ path: '/books' }]);
  mockReadarrInstance.getTags.mockResolvedValue([{ id: 1, label: 'tag' }]);
}

function setupLidarrSuccess() {
  mockLidarrInstance.getQualityProfiles.mockResolvedValue([{ id: 1 }]);
  mockLidarrInstance.getMetadataProfiles.mockResolvedValue([{ id: 2 }]);
  mockLidarrInstance.getRootFolders.mockResolvedValue([{ path: '/music' }]);
  mockLidarrInstance.getTags.mockResolvedValue([{ id: 1, label: 'tag' }]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('routes/service', () => {
  beforeEach(() => {
    // Clear calls/results without resetting implementations
    MockReadarrApi.mockClear();
    MockLidarrApi.mockClear();
    mockGetInstance.mockReset();
    mockReadarrInstance.getQualityProfiles.mockReset();
    mockReadarrInstance.getMetadataProfiles.mockReset();
    mockReadarrInstance.getRootFolders.mockReset();
    mockReadarrInstance.getTags.mockReset();
    mockLidarrInstance.getQualityProfiles.mockReset();
    mockLidarrInstance.getMetadataProfiles.mockReset();
    mockLidarrInstance.getRootFolders.mockReset();
    mockLidarrInstance.getTags.mockReset();
  });

  describe('GET /readarr/:id', () => {
    const handler = handlers['GET /readarr/:id'];

    it('returns profiles and root folders on success', async () => {
      setupSettings([{ id: 1, hostname: 'localhost', port: 8787, apiKey: 'key1' }]);
      setupReadarrSuccess();

      const res = mockRes();
      await handler(mockReq({ params: { id: '1' } }), res);

      expect(MockReadarrApi).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        qualityProfiles: [{ id: 1 }],
        metadataProfiles: [{ id: 2 }],
        rootFolders: [{ path: '/books' }],
        tags: [{ id: 1, label: 'tag' }],
      });
    });

    it('returns 400 for invalid ID', async () => {
      const res = mockRes();
      await handler(mockReq({ params: { id: 'abc' } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid ID' });
    });

    it('returns 404 when server not found', async () => {
      setupSettings([{ id: 1, hostname: 'localhost', port: 8787, apiKey: 'key1' }]);

      const res = mockRes();
      await handler(mockReq({ params: { id: '99' } }), res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Readarr server not found' });
    });

    it('returns 500 on API error', async () => {
      setupSettings([{ id: 1, hostname: 'localhost', port: 8787, apiKey: 'key1' }]);
      mockReadarrInstance.getQualityProfiles.mockRejectedValue(new Error('connection refused'));
      mockReadarrInstance.getMetadataProfiles.mockResolvedValue([]);
      mockReadarrInstance.getRootFolders.mockResolvedValue([]);
      mockReadarrInstance.getTags.mockResolvedValue([]);

      const res = mockRes();
      await handler(mockReq({ params: { id: '1' } }), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to connect to Readarr' });
    });

    it('constructs API with correct server URL and key', async () => {
      setupSettings([{ id: 1, hostname: 'readarr.local', port: 8787, apiKey: 'secret' }]);
      setupReadarrSuccess();

      const res = mockRes();
      await handler(mockReq({ params: { id: '1' } }), res);

      const { buildServerUrl } = await import('@server/lib/serverUrl');
      expect(buildServerUrl).toHaveBeenCalledWith({ id: 1, hostname: 'readarr.local', port: 8787, apiKey: 'secret' });
      expect(MockReadarrApi).toHaveBeenCalledWith('http://readarr.local:8787', 'secret');
    });
  });

  describe('GET /lidarr/:id', () => {
    const handler = handlers['GET /lidarr/:id'];

    it('returns profiles and root folders on success', async () => {
      setupSettings([], [{ id: 1, hostname: 'localhost', port: 8686, apiKey: 'key2' }]);
      setupLidarrSuccess();

      const res = mockRes();
      await handler(mockReq({ params: { id: '1' } }), res);

      expect(MockLidarrApi).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        qualityProfiles: [{ id: 1 }],
        metadataProfiles: [{ id: 2 }],
        rootFolders: [{ path: '/music' }],
        tags: [{ id: 1, label: 'tag' }],
      });
    });

    it('returns 400 for invalid ID', async () => {
      const res = mockRes();
      await handler(mockReq({ params: { id: 'abc' } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid ID' });
    });

    it('returns 404 when server not found', async () => {
      setupSettings([], [{ id: 1, hostname: 'localhost', port: 8686, apiKey: 'key2' }]);

      const res = mockRes();
      await handler(mockReq({ params: { id: '99' } }), res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Lidarr server not found' });
    });

    it('returns 500 on API error', async () => {
      setupSettings([], [{ id: 1, hostname: 'localhost', port: 8686, apiKey: 'key2' }]);
      mockLidarrInstance.getQualityProfiles.mockRejectedValue(new Error('timeout'));
      mockLidarrInstance.getMetadataProfiles.mockResolvedValue([]);
      mockLidarrInstance.getRootFolders.mockResolvedValue([]);
      mockLidarrInstance.getTags.mockResolvedValue([]);

      const res = mockRes();
      await handler(mockReq({ params: { id: '1' } }), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to connect to Lidarr' });
    });

    it('constructs API with correct server URL and key', async () => {
      setupSettings([], [{ id: 1, hostname: 'lidarr.local', port: 8686, apiKey: 'secret2' }]);
      setupLidarrSuccess();

      const res = mockRes();
      await handler(mockReq({ params: { id: '1' } }), res);

      const { buildServerUrl } = await import('@server/lib/serverUrl');
      expect(buildServerUrl).toHaveBeenCalledWith({ id: 1, hostname: 'lidarr.local', port: 8686, apiKey: 'secret2' });
      expect(MockLidarrApi).toHaveBeenCalledWith('http://lidarr.local:8686', 'secret2');
    });
  });
});
