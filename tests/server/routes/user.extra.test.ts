import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReq, mockRes } from './_testHelper';

// ---------------------------------------------------------------------------
// Hoisted mocks — cover quota and notifications branches
// ---------------------------------------------------------------------------

const {
  handlers,
  mockHasPermission,
  mockGetAllowedNotificationTypes,
  mockUserRepo,
  mockUserSettingsRepo,
  mockGetInstance,
  mockResolveEffectiveQuota,
  mockGetQuotaUsage,
  mockInvalidateUserCache,
} = vi.hoisted(() => {
  const qb: any = {};
  qb.select = vi.fn().mockReturnValue(qb);
  qb.addSelect = vi.fn().mockReturnValue(qb);
  qb.where = vi.fn().mockReturnValue(qb);
  qb.groupBy = vi.fn().mockReturnValue(qb);
  qb.getRawMany = vi.fn().mockResolvedValue([]);

  return {
    handlers: {} as Record<string, (...args: any[]) => any>,
    mockHasPermission: vi.fn().mockReturnValue(false),
    mockGetAllowedNotificationTypes: vi.fn().mockReturnValue(0xFFFF),
    mockUserRepo: {
      findAndCount: vi.fn().mockResolvedValue([[], 0]),
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn((data: any) => data),
      save: vi.fn((data: any) => Promise.resolve(data)),
      remove: vi.fn().mockResolvedValue(undefined),
      createQueryBuilder: vi.fn().mockReturnValue(qb),
    },
    mockUserSettingsRepo: {
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn((data: any) => data),
      save: vi.fn((data: any) => Promise.resolve(data)),
    },
    mockGetInstance: vi.fn(),
    mockInvalidateUserCache: vi.fn(),
    mockResolveEffectiveQuota: vi.fn().mockReturnValue(null),
    mockGetQuotaUsage: vi.fn().mockResolvedValue(0),
  };
});

// ---------------------------------------------------------------------------
// Sentinel classes
// ---------------------------------------------------------------------------

class MockUser {}
class MockUserSettings {}
class MockBookRequest {}
class MockMusicRequest {}

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
  default: { hash: vi.fn().mockResolvedValue('hashed'), compare: vi.fn() },
}));

vi.mock('@server/datasource', () => ({
  default: {
    getRepository: vi.fn((entity: any) => {
      if (entity === MockUser) return mockUserRepo;
      if (entity === MockUserSettings) return mockUserSettingsRepo;
      if (entity === MockBookRequest || entity === MockMusicRequest) return mockUserRepo;
      return mockUserRepo;
    }),
  },
}));

vi.mock('@server/entity/User', () => ({ User: MockUser }));
vi.mock('@server/entity/UserSettings', () => ({ UserSettings: MockUserSettings }));
vi.mock('@server/entity/BookRequest', () => ({ BookRequest: MockBookRequest }));
vi.mock('@server/entity/MusicRequest', () => ({ MusicRequest: MockMusicRequest }));

vi.mock('@server/lib/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@server/lib/permissions')>();
  return {
    ...actual,
    hasPermission: mockHasPermission,
    getAllowedNotificationTypes: mockGetAllowedNotificationTypes,
  };
});

vi.mock('@server/constants/user', () => ({
  UserType: { LOCAL: 3, JELLYFIN: 1, PLEX: 2 },
}));

vi.mock('@server/lib/settings', () => ({
  default: { getInstance: mockGetInstance },
}));

vi.mock('@server/lib/quota', () => ({
  resolveEffectiveQuota: mockResolveEffectiveQuota,
  getQuotaUsage: mockGetQuotaUsage,
}));

vi.mock('@server/middleware/auth', () => ({
  isAuthenticated: vi.fn((_req: any, _res: any, next: any) => next()),
  requirePermission: vi.fn(() => (_req: any, _res: any, next: any) => next()),
  invalidateUserCache: mockInvalidateUserCache,
}));

