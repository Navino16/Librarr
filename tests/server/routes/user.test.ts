import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReq, mockRes } from './_testHelper';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  handlers,
  mockHasPermission,
  mockBcryptHash,
  mockBcryptCompare,
  mockUserRepo,
  mockUserSettingsRepo,
  mockRequestRepo,
  mockGetInstance,
  mockInvalidateUserCache,
  mockResolveEffectiveQuota,
  mockGetQuotaUsage,
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
    mockBcryptHash: vi.fn().mockResolvedValue('hashed_pw'),
    mockBcryptCompare: vi.fn().mockResolvedValue(false),
    mockUserRepo: {
      findAndCount: vi.fn().mockResolvedValue([[], 0]),
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn((data: any) => data),
      save: vi.fn((data: any) => Promise.resolve(data)),
      remove: vi.fn().mockResolvedValue(undefined),
    },
    mockUserSettingsRepo: {
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn((data: any) => data),
      save: vi.fn((data: any) => Promise.resolve(data)),
    },
    mockRequestRepo: {
      count: vi.fn().mockResolvedValue(0),
      createQueryBuilder: vi.fn().mockReturnValue(qb),
    },
    mockGetInstance: vi.fn(),
    mockInvalidateUserCache: vi.fn(),
    mockResolveEffectiveQuota: vi.fn().mockReturnValue(null),
    mockGetQuotaUsage: vi.fn().mockResolvedValue(0),
  };
});

// ---------------------------------------------------------------------------
// Sentinel classes for getRepository dispatch
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
  default: { hash: mockBcryptHash, compare: mockBcryptCompare },
}));

