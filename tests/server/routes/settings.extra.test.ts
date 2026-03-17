import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReq, mockRes } from './_testHelper';
import { Permission } from '@server/lib/permissions';

// ---------------------------------------------------------------------------
// Hoisted mocks — cover branches missing from settings.test.ts
// ---------------------------------------------------------------------------

const {
  handlers,
  mockGetInstance,
  mockSave,
  mockUnmatchedRepo,
  mockUserRepo,
  mockBcryptHash,
  mockValidateConnectionTarget,
  mockBuildServerUrl,
  mockResetMetadataResolver,
  mockCacheFlush,
  mockEmailAgentTest,
  mockNotificationManagerTest,
} = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => any>,
  mockGetInstance: vi.fn(),
  mockSave: vi.fn(),
  mockUnmatchedRepo: {
    findAndCount: vi.fn().mockResolvedValue([[], 0]),
    count: vi.fn().mockResolvedValue(0),
    findOne: vi.fn().mockResolvedValue(null),
    remove: vi.fn(),
  },
  mockUserRepo: {
    create: vi.fn((data: any) => ({ id: 1, ...data })),
    save: vi.fn((data: any) => data),
  },
  mockBcryptHash: vi.fn().mockResolvedValue('hashed_pw'),
  mockValidateConnectionTarget: vi.fn().mockResolvedValue(null),
  mockBuildServerUrl: vi.fn().mockReturnValue('http://localhost:8787'),
  mockResetMetadataResolver: vi.fn(),
  mockCacheFlush: vi.fn(),
  mockEmailAgentTest: vi.fn().mockResolvedValue(true),
  mockNotificationManagerTest: vi.fn().mockResolvedValue(true),
}));

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
vi.mock('@server/constants/user', () => ({ UserType: { LOCAL: 3 } }));

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
      search: ['hardcover'],
      description: ['hardcover'],
      cover: ['hardcover'],
      editions: ['hardcover'],
      ratings: ['hardcover'],
    },
  },
}));

vi.mock('@server/api/servarr/readarr', () => ({
  default: vi.fn().mockImplementation(function (this: any) { this.testConnection = vi.fn().mockResolvedValue(true); }),
}));
vi.mock('@server/api/servarr/lidarr', () => ({
  default: vi.fn().mockImplementation(function (this: any) { this.testConnection = vi.fn().mockResolvedValue(true); }),
}));
vi.mock('@server/api/audiobookshelf', () => ({
  default: vi.fn().mockImplementation(function (this: any) { this.testConnection = vi.fn().mockResolvedValue(true); }),
}));
vi.mock('@server/api/jellyfin', () => ({
  default: vi.fn().mockImplementation(function (this: any) { this.testConnection = vi.fn().mockResolvedValue(true); }),
}));
vi.mock('@server/api/plexapi', () => ({
  default: vi.fn().mockImplementation(function (this: any) { this.testConnection = vi.fn().mockResolvedValue(true); }),
}));

vi.mock('@server/job/schedule', () => ({
  getJobs: vi.fn().mockReturnValue([]),
  runJob: vi.fn().mockReturnValue(true),
}));

vi.mock('@server/lib/notifications', () => ({
  default: { testAgent: mockNotificationManagerTest },
}));

