import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReq, mockRes } from './_testHelper';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  handlers,
  mockGetInstance,
  mockSave,
  mockUserRepo,
  mockUnmatchedRepo,
  mockBcryptHash,
  mockValidateConnectionTarget,
  mockBuildServerUrl,
  mockResetMetadataResolver,
  mockCacheFlush,
  mockGetJobs,
  mockRunJob,
  mockTestConnection,
} = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => any>,
  mockGetInstance: vi.fn(),
  mockSave: vi.fn(),
  mockUserRepo: {
    create: vi.fn((data: any) => ({ id: 1, ...data })),
    save: vi.fn((data: any) => data),
  },
  mockUnmatchedRepo: {
    findAndCount: vi.fn().mockResolvedValue([[], 0]),
    count: vi.fn().mockResolvedValue(0),
    findOne: vi.fn().mockResolvedValue(null),
    remove: vi.fn(),
  },
  mockBcryptHash: vi.fn().mockResolvedValue('hashed_pw'),
  mockValidateConnectionTarget: vi.fn().mockResolvedValue(null),
  mockBuildServerUrl: vi.fn().mockReturnValue('http://localhost:8787'),
  mockResetMetadataResolver: vi.fn(),
  mockCacheFlush: vi.fn(),
  mockGetJobs: vi.fn().mockReturnValue([]),
  mockRunJob: vi.fn().mockReturnValue(true),
  mockTestConnection: vi.fn().mockResolvedValue(true),
}));

// Sentinel classes
class MockUser {}
class MockUnmatchedMediaItem {}

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

vi.mock('express-rate-limit', () => ({
  default: vi.fn(() => (_req: any, _res: any, next: any) => next()),
}));

vi.mock('bcrypt', () => ({
  default: { hash: mockBcryptHash },
}));

vi.mock('@server/datasource', () => ({
  default: {
    getRepository: vi.fn((entity: any) => {
      if (entity === MockUser) return mockUserRepo;
      if (entity === MockUnmatchedMediaItem) return mockUnmatchedRepo;
      return mockUserRepo;
    }),
  },
}));

vi.mock('@server/entity/User', () => ({ User: MockUser }));
vi.mock('@server/entity/UnmatchedMediaItem', () => ({ UnmatchedMediaItem: MockUnmatchedMediaItem }));
vi.mock('@server/constants/user', () => ({ UserType: { LOCAL: 3, JELLYFIN: 1, PLEX: 2 } }));

vi.mock('@server/lib/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@server/lib/permissions')>();
  return actual;
});

vi.mock('@server/lib/settings', () => ({
  default: { getInstance: mockGetInstance },
}));

vi.mock('@server/middleware/auth', () => ({
  isAuthenticated: vi.fn((_req: any, _res: any, next: any) => next()),
  requirePermission: vi.fn(() => (_req: any, _res: any, next: any) => next()),
  authOrSetup: vi.fn(() => (_req: any, _res: any, next: any) => next()),
}));

vi.mock('@server/middleware/asyncHandler', () => ({
  asyncHandler: vi.fn((fn: (...args: any[]) => any) => fn),
}));

vi.mock('@server/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@server/utils/validateHostname', () => ({
  validateConnectionTarget: mockValidateConnectionTarget,
}));

vi.mock('@server/lib/serverUrl', () => ({
  buildServerUrl: mockBuildServerUrl,
}));

vi.mock('@server/lib/metadataResolverInstance', () => ({
  resetMetadataResolver: mockResetMetadataResolver,
}));

vi.mock('@server/lib/cache', () => ({
  CacheRegistry: { flush: mockCacheFlush },
}));

vi.mock('@server/api/metadata/MetadataResolver', () => ({
  DEFAULT_METADATA_PROVIDERS: {
    hardcover: { enabled: true },
    openlibrary: { enabled: true },
    googlebooks: { enabled: true },
    priority: {
      search: ['hardcover', 'openlibrary', 'googlebooks'],
      description: ['hardcover', 'openlibrary', 'googlebooks'],
      cover: ['hardcover', 'openlibrary', 'googlebooks'],
      editions: ['hardcover', 'openlibrary'],
      ratings: ['hardcover'],
    },
  },
}));