vi.mock('@server/datasource', () => ({
  default: {
    getRepository: vi.fn((entity: any) => {
      if (entity === MockUser) return mockUserRepo;
      if (entity === MockUserSettings) return mockUserSettingsRepo;
      if (entity === MockBookRequest || entity === MockMusicRequest) return mockRequestRepo;
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

/** Regular user (no admin, no manage_users) */
function defaultUser(overrides: Record<string, any> = {}) {
  return { id: 1, permissions: 0, ...overrides };
}

/** Admin user (Permission.ADMIN = 2) */
function adminUser(overrides: Record<string, any> = {}) {
  return { id: 1, permissions: 2, ...overrides };
}

/** Manager user (Permission.MANAGE_USERS = 4) */
function managerUser(overrides: Record<string, any> = {}) {
  return { id: 1, permissions: 4, ...overrides };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('routes/user', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-set defaults after clearAllMocks
    mockHasPermission.mockReturnValue(false);
    mockBcryptHash.mockResolvedValue('hashed_pw');
    mockBcryptCompare.mockResolvedValue(false);
    mockUserRepo.findAndCount.mockResolvedValue([[], 0]);
    mockUserRepo.findOne.mockResolvedValue(null);
    mockUserRepo.create.mockImplementation((data: any) => data);
    mockUserRepo.save.mockImplementation((data: any) => Promise.resolve(data));
    mockUserSettingsRepo.findOne.mockResolvedValue(null);
    mockUserSettingsRepo.create.mockImplementation((data: any) => data);
    mockUserSettingsRepo.save.mockImplementation((data: any) => Promise.resolve(data));
  });

  // -------------------------------------------------------------------------
  // GET /
  // -------------------------------------------------------------------------

  describe('GET /', () => {
    const handler = handlers['GET /'];

    it('returns paginated users', async () => {
      const users = [
        { id: 1, username: 'alice' },
        { id: 2, username: 'bob' },
      ];
      mockUserRepo.findAndCount.mockResolvedValue([users, 2]);

      const req = mockReq({ query: { take: '10', skip: '0' }, user: adminUser() });
      const res = mockRes();
      await handler(req, res);

      expect(mockUserRepo.findAndCount).toHaveBeenCalledWith({
        order: { id: 'ASC' },
        take: 10,
        skip: 0,
      });
      expect(res.json).toHaveBeenCalledWith({
        pageInfo: { pages: 1, page: 1, results: 2 },
        results: users.map((u) => ({ ...u, requestCount: 0 })),
      });
    });

    it('clamps take to max 100', async () => {
      mockUserRepo.findAndCount.mockResolvedValue([[], 0]);

      const req = mockReq({ query: { take: '999' }, user: adminUser() });
      const res = mockRes();
      await handler(req, res);

      expect(mockUserRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 })
      );
    });
  });

  // -------------------------------------------------------------------------
  // POST /
  // -------------------------------------------------------------------------

  describe('POST /', () => {
    const handler = handlers['POST /'];

    it('400 when fields missing', async () => {
      const req = mockReq({ body: { email: 'a@b.com' }, user: adminUser() });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Email, username and password are required' });
    });

    it('400 for short password', async () => {
      const req = mockReq({
        body: { email: 'a@b.com', username: 'alice', password: 'short' },
        user: adminUser(),
      });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Password must be 8-256 characters' });
    });

    it('409 when email already exists', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 99, email: 'a@b.com' });

      const req = mockReq({
        body: { email: 'a@b.com', username: 'alice', password: 'password123' },
        user: adminUser(),
      });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ error: 'A user with this email already exists' });
    });

    it('201 on success, password excluded from response', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      mockUserRepo.create.mockImplementation((data: any) => ({ id: 10, ...data }));
      mockUserRepo.save.mockImplementation((data: any) => Promise.resolve(data));
      mockGetInstance.mockReturnValue({ main: { defaultPermissions: 8 } });

      const req = mockReq({
        body: { email: 'a@b.com', username: 'alice', password: 'password123' },
        user: adminUser(),
      });
      const res = mockRes();
      await handler(req, res);

      expect(mockBcryptHash).toHaveBeenCalledWith('password123', 12);
      expect(mockUserRepo.create).toHaveBeenCalledWith({
        email: 'a@b.com',
        username: 'alice',
        password: 'hashed_pw',
        userType: 3, // UserType.LOCAL
        permissions: 8,
      });
      expect(res.status).toHaveBeenCalledWith(201);
      // The response should NOT include password
      const jsonCall = res.json.mock.calls[0][0];
      expect(jsonCall).not.toHaveProperty('password');
      expect(jsonCall).toHaveProperty('email', 'a@b.com');
    });
  });

  // -------------------------------------------------------------------------
  // GET /:id
  // -------------------------------------------------------------------------

  describe('GET /:id', () => {
    const handler = handlers['GET /:id'];

    it('400 for invalid ID', async () => {
      const req = mockReq({ params: { id: 'abc' }, user: defaultUser() });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid ID' });
    });

    it('403 when non-admin views other user', async () => {
      // hasPermission returns false for both ADMIN and MANAGE_USERS
      mockHasPermission.mockReturnValue(false);

      const req = mockReq({ params: { id: '2' }, user: defaultUser({ id: 1 }) });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
    });

    it('404 when not found', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      const req = mockReq({ params: { id: '1' }, user: defaultUser({ id: 1 }) });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('returns user for self', async () => {
      const user = { id: 1, username: 'alice' };
      mockUserRepo.findOne.mockResolvedValue(user);

      const req = mockReq({ params: { id: '1' }, user: defaultUser({ id: 1 }) });
      const res = mockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(user);
    });

    it('returns user for admin viewing another', async () => {
      const targetUser = { id: 2, username: 'bob' };
      mockUserRepo.findOne.mockResolvedValue(targetUser);
      // First call: hasPermission(permissions, ADMIN) => true
      mockHasPermission.mockReturnValue(true);

      const req = mockReq({ params: { id: '2' }, user: adminUser({ id: 1 }) });
      const res = mockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(targetUser);
    });
  });

  // -------------------------------------------------------------------------
  // PUT /:id
  // -------------------------------------------------------------------------

  describe('PUT /:id', () => {
    const handler = handlers['PUT /:id'];

    it('400 for invalid ID', async () => {
      const req = mockReq({ params: { id: 'abc' }, body: {}, user: defaultUser() });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid ID' });
    });

    it('403 when non-admin edits other user', async () => {
      mockHasPermission.mockReturnValue(false);

      const req = mockReq({ params: { id: '2' }, body: {}, user: defaultUser({ id: 1 }) });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
    });

    it('404 when not found', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      const req = mockReq({
        params: { id: '1' },
        body: { username: 'newname' },
        user: defaultUser({ id: 1 }),
      });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('403 when non-admin modifies admin user', async () => {
      const targetAdmin = { id: 1, username: 'admin', permissions: 2 };
      mockUserRepo.findOne.mockResolvedValue(targetAdmin);
      // hasPermission is called to check: target has ADMIN? yes. Requester has ADMIN? no.
      mockHasPermission.mockImplementation((perms: number, perm: number) => {
        // target.permissions=2 has ADMIN(2) => true; requester.permissions=4 has ADMIN(2) => false
        if (perms === 2 && perm === 2) return true;
        // Allow MANAGE_USERS check on requester to pass the 403 guard on line 114
        if (perms === 4 && perm === 4) return true;
        return false;
      });

      const req = mockReq({
        params: { id: '1' },
        body: { username: 'hacked' },
        user: managerUser({ id: 5, permissions: 4 }),
      });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Only admins can modify admin users' });
    });

    it('updates username and email', async () => {
      const existingUser = { id: 1, username: 'old', email: 'old@test.com', permissions: 0 };
      mockUserRepo.findOne.mockResolvedValue(existingUser);

      const req = mockReq({
        params: { id: '1' },
        body: { username: 'newname', email: 'new@test.com' },
        user: defaultUser({ id: 1 }),
      });
      const res = mockRes();

      // No other user with that email
      mockUserRepo.findOne
        .mockResolvedValueOnce(existingUser) // first call: find user by id
        .mockResolvedValueOnce(null); // second call: check email uniqueness

      await handler(req, res);

      expect(mockUserRepo.save).toHaveBeenCalled();
      const saved = mockUserRepo.save.mock.calls[0][0];
      expect(saved.username).toBe('newname');
      expect(saved.email).toBe('new@test.com');
      expect(res.json).toHaveBeenCalledWith(saved);
      expect(mockInvalidateUserCache).toHaveBeenCalledWith(1);
    });

    it('400 for invalid username', async () => {
      const existingUser = { id: 1, username: 'old', email: 'old@test.com', permissions: 0 };
      mockUserRepo.findOne.mockResolvedValue(existingUser);

      const req = mockReq({
        params: { id: '1' },
        body: { username: '' },
        user: defaultUser({ id: 1 }),
      });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Username must be between 1 and 100 characters' });
    });

    it('409 when email already taken', async () => {
      const existingUser = { id: 1, username: 'alice', email: 'old@test.com', permissions: 0 };
      const otherUser = { id: 2, email: 'taken@test.com' };
      mockUserRepo.findOne
        .mockResolvedValueOnce(existingUser) // find user by id
        .mockResolvedValueOnce(otherUser); // email uniqueness check

      const req = mockReq({
        params: { id: '1' },
        body: { email: 'taken@test.com' },
        user: defaultUser({ id: 1 }),
      });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ error: 'A user with this email already exists' });
    });

    it('updates avatar', async () => {
      const existingUser = { id: 1, username: 'alice', avatar: null, permissions: 0 };
      mockUserRepo.findOne.mockResolvedValue(existingUser);

      const req = mockReq({
        params: { id: '1' },
        body: { avatar: 'https://example.com/avatar.png' },
        user: defaultUser({ id: 1 }),
      });
      const res = mockRes();
      await handler(req, res);

      expect(mockUserRepo.save).toHaveBeenCalled();
      const saved = mockUserRepo.save.mock.calls[0][0];
      expect(saved.avatar).toBe('https://example.com/avatar.png');
    });

    it('400 for invalid avatar', async () => {
      const existingUser = { id: 1, username: 'alice', avatar: null, permissions: 0 };
      mockUserRepo.findOne.mockResolvedValue(existingUser);

      const req = mockReq({
        params: { id: '1' },
        body: { avatar: 'x'.repeat(501) },
        user: defaultUser({ id: 1 }),
      });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Avatar must be a string of at most 500 characters' });
    });

    it('admin can update quota fields', async () => {
      const existingUser = { id: 2, username: 'bob', permissions: 0 };
      mockUserRepo.findOne.mockResolvedValue(existingUser);
      // Admin has ADMIN and MANAGE_USERS
      mockHasPermission.mockImplementation((perms: number, perm: number) => {
        if (perm === 2 && perms === 2) return true; // ADMIN check
        return false;
      });

      const req = mockReq({
        params: { id: '2' },
        body: { ebookQuotaLimit: 10, audiobookQuotaLimit: 8, musicQuotaLimit: 5 },
        user: adminUser({ id: 1 }),
      });
      const res = mockRes();
      await handler(req, res);

      expect(mockUserRepo.save).toHaveBeenCalled();
      const saved = mockUserRepo.save.mock.calls[0][0];
      expect(saved.ebookQuotaLimit).toBe(10);
      expect(saved.audiobookQuotaLimit).toBe(8);
      expect(saved.musicQuotaLimit).toBe(5);
    });

    it('non-admin cannot update quota fields (quota ignored, not error)', async () => {
      const existingUser = { id: 1, username: 'alice', permissions: 0, ebookQuotaLimit: 0 };
      mockUserRepo.findOne.mockResolvedValue(existingUser);
      // hasPermission returns false for everything (non-admin, non-manager)
      mockHasPermission.mockReturnValue(false);

      const req = mockReq({
        params: { id: '1' },
        body: { ebookQuotaLimit: 999 },
        user: defaultUser({ id: 1, permissions: 0 }),
      });
      const res = mockRes();
      await handler(req, res);

      // Should succeed but quota should NOT be updated
      expect(mockUserRepo.save).toHaveBeenCalled();
      const saved = mockUserRepo.save.mock.calls[0][0];
      expect(saved.ebookQuotaLimit).toBe(0); // unchanged
      expect(res.json).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /:id
  // -------------------------------------------------------------------------

  describe('DELETE /:id', () => {
    const handler = handlers['DELETE /:id'];

    it('400 for invalid ID', async () => {
      const req = mockReq({ params: { id: 'abc' }, user: adminUser() });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid ID' });
    });

    it('400 when deleting own account', async () => {
      const req = mockReq({ params: { id: '1' }, user: adminUser({ id: 1 }) });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Cannot delete your own account' });
    });

    it('404 when not found', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      const req = mockReq({ params: { id: '2' }, user: adminUser({ id: 1 }) });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('403 when non-admin deletes admin user', async () => {
      const targetAdmin = { id: 2, username: 'admin', permissions: 2 };
      mockUserRepo.findOne.mockResolvedValue(targetAdmin);
      mockHasPermission.mockImplementation((perms: number, perm: number) => {
        // target.permissions=2 has ADMIN(2) => true
        if (perms === 2 && perm === 2) return true;
        return false;
      });

      const req = mockReq({ params: { id: '2' }, user: managerUser({ id: 5, permissions: 4 }) });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Only admins can delete admin users' });
    });

    it('deletes user', async () => {
      const targetUser = { id: 2, username: 'bob', permissions: 0 };
      mockUserRepo.findOne.mockResolvedValue(targetUser);
      mockHasPermission.mockReturnValue(false); // target is not admin

      const req = mockReq({ params: { id: '2' }, user: adminUser({ id: 1 }) });
      const res = mockRes();
      await handler(req, res);

      expect(mockUserRepo.remove).toHaveBeenCalledWith(targetUser);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  // -------------------------------------------------------------------------
  // GET /:id/settings/main
  // -------------------------------------------------------------------------

  describe('GET /:id/settings/main', () => {
    const handler = handlers['GET /:id/settings/main'];

    it('400 for invalid ID', async () => {
      const req = mockReq({ params: { id: 'abc' }, user: defaultUser() });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid ID' });
    });

    it('403 for non-admin viewing other user settings', async () => {
      mockHasPermission.mockReturnValue(false);

      const req = mockReq({ params: { id: '2' }, user: defaultUser({ id: 1 }) });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
    });

    it('creates settings if not exists', async () => {
      mockUserSettingsRepo.findOne.mockResolvedValue(null);
      const createdSettings = { id: 1, locale: 'en', user: { id: 1 } };
      mockUserSettingsRepo.create.mockReturnValue(createdSettings);
      mockUserSettingsRepo.save.mockResolvedValue(createdSettings);

      const req = mockReq({ params: { id: '1' }, user: defaultUser({ id: 1 }) });
      const res = mockRes();
      await handler(req, res);

      expect(mockUserSettingsRepo.create).toHaveBeenCalledWith({ user: { id: 1 } });
      expect(mockUserSettingsRepo.save).toHaveBeenCalledWith(createdSettings);
      expect(res.json).toHaveBeenCalledWith(createdSettings);
    });

    it('returns existing settings', async () => {
      const existingSettings = { id: 1, locale: 'fr', discordId: '12345' };
      mockUserSettingsRepo.findOne.mockResolvedValue(existingSettings);

      const req = mockReq({ params: { id: '1' }, user: defaultUser({ id: 1 }) });
      const res = mockRes();
      await handler(req, res);

      expect(mockUserSettingsRepo.create).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(existingSettings);
    });
  });

  // -------------------------------------------------------------------------
  // POST /:id/settings/main
  // -------------------------------------------------------------------------

  describe('POST /:id/settings/main', () => {
    const handler = handlers['POST /:id/settings/main'];

    it('400 for invalid locale', async () => {
      mockUserSettingsRepo.findOne.mockResolvedValue({ id: 1, locale: 'en' });

      const req = mockReq({
        params: { id: '1' },
        body: { locale: 'invalid-locale' },
        user: defaultUser({ id: 1 }),
      });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'locale must be a valid BCP 47 language tag (e.g., "en", "fr")',
      });
    });

    it('updates settings fields', async () => {
      const existingSettings: any = { id: 1, locale: 'en' };
      mockUserSettingsRepo.findOne.mockResolvedValue(existingSettings);
      mockUserSettingsRepo.save.mockImplementation((data: any) => Promise.resolve(data));

      const req = mockReq({
        params: { id: '1' },
        body: {
          locale: 'fr',
          discordId: 'disc123',
          telegramChatId: 'tg456',
          pushbulletAccessToken: 'pb789',
          pushoverApplicationToken: 'po_app',
          pushoverUserKey: 'po_user',
        },
        user: defaultUser({ id: 1 }),
      });
      const res = mockRes();
      await handler(req, res);

      expect(mockUserSettingsRepo.save).toHaveBeenCalled();
      const saved = mockUserSettingsRepo.save.mock.calls[0][0];
      expect(saved.locale).toBe('fr');
      expect(saved.discordId).toBe('disc123');
      expect(saved.telegramChatId).toBe('tg456');
      expect(saved.pushbulletAccessToken).toBe('pb789');
      expect(saved.pushoverApplicationToken).toBe('po_app');
      expect(saved.pushoverUserKey).toBe('po_user');
      expect(mockInvalidateUserCache).toHaveBeenCalledWith(1);
    });

    it('403 for non-admin editing other user settings', async () => {
      mockHasPermission.mockReturnValue(false);

      const req = mockReq({
        params: { id: '2' },
        body: { locale: 'fr' },
        user: defaultUser({ id: 1 }),
      });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
    });
  });

  // -------------------------------------------------------------------------
  // POST /:id/settings/password
  // -------------------------------------------------------------------------

  describe('POST /:id/settings/password', () => {
    const handler = handlers['POST /:id/settings/password'];

    it('400 for invalid ID', async () => {
      const req = mockReq({ params: { id: 'abc' }, body: {}, user: defaultUser() });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid ID' });
    });

    it('400 for short password', async () => {
      const req = mockReq({
        params: { id: '1' },
        body: { newPassword: 'short' },
        user: defaultUser({ id: 1 }),
      });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Password must be 8-256 characters' });
    });

    it('404 when user not found', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      const req = mockReq({
        params: { id: '1' },
        body: { newPassword: 'newpassword123' },
        user: defaultUser({ id: 1 }),
      });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('400 when current password missing (own account)', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 1, password: 'hashed_existing' });

      const req = mockReq({
        params: { id: '1' },
        body: { newPassword: 'newpassword123' },
        user: defaultUser({ id: 1 }),
      });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Current password is required' });
    });

    it('401 when current password incorrect', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 1, password: 'hashed_existing' });
      mockBcryptCompare.mockResolvedValue(false);

      const req = mockReq({
        params: { id: '1' },
        body: { currentPassword: 'wrongpassword', newPassword: 'newpassword123' },
        user: defaultUser({ id: 1 }),
      });
      const res = mockRes();
      await handler(req, res);

      expect(mockBcryptCompare).toHaveBeenCalledWith('wrongpassword', 'hashed_existing');
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Current password is incorrect' });
    });

    it('success when admin changes another user password (no currentPassword needed)', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 2, password: 'hashed_existing' });
      mockHasPermission.mockReturnValue(true); // admin
      mockBcryptHash.mockResolvedValue('new_hashed_pw');

      const req = mockReq({
        params: { id: '2' },
        body: { newPassword: 'newpassword123' },
        user: adminUser({ id: 1 }),
      });
      const res = mockRes();
      await handler(req, res);

      // bcrypt.compare should NOT be called (admin changing someone else's password)
      expect(mockBcryptCompare).not.toHaveBeenCalled();
      expect(mockBcryptHash).toHaveBeenCalledWith('newpassword123', 12);
      expect(mockUserRepo.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('success when user changes own password', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 1, password: 'hashed_existing' });
      mockBcryptCompare.mockResolvedValue(true);
      mockBcryptHash.mockResolvedValue('new_hashed_pw');

      const req = mockReq({
        params: { id: '1' },
        body: { currentPassword: 'correctpassword', newPassword: 'newpassword123' },
        user: defaultUser({ id: 1 }),
      });
      const res = mockRes();
      await handler(req, res);

      expect(mockBcryptCompare).toHaveBeenCalledWith('correctpassword', 'hashed_existing');
      expect(mockBcryptHash).toHaveBeenCalledWith('newpassword123', 12);
      expect(mockUserRepo.save).toHaveBeenCalled();
      const saved = mockUserRepo.save.mock.calls[0][0];
      expect(saved.password).toBe('new_hashed_pw');
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  // -------------------------------------------------------------------------
  // GET /:id/settings/permissions
  // -------------------------------------------------------------------------

  describe('GET /:id/settings/permissions', () => {
    const handler = handlers['GET /:id/settings/permissions'];

    it('400 for invalid ID', async () => {
      const req = mockReq({ params: { id: 'abc' }, user: adminUser() });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid ID' });
    });

    it('404 when not found', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      const req = mockReq({ params: { id: '1' }, user: adminUser() });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('returns permissions', async () => {
      const user = { id: 1, permissions: 14 };
      mockUserRepo.findOne.mockResolvedValue(user);

      const req = mockReq({ params: { id: '1' }, user: adminUser() });
      const res = mockRes();
      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({ permissions: 14 });
    });
  });

  // -------------------------------------------------------------------------
  // POST /:id/settings/permissions
  // -------------------------------------------------------------------------

  describe('POST /:id/settings/permissions', () => {
    const handler = handlers['POST /:id/settings/permissions'];

    it('400 for invalid ID', async () => {
      const req = mockReq({ params: { id: 'abc' }, body: {}, user: adminUser() });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid ID' });
    });

    it('400 when changing own permissions', async () => {
      const req = mockReq({
        params: { id: '1' },
        body: { permissions: 8 },
        user: adminUser({ id: 1 }),
      });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Cannot change your own permissions' });
    });

    it('400 when permissions not a number', async () => {
      const req = mockReq({
        params: { id: '2' },
        body: { permissions: 'not_a_number' },
        user: adminUser({ id: 1 }),
      });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'permissions must be a number' });
    });

    it('403 when non-admin grants ADMIN', async () => {
      // permissions = 2 (ADMIN bit set), requester is not admin
      mockHasPermission.mockReturnValue(false);

      const req = mockReq({
        params: { id: '2' },
        body: { permissions: 2 }, // ADMIN permission
        user: managerUser({ id: 1, permissions: 4 }),
      });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Only admins can grant admin permission' });
    });

    it('403 for permission escalation', async () => {
      // Non-admin tries to grant permissions they do not have
      mockHasPermission.mockReturnValue(false);

      const req = mockReq({
        params: { id: '2' },
        // Try to grant REQUEST_EBOOK(8) + REQUEST_AUDIOBOOK(16) = 24
        // But requester only has MANAGE_USERS(4) + REQUEST_EBOOK(8) = 12
        body: { permissions: 24 },
        user: managerUser({ id: 1, permissions: 12 }),
      });
      const res = mockRes();
      await handler(req, res);

      // permissions=24 does not have ADMIN bit, so first check passes.
      // Then anti-escalation: grantedNew = 24 & ~12 = 16 (REQUEST_AUDIOBOOK), non-zero => 403.
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Cannot grant permissions you do not have' });
    });

    it('403 when non-admin modifies admin user', async () => {
      const targetAdmin = { id: 2, username: 'admin', permissions: 2 };
      mockUserRepo.findOne.mockResolvedValue(targetAdmin);
      // hasPermission: target has ADMIN => true, requester has ADMIN => false
      mockHasPermission.mockImplementation((perms: number, perm: number) => {
        if (perms === 2 && perm === 2) return true; // target has ADMIN
        return false;
      });

      const req = mockReq({
        params: { id: '2' },
        // Grant only permissions the requester has (so anti-escalation passes)
        body: { permissions: 4 }, // MANAGE_USERS only
        user: managerUser({ id: 1, permissions: 4 }),
      });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Only admins can modify admin users' });
    });

    it('404 when not found', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      mockHasPermission.mockReturnValue(true); // admin, bypass escalation checks

      const req = mockReq({
        params: { id: '99' },
        body: { permissions: 8 },
        user: adminUser({ id: 1 }),
      });
      const res = mockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('success updates permissions', async () => {
      const targetUser = { id: 2, username: 'bob', permissions: 0 };
      mockUserRepo.findOne.mockResolvedValue(targetUser);
      mockHasPermission.mockReturnValue(true); // admin

      const req = mockReq({
        params: { id: '2' },
        body: { permissions: 56 }, // REQUEST_EBOOK + REQUEST_AUDIOBOOK + REQUEST_MUSIC
        user: adminUser({ id: 1 }),
      });
      const res = mockRes();
      await handler(req, res);

      expect(mockUserRepo.save).toHaveBeenCalled();
      const saved = mockUserRepo.save.mock.calls[0][0];
      expect(saved.permissions).toBe(56);
      expect(mockInvalidateUserCache).toHaveBeenCalledWith(2);
      expect(res.json).toHaveBeenCalledWith({ permissions: 56 });
    });
  });
});