vi.mock('@server/lib/notifications/agents/email', () => ({
  default: { test: mockEmailAgentTest },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

await import('@server/routes/settings/index');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function settingsObj(overrides: Record<string, any> = {}) {
  return {
    main: {
      initialized: true,
      appTitle: 'Librarr',
      applicationUrl: '',
      hideAvailable: false,
      localLogin: true,
      plexLogin: false,
      oidcLogin: false,
      defaultPermissions: 8,
      hardcoverToken: '',
      enableEbookRequests: true,
      enableAudiobookRequests: true,
      enableMusicRequests: true,
      ...overrides.main,
    },
    public: { appTitle: 'Librarr', initialized: true },
    roles: overrides.roles ?? [],
    readarr: overrides.readarr ?? [],
    lidarr: overrides.lidarr ?? [],
    audiobookshelf: overrides.audiobookshelf ?? { hostname: '', port: 0, apiKey: '', useSsl: false, baseUrl: '' },
    jellyfin: overrides.jellyfin ?? { hostname: '', port: 0, apiKey: '', useSsl: false, baseUrl: '', serverId: '' },
    plex: overrides.plex ?? { hostname: '', port: 0, token: '', useSsl: false, machineId: '' },
    plexAuth: overrides.plexAuth ?? { autoCreateUsers: false, defaultPermissions: 8 },
    oidcProviders: overrides.oidcProviders ?? [],
    metadataProviders: overrides.metadataProviders ?? {
      hardcover: { enabled: true },
      openlibrary: { enabled: true },
      googlebooks: { enabled: true },
      priority: { search: ['hardcover'], description: ['hardcover'], cover: ['hardcover'], editions: ['hardcover'], ratings: ['hardcover'] },
    },
    notifications: overrides.notifications ?? {
      agents: {},
      smtp: null,
    },
    save: mockSave,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('routes/settings (extra — notifications, OIDC, roles branches)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRepo.create.mockImplementation((data: any) => ({ id: 1, ...data }));
    mockUserRepo.save.mockImplementation((data: any) => data);
    mockBcryptHash.mockResolvedValue('hashed_pw');
    mockValidateConnectionTarget.mockResolvedValue(null);
    mockEmailAgentTest.mockResolvedValue(true);
    mockNotificationManagerTest.mockResolvedValue(true);
  });

  // =========================================================================
  // POST /main — additional branches
  // =========================================================================

  describe('POST /main — branch coverage', () => {
    const handler = () => handlers['POST /main'];

    it('400 for invalid appTitle (empty)', () => {
      mockGetInstance.mockReturnValue(settingsObj());
      const res = mockRes();
      handler()(mockReq({ body: { appTitle: '   ' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'appTitle must be a non-empty string (max 255 chars)' });
    });

    it('400 for invalid applicationUrl', () => {
      mockGetInstance.mockReturnValue(settingsObj());
      const res = mockRes();
      handler()(mockReq({ body: { applicationUrl: 'not-a-url' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'applicationUrl must be a valid URL' });
    });

    it('allows empty applicationUrl (clears it)', () => {
      const s = settingsObj();
      mockGetInstance.mockReturnValue(s);
      const res = mockRes();
      handler()(mockReq({ body: { applicationUrl: '' } }), res);
      expect(s.main.applicationUrl).toBe('');
      expect(mockSave).toHaveBeenCalled();
    });

    it('400 for non-finite defaultPermissions', () => {
      mockGetInstance.mockReturnValue(settingsObj());
      const res = mockRes();
      handler()(mockReq({ body: { defaultPermissions: NaN } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'defaultPermissions must be a number' });
    });

    it('strips ADMIN bit from defaultPermissions', () => {
      const s = settingsObj();
      mockGetInstance.mockReturnValue(s);
      const res = mockRes();
      // Permission.ADMIN = 2, so permissions 3 (ADMIN|something) should strip ADMIN
      handler()(mockReq({ body: { defaultPermissions: 3 } }), res);
      // 3 & ~2 = 1
      expect(s.main.defaultPermissions).toBe(1);
    });

    it('ignores hardcoverToken if empty string', () => {
      const s = settingsObj({ main: { hardcoverToken: 'existing-token' } });
      mockGetInstance.mockReturnValue(s);
      const res = mockRes();
      handler()(mockReq({ body: { hardcoverToken: '' } }), res);
      // Empty token should not update
      expect(s.main.hardcoverToken).toBe('existing-token');
    });
  });

  // =========================================================================
  // GET /notifications — smtp masking
  // =========================================================================

  describe('GET /notifications', () => {
    const handler = () => handlers['GET /notifications'];

    it('returns masked SMTP password', () => {
      mockGetInstance.mockReturnValue(settingsObj({
        notifications: {
          agents: {},
          smtp: {
            host: 'smtp.example.com',
            port: 587,
            authPass: 'my-secret-pass',
            authUser: 'user@example.com',
          },
        },
      }));

      const res = mockRes();
      handler()(mockReq(), res);

      const returned = res.json.mock.calls[0][0];
      expect(returned.smtp.authPass).toBe('********');
    });

    it('returns empty authPass when not set', () => {
      mockGetInstance.mockReturnValue(settingsObj({
        notifications: {
          agents: {},
          smtp: {
            host: 'smtp.example.com',
            port: 587,
            authPass: '',
            authUser: 'user@example.com',
          },
        },
      }));

      const res = mockRes();
      handler()(mockReq(), res);

      const returned = res.json.mock.calls[0][0];
      expect(returned.smtp.authPass).toBe('');
    });

    it('returns undefined smtp when not configured', () => {
      mockGetInstance.mockReturnValue(settingsObj({ notifications: { agents: {}, smtp: null } }));

      const res = mockRes();
      handler()(mockReq(), res);

      const returned = res.json.mock.calls[0][0];
      expect(returned.smtp).toBeUndefined();
    });
  });

  // =========================================================================
  // POST /notifications/:agentId
  // =========================================================================

  describe('POST /notifications/:agentId', () => {
    const handler = () => handlers['POST /notifications/:agentId'];

    it('returns 400 for invalid agentId', () => {
      mockGetInstance.mockReturnValue(settingsObj());
      const res = mockRes();
      handler()(mockReq({ params: { agentId: 'invalid-agent' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid agent ID' });
    });

    it('creates agent config if not exists', () => {
      const s = settingsObj({ notifications: { agents: {}, smtp: null } });
      mockGetInstance.mockReturnValue(s);

      const res = mockRes();
      handler()(mockReq({
        params: { agentId: 'discord' },
        body: { enabled: true, types: 3, options: { webhookUrl: 'https://discord.com/webhook' } },
        user: { id: 1 },
      }), res);

      expect(mockSave).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, types: 3 }));
    });

    it('updates existing agent config', () => {
      const s = settingsObj({
        notifications: {
          agents: { discord: { enabled: false, types: 0, options: {} } },
          smtp: null,
        },
      });
      mockGetInstance.mockReturnValue(s);

      const res = mockRes();
      handler()(mockReq({
        params: { agentId: 'discord' },
        body: { enabled: true },
        user: { id: 1 },
      }), res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    });

    it('handles email agent', () => {
      const s = settingsObj({ notifications: { agents: {}, smtp: null } });
      mockGetInstance.mockReturnValue(s);

      const res = mockRes();
      handler()(mockReq({
        params: { agentId: 'email' },
        body: { enabled: true, types: 1 },
        user: { id: 1 },
      }), res);

      expect(mockSave).toHaveBeenCalled();
    });

    it('merges options object', () => {
      const s = settingsObj({
        notifications: {
          agents: { webhook: { enabled: true, types: 1, options: { url: 'http://old.com' } } },
          smtp: null,
        },
      });
      mockGetInstance.mockReturnValue(s);

      const res = mockRes();
      handler()(mockReq({
        params: { agentId: 'webhook' },
        body: { options: { url: 'http://new.com', newField: 'value' } },
        user: { id: 1 },
      }), res);

      const returned = res.json.mock.calls[0][0];
      expect(returned.options.url).toBe('http://new.com');
      expect(returned.options.newField).toBe('value');
    });
  });

  // =========================================================================
  // POST /notifications/smtp/config
  // =========================================================================

  describe('POST /notifications/smtp/config', () => {
    const handler = () => handlers['POST /notifications/smtp/config'];

    it('creates SMTP config from scratch', () => {
      const s = settingsObj({ notifications: { agents: {}, smtp: null } });
      mockGetInstance.mockReturnValue(s);

      const res = mockRes();
      handler()(mockReq({
        body: {
          host: 'smtp.example.com',
          port: 587,
          secure: false,
          authUser: 'user@example.com',
          authPass: 'pass',
          senderAddress: 'noreply@example.com',
          senderName: 'Librarr',
        },
        user: { id: 1 },
      }), res);

      expect(mockSave).toHaveBeenCalled();
      const returned = res.json.mock.calls[0][0];
      expect(returned.host).toBe('smtp.example.com');
      expect(returned.authPass).toBe('********'); // masked
    });

    it('merges with existing SMTP config', () => {
      const s = settingsObj({
        notifications: {
          agents: {},
          smtp: {
            host: 'old-smtp.example.com',
            port: 465,
            secure: true,
            authUser: 'user',
            authPass: 'old-pass',
            senderAddress: 'old@example.com',
            senderName: 'Old Name',
            requireTls: true,
            allowSelfSigned: false,
          },
        },
      });
      mockGetInstance.mockReturnValue(s);

      const res = mockRes();
      handler()(mockReq({
        body: { host: 'new-smtp.example.com' }, // only update host
        user: { id: 1 },
      }), res);

      const returned = res.json.mock.calls[0][0];
      expect(returned.host).toBe('new-smtp.example.com');
      expect(returned.port).toBe(465); // unchanged
      expect(returned.authPass).toBe('********'); // masked because old-pass is truthy
    });

    it('returns empty authPass when cleared', () => {
      const s = settingsObj({
        notifications: {
          agents: {},
          smtp: { host: 'smtp.ex.com', port: 587, secure: false, authUser: '', authPass: '', senderAddress: '', senderName: '', requireTls: false, allowSelfSigned: false },
        },
      });
      mockGetInstance.mockReturnValue(s);

      const res = mockRes();
      handler()(mockReq({
        body: { authPass: '' },
        user: { id: 1 },
      }), res);

      const returned = res.json.mock.calls[0][0];
      expect(returned.authPass).toBe('');
    });
  });

  // =========================================================================
  // POST /notifications/:agentId/test
  // =========================================================================

  describe('POST /notifications/:agentId/test', () => {
    const handler = () => handlers['POST /notifications/:agentId/test'];

    it('returns 400 for invalid agent', async () => {
      const res = mockRes();
      await handler()(mockReq({ params: { agentId: 'invalid' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid agent ID' });
    });

    it('sends email test to recipientEmail from body', async () => {
      mockEmailAgentTest.mockResolvedValue(true);
      const res = mockRes();
      await handler()(mockReq({
        params: { agentId: 'email' },
        body: { recipientEmail: 'test@test.com' },
        user: { id: 1, email: 'user@test.com' },
      }), res);

      expect(mockEmailAgentTest).toHaveBeenCalledWith('test@test.com');
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('falls back to user email for email test', async () => {
      mockEmailAgentTest.mockResolvedValue(true);
      const res = mockRes();
      await handler()(mockReq({
        params: { agentId: 'email' },
        body: {},
        user: { id: 1, email: 'user@test.com' },
      }), res);

      expect(mockEmailAgentTest).toHaveBeenCalledWith('user@test.com');
    });

    it('returns 400 when no email available for email test', async () => {
      const res = mockRes();
      await handler()(mockReq({
        params: { agentId: 'email' },
        body: {},
        user: { id: 1, email: undefined },
      }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'No recipient email provided' });
    });

    it('tests discord agent', async () => {
      mockNotificationManagerTest.mockResolvedValue(true);
      const res = mockRes();
      await handler()(mockReq({
        params: { agentId: 'discord' },
        body: {},
        user: { id: 1 },
      }), res);

      expect(mockNotificationManagerTest).toHaveBeenCalledWith('discord');
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('tests webhook agent', async () => {
      mockNotificationManagerTest.mockResolvedValue(false);
      const res = mockRes();
      await handler()(mockReq({
        params: { agentId: 'webhook' },
        body: {},
        user: { id: 1 },
      }), res);

      expect(res.json).toHaveBeenCalledWith({ success: false });
    });
  });

  // =========================================================================
  // GET /servers-for-request
  // =========================================================================

  describe('GET /servers-for-request', () => {
    const handler = () => handlers['GET /servers-for-request'];

    it('returns ebook readarr servers', () => {
      mockGetInstance.mockReturnValue(settingsObj({
        readarr: [
          { id: 1, name: 'Readarr Books', contentType: 'ebook' },
          { id: 2, name: 'Readarr Audio', contentType: 'audiobook' },
        ],
      }));

      const res = mockRes();
      handler()(mockReq({ query: { type: 'book', format: 'ebook' } }), res);

      expect(res.json).toHaveBeenCalledWith([{ id: 1, name: 'Readarr Books' }]);
    });

    it('returns audiobook readarr servers', () => {
      mockGetInstance.mockReturnValue(settingsObj({
        readarr: [
          { id: 1, name: 'Readarr Books', contentType: 'ebook' },
          { id: 2, name: 'Readarr Audio', contentType: 'audiobook' },
        ],
      }));

      const res = mockRes();
      handler()(mockReq({ query: { type: 'book', format: 'audiobook' } }), res);

      expect(res.json).toHaveBeenCalledWith([{ id: 2, name: 'Readarr Audio' }]);
    });

    it('returns lidarr servers for music', () => {
      mockGetInstance.mockReturnValue(settingsObj({
        lidarr: [
          { id: 1, name: 'Lidarr', isDefault: true },
        ],
      }));

      const res = mockRes();
      handler()(mockReq({ query: { type: 'music' } }), res);

      expect(res.json).toHaveBeenCalledWith([{ id: 1, name: 'Lidarr', isDefault: true }]);
    });

    it('returns 400 for invalid type', () => {
      mockGetInstance.mockReturnValue(settingsObj());
      const res = mockRes();
      handler()(mockReq({ query: { type: 'invalid' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'type must be "book" or "music"' });
    });

    it('defaults to ebook when format is not audiobook', () => {
      mockGetInstance.mockReturnValue(settingsObj({
        readarr: [
          { id: 1, name: 'Readarr', contentType: 'ebook' },
        ],
      }));

      const res = mockRes();
      // format is not 'audiobook', so should default to 'ebook'
      handler()(mockReq({ query: { type: 'book' } }), res);

      expect(res.json).toHaveBeenCalledWith([{ id: 1, name: 'Readarr' }]);
    });

    it('handles readarr without contentType (defaults to ebook)', () => {
      mockGetInstance.mockReturnValue(settingsObj({
        readarr: [{ id: 1, name: 'Readarr' }], // no contentType field
      }));

      const res = mockRes();
      handler()(mockReq({ query: { type: 'book', format: 'ebook' } }), res);

      expect(res.json).toHaveBeenCalledWith([{ id: 1, name: 'Readarr' }]);
    });
  });

  // =========================================================================
  // OIDC providers — POST /oidc-providers branches
  // =========================================================================

  describe('POST /oidc-providers', () => {
    const handler = () => handlers['POST /oidc-providers'];

    it('returns 400 when name missing', () => {
      mockGetInstance.mockReturnValue(settingsObj());
      const res = mockRes();
      handler()(mockReq({ body: { issuerUrl: 'https://example.com', clientId: 'cid', clientSecret: 'cs' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Name is required' });
    });

    it('returns 400 when issuerUrl missing', () => {
      mockGetInstance.mockReturnValue(settingsObj());
      const res = mockRes();
      handler()(mockReq({ body: { name: 'Test', clientId: 'cid', clientSecret: 'cs' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Issuer URL is required' });
    });

    it('returns 400 for invalid issuerUrl format', () => {
      mockGetInstance.mockReturnValue(settingsObj());
      const res = mockRes();
      handler()(mockReq({ body: { name: 'Test', issuerUrl: 'not-a-url', clientId: 'cid', clientSecret: 'cs' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Issuer URL must be a valid URL' });
    });

    it('returns 400 for issuerUrl with invalid protocol', () => {
      mockGetInstance.mockReturnValue(settingsObj());
      const res = mockRes();
      handler()(mockReq({ body: { name: 'Test', issuerUrl: 'ftp://example.com', clientId: 'cid', clientSecret: 'cs' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Issuer URL must use https (or http for development)' });
    });

    it('returns 400 when clientId missing', () => {
      mockGetInstance.mockReturnValue(settingsObj());
      const res = mockRes();
      handler()(mockReq({ body: { name: 'Test', issuerUrl: 'https://example.com', clientSecret: 'cs' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Client ID is required' });
    });

    it('returns 400 when clientSecret missing', () => {
      mockGetInstance.mockReturnValue(settingsObj());
      const res = mockRes();
      handler()(mockReq({ body: { name: 'Test', issuerUrl: 'https://example.com', clientId: 'cid' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Client Secret is required' });
    });

    it('creates provider with all fields', () => {
      const s = settingsObj({ oidcProviders: [] });
      mockGetInstance.mockReturnValue(s);

      const res = mockRes();
      handler()(mockReq({
        body: {
          name: 'Test Provider',
          issuerUrl: 'https://accounts.example.com',
          clientId: 'my-client-id',
          clientSecret: 'my-client-secret',
          scopes: 'openid email',
          autoCreateUsers: true,
          defaultPermissions: 8,
        },
      }), res);

      expect(mockSave).toHaveBeenCalled();
      const returned = res.json.mock.calls[0][0];
      expect(returned.name).toBe('Test Provider');
      expect(returned.clientSecretSet).toBe(true);
      // clientSecret should NOT be in response
      expect(returned.clientSecret).toBeUndefined();
    });

    it('uses defaultPermissions from main when not provided', () => {
      const s = settingsObj({ oidcProviders: [], main: { defaultPermissions: 16 } });
      mockGetInstance.mockReturnValue(s);

      const res = mockRes();
      handler()(mockReq({
        body: {
          name: 'Test Provider',
          issuerUrl: 'https://accounts.example.com',
          clientId: 'cid',
          clientSecret: 'cs',
        },
      }), res);

      const returned = res.json.mock.calls[0][0];
      expect(returned.defaultPermissions).toBe(16);
    });
  });

  // =========================================================================
  // PUT /oidc-providers/:id — branches
  // =========================================================================

  describe('PUT /oidc-providers/:id', () => {
    const handler = () => handlers['PUT /oidc-providers/:id'];

    it('returns 404 when provider not found', () => {
      mockGetInstance.mockReturnValue(settingsObj({ oidcProviders: [] }));
      const res = mockRes();
      handler()(mockReq({ params: { id: 'nonexistent' }, body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Provider not found' });
    });

    it('updates provider fields', () => {
      const s = settingsObj({
        oidcProviders: [{ id: 'p1', name: 'Old Name', issuerUrl: 'https://example.com', clientId: 'cid', clientSecret: 'cs', scopes: 'openid', autoCreateUsers: false, defaultPermissions: 8 }],
      });
      mockGetInstance.mockReturnValue(s);

      const res = mockRes();
      handler()(mockReq({ params: { id: 'p1' }, body: { name: 'New Name', autoCreateUsers: true } }), res);

      expect(mockSave).toHaveBeenCalled();
      const returned = res.json.mock.calls[0][0];
      expect(returned.name).toBe('New Name');
      expect(returned.autoCreateUsers).toBe(true);
    });

    it('does not update clientSecret when empty string', () => {
      const s = settingsObj({
        oidcProviders: [{ id: 'p1', name: 'Provider', issuerUrl: 'https://example.com', clientId: 'cid', clientSecret: 'original-secret', scopes: 'openid', autoCreateUsers: false, defaultPermissions: 8 }],
      });
      mockGetInstance.mockReturnValue(s);

      const res = mockRes();
      handler()(mockReq({ params: { id: 'p1' }, body: { clientSecret: '' } }), res);

      // Empty string should NOT override existing secret
      expect(s.oidcProviders[0].clientSecret).toBe('original-secret');
    });

    it('returns 400 for invalid issuerUrl during update', () => {
      const s = settingsObj({
        oidcProviders: [{ id: 'p1', name: 'Provider', issuerUrl: 'https://example.com', clientId: 'cid', clientSecret: 'cs', scopes: 'openid', autoCreateUsers: false, defaultPermissions: 8 }],
      });
      mockGetInstance.mockReturnValue(s);

      const res = mockRes();
      handler()(mockReq({ params: { id: 'p1' }, body: { issuerUrl: 'invalid-url' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('updates defaultPermissions stripping ADMIN bit', () => {
      const s = settingsObj({
        oidcProviders: [{ id: 'p1', name: 'P', issuerUrl: 'https://example.com', clientId: 'cid', clientSecret: 'cs', scopes: 'openid', autoCreateUsers: false, defaultPermissions: 0 }],
      });
      mockGetInstance.mockReturnValue(s);

      const res = mockRes();
      handler()(mockReq({ params: { id: 'p1' }, body: { defaultPermissions: 3 } }), res); // 3 = ADMIN|1

      const returned = res.json.mock.calls[0][0];
      // 3 & ~2 = 1
      expect(returned.defaultPermissions).toBe(1);
    });
  });

  // =========================================================================
  // DELETE /oidc-providers/:id
  // =========================================================================

  describe('DELETE /oidc-providers/:id', () => {
    const handler = () => handlers['DELETE /oidc-providers/:id'];

    it('returns 404 when provider not found', () => {
      mockGetInstance.mockReturnValue(settingsObj({ oidcProviders: [] }));
      const res = mockRes();
      handler()(mockReq({ params: { id: 'nonexistent' } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Provider not found' });
    });

    it('deletes provider', () => {
      const s = settingsObj({
        oidcProviders: [{ id: 'p1', name: 'Provider' }],
      });
      mockGetInstance.mockReturnValue(s);

      const res = mockRes();
      handler()(mockReq({ params: { id: 'p1' } }), res);

      expect(mockSave).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ success: true });
      expect(s.oidcProviders).toHaveLength(0);
    });
  });

  // =========================================================================
  // POST /roles — quota validation branches
  // =========================================================================

  describe('POST /roles', () => {
    const handler = () => handlers['POST /roles'];

    it('400 for missing name', () => {
      mockGetInstance.mockReturnValue(settingsObj({ roles: [] }));
      const res = mockRes();
      handler()(mockReq({ body: { permissions: 8 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Name is required' });
    });

    it('400 for non-number permissions', () => {
      mockGetInstance.mockReturnValue(settingsObj({ roles: [] }));
      const res = mockRes();
      handler()(mockReq({ body: { name: 'Role', permissions: 'not-a-number' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Permissions must be a number' });
    });

    it('400 for invalid ebookQuotaLimit', () => {
      mockGetInstance.mockReturnValue(settingsObj({ roles: [] }));
      const res = mockRes();
      handler()(mockReq({ body: { name: 'Role', permissions: 8, ebookQuotaLimit: -1 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'ebookQuotaLimit must be a positive integer or null' });
    });

    it('400 for non-integer audiobookQuotaLimit', () => {
      mockGetInstance.mockReturnValue(settingsObj({ roles: [] }));
      const res = mockRes();
      handler()(mockReq({ body: { name: 'Role', permissions: 8, audiobookQuotaLimit: 1.5 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'audiobookQuotaLimit must be a positive integer or null' });
    });

    it('400 for invalid musicQuotaLimit', () => {
      mockGetInstance.mockReturnValue(settingsObj({ roles: [] }));
      const res = mockRes();
      handler()(mockReq({ body: { name: 'Role', permissions: 8, musicQuotaLimit: 'bad' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'musicQuotaLimit must be a positive integer or null' });
    });

    it('creates role successfully', () => {
      const s = settingsObj({ roles: [] });
      mockGetInstance.mockReturnValue(s);

      const res = mockRes();
      handler()(mockReq({ body: { name: 'Reader', permissions: 8, ebookQuotaLimit: 5 } }), res);

      expect(mockSave).toHaveBeenCalled();
      const returned = res.json.mock.calls[0][0];
      expect(returned.name).toBe('Reader');
      expect(returned.permissions).toBe(8);
      expect(returned.ebookQuotaLimit).toBe(5);
    });

    it('creates role without quota fields (undefined)', () => {
      const s = settingsObj({ roles: [] });
      mockGetInstance.mockReturnValue(s);

      const res = mockRes();
      handler()(mockReq({ body: { name: 'Basic', permissions: 0 } }), res);

      expect(mockSave).toHaveBeenCalled();
      const returned = res.json.mock.calls[0][0];
      expect(returned.ebookQuotaLimit).toBeUndefined();
    });
  });

  // =========================================================================
  // PUT /roles/:id
  // =========================================================================

  describe('PUT /roles/:id', () => {
    const handler = () => handlers['PUT /roles/:id'];

    it('400 for invalid ID', () => {
      mockGetInstance.mockReturnValue(settingsObj({ roles: [] }));
      const res = mockRes();
      handler()(mockReq({ params: { id: 'abc' }, body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid ID' });
    });

    it('404 when role not found', () => {
      mockGetInstance.mockReturnValue(settingsObj({ roles: [] }));
      const res = mockRes();
      handler()(mockReq({ params: { id: '999' }, body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Role not found' });
    });

    it('400 when trying to modify admin role', () => {
      // Permission is imported at top of file
      mockGetInstance.mockReturnValue(settingsObj({
        roles: [{ id: 1, name: 'Admin', permissions: Permission.ADMIN, isDefault: false }],
      }));

      const res = mockRes();
      handler()(mockReq({ params: { id: '1' }, body: { name: 'Hacked' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Cannot modify the Admin role' });
    });

    it('400 for empty name', () => {
      mockGetInstance.mockReturnValue(settingsObj({
        roles: [{ id: 1, name: 'Reader', permissions: 8, isDefault: false }],
      }));

      const res = mockRes();
      handler()(mockReq({ params: { id: '1' }, body: { name: '' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Name must be a non-empty string' });
    });

    it('400 for non-number permissions', () => {
      mockGetInstance.mockReturnValue(settingsObj({
        roles: [{ id: 1, name: 'Reader', permissions: 8, isDefault: false }],
      }));

      const res = mockRes();
      handler()(mockReq({ params: { id: '1' }, body: { permissions: 'bad' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Permissions must be a number' });
    });

    it('sets isDefault and updates defaultPermissions in main', () => {
      const s = settingsObj({
        roles: [
          { id: 1, name: 'Role1', permissions: 8, isDefault: true },
          { id: 2, name: 'Role2', permissions: 16, isDefault: false },
        ],
      });
      mockGetInstance.mockReturnValue(s);

      const res = mockRes();
      handler()(mockReq({ params: { id: '2' }, body: { isDefault: true } }), res);

      // Role 1 should no longer be default
      const role1 = s.roles.find((r: any) => r.id === 1);
      expect(role1?.isDefault).toBe(false);
      // defaultPermissions in main should be updated
      expect(s.main.defaultPermissions).toBe(16); // 16 & ~ADMIN
    });

    it('clears quota by setting null', () => {
      const s = settingsObj({
        roles: [{ id: 1, name: 'Reader', permissions: 8, isDefault: false, ebookQuotaLimit: 5 }],
      });
      mockGetInstance.mockReturnValue(s);

      const res = mockRes();
      handler()(mockReq({ params: { id: '1' }, body: { ebookQuotaLimit: null } }), res);

      const returned = res.json.mock.calls[0][0];
      expect(returned.ebookQuotaLimit).toBeUndefined(); // null maps to undefined
    });
  });

  // =========================================================================
  // DELETE /roles/:id
  // =========================================================================

  describe('DELETE /roles/:id', () => {
    const handler = () => handlers['DELETE /roles/:id'];

    it('400 for invalid ID', () => {
      mockGetInstance.mockReturnValue(settingsObj({ roles: [] }));
      const res = mockRes();
      handler()(mockReq({ params: { id: 'abc' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid ID' });
    });

    it('404 when role not found', () => {
      mockGetInstance.mockReturnValue(settingsObj({ roles: [] }));
      const res = mockRes();
      handler()(mockReq({ params: { id: '999' } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Role not found' });
    });

    it('400 when trying to delete admin role', () => {
      // Permission is imported at top of file
      mockGetInstance.mockReturnValue(settingsObj({
        roles: [{ id: 1, name: 'Admin', permissions: Permission.ADMIN, isDefault: false }],
      }));

      const res = mockRes();
      handler()(mockReq({ params: { id: '1' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Cannot delete the Admin role' });
    });

    it('400 when trying to delete default role', () => {
      mockGetInstance.mockReturnValue(settingsObj({
        roles: [{ id: 1, name: 'Default Role', permissions: 8, isDefault: true }],
      }));

      const res = mockRes();
      handler()(mockReq({ params: { id: '1' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Cannot delete the default role' });
    });

    it('deletes non-default, non-admin role', () => {
      const s = settingsObj({
        roles: [{ id: 1, name: 'Regular', permissions: 8, isDefault: false }],
      });
      mockGetInstance.mockReturnValue(s);

      const res = mockRes();
      handler()(mockReq({ params: { id: '1' } }), res);
      expect(mockSave).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ success: true });
      expect(s.roles).toHaveLength(0);
    });
  });

  // =========================================================================
  // POST /readarr — contentType and port validation
  // =========================================================================

  describe('POST /readarr', () => {
    const handler = () => handlers['POST /readarr'];

    it('400 for invalid contentType', () => {
      mockGetInstance.mockReturnValue(settingsObj({ readarr: [] }));
      const res = mockRes();
      handler()(mockReq({ body: { hostname: 'localhost', contentType: 'video' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'contentType must be "ebook" or "audiobook"' });
    });

    it('400 when existing server for same contentType', () => {
      mockGetInstance.mockReturnValue(settingsObj({
        readarr: [{ id: 1, hostname: 'existing', contentType: 'ebook' }],
      }));

      const res = mockRes();
      handler()(mockReq({ body: { hostname: 'new', contentType: 'ebook' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'A Readarr server for ebook already exists' });
    });

    it('400 for invalid port', () => {
      mockGetInstance.mockReturnValue(settingsObj({ readarr: [] }));
      const res = mockRes();
      handler()(mockReq({ body: { hostname: 'localhost', port: 99999 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'port must be between 1 and 65535' });
    });

    it('400 for missing hostname', () => {
      mockGetInstance.mockReturnValue(settingsObj({ readarr: [] }));
      const res = mockRes();
      handler()(mockReq({ body: { port: 8787 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'hostname is required' });
    });
  });

  // =========================================================================
  // PUT /readarr/:id — contentType change validation
  // =========================================================================

  describe('PUT /readarr/:id', () => {
    const handler = () => handlers['PUT /readarr/:id'];

    it('400 for invalid contentType', () => {
      mockGetInstance.mockReturnValue(settingsObj({ readarr: [{ id: 1, hostname: 'localhost', contentType: 'ebook' }] }));
      const res = mockRes();
      handler()(mockReq({ params: { id: '1' }, body: { contentType: 'video' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('400 when changing to contentType that already has a server', () => {
      mockGetInstance.mockReturnValue(settingsObj({
        readarr: [
          { id: 1, hostname: 'localhost', contentType: 'ebook' },
          { id: 2, hostname: 'other', contentType: 'audiobook' },
        ],
      }));

      const res = mockRes();
      // Try to change server 1 (ebook) to audiobook, but audiobook already exists
      handler()(mockReq({ params: { id: '1' }, body: { contentType: 'audiobook' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'A Readarr server for audiobook already exists' });
    });
  });

  // =========================================================================
  // POST /lidarr — port and isDefault handling
  // =========================================================================

  describe('POST /lidarr', () => {
    const handler = () => handlers['POST /lidarr'];

    it('400 for missing hostname', () => {
      mockGetInstance.mockReturnValue(settingsObj({ lidarr: [] }));
      const res = mockRes();
      handler()(mockReq({ body: { port: 8686 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'hostname is required' });
    });

    it('400 for invalid port', () => {
      mockGetInstance.mockReturnValue(settingsObj({ lidarr: [] }));
      const res = mockRes();
      handler()(mockReq({ body: { hostname: 'localhost', port: 0 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'port must be between 1 and 65535' });
    });

    it('clears isDefault on existing servers when adding a new default', () => {
      const s = settingsObj({
        lidarr: [{ id: 1, hostname: 'old', port: 8686, apiKey: 'key', isDefault: true }],
      });
      mockGetInstance.mockReturnValue(s);

      const res = mockRes();
      handler()(mockReq({ body: { hostname: 'new-lidarr', port: 8686, isDefault: true } }), res);

      // Old server should no longer be default
      const old = s.lidarr.find((l: any) => l.id === 1);
      expect(old?.isDefault).toBe(false);
    });
  });

  // =========================================================================
  // PUT /lidarr/:id — isDefault handling
  // =========================================================================

  describe('PUT /lidarr/:id', () => {
    const handler = () => handlers['PUT /lidarr/:id'];

    it('updates other servers isDefault to false when setting new default', () => {
      const s = settingsObj({
        lidarr: [
          { id: 1, hostname: 'lidarr1', port: 8686, isDefault: true },
          { id: 2, hostname: 'lidarr2', port: 8687, isDefault: false },
        ],
      });
      mockGetInstance.mockReturnValue(s);

      const res = mockRes();
      handler()(mockReq({ params: { id: '2' }, body: { isDefault: true } }), res);

      const server1 = s.lidarr.find((l: any) => l.id === 1);
      expect(server1?.isDefault).toBe(false);
    });
  });

  // =========================================================================
  // POST /plex-auth — branch coverage
  // =========================================================================

  describe('POST /plex-auth', () => {
    const handler = () => handlers['POST /plex-auth'];

    it('updates autoCreateUsers', () => {
      const s = settingsObj({ plexAuth: { autoCreateUsers: false, defaultPermissions: 8 } });
      mockGetInstance.mockReturnValue(s);

      const res = mockRes();
      handler()(mockReq({ body: { autoCreateUsers: true } }), res);

      expect(s.plexAuth.autoCreateUsers).toBe(true);
      expect(mockSave).toHaveBeenCalled();
    });

    it('updates defaultPermissions stripping ADMIN bit', () => {
      const s = settingsObj({ plexAuth: { autoCreateUsers: false, defaultPermissions: 8 } });
      mockGetInstance.mockReturnValue(s);

      const res = mockRes();
      handler()(mockReq({ body: { defaultPermissions: 3 } }), res); // 3 = ADMIN|1

      // 3 & ~2 = 1
      expect(s.plexAuth.defaultPermissions).toBe(1);
    });

    it('ignores non-number defaultPermissions', () => {
      const s = settingsObj({ plexAuth: { autoCreateUsers: false, defaultPermissions: 8 } });
      mockGetInstance.mockReturnValue(s);

      const res = mockRes();
      handler()(mockReq({ body: { defaultPermissions: 'invalid' } }), res);

      // Not changed
      expect(s.plexAuth.defaultPermissions).toBe(8);
    });
  });

  // =========================================================================
  // POST /metadata-providers — more branches
  // =========================================================================

  describe('POST /metadata-providers', () => {
    const handler = () => handlers['POST /metadata-providers'];

    it('400 when all providers disabled', () => {
      mockGetInstance.mockReturnValue(settingsObj({
        metadataProviders: {
          hardcover: { enabled: false },
          openlibrary: { enabled: false },
          googlebooks: { enabled: false },
          priority: { search: ['hardcover'], description: ['hardcover'], cover: ['hardcover'], editions: ['hardcover'], ratings: ['hardcover'] },
        },
      }));

      const res = mockRes();
      handler()(mockReq({
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

    it('400 for invalid provider format', () => {
      mockGetInstance.mockReturnValue(settingsObj());
      const res = mockRes();
      handler()(mockReq({
        body: { hardcover: 'not-an-object' },
        user: { id: 1 },
      }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'hardcover must be an object with an "enabled" boolean field' });
    });

    it('400 when priority is not an object', () => {
      mockGetInstance.mockReturnValue(settingsObj());
      const res = mockRes();
      handler()(mockReq({
        body: { priority: 'invalid' },
        user: { id: 1 },
      }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'priority must be an object' });
    });

    it('400 for invalid priority array', () => {
      mockGetInstance.mockReturnValue(settingsObj());
      const res = mockRes();
      handler()(mockReq({
        body: { priority: { search: ['invalid-source'] } },
        user: { id: 1 },
      }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: expect.stringContaining('priority.search') });
    });
  });

  // =========================================================================
  // Connection test endpoints — error branches
  // =========================================================================

  describe('POST /readarr/test — error branches', () => {
    const handler = () => handlers['POST /readarr/test'];

    it('returns 400 when host validation fails', async () => {
      mockValidateConnectionTarget.mockResolvedValue('Invalid hostname');
      const res = mockRes();
      await handler()(mockReq({ body: { hostname: 'invalid!', port: 8787, apiKey: 'key' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid hostname' });
    });

    it('returns 400 when no API key', async () => {
      mockValidateConnectionTarget.mockResolvedValue(null);
      mockGetInstance.mockReturnValue(settingsObj({ readarr: [] }));
      const res = mockRes();
      await handler()(mockReq({ body: { hostname: 'localhost', port: 8787 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'API key is required' });
    });

    it('resolves API key from existing server by serverId', async () => {
      mockValidateConnectionTarget.mockResolvedValue(null);
      mockGetInstance.mockReturnValue(settingsObj({
        readarr: [{ id: 5, hostname: 'localhost', port: 8787, apiKey: 'server-key' }],
      }));

      const res = mockRes();
      await handler()(mockReq({ body: { hostname: 'localhost', port: 8787, serverId: 5 } }), res);

      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('POST /lidarr/test — error branches', () => {
    const handler = () => handlers['POST /lidarr/test'];

    it('returns 400 when host validation fails', async () => {
      mockValidateConnectionTarget.mockResolvedValue('Invalid hostname');
      const res = mockRes();
      await handler()(mockReq({ body: { hostname: 'bad!', port: 8686, apiKey: 'k' } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when no API key', async () => {
      mockValidateConnectionTarget.mockResolvedValue(null);
      mockGetInstance.mockReturnValue(settingsObj({ lidarr: [] }));
      const res = mockRes();
      await handler()(mockReq({ body: { hostname: 'localhost', port: 8686 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'API key is required' });
    });

    it('resolves API key from existing lidarr server by serverId', async () => {
      mockValidateConnectionTarget.mockResolvedValue(null);
      mockGetInstance.mockReturnValue(settingsObj({
        lidarr: [{ id: 3, hostname: 'localhost', port: 8686, apiKey: 'lidarr-key' }],
      }));

      const res = mockRes();
      await handler()(mockReq({ body: { hostname: 'localhost', port: 8686, serverId: 3 } }), res);

      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('POST /audiobookshelf/test — error branches', () => {
    const handler = () => handlers['POST /audiobookshelf/test'];

    it('returns 400 when no API key', async () => {
      mockValidateConnectionTarget.mockResolvedValue(null);
      mockGetInstance.mockReturnValue(settingsObj({ audiobookshelf: { apiKey: null } }));
      const res = mockRes();
      await handler()(mockReq({ body: { hostname: 'localhost', port: 13378 } }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'API key is required' });
    });

    it('uses existing audiobookshelf apiKey when not provided', async () => {
      mockValidateConnectionTarget.mockResolvedValue(null);
      mockGetInstance.mockReturnValue(settingsObj({ audiobookshelf: { apiKey: 'abs-key' } }));

      const res = mockRes();
      await handler()(mockReq({ body: { hostname: 'localhost', port: 13378 } }), res);

      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('POST /plex/test — token branch', () => {
    const handler = () => handlers['POST /plex/test'];

    it('returns success: false when no token provided', async () => {
      const res = mockRes();
      await handler()(mockReq({ body: { hostname: 'plex.local', port: 32400 } }), res);
      expect(res.json).toHaveBeenCalledWith({ success: false });
    });
  });
});