// Dynamic imports for test connections
vi.mock('@server/api/servarr/readarr', () => ({
  default: vi.fn().mockImplementation(function (this: any) { this.testConnection = mockTestConnection; }),
}));
vi.mock('@server/api/servarr/lidarr', () => ({
  default: vi.fn().mockImplementation(function (this: any) { this.testConnection = mockTestConnection; }),
}));
vi.mock('@server/api/audiobookshelf', () => ({
  default: vi.fn().mockImplementation(function (this: any) { this.testConnection = mockTestConnection; }),
}));
vi.mock('@server/api/jellyfin', () => ({
  default: vi.fn().mockImplementation(function (this: any) { this.testConnection = mockTestConnection; }),
}));
vi.mock('@server/api/plexapi', () => ({
  default: vi.fn().mockImplementation(function (this: any) { this.testConnection = mockTestConnection; }),
}));

vi.mock('@server/job/schedule', () => ({
  getJobs: mockGetJobs,
  runJob: mockRunJob,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

await import('@server/routes/settings/index');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function settingsObj(overrides: Record<string, any> = {}) {
  const s: any = {
    main: {
      initialized: false,
      appTitle: 'Librarr',
      applicationUrl: '',
      hideAvailable: false,
      localLogin: true,
      defaultPermissions: 0,
      hardcoverToken: '',
      enableEbookRequests: true,
      enableAudiobookRequests: true,
      enableMusicRequests: true,
      ...overrides.main,
    },
    public: { appTitle: 'Librarr', initialized: false },
    roles: overrides.roles ?? [],
    readarr: overrides.readarr ?? [],
    lidarr: overrides.lidarr ?? [],
    audiobookshelf: overrides.audiobookshelf ?? { hostname: '', port: 0, apiKey: '', useSsl: false, baseUrl: '' },
    jellyfin: overrides.jellyfin ?? { hostname: '', port: 0, apiKey: '', useSsl: false, baseUrl: '', serverId: '' },
    plex: overrides.plex ?? { hostname: '', port: 0, token: '', useSsl: false, machineId: '' },
    metadataProviders: overrides.metadataProviders ?? {
      hardcover: { enabled: true },
      openlibrary: { enabled: true },
      googlebooks: { enabled: true },
      priority: {
        search: ['hardcover'],
        description: ['hardcover'],
        cover: ['hardcover'],
        editions: ['hardcover'],
        ratings: ['hardcover'],
      },
    },
    save: mockSave,
  };
  return s;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('routes/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRepo.create.mockImplementation((data: any) => ({ id: 1, ...data }));
    mockUserRepo.save.mockImplementation((data: any) => data);
    mockBcryptHash.mockResolvedValue('hashed_pw');
    mockTestConnection.mockResolvedValue(true);
    mockValidateConnectionTarget.mockResolvedValue(null);
  });

  // =========================================================================
  // POST /initialize
  // =========================================================================

  describe('POST /initialize', () => {
    const handler = handlers['POST /initialize'];

    it('400 when already initialized', async () => {
      mockGetInstance.mockReturnValue(settingsObj({ main: { initialized: true } }));
      const res = mockRes();
      await handler(mockReq({ body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Application already initialized' });
    });

    it('400 when email/username/password missing', async () => {
      mockGetInstance.mockReturnValue(settingsObj());
      const res = mockRes();
      await handler(mockReq({ body: { email: 'a@b.c' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('400 for invalid email format', async () => {
      mockGetInstance.mockReturnValue(settingsObj());
      const res = mockRes();
      await handler(mockReq({ body: { email: 'bad', username: 'admin', password: 'longpassword' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid email format' });
    });

    it('400 for short password', async () => {
      mockGetInstance.mockReturnValue(settingsObj());
      const res = mockRes();
      await handler(mockReq({ body: { email: 'a@b.com', username: 'admin', password: 'short' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Password must be 8-256 characters' });
    });

    it('400 for empty username', async () => {
      mockGetInstance.mockReturnValue(settingsObj());
      const res = mockRes();
      await handler(mockReq({ body: { email: 'a@b.com', username: '  ', password: 'longpassword' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Username must be 1-100 characters' });
    });

    it('creates admin user and initializes on success', async () => {
      const settings = settingsObj();
      mockGetInstance.mockReturnValue(settings);
      const regenerate = vi.fn((cb: (err?: Error) => void) => cb());
      const res = mockRes();
      await handler(mockReq({
        body: { email: 'admin@test.com', username: 'admin', password: 'password123' },
        session: { regenerate },
      }), res);

      expect(mockBcryptHash).toHaveBeenCalledWith('password123', 12);
      expect(mockUserRepo.create).toHaveBeenCalled();
      expect(mockUserRepo.save).toHaveBeenCalled();
      expect(settings.main.initialized).toBe(true);
      expect(mockSave).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalled();
      // Password should not be in response
      const responseBody = res.json.mock.calls[0][0];
      expect(responseBody.password).toBeUndefined();
    });
  });

  // =========================================================================
  // GET /public
  // =========================================================================

  describe('GET /public', () => {
    const handler = handlers['GET /public'];

    it('returns public settings', () => {
      const settings = settingsObj();
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq(), res);
      expect(res.json).toHaveBeenCalledWith(settings.public);
    });
  });

  // =========================================================================
  // GET /main
  // =========================================================================

  describe('GET /main', () => {
    const handler = handlers['GET /main'];

    it('returns main settings with hardcoverTokenSet flag', () => {
      const settings = settingsObj({ main: { hardcoverToken: 'secret' } });
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq(), res);

      const body = res.json.mock.calls[0][0];
      expect(body.hardcoverToken).toBeUndefined();
      expect(body.hardcoverTokenSet).toBe(true);
    });
  });

  // =========================================================================
  // POST /main
  // =========================================================================

  describe('POST /main', () => {
    const handler = handlers['POST /main'];

    it('updates appTitle', () => {
      const settings = settingsObj();
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ body: { appTitle: 'My Library' } }), res);
      expect(settings.main.appTitle).toBe('My Library');
      expect(mockSave).toHaveBeenCalled();
    });

    it('400 for empty appTitle', () => {
      const settings = settingsObj();
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ body: { appTitle: '  ' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('400 for invalid applicationUrl', () => {
      const settings = settingsObj();
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ body: { applicationUrl: 'not-a-url' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('accepts valid applicationUrl', () => {
      const settings = settingsObj();
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ body: { applicationUrl: 'https://lib.example.com' } }), res);
      expect(settings.main.applicationUrl).toBe('https://lib.example.com');
    });

    it('accepts empty applicationUrl', () => {
      const settings = settingsObj();
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ body: { applicationUrl: '' } }), res);
      expect(settings.main.applicationUrl).toBe('');
    });

    it('updates boolean flags', () => {
      const settings = settingsObj();
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ body: { hideAvailable: true, localLogin: false, enableMusicRequests: false } }), res);
      expect(settings.main.hideAvailable).toBe(true);
      expect(settings.main.localLogin).toBe(false);
      expect(settings.main.enableMusicRequests).toBe(false);
    });

    it('400 for non-number defaultPermissions', () => {
      const settings = settingsObj();
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ body: { defaultPermissions: 'bad' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('strips ADMIN bit from defaultPermissions', () => {
      const settings = settingsObj();
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ body: { defaultPermissions: 2 | 8 } }), res); // ADMIN | REQUEST_EBOOK
      expect(settings.main.defaultPermissions).toBe(8); // ADMIN stripped
    });

    it('updates hardcoverToken', () => {
      const settings = settingsObj();
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ body: { hardcoverToken: 'newtoken' } }), res);
      expect(settings.main.hardcoverToken).toBe('newtoken');
    });
  });

  // =========================================================================
  // Roles CRUD
  // =========================================================================

  describe('GET /roles', () => {
    const handler = handlers['GET /roles'];

    it('returns roles', () => {
      const settings = settingsObj({ roles: [{ id: 1, name: 'Admin', permissions: 2, isDefault: false }] });
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq(), res);
      expect(res.json).toHaveBeenCalledWith(settings.roles);
    });
  });

  describe('POST /roles', () => {
    const handler = handlers['POST /roles'];

    it('400 when name missing', () => {
      mockGetInstance.mockReturnValue(settingsObj());
      const res = mockRes();
      handler(mockReq({ body: { permissions: 8 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('400 when permissions not a number', () => {
      mockGetInstance.mockReturnValue(settingsObj());
      const res = mockRes();
      handler(mockReq({ body: { name: 'User', permissions: 'bad' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('creates role on success', () => {
      const settings = settingsObj({ roles: [] });
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ body: { name: 'Custom', permissions: 8 } }), res);
      expect(settings.roles).toHaveLength(1);
      expect(settings.roles[0].name).toBe('Custom');
      expect(mockSave).toHaveBeenCalled();
    });
  });

  describe('PUT /roles/:id', () => {
    const handler = handlers['PUT /roles/:id'];

    it('400 for invalid ID', () => {
      mockGetInstance.mockReturnValue(settingsObj());
      const res = mockRes();
      handler(mockReq({ params: { id: 'abc' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('404 when role not found', () => {
      mockGetInstance.mockReturnValue(settingsObj({ roles: [] }));
      const res = mockRes();
      handler(mockReq({ params: { id: '999' } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('400 when trying to modify Admin role', () => {
      const settings = settingsObj({ roles: [{ id: 1, name: 'Admin', permissions: 2, isDefault: false }] });
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ params: { id: '1' }, body: { name: 'New' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Cannot modify the Admin role' });
    });

    it('400 for invalid name', () => {
      const settings = settingsObj({ roles: [{ id: 1, name: 'User', permissions: 8, isDefault: false }] });
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ params: { id: '1' }, body: { name: '  ' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('400 for non-number permissions', () => {
      const settings = settingsObj({ roles: [{ id: 1, name: 'User', permissions: 8, isDefault: false }] });
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ params: { id: '1' }, body: { permissions: 'bad' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('updates role name and permissions', () => {
      const settings = settingsObj({ roles: [{ id: 1, name: 'User', permissions: 8, isDefault: false }] });
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ params: { id: '1' }, body: { name: 'Power User', permissions: 16 } }), res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ name: 'Power User', permissions: 16 }));
    });

    it('sets isDefault and updates defaultPermissions', () => {
      const settings = settingsObj({
        roles: [
          { id: 1, name: 'Role A', permissions: 8, isDefault: true },
          { id: 2, name: 'Role B', permissions: 16, isDefault: false },
        ],
      });
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ params: { id: '2' }, body: { isDefault: true } }), res);
      // Role A should no longer be default
      expect(settings.roles.find((r: any) => r.id === 1)?.isDefault).toBe(false);
      expect(settings.main.defaultPermissions).toBe(16);
    });
  });

  describe('DELETE /roles/:id', () => {
    const handler = handlers['DELETE /roles/:id'];

    it('400 for invalid ID', () => {
      mockGetInstance.mockReturnValue(settingsObj());
      const res = mockRes();
      handler(mockReq({ params: { id: 'abc' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('404 when role not found', () => {
      mockGetInstance.mockReturnValue(settingsObj({ roles: [] }));
      const res = mockRes();
      handler(mockReq({ params: { id: '1' } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('400 when deleting Admin role', () => {
      const settings = settingsObj({ roles: [{ id: 1, name: 'Admin', permissions: 2, isDefault: false }] });
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ params: { id: '1' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('400 when deleting default role', () => {
      const settings = settingsObj({ roles: [{ id: 1, name: 'User', permissions: 8, isDefault: true }] });
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ params: { id: '1' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Cannot delete the default role' });
    });

    it('deletes role on success', () => {
      const settings = settingsObj({ roles: [{ id: 1, name: 'Custom', permissions: 8, isDefault: false }] });
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ params: { id: '1' } }), res);
      expect(settings.roles).toHaveLength(0);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  // =========================================================================
  // Readarr CRUD
  // =========================================================================

  describe('GET /readarr', () => {
    const handler = handlers['GET /readarr'];

    it('returns readarr servers with apiKey masked', () => {
      const settings = settingsObj({ readarr: [{ id: 1, name: 'R1', hostname: 'h', apiKey: 'secret' }] });
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq(), res);
      const body = res.json.mock.calls[0][0];
      expect(body[0].apiKey).toBeUndefined();
      expect(body[0].apiKeySet).toBe(true);
    });
  });

  describe('POST /readarr', () => {
    const handler = handlers['POST /readarr'];

    it('400 when hostname missing', () => {
      const settings = settingsObj();
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('400 for invalid port', () => {
      const settings = settingsObj();
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ body: { hostname: 'h', port: 99999 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('400 for invalid contentType', () => {
      const settings = settingsObj();
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ body: { hostname: 'h', contentType: 'video' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rejects adding a second server for the same content type', () => {
      const settings = settingsObj({
        readarr: [{ id: 1, name: 'Old', hostname: 'h', contentType: 'ebook', apiKey: 'k' }],
      });
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ body: { hostname: 'new', apiKey: 'k2', contentType: 'ebook' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(settings.readarr).toHaveLength(1);
    });

    it('allows adding a server for a different content type', () => {
      const settings = settingsObj({
        readarr: [{ id: 1, name: 'Ebook', hostname: 'h', contentType: 'ebook', apiKey: 'k' }],
      });
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ body: { hostname: 'new', apiKey: 'k2', contentType: 'audiobook' } }), res);
      expect(settings.readarr).toHaveLength(2);
      expect(mockSave).toHaveBeenCalled();
    });
  });

  describe('PUT /readarr/:id', () => {
    const handler = handlers['PUT /readarr/:id'];

    it('400 for invalid ID', () => {
      const settings = settingsObj();
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ params: { id: 'abc' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('400 for invalid contentType', () => {
      const settings = settingsObj({ readarr: [{ id: 1, hostname: 'h', apiKey: 'k' }] });
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ params: { id: '1' }, body: { contentType: 'video' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('updates readarr server', () => {
      const settings = settingsObj({ readarr: [{ id: 1, name: 'Old', hostname: 'h', apiKey: 'k' }] });
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ params: { id: '1' }, body: { name: 'Updated' } }), res);
      expect(settings.readarr[0].name).toBe('Updated');
    });

    it('rejects changing content type if another server exists for the target type', () => {
      const settings = settingsObj({
        readarr: [
          { id: 1, name: 'R1', hostname: 'h', apiKey: 'k', contentType: 'ebook' },
          { id: 2, name: 'R2', hostname: 'h2', apiKey: 'k2', contentType: 'audiobook' },
        ],
      });
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ params: { id: '2' }, body: { contentType: 'ebook' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('DELETE /readarr/:id', () => {
    const handler = handlers['DELETE /readarr/:id'];

    it('removes readarr server', () => {
      const settings = settingsObj({ readarr: [{ id: 1, hostname: 'h', apiKey: 'k' }] });
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ params: { id: '1' } }), res);
      expect(settings.readarr).toHaveLength(0);
    });
  });

  // =========================================================================
  // Lidarr CRUD
  // =========================================================================

  describe('GET /lidarr', () => {
    const handler = handlers['GET /lidarr'];

    it('returns lidarr servers with apiKey masked', () => {
      const settings = settingsObj({ lidarr: [{ id: 1, name: 'L1', hostname: 'h', apiKey: 'secret' }] });
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq(), res);
      const body = res.json.mock.calls[0][0];
      expect(body[0].apiKeySet).toBe(true);
      expect(body[0].apiKey).toBeUndefined();
    });
  });

  describe('POST /lidarr', () => {
    const handler = handlers['POST /lidarr'];

    it('400 when hostname missing', () => {
      mockGetInstance.mockReturnValue(settingsObj());
      const res = mockRes();
      handler(mockReq({ body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('400 for invalid port', () => {
      mockGetInstance.mockReturnValue(settingsObj());
      const res = mockRes();
      handler(mockReq({ body: { hostname: 'h', port: 0 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('adds lidarr server and enforces unique isDefault', () => {
      const settings = settingsObj({
        lidarr: [{ id: 1, name: 'Old', hostname: 'h', isDefault: true, apiKey: 'k' }],
      });
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ body: { hostname: 'new', apiKey: 'k2', isDefault: true } }), res);
      expect(settings.lidarr[0].isDefault).toBe(false);
      expect(settings.lidarr).toHaveLength(2);
    });
  });

  describe('PUT /lidarr/:id', () => {
    const handler = handlers['PUT /lidarr/:id'];

    it('400 for invalid ID', () => {
      mockGetInstance.mockReturnValue(settingsObj());
      const res = mockRes();
      handler(mockReq({ params: { id: 'abc' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('updates lidarr server and enforces unique isDefault', () => {
      const settings = settingsObj({
        lidarr: [
          { id: 1, name: 'L1', hostname: 'h', apiKey: 'k', isDefault: true },
          { id: 2, name: 'L2', hostname: 'h2', apiKey: 'k2', isDefault: false },
        ],
      });
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ params: { id: '2' }, body: { isDefault: true } }), res);
      expect(settings.lidarr.find((l: any) => l.id === 1).isDefault).toBe(false);
    });
  });

  describe('DELETE /lidarr/:id', () => {
    const handler = handlers['DELETE /lidarr/:id'];

    it('removes lidarr server', () => {
      const settings = settingsObj({ lidarr: [{ id: 1, hostname: 'h', apiKey: 'k' }] });
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ params: { id: '1' } }), res);
      expect(settings.lidarr).toHaveLength(0);
    });
  });

  // =========================================================================
  // Media server settings (Audiobookshelf, Jellyfin, Plex)
  // =========================================================================

  describe('GET /audiobookshelf', () => {
    const handler = handlers['GET /audiobookshelf'];

    it('returns audiobookshelf settings with apiKey masked', () => {
      const settings = settingsObj({ audiobookshelf: { hostname: 'abs', apiKey: 'secret', port: 443, useSsl: true, baseUrl: '' } });
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq(), res);
      const body = res.json.mock.calls[0][0];
      expect(body.apiKey).toBeUndefined();
      expect(body.apiKeySet).toBe(true);
    });
  });

  describe('POST /audiobookshelf', () => {
    const handler = handlers['POST /audiobookshelf'];

    it('updates audiobookshelf settings', () => {
      const settings = settingsObj();
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ body: { hostname: 'new-abs', port: 443 } }), res);
      expect(settings.audiobookshelf.hostname).toBe('new-abs');
      expect(mockSave).toHaveBeenCalled();
    });
  });

  describe('GET /jellyfin', () => {
    const handler = handlers['GET /jellyfin'];

    it('returns jellyfin settings with apiKey masked', () => {
      const settings = settingsObj({ jellyfin: { hostname: 'jf', apiKey: 'secret', port: 8096, useSsl: false, baseUrl: '', serverId: '' } });
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq(), res);
      const body = res.json.mock.calls[0][0];
      expect(body.apiKeySet).toBe(true);
    });
  });

  describe('POST /jellyfin', () => {
    const handler = handlers['POST /jellyfin'];

    it('updates jellyfin settings', () => {
      const settings = settingsObj();
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ body: { hostname: 'new-jf', serverId: 'abc' } }), res);
      expect(settings.jellyfin.hostname).toBe('new-jf');
      expect(settings.jellyfin.serverId).toBe('abc');
    });
  });

  describe('GET /plex', () => {
    const handler = handlers['GET /plex'];

    it('returns plex settings with token masked', () => {
      const settings = settingsObj({ plex: { hostname: 'plex', token: 'secret', port: 32400, useSsl: false, machineId: '' } });
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq(), res);
      const body = res.json.mock.calls[0][0];
      expect(body.token).toBeUndefined();
      expect(body.tokenSet).toBe(true);
    });
  });

  describe('POST /plex', () => {
    const handler = handlers['POST /plex'];

    it('updates plex settings', () => {
      const settings = settingsObj();
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ body: { hostname: 'new-plex', token: 'tok' } }), res);
      expect(settings.plex.hostname).toBe('new-plex');
      expect(settings.plex.token).toBe('tok');
    });
  });

  // =========================================================================
  // GET /servers-for-request
  // =========================================================================

  describe('GET /servers-for-request', () => {
    const handler = handlers['GET /servers-for-request'];

    it('returns readarr ebook servers for type=book', () => {
      const settings = settingsObj({
        readarr: [
          { id: 1, name: 'R-ebook', isDefault: true, contentType: 'ebook', apiKey: 'k' },
          { id: 2, name: 'R-audio', isDefault: false, contentType: 'audiobook', apiKey: 'k' },
        ],
      });
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ query: { type: 'book', format: 'ebook' } }), res);
      const body = res.json.mock.calls[0][0];
      expect(body).toHaveLength(1);
      expect(body[0].name).toBe('R-ebook');
    });

    it('returns readarr audiobook servers for type=book&format=audiobook', () => {
      const settings = settingsObj({
        readarr: [
          { id: 1, name: 'R-ebook', isDefault: true, contentType: 'ebook', apiKey: 'k' },
          { id: 2, name: 'R-audio', isDefault: false, contentType: 'audiobook', apiKey: 'k' },
        ],
      });
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ query: { type: 'book', format: 'audiobook' } }), res);
      const body = res.json.mock.calls[0][0];
      expect(body).toHaveLength(1);
      expect(body[0].name).toBe('R-audio');
    });

    it('returns lidarr servers for type=music', () => {
      const settings = settingsObj({
        lidarr: [{ id: 1, name: 'L1', isDefault: true, apiKey: 'k' }],
      });
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ query: { type: 'music' } }), res);
      const body = res.json.mock.calls[0][0];
      expect(body).toHaveLength(1);
    });

    it('400 for unknown type', () => {
      mockGetInstance.mockReturnValue(settingsObj());
      const res = mockRes();
      handler(mockReq({ query: { type: 'video' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  // =========================================================================
  // Test connections
  // =========================================================================

  describe('POST /readarr/test', () => {
    const handler = handlers['POST /readarr/test'];

    it('returns success on good connection', async () => {
      const res = mockRes();
      await handler(mockReq({ body: { hostname: 'h', port: 8787, apiKey: 'k', useSsl: false, baseUrl: '' } }), res);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('400 when hostname validation fails', async () => {
      mockValidateConnectionTarget.mockResolvedValue('Invalid hostname');
      const res = mockRes();
      await handler(mockReq({ body: { hostname: 'bad', port: 8787, apiKey: 'k' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns success: false on connection error', async () => {
      mockTestConnection.mockRejectedValue(new Error('timeout'));
      const res = mockRes();
      await handler(mockReq({ body: { hostname: 'h', port: 8787, apiKey: 'k' } }), res);
      expect(res.json).toHaveBeenCalledWith({ success: false });
    });
  });

  describe('POST /lidarr/test', () => {
    const handler = handlers['POST /lidarr/test'];

    it('returns success on good connection', async () => {
      const res = mockRes();
      await handler(mockReq({ body: { hostname: 'h', port: 8686, apiKey: 'k' } }), res);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('returns success: false on error', async () => {
      mockTestConnection.mockRejectedValue(new Error('fail'));
      const res = mockRes();
      await handler(mockReq({ body: { hostname: 'h', port: 8686, apiKey: 'k' } }), res);
      expect(res.json).toHaveBeenCalledWith({ success: false });
    });
  });

  describe('POST /audiobookshelf/test', () => {
    const handler = handlers['POST /audiobookshelf/test'];

    it('returns success on good connection', async () => {
      const res = mockRes();
      await handler(mockReq({ body: { hostname: 'h', port: 443, apiKey: 'k' } }), res);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('returns success: false on error', async () => {
      mockTestConnection.mockRejectedValue(new Error('fail'));
      const res = mockRes();
      await handler(mockReq({ body: { hostname: 'h', port: 443, apiKey: 'k' } }), res);
      expect(res.json).toHaveBeenCalledWith({ success: false });
    });
  });

  describe('POST /jellyfin/test', () => {
    const handler = handlers['POST /jellyfin/test'];

    it('returns success on good connection', async () => {
      const res = mockRes();
      await handler(mockReq({ body: { hostname: 'h', port: 8096, useSsl: false, baseUrl: '' } }), res);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('returns success: false on error', async () => {
      mockTestConnection.mockRejectedValue(new Error('fail'));
      const res = mockRes();
      await handler(mockReq({ body: { hostname: 'h', port: 8096 } }), res);
      expect(res.json).toHaveBeenCalledWith({ success: false });
    });
  });

  describe('POST /plex/test', () => {
    const handler = handlers['POST /plex/test'];

    it('returns success: false when no token', async () => {
      const res = mockRes();
      await handler(mockReq({ body: { hostname: 'h', port: 32400, useSsl: false } }), res);
      expect(res.json).toHaveBeenCalledWith({ success: false });
    });

    it('returns success on good connection', async () => {
      const res = mockRes();
      await handler(mockReq({ body: { hostname: 'h', port: 32400, useSsl: false, token: 'tok' } }), res);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('returns success: false on error', async () => {
      mockTestConnection.mockRejectedValue(new Error('fail'));
      const res = mockRes();
      await handler(mockReq({ body: { hostname: 'h', port: 32400, useSsl: false, token: 'tok' } }), res);
      expect(res.json).toHaveBeenCalledWith({ success: false });
    });
  });

  // =========================================================================
  // Jobs
  // =========================================================================

  describe('GET /jobs', () => {
    const handler = handlers['GET /jobs'];

    it('returns job list', async () => {
      mockGetJobs.mockReturnValue([{ id: 'sync', name: 'Sync' }]);
      const res = mockRes();
      await handler(mockReq(), res);
      expect(res.json).toHaveBeenCalledWith([{ id: 'sync', name: 'Sync' }]);
    });
  });

  describe('POST /jobs/:id/run', () => {
    const handler = handlers['POST /jobs/:id/run'];

    it('runs a job', async () => {
      mockRunJob.mockReturnValue(true);
      const res = mockRes();
      await handler(mockReq({ params: { id: 'downloadSync' } }), res);
      expect(mockRunJob).toHaveBeenCalledWith('downloadSync');
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  // =========================================================================
  // Metadata providers
  // =========================================================================

  describe('GET /metadata-providers', () => {
    const handler = handlers['GET /metadata-providers'];

    it('returns metadata provider settings', () => {
      const settings = settingsObj();
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq(), res);
      expect(res.json).toHaveBeenCalledWith(settings.metadataProviders);
    });
  });

  describe('POST /metadata-providers', () => {
    const handler = handlers['POST /metadata-providers'];

    it('updates provider enabled flags', () => {
      const settings = settingsObj();
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ body: { openlibrary: { enabled: false } }, user: { id: 1 } }), res);
      expect(settings.metadataProviders.openlibrary.enabled).toBe(false);
      expect(mockSave).toHaveBeenCalled();
      expect(mockResetMetadataResolver).toHaveBeenCalled();
      expect(mockCacheFlush).toHaveBeenCalledTimes(3);
    });

    it('400 for invalid provider object', () => {
      const settings = settingsObj();
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ body: { hardcover: 'bad' }, user: { id: 1 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('400 for invalid priority array', () => {
      const settings = settingsObj();
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ body: { priority: { search: ['invalid_source'] } }, user: { id: 1 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('400 for non-object priority', () => {
      const settings = settingsObj();
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ body: { priority: 'bad' }, user: { id: 1 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('400 when all providers disabled', () => {
      const settings = settingsObj();
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({
        body: {
          hardcover: { enabled: false },
          openlibrary: { enabled: false },
          googlebooks: { enabled: false },
        },
        user: { id: 1 },
      }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'At least one metadata provider must be enabled' });
    });

    it('updates priority arrays', () => {
      const settings = settingsObj();
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({
        body: { priority: { search: ['openlibrary', 'hardcover'] } },
        user: { id: 1 },
      }), res);
      expect(settings.metadataProviders.priority.search).toEqual(['openlibrary', 'hardcover']);
    });
  });

  describe('POST /metadata-providers/reset', () => {
    const handler = handlers['POST /metadata-providers/reset'];

    it('resets to defaults', () => {
      const settings = settingsObj();
      mockGetInstance.mockReturnValue(settings);
      const res = mockRes();
      handler(mockReq({ user: { id: 1 } }), res);
      expect(mockSave).toHaveBeenCalled();
      expect(mockResetMetadataResolver).toHaveBeenCalled();
      expect(mockCacheFlush).toHaveBeenCalledTimes(3);
      expect(res.json).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Unmatched media items
  // =========================================================================

  describe('GET /unmatched', () => {
    const handler = handlers['GET /unmatched'];

    it('returns paginated unmatched items', async () => {
      const items = [{ id: 1 }];
      mockUnmatchedRepo.findAndCount.mockResolvedValue([items, 1]);
      const res = mockRes();
      await handler(mockReq({ query: {} }), res);
      expect(res.json).toHaveBeenCalledWith({
        pageInfo: { pages: 1, page: 1, results: 1 },
        results: items,
      });
    });

    it('clamps take to max 100', async () => {
      mockUnmatchedRepo.findAndCount.mockResolvedValue([[], 0]);
      const res = mockRes();
      await handler(mockReq({ query: { take: '999' } }), res);
      expect(mockUnmatchedRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });
  });

  describe('GET /unmatched/count', () => {
    const handler = handlers['GET /unmatched/count'];

    it('returns count', async () => {
      mockUnmatchedRepo.count.mockResolvedValue(42);
      const res = mockRes();
      await handler(mockReq(), res);
      expect(res.json).toHaveBeenCalledWith({ count: 42 });
    });
  });

  describe('DELETE /unmatched/:id', () => {
    const handler = handlers['DELETE /unmatched/:id'];

    it('400 for invalid ID', async () => {
      const res = mockRes();
      await handler(mockReq({ params: { id: 'abc' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('404 when not found', async () => {
      mockUnmatchedRepo.findOne.mockResolvedValue(null);
      const res = mockRes();
      await handler(mockReq({ params: { id: '1' } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('removes item and returns success', async () => {
      mockUnmatchedRepo.findOne.mockResolvedValue({ id: 1 });
      const res = mockRes();
      await handler(mockReq({ params: { id: '1' } }), res);
      expect(mockUnmatchedRepo.remove).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });
});
