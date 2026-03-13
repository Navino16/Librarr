import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReq, mockRes } from './_testHelper';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  handlers,
  mockFindOne,
  mockSave,
  mockCompare,
  mockHash,
  mockUuid,
  mockInvalidateUserCache,
  mockSendPasswordReset,
  mockGetInstance,
} = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => any>,
  mockFindOne: vi.fn(),
  mockSave: vi.fn(),
  mockCompare: vi.fn(),
  mockHash: vi.fn(),
  mockUuid: vi.fn(),
  mockInvalidateUserCache: vi.fn(),
  mockSendPasswordReset: vi.fn(),
  mockGetInstance: vi.fn(),
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

vi.mock('express-rate-limit', () => ({
  default: vi.fn(() => (_req: any, _res: any, next: any) => next()),
  ipKeyGenerator: vi.fn(),
}));

vi.mock('bcrypt', () => ({
  default: {
    compare: mockCompare,
    hash: mockHash,
  },
}));

vi.mock('uuid', () => ({
  v4: mockUuid,
}));

vi.mock('@server/datasource', () => ({
  default: {
    getRepository: vi.fn(() => ({
      findOne: mockFindOne,
      save: mockSave,
    })),
  },
}));

vi.mock('@server/entity/User', () => ({
  User: class User {},
}));

vi.mock('@server/middleware/auth', () => ({
  isAuthenticated: vi.fn((_req: any, _res: any, next: any) => next()),
  invalidateUserCache: mockInvalidateUserCache,
}));

vi.mock('@server/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@server/constants/user', () => ({
  UserType: { JELLYFIN: 1, PLEX: 2, LOCAL: 3 },
}));

vi.mock('@server/lib/notifications/agents/email', () => ({
  default: { sendPasswordReset: mockSendPasswordReset },
}));