vi.mock('@server/middleware/asyncHandler', () => ({
  asyncHandler: vi.fn((fn: (...args: any[]) => any) => fn),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

await import('@server/routes/user/index');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultUser(overrides: Record<string, any> = {}) {
  return { id: 1, permissions: 0, ...overrides };
}

function adminUser(overrides: Record<string, any> = {}) {
  return { id: 1, permissions: 2, ...overrides };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('routes/user (extra — quota & notifications)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasPermission.mockReturnValue(false);
    mockGetAllowedNotificationTypes.mockReturnValue(0xFFFF);
    mockUserRepo.findOne.mockResolvedValue(null);
    mockUserRepo.findAndCount.mockResolvedValue([[], 0]);
    mockUserSettingsRepo.findOne.mockResolvedValue(null);
    mockUserSettingsRepo.create.mockImplementation((data: any) => data);
    mockUserSettingsRepo.save.mockImplementation((data: any) => Promise.resolve(data));
    mockResolveEffectiveQuota.mockReturnValue(null);
    mockGetQuotaUsage.mockResolvedValue(0);
  });

  // =========================================================================
  // GET /:id/quota
  // =========================================================================

  describe('GET /:id/quota', () => {
    const handler = () => handlers['GET /:id/quota'];

    it('returns 400 for invalid ID', async () => {
      const req = mockReq({ params: { id: 'abc' }, user: defaultUser() });
      const res = mockRes();
      await handler()(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid ID' });
    });

    it('returns 403 when non-admin views other user quota', async () => {
      mockHasPermission.mockReturnValue(false);

      const req = mockReq({ params: { id: '2' }, user: defaultUser({ id: 1 }) });
      const res = mockRes();
      await handler()(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
    });

    it('returns 404 when user not found', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      const req = mockReq({ params: { id: '1' }, user: defaultUser({ id: 1 }) });
      const res = mockRes();
      await handler()(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('returns quota usage for own account (null limits)', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 1, permissions: 0 });
      mockResolveEffectiveQuota.mockReturnValue(null);
      mockGetQuotaUsage.mockResolvedValue(3);

      const req = mockReq({ params: { id: '1' }, user: defaultUser({ id: 1 }) });
      const res = mockRes();
      await handler()(req, res);

      expect(res.json).toHaveBeenCalledWith({
        ebook: { limit: null, used: 3, remaining: null },
        audiobook: { limit: null, used: 3, remaining: null },
        music: { limit: null, used: 3, remaining: null },
      });
    });

    it('returns quota usage with numeric limits and remaining clamped at 0', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 1, permissions: 0 });
      // Limit = 5, used = 8 → remaining = max(0, 5-8) = 0
      mockResolveEffectiveQuota.mockReturnValue(5);
      mockGetQuotaUsage.mockResolvedValue(8);

      const req = mockReq({ params: { id: '1' }, user: defaultUser({ id: 1 }) });
      const res = mockRes();
      await handler()(req, res);

      expect(res.json).toHaveBeenCalledWith({
        ebook: { limit: 5, used: 8, remaining: 0 },
        audiobook: { limit: 5, used: 8, remaining: 0 },
        music: { limit: 5, used: 8, remaining: 0 },
      });
    });

    it('returns positive remaining when under quota', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 1, permissions: 0 });
      mockResolveEffectiveQuota.mockReturnValue(10);
      mockGetQuotaUsage.mockResolvedValue(3);

      const req = mockReq({ params: { id: '1' }, user: defaultUser({ id: 1 }) });
      const res = mockRes();
      await handler()(req, res);

      expect(res.json).toHaveBeenCalledWith({
        ebook: { limit: 10, used: 3, remaining: 7 },
        audiobook: { limit: 10, used: 3, remaining: 7 },
        music: { limit: 10, used: 3, remaining: 7 },
      });
    });

    it('allows admin to view other user quota', async () => {
      mockHasPermission.mockReturnValue(true);
      mockUserRepo.findOne.mockResolvedValue({ id: 2, permissions: 0 });
      mockResolveEffectiveQuota.mockReturnValue(null);
      mockGetQuotaUsage.mockResolvedValue(0);

      const req = mockReq({ params: { id: '2' }, user: adminUser({ id: 1 }) });
      const res = mockRes();
      await handler()(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ ebook: expect.any(Object) })
      );
    });
  });

  // =========================================================================
  // GET /:id/settings/main — sensitivity masking
  // =========================================================================

  describe('GET /:id/settings/main — token masking', () => {
    const handler = () => handlers['GET /:id/settings/main'];

    it('masks pushbullet and pushover tokens when they exist', async () => {
      const existingSettings = {
        id: 1,
        locale: 'en',
        pushbulletAccessToken: 'my-pb-token',
        pushoverApplicationToken: 'my-po-app',
        pushoverUserKey: 'my-po-key',
      };
      mockUserSettingsRepo.findOne.mockResolvedValue(existingSettings);

      const req = mockReq({ params: { id: '1' }, user: defaultUser({ id: 1 }) });
      const res = mockRes();
      await handler()(req, res);

      const returned = res.json.mock.calls[0][0];
      expect(returned.pushbulletAccessToken).toBe('********');
      expect(returned.pushoverApplicationToken).toBe('********');
      expect(returned.pushoverUserKey).toBe('********');
    });

    it('returns undefined for empty notification tokens', async () => {
      const existingSettings = {
        id: 1,
        locale: 'en',
        pushbulletAccessToken: '',
        pushoverApplicationToken: null,
        pushoverUserKey: undefined,
      };
      mockUserSettingsRepo.findOne.mockResolvedValue(existingSettings);

      const req = mockReq({ params: { id: '1' }, user: defaultUser({ id: 1 }) });
      const res = mockRes();
      await handler()(req, res);

      const returned = res.json.mock.calls[0][0];
      // Falsy values → undefined
      expect(returned.pushbulletAccessToken).toBeUndefined();
      expect(returned.pushoverApplicationToken).toBeUndefined();
      expect(returned.pushoverUserKey).toBeUndefined();
    });
  });

  // =========================================================================
  // POST /:id/settings/main — creates settings if not exists
  // =========================================================================

  describe('POST /:id/settings/main — creates settings if not exists', () => {
    const handler = () => handlers['POST /:id/settings/main'];

    it('creates settings when none exist', async () => {
      mockUserSettingsRepo.findOne.mockResolvedValue(null);
      const created = { id: 1, locale: 'en' };
      mockUserSettingsRepo.create.mockReturnValue(created);
      mockUserSettingsRepo.save.mockResolvedValue(created);

      const req = mockReq({
        params: { id: '1' },
        body: { locale: 'fr' },
        user: defaultUser({ id: 1 }),
      });
      const res = mockRes();
      await handler()(req, res);

      expect(mockUserSettingsRepo.create).toHaveBeenCalledWith({ user: { id: 1 } });
      expect(mockUserSettingsRepo.save).toHaveBeenCalled();
    });

    it('masks tokens in response', async () => {
      const existingSettings: any = {
        id: 1,
        locale: 'en',
        pushbulletAccessToken: 'pb-secret',
        pushoverApplicationToken: 'po-app-secret',
        pushoverUserKey: 'po-key-secret',
      };
      mockUserSettingsRepo.findOne.mockResolvedValue(existingSettings);
      mockUserSettingsRepo.save.mockImplementation((data: any) => Promise.resolve(data));

      const req = mockReq({
        params: { id: '1' },
        body: { locale: 'fr' },
        user: defaultUser({ id: 1 }),
      });
      const res = mockRes();
      await handler()(req, res);

      const returned = res.json.mock.calls[0][0];
      expect(returned.pushbulletAccessToken).toBe('********');
      expect(returned.pushoverApplicationToken).toBe('********');
      expect(returned.pushoverUserKey).toBe('********');
    });
  });

  // =========================================================================
  // GET /:id/settings/notifications
  // =========================================================================

  describe('GET /:id/settings/notifications', () => {
    const handler = () => handlers['GET /:id/settings/notifications'];

    it('returns 400 for invalid ID', async () => {
      const req = mockReq({ params: { id: 'abc' }, user: defaultUser() });
      const res = mockRes();
      await handler()(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid ID' });
    });

    it('returns 403 for non-admin viewing other user notifications', async () => {
      mockHasPermission.mockReturnValue(false);

      const req = mockReq({ params: { id: '2' }, user: defaultUser({ id: 1 }) });
      const res = mockRes();
      await handler()(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
    });

    it('creates settings if not exist and returns notificationTypes', async () => {
      mockUserSettingsRepo.findOne.mockResolvedValue(null);
      const created = { id: 1, notificationTypes: 0 };
      mockUserSettingsRepo.create.mockReturnValue(created);
      mockUserSettingsRepo.save.mockResolvedValue(created);

      const req = mockReq({ params: { id: '1' }, user: defaultUser({ id: 1 }) });
      const res = mockRes();
      await handler()(req, res);

      expect(mockUserSettingsRepo.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ notificationTypes: 0 });
    });

    it('returns existing notificationTypes', async () => {
      mockUserSettingsRepo.findOne.mockResolvedValue({ id: 1, notificationTypes: 42 });

      const req = mockReq({ params: { id: '1' }, user: defaultUser({ id: 1 }) });
      const res = mockRes();
      await handler()(req, res);

      expect(res.json).toHaveBeenCalledWith({ notificationTypes: 42 });
    });
  });

  // =========================================================================
  // POST /:id/settings/notifications
  // =========================================================================

  describe('POST /:id/settings/notifications', () => {
    const handler = () => handlers['POST /:id/settings/notifications'];

    it('returns 400 for invalid ID', async () => {
      const req = mockReq({ params: { id: 'abc' }, body: {}, user: defaultUser() });
      const res = mockRes();
      await handler()(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid ID' });
    });

    it('returns 403 for non-admin editing other user notifications', async () => {
      mockHasPermission.mockReturnValue(false);

      const req = mockReq({
        params: { id: '2' },
        body: { notificationTypes: 4 },
        user: defaultUser({ id: 1 }),
      });
      const res = mockRes();
      await handler()(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
    });

    it('returns 400 when notificationTypes is not a number', async () => {
      const req = mockReq({
        params: { id: '1' },
        body: { notificationTypes: 'not-a-number' },
        user: defaultUser({ id: 1 }),
      });
      const res = mockRes();
      await handler()(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'notificationTypes must be a number' });
    });

    it('returns 404 when target user not found', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      const req = mockReq({
        params: { id: '1' },
        body: { notificationTypes: 4 },
        user: defaultUser({ id: 1 }),
      });
      const res = mockRes();
      await handler()(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('masks notificationTypes against allowed types', async () => {
      const targetUser = { id: 1, permissions: 8 }; // REQUEST_EBOOK
      mockUserRepo.findOne.mockResolvedValue(targetUser);
      // Allow only types 0b1111 (15)
      mockGetAllowedNotificationTypes.mockReturnValue(15);

      const existingSettings = { id: 1, notificationTypes: 0 };
      mockUserSettingsRepo.findOne.mockResolvedValue(existingSettings);
      mockUserSettingsRepo.save.mockImplementation((data: any) => Promise.resolve(data));

      const req = mockReq({
        params: { id: '1' },
        body: { notificationTypes: 0b11111111 }, // 255 — only 15 should be kept
        user: defaultUser({ id: 1 }),
      });
      const res = mockRes();
      await handler()(req, res);

      expect(mockGetAllowedNotificationTypes).toHaveBeenCalledWith(8);
      expect(res.json).toHaveBeenCalledWith({ notificationTypes: 15 }); // 255 & 15 = 15
    });

    it('creates settings if not exist', async () => {
      const targetUser = { id: 1, permissions: 8 };
      mockUserRepo.findOne.mockResolvedValue(targetUser);
      mockGetAllowedNotificationTypes.mockReturnValue(0xFFFF);
      mockUserSettingsRepo.findOne.mockResolvedValue(null);
      const created = { id: 1, notificationTypes: 0 };
      mockUserSettingsRepo.create.mockReturnValue(created);
      mockUserSettingsRepo.save.mockImplementation((data: any) => Promise.resolve(data));

      const req = mockReq({
        params: { id: '1' },
        body: { notificationTypes: 4 },
        user: defaultUser({ id: 1 }),
      });
      const res = mockRes();
      await handler()(req, res);

      expect(mockUserSettingsRepo.create).toHaveBeenCalled();
      expect(mockUserSettingsRepo.save).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // PUT /:id — email validation branches
  // =========================================================================

  describe('PUT /:id — additional validation branches', () => {
    const handler = () => handlers['PUT /:id'];

    it('returns 400 for email that is empty string', async () => {
      const existingUser = { id: 1, username: 'alice', email: 'old@test.com', permissions: 0 };
      mockUserRepo.findOne.mockResolvedValue(existingUser);

      const req = mockReq({
        params: { id: '1' },
        body: { email: '' },
        user: defaultUser({ id: 1 }),
      });
      const res = mockRes();
      await handler()(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Email must be between 1 and 255 characters' });
    });

    it('returns 400 for ebookQuotaLimit that is not number', async () => {
      const existingUser = { id: 1, username: 'alice', permissions: 0 };
      mockUserRepo.findOne.mockResolvedValue(existingUser);
      mockHasPermission.mockReturnValue(true); // admin

      const req = mockReq({
        params: { id: '2' },
        body: { ebookQuotaLimit: 'not-a-number' },
        user: adminUser({ id: 1 }),
      });
      const res = mockRes();
      await handler()(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'ebookQuotaLimit must be a number or null' });
    });

    it('returns 400 for audiobookQuotaLimit that is not number', async () => {
      const existingUser = { id: 2, username: 'bob', permissions: 0 };
      mockUserRepo.findOne.mockResolvedValue(existingUser);
      mockHasPermission.mockReturnValue(true); // admin

      const req = mockReq({
        params: { id: '2' },
        body: { audiobookQuotaLimit: 'not-a-number' },
        user: adminUser({ id: 1 }),
      });
      const res = mockRes();
      await handler()(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'audiobookQuotaLimit must be a number or null' });
    });

    it('returns 400 for musicQuotaLimit that is not number', async () => {
      const existingUser = { id: 2, username: 'bob', permissions: 0 };
      mockUserRepo.findOne.mockResolvedValue(existingUser);
      mockHasPermission.mockReturnValue(true); // admin

      const req = mockReq({
        params: { id: '2' },
        body: { musicQuotaLimit: 'not-a-number' },
        user: adminUser({ id: 1 }),
      });
      const res = mockRes();
      await handler()(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'musicQuotaLimit must be a number or null' });
    });

    it('accepts null quota values (clearing quotas)', async () => {
      const existingUser = { id: 2, username: 'bob', permissions: 0, ebookQuotaLimit: 10 };
      mockUserRepo.findOne.mockResolvedValue(existingUser);
      mockHasPermission.mockReturnValue(true); // admin

      const req = mockReq({
        params: { id: '2' },
        body: { ebookQuotaLimit: null },
        user: adminUser({ id: 1 }),
      });
      const res = mockRes();
      await handler()(req, res);

      expect(mockUserRepo.save).toHaveBeenCalled();
      const saved = mockUserRepo.save.mock.calls[0][0];
      expect(saved.ebookQuotaLimit).toBeNull();
    });

    it('same email does not trigger uniqueness check', async () => {
      const existingUser = { id: 1, username: 'alice', email: 'same@test.com', permissions: 0 };
      mockUserRepo.findOne.mockResolvedValue(existingUser);

      const req = mockReq({
        params: { id: '1' },
        body: { email: 'same@test.com' }, // same email as current
        user: defaultUser({ id: 1 }),
      });
      const res = mockRes();
      await handler()(req, res);

      // findOne called once (for finding the user), NOT a second time for uniqueness
      expect(mockUserRepo.findOne).toHaveBeenCalledTimes(1);
      expect(mockUserRepo.save).toHaveBeenCalled();
    });

    it('avatar null is accepted', async () => {
      const existingUser = { id: 1, username: 'alice', avatar: 'old-url', permissions: 0 };
      mockUserRepo.findOne.mockResolvedValue(existingUser);

      const req = mockReq({
        params: { id: '1' },
        body: { avatar: null },
        user: defaultUser({ id: 1 }),
      });
      const res = mockRes();
      await handler()(req, res);

      const saved = mockUserRepo.save.mock.calls[0][0];
      expect(saved.avatar).toBeNull();
    });
  });

  // =========================================================================
  // POST /:id/settings/password — extra branches
  // =========================================================================

  describe('POST /:id/settings/password — extra branches', () => {
    const handler = () => handlers['POST /:id/settings/password'];

    it('403 when non-admin changes another user password', async () => {
      mockHasPermission.mockReturnValue(false);

      const req = mockReq({
        params: { id: '2' },
        body: { newPassword: 'newpassword123' },
        user: defaultUser({ id: 1, permissions: 0 }),
      });
      const res = mockRes();
      await handler()(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
    });

    it('400 for password that is too long', async () => {
      const req = mockReq({
        params: { id: '1' },
        body: { newPassword: 'x'.repeat(257) },
        user: defaultUser({ id: 1 }),
      });
      const res = mockRes();
      await handler()(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Password must be 8-256 characters' });
    });

    it('skips currentPassword check when user has no password hash', async () => {
      // User account has no password (e.g. OIDC user)
      mockUserRepo.findOne.mockResolvedValue({ id: 1, password: null });
      const { default: bcrypt } = await import('bcrypt');
      (bcrypt.hash as any).mockResolvedValue('new_hash');

      const req = mockReq({
        params: { id: '1' },
        body: { newPassword: 'newpassword123' },
        user: defaultUser({ id: 1 }),
      });
      const res = mockRes();
      await handler()(req, res);

      // No comparison needed (no existing hash)
      expect(bcrypt.compare).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  // =========================================================================
  // GET / — with request counts
  // =========================================================================

  describe('GET / — request count aggregation', () => {
    const handler = () => handlers['GET /'];

    it('aggregates book and music request counts per user', async () => {
      const users = [{ id: 1, username: 'alice' }];
      mockUserRepo.findAndCount.mockResolvedValue([users, 1]);

      // Simulate getRawMany returning counts
      const qb: any = {};
      qb.select = vi.fn().mockReturnValue(qb);
      qb.addSelect = vi.fn().mockReturnValue(qb);
      qb.where = vi.fn().mockReturnValue(qb);
      qb.groupBy = vi.fn().mockReturnValue(qb);
      // First call (BookRequest) returns 2, second call (MusicRequest) returns 1
      qb.getRawMany = vi.fn()
        .mockResolvedValueOnce([{ userId: 1, cnt: '2' }])
        .mockResolvedValueOnce([{ userId: 1, cnt: '1' }]);
      mockUserRepo.createQueryBuilder = vi.fn().mockReturnValue(qb);

      const req = mockReq({ query: { take: '10', skip: '0' }, user: adminUser() });
      const res = mockRes();
      await handler()(req, res);

      expect(res.json).toHaveBeenCalledWith({
        pageInfo: { pages: 1, page: 1, results: 1 },
        results: [{ id: 1, username: 'alice', requestCount: 3 }],
      });
    });
  });
});