vi.mock('@server/lib/settings', () => ({
  default: { getInstance: mockGetInstance },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

await import('@server/routes/auth');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('routes/auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // POST /local
  // =========================================================================

  describe('POST /local', () => {
    const handler = handlers['POST /local'];

    it('returns 400 when email is missing', async () => {
      const res = mockRes();
      await handler(mockReq({ body: { password: 'pass' } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Email and password are required' });
    });

    it('returns 400 when password is missing', async () => {
      const res = mockRes();
      await handler(mockReq({ body: { email: 'a@b.com' } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Email and password are required' });
    });

    it('returns 400 when password exceeds 256 chars', async () => {
      const res = mockRes();
      await handler(mockReq({ body: { email: 'a@b.com', password: 'x'.repeat(257) } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Password is too long' });
    });

    it('returns 401 when user not found', async () => {
      mockFindOne.mockResolvedValue(null);

      const res = mockRes();
      await handler(mockReq({ body: { email: 'a@b.com', password: 'pass123' } }), res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
    });

    it('returns 401 when user has no password hash', async () => {
      mockFindOne.mockResolvedValue({ id: 1, email: 'a@b.com', password: null });

      const res = mockRes();
      await handler(mockReq({ body: { email: 'a@b.com', password: 'pass123' } }), res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
    });

    it('returns 401 when password is wrong', async () => {
      mockFindOne.mockResolvedValue({ id: 1, email: 'a@b.com', password: '$hashed' });
      mockCompare.mockResolvedValue(false);

      const res = mockRes();
      await handler(mockReq({ body: { email: 'a@b.com', password: 'wrong' } }), res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
    });

    it('returns user on successful login and sets session', async () => {
      const user = { id: 1, email: 'a@b.com', username: 'user1', password: '$hashed', permissions: 2, userType: 1, avatar: null };
      mockFindOne.mockResolvedValue(user);
      mockCompare.mockResolvedValue(true);
      mockGetInstance.mockReturnValue({ main: { localLogin: true } });

      const session: any = {
        regenerate: vi.fn((cb: (err?: Error) => void) => cb()),
        save: vi.fn((cb: (err?: Error) => void) => cb()),
        userId: undefined,
      };

      const res = mockRes();
      await handler(mockReq({ body: { email: 'a@b.com', password: 'pass123' }, session }), res);

      expect(session.regenerate).toHaveBeenCalled();
      expect(session.userId).toBe(1);
      expect(res.json).toHaveBeenCalledWith({
        id: 1,
        email: 'a@b.com',
        username: 'user1',
        permissions: 2,
        userType: 1,
        avatar: null,
      });
    });

    it('returns 500 when session regeneration fails', async () => {
      const user = { id: 1, email: 'a@b.com', username: 'user1', password: '$hashed', permissions: 2, userType: 1, avatar: null };
      mockFindOne.mockResolvedValue(user);
      mockCompare.mockResolvedValue(true);
      mockGetInstance.mockReturnValue({ main: { localLogin: true } });

      const session: any = {
        regenerate: vi.fn((cb: (err?: Error) => void) => cb(new Error('session store error'))),
      };

      const res = mockRes();
      await handler(mockReq({ body: { email: 'a@b.com', password: 'pass123' }, session }), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });

    it('returns 500 on unexpected error', async () => {
      mockFindOne.mockRejectedValue(new Error('DB down'));

      const res = mockRes();
      await handler(mockReq({ body: { email: 'a@b.com', password: 'pass123' } }), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });
  });

  // =========================================================================
  // POST /logout
  // =========================================================================

  describe('POST /logout', () => {
    const handler = handlers['POST /logout'];

    it('destroys session and clears cookie on success', () => {
      const session: any = {
        destroy: vi.fn((cb: (err?: Error) => void) => cb()),
      };

      const res = mockRes();
      handler(mockReq({ session }), res);

      expect(session.destroy).toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalledWith('connect.sid');
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('returns 500 when session destroy fails', () => {
      const session: any = {
        destroy: vi.fn((cb: (err?: Error) => void) => cb(new Error('fail'))),
      };

      const res = mockRes();
      handler(mockReq({ session }), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to logout' });
    });
  });

  // =========================================================================
  // GET /me
  // =========================================================================

  describe('GET /me', () => {
    const handler = handlers['GET /me'];

    it('returns user without notification tokens', () => {
      const user = {
        id: 1,
        username: 'admin',
        settings: {
          locale: 'en',
          pushbulletAccessToken: 'secret-pb',
          pushoverApplicationToken: 'secret-po-app',
          pushoverUserKey: 'secret-po-user',
        },
      };

      const res = mockRes();
      handler(mockReq({ user }), res);

      const returned = res.json.mock.calls[0][0];
      expect(returned.id).toBe(1);
      expect(returned.settings.locale).toBe('en');
      expect(returned.settings.pushbulletAccessToken).toBe('********');
      expect(returned.settings.pushoverApplicationToken).toBe('********');
      expect(returned.settings.pushoverUserKey).toBe('********');
    });

    it('returns user without settings', () => {
      const user = { id: 1, username: 'admin' };

      const res = mockRes();
      handler(mockReq({ user }), res);

      expect(res.json).toHaveBeenCalledWith({ id: 1, username: 'admin' });
    });
  });

  // =========================================================================
  // POST /reset-password
  // =========================================================================

  describe('POST /reset-password', () => {
    const handler = handlers['POST /reset-password'];

    it('creates a reset token and sends email for LOCAL user', async () => {
      const user = { id: 1, email: 'a@b.com', userType: 3 } as any; // LOCAL = 3
      mockFindOne.mockResolvedValue(user);
      mockUuid.mockReturnValue('guid-123');
      mockSendPasswordReset.mockResolvedValue(true);
      mockGetInstance.mockReturnValue({
        main: { applicationUrl: 'http://localhost:5055', appTitle: 'Librarr' },
      });

      const res = mockRes();
      await handler(mockReq({ body: { email: 'a@b.com' } }), res);

      expect(user.resetPasswordGuid).toBe('guid-123');
      expect(user.resetPasswordExpiry).toBeInstanceOf(Date);
      expect(mockSave).toHaveBeenCalledWith(user);
      expect(mockSendPasswordReset).toHaveBeenCalledWith(
        'a@b.com',
        'http://localhost:5055/login/reset-password/guid-123',
        'Librarr'
      );
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('skips non-LOCAL user (Jellyfin/Plex)', async () => {
      const user = { id: 2, email: 'jelly@b.com', userType: 1 } as any; // JELLYFIN = 1
      mockFindOne.mockResolvedValue(user);

      const res = mockRes();
      await handler(mockReq({ body: { email: 'jelly@b.com' } }), res);

      expect(mockSave).not.toHaveBeenCalled();
      expect(mockSendPasswordReset).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('does not send email when applicationUrl is not configured', async () => {
      const user = { id: 1, email: 'a@b.com', userType: 3 } as any;
      mockFindOne.mockResolvedValue(user);
      mockUuid.mockReturnValue('guid-456');
      mockGetInstance.mockReturnValue({
        main: { applicationUrl: undefined, appTitle: 'Librarr' },
      });

      const res = mockRes();
      await handler(mockReq({ body: { email: 'a@b.com' } }), res);

      expect(user.resetPasswordGuid).toBe('guid-456');
      expect(mockSave).toHaveBeenCalled();
      expect(mockSendPasswordReset).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('returns 500 on unexpected error', async () => {
      mockFindOne.mockRejectedValue(new Error('DB crash'));

      const res = mockRes();
      await handler(mockReq({ body: { email: 'a@b.com' } }), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });

    it('returns success even when user not found (anti-enumeration)', async () => {
      mockFindOne.mockResolvedValue(null);

      const res = mockRes();
      await handler(mockReq({ body: { email: 'nobody@test.com' } }), res);

      expect(mockSave).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  // =========================================================================
  // POST /reset-password/:guid
  // =========================================================================

  describe('POST /reset-password/:guid', () => {
    const handler = handlers['POST /reset-password/:guid'];

    it('returns 400 for invalid password length', async () => {
      const res = mockRes();
      await handler(mockReq({ params: { guid: 'g1' }, body: { password: 'short' } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Password must be 8-256 characters' });
    });

    it('returns 404 for invalid token', async () => {
      mockFindOne.mockResolvedValue(null);

      const res = mockRes();
      await handler(mockReq({ params: { guid: 'bad-guid' }, body: { password: 'validpass123' } }), res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid reset token' });
    });

    it('returns 400 for expired token', async () => {
      const user = {
        id: 1,
        resetPasswordGuid: 'g1',
        resetPasswordExpiry: new Date(Date.now() - 3600_000), // expired 1h ago
      };
      mockFindOne.mockResolvedValue(user);

      const res = mockRes();
      await handler(mockReq({ params: { guid: 'g1' }, body: { password: 'validpass123' } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Reset token has expired' });
      expect(user.resetPasswordGuid).toBeUndefined();
      expect(mockSave).toHaveBeenCalled();
    });

    it('returns 500 on unexpected error', async () => {
      mockFindOne.mockRejectedValue(new Error('DB crash'));

      const res = mockRes();
      await handler(mockReq({ params: { guid: 'g1' }, body: { password: 'validpass123' } }), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });

    it('resets password on valid token', async () => {
      const user = {
        id: 1,
        resetPasswordGuid: 'g1',
        resetPasswordExpiry: new Date(Date.now() + 3600_000), // valid for 1h
      } as any;
      mockFindOne.mockResolvedValue(user);
      mockHash.mockResolvedValue('$newhash');

      const res = mockRes();
      await handler(mockReq({ params: { guid: 'g1' }, body: { password: 'newpassword123' } }), res);

      expect(mockHash).toHaveBeenCalledWith('newpassword123', 12);
      expect(user.password).toBe('$newhash');
      expect(user.resetPasswordGuid).toBeUndefined();
      expect(user.resetPasswordExpiry).toBeUndefined();
      expect(mockSave).toHaveBeenCalledWith(user);
      expect(mockInvalidateUserCache).toHaveBeenCalledWith(1);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });
});
