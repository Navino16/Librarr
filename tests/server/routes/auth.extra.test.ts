import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReq, mockRes } from './_testHelper';

// ---------------------------------------------------------------------------
// Hoisted mocks — these cover the Plex and OIDC branches of auth.ts
// ---------------------------------------------------------------------------

const {
  handlers,
  mockGetInstance,
  mockCreatePlexPin,
  mockCheckPlexPin,
  mockGetPlexUser,
  mockFindOrCreateUser,
  mockGenerateAuthorizationUrl,
  mockExchangeCode,
} = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => any>,
  mockGetInstance: vi.fn(),
  mockCreatePlexPin: vi.fn(),
  mockCheckPlexPin: vi.fn(),
  mockGetPlexUser: vi.fn(),
  mockFindOrCreateUser: vi.fn(),
  mockGenerateAuthorizationUrl: vi.fn(),
  mockExchangeCode: vi.fn(),
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
  default: { compare: vi.fn(), hash: vi.fn() },
}));

vi.mock('uuid', () => ({ v4: vi.fn() }));

vi.mock('@server/datasource', () => ({
  default: {
    getRepository: vi.fn(() => ({
      findOne: vi.fn().mockResolvedValue(null),
      save: vi.fn(),
    })),
  },
}));

vi.mock('@server/entity/User', () => ({
  User: class User {},
}));

vi.mock('@server/middleware/auth', () => ({
  isAuthenticated: vi.fn((_req: any, _res: any, next: any) => next()),
  invalidateUserCache: vi.fn(),
}));

vi.mock('@server/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@server/constants/user', () => ({
  UserType: { JELLYFIN: 1, PLEX: 2, LOCAL: 3 },
}));

vi.mock('@server/lib/notifications/agents/email', () => ({
  default: { sendPasswordReset: vi.fn() },
}));

vi.mock('@server/lib/settings', () => ({
  default: { getInstance: mockGetInstance },
}));

vi.mock('@server/lib/plexAuth', () => ({
  createPlexPin: mockCreatePlexPin,
  checkPlexPin: mockCheckPlexPin,
  getPlexUser: mockGetPlexUser,
}));

vi.mock('@server/lib/oidcAuth', () => ({
  generateAuthorizationUrl: mockGenerateAuthorizationUrl,
  exchangeCode: mockExchangeCode,
}));

vi.mock('@server/lib/authHelpers', () => ({
  findOrCreateUser: mockFindOrCreateUser,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

await import('@server/routes/auth');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('routes/auth (extra — Plex & OIDC branches)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // POST /local — local login disabled branch
  // =========================================================================

  describe('POST /local — local login disabled', () => {
    const handler = () => handlers['POST /local'];

    it('returns 403 when local login disabled and user is not admin', async () => {
      const { default: bcrypt } = await import('bcrypt');
      (bcrypt.compare as any).mockResolvedValue(true);

      const { default: ds } = await import('@server/datasource');
      (ds.getRepository as any).mockReturnValue({
        findOne: vi.fn().mockResolvedValue({
          id: 1, email: 'a@b.com', username: 'user1', password: '$hashed',
          permissions: 8, // REQUEST_EBOOK, not admin
          userType: 3,
          avatar: null,
        }),
        save: vi.fn(),
      });

      // Local login disabled, user is not admin
      mockGetInstance.mockReturnValue({ main: { localLogin: false } });

      const res = mockRes();
      await handler()(mockReq({ body: { email: 'a@b.com', password: 'pass123' } }), res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Local login is disabled' });
    });
  });

  // =========================================================================
  // POST /local — session save error
  // =========================================================================

  describe('POST /local — session save error', () => {
    it('returns 500 when session save fails', async () => {
      const { default: bcrypt } = await import('bcrypt');
      (bcrypt.compare as any).mockResolvedValue(true);

      const { default: ds } = await import('@server/datasource');
      (ds.getRepository as any).mockReturnValue({
        findOne: vi.fn().mockResolvedValue({
          id: 1, email: 'a@b.com', username: 'user1', password: '$hashed',
          permissions: 2, // admin
          userType: 3,
          avatar: null,
        }),
        save: vi.fn(),
      });

      mockGetInstance.mockReturnValue({ main: { localLogin: false } });

      const session: any = {
        regenerate: vi.fn((cb: (err?: Error) => void) => cb()),
        save: vi.fn((cb: (err?: Error) => void) => cb(new Error('save error'))),
        userId: undefined,
      };

      const res = mockRes();
      await handlers['POST /local'](
        mockReq({ body: { email: 'a@b.com', password: 'pass123' }, session }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });
  });

  // =========================================================================
  // POST /plex
  // =========================================================================

  describe('POST /plex', () => {
    const handler = () => handlers['POST /plex'];

    it('returns 400 when Plex login disabled', async () => {
      mockGetInstance.mockReturnValue({ main: { plexLogin: false } });

      const res = mockRes();
      await handler()(mockReq(), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Plex login is disabled' });
    });

    it('returns PIN data on success', async () => {
      mockGetInstance.mockReturnValue({ main: { plexLogin: true } });
      mockCreatePlexPin.mockResolvedValue({
        id: 42,
        code: 'ABCD',
        clientId: 'client-uuid',
        authUrl: 'https://app.plex.tv/auth#...',
      });

      const res = mockRes();
      await handler()(mockReq(), res);

      expect(mockCreatePlexPin).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        id: 42,
        code: 'ABCD',
        clientId: 'client-uuid',
        authUrl: 'https://app.plex.tv/auth#...',
      });
    });

    it('returns 500 on error', async () => {
      mockGetInstance.mockReturnValue({ main: { plexLogin: true } });
      mockCreatePlexPin.mockRejectedValue(new Error('Plex API down'));

      const res = mockRes();
      await handler()(mockReq(), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to create Plex PIN' });
    });
  });

  // =========================================================================
  // POST /plex/poll
  // =========================================================================

  describe('POST /plex/poll', () => {
    const handler = () => handlers['POST /plex/poll'];

    it('returns 400 when Plex login disabled', async () => {
      mockGetInstance.mockReturnValue({ main: { plexLogin: false } });

      const res = mockRes();
      await handler()(mockReq({ body: { pinId: 1, clientId: 'abc' } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Plex login is disabled' });
    });

    it('returns 400 when pinId missing', async () => {
      mockGetInstance.mockReturnValue({ main: { plexLogin: true } });

      const res = mockRes();
      await handler()(mockReq({ body: { clientId: 'abc' } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'pinId and clientId are required' });
    });

    it('returns 400 when clientId missing', async () => {
      mockGetInstance.mockReturnValue({ main: { plexLogin: true } });

      const res = mockRes();
      await handler()(mockReq({ body: { pinId: 1 } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'pinId and clientId are required' });
    });

    it('returns 400 when pinId is not integer', async () => {
      mockGetInstance.mockReturnValue({ main: { plexLogin: true } });

      const res = mockRes();
      await handler()(mockReq({ body: { pinId: 'abc', clientId: 'cid' } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'pinId must be a positive integer' });
    });

    it('returns 400 when pinId is negative', async () => {
      mockGetInstance.mockReturnValue({ main: { plexLogin: true } });

      const res = mockRes();
      await handler()(mockReq({ body: { pinId: -1, clientId: 'cid' } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'pinId must be a positive integer' });
    });

    it('returns 400 when clientId too long', async () => {
      mockGetInstance.mockReturnValue({ main: { plexLogin: true } });

      const res = mockRes();
      await handler()(mockReq({ body: { pinId: 1, clientId: 'x'.repeat(65) } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid clientId' });
    });

    it('returns authenticated: false when PIN not yet claimed', async () => {
      mockGetInstance.mockReturnValue({ main: { plexLogin: true } });
      mockCheckPlexPin.mockResolvedValue(null);

      const res = mockRes();
      await handler()(mockReq({ body: { pinId: 42, clientId: 'valid-id' } }), res);

      expect(res.json).toHaveBeenCalledWith({ authenticated: false });
    });

    it('returns 403 when no account found for Plex user', async () => {
      mockGetInstance.mockReturnValue({
        main: { plexLogin: true },
        plexAuth: { autoCreateUsers: false, defaultPermissions: 8 },
      });
      mockCheckPlexPin.mockResolvedValue('auth-token');
      mockGetPlexUser.mockResolvedValue({
        id: 99,
        email: 'plex@test.com',
        username: 'plexuser',
        thumb: null,
      });
      mockFindOrCreateUser.mockResolvedValue(null);

      const res = mockRes();
      await handler()(mockReq({ body: { pinId: 42, clientId: 'valid-id' } }), res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'No account found. Contact your administrator.' });
    });

    it('creates session and returns user on successful Plex auth', async () => {
      mockGetInstance.mockReturnValue({
        main: { plexLogin: true },
        plexAuth: { autoCreateUsers: true, defaultPermissions: 8 },
      });
      mockCheckPlexPin.mockResolvedValue('auth-token');
      mockGetPlexUser.mockResolvedValue({
        id: 99,
        email: 'plex@test.com',
        username: 'plexuser',
        thumb: null,
      });
      const plexUser = { id: 5, email: 'plex@test.com', username: 'plexuser', plexToken: 'auth-token' };
      mockFindOrCreateUser.mockResolvedValue(plexUser);

      const session: any = {
        regenerate: vi.fn((cb: (err?: Error) => void) => cb()),
        save: vi.fn((cb: (err?: Error) => void) => cb()),
        userId: undefined,
      };

      const res = mockRes();
      await handler()(mockReq({ body: { pinId: 42, clientId: 'valid-id' }, session }), res);

      expect(session.userId).toBe(5);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ authenticated: true })
      );
    });

    it('returns 500 when session regenerate fails during Plex auth', async () => {
      mockGetInstance.mockReturnValue({
        main: { plexLogin: true },
        plexAuth: { autoCreateUsers: true, defaultPermissions: 8 },
      });
      mockCheckPlexPin.mockResolvedValue('auth-token');
      mockGetPlexUser.mockResolvedValue({
        id: 99, email: 'plex@test.com', username: 'plexuser', thumb: null,
      });
      mockFindOrCreateUser.mockResolvedValue({ id: 5, email: 'plex@test.com' });

      const session: any = {
        regenerate: vi.fn((cb: (err?: Error) => void) => cb(new Error('session error'))),
      };

      const res = mockRes();
      await handler()(mockReq({ body: { pinId: 42, clientId: 'valid-id' }, session }), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });

    it('returns 500 when session save fails during Plex auth', async () => {
      mockGetInstance.mockReturnValue({
        main: { plexLogin: true },
        plexAuth: { autoCreateUsers: true, defaultPermissions: 8 },
      });
      mockCheckPlexPin.mockResolvedValue('auth-token');
      mockGetPlexUser.mockResolvedValue({
        id: 99, email: 'plex@test.com', username: 'plexuser', thumb: null,
      });
      mockFindOrCreateUser.mockResolvedValue({ id: 5, email: 'plex@test.com' });

      const session: any = {
        regenerate: vi.fn((cb: (err?: Error) => void) => cb()),
        save: vi.fn((cb: (err?: Error) => void) => cb(new Error('save error'))),
        userId: undefined,
      };

      const res = mockRes();
      await handler()(mockReq({ body: { pinId: 42, clientId: 'valid-id' }, session }), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });

    it('returns 500 on unexpected error', async () => {
      mockGetInstance.mockReturnValue({ main: { plexLogin: true } });
      mockCheckPlexPin.mockRejectedValue(new Error('network error'));

      const res = mockRes();
      await handler()(mockReq({ body: { pinId: 42, clientId: 'valid-id' } }), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });
  });

  // =========================================================================
  // GET /oidc/:providerId/authorize
  // =========================================================================

  describe('GET /oidc/:providerId/authorize', () => {
    const handler = () => handlers['GET /oidc/:providerId/authorize'];

    it('returns 400 when OIDC login disabled', async () => {
      mockGetInstance.mockReturnValue({ main: { oidcLogin: false }, oidcProviders: [] });

      const res = mockRes();
      await handler()(mockReq({ params: { providerId: 'provider1' } }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'OIDC login is disabled' });
    });

    it('returns 404 when provider not found', async () => {
      mockGetInstance.mockReturnValue({
        main: { oidcLogin: true },
        oidcProviders: [{ id: 'other-provider', issuerUrl: 'https://example.com' }],
      });

      const res = mockRes();
      await handler()(mockReq({ params: { providerId: 'provider1' } }), res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'OIDC provider not found' });
    });

    it('stores PKCE state in session and redirects', async () => {
      const provider = { id: 'provider1', issuerUrl: 'https://issuer.example.com', clientId: 'cid' };
      mockGetInstance.mockReturnValue({
        main: { oidcLogin: true, applicationUrl: 'http://localhost:5055' },
        oidcProviders: [provider],
      });
      mockGenerateAuthorizationUrl.mockResolvedValue({
        url: 'https://issuer.example.com/auth?state=abc',
        state: 'state-abc',
        codeVerifier: 'verifier-xyz',
      });

      const session: any = {
        save: vi.fn((cb: (err?: Error) => void) => cb()),
      };
      const res: any = mockRes();
      res.redirect = vi.fn();

      await handler()(
        mockReq({
          params: { providerId: 'provider1' },
          query: { returnUrl: '/home' },
          session,
          protocol: 'http',
          get: vi.fn(() => 'localhost:5055'),
        }),
        res
      );

      expect(session.oidcState).toBe('state-abc');
      expect(session.oidcCodeVerifier).toBe('verifier-xyz');
      expect(res.redirect).toHaveBeenCalledWith('https://issuer.example.com/auth?state=abc');
    });

    it('returns 500 when session save fails', async () => {
      const provider = { id: 'provider1', issuerUrl: 'https://issuer.example.com', clientId: 'cid' };
      mockGetInstance.mockReturnValue({
        main: { oidcLogin: true, applicationUrl: 'http://localhost:5055' },
        oidcProviders: [provider],
      });
      mockGenerateAuthorizationUrl.mockResolvedValue({
        url: 'https://issuer.example.com/auth',
        state: 'state-abc',
        codeVerifier: 'verifier-xyz',
      });

      const session: any = {
        save: vi.fn((cb: (err?: Error) => void) => cb(new Error('session error'))),
      };
      const res = mockRes();

      await handler()(
        mockReq({
          params: { providerId: 'provider1' },
          session,
          protocol: 'http',
          get: vi.fn(() => 'localhost:5055'),
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });

    it('returns 500 on unexpected error', async () => {
      mockGetInstance.mockReturnValue({
        main: { oidcLogin: true },
        oidcProviders: [{ id: 'provider1' }],
      });
      mockGenerateAuthorizationUrl.mockRejectedValue(new Error('discovery failed'));

      const session: any = {};
      const res = mockRes();

      await handler()(
        mockReq({
          params: { providerId: 'provider1' },
          session,
          protocol: 'http',
          get: vi.fn(() => 'localhost:5055'),
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to initiate OIDC login' });
    });
  });

  // =========================================================================
  // GET /oidc/:providerId/callback
  // =========================================================================

  describe('GET /oidc/:providerId/callback', () => {
    const handler = () => handlers['GET /oidc/:providerId/callback'];

    it('redirects with error when OIDC login disabled', async () => {
      mockGetInstance.mockReturnValue({ main: { oidcLogin: false }, oidcProviders: [] });

      const session: any = {};
      const res: any = mockRes();
      res.redirect = vi.fn();

      await handler()(
        mockReq({ params: { providerId: 'p1' }, session, protocol: 'http', get: vi.fn(() => 'localhost:5055') }),
        res
      );

      expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('oidc_failed'));
    });

    it('redirects with error when provider not found', async () => {
      mockGetInstance.mockReturnValue({
        main: { oidcLogin: true },
        oidcProviders: [],
      });

      const session: any = { oidcReturnUrl: '/' };
      const res: any = mockRes();
      res.redirect = vi.fn();

      await handler()(
        mockReq({ params: { providerId: 'p1' }, session, protocol: 'http', get: vi.fn(() => 'localhost:5055') }),
        res
      );

      expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('oidc_failed'));
    });

    it('redirects with error when session state is invalid', async () => {
      const provider = { id: 'p1', issuerUrl: 'https://issuer.example.com' };
      mockGetInstance.mockReturnValue({
        main: { oidcLogin: true },
        oidcProviders: [provider],
      });

      // Missing oidcState
      const session: any = { oidcReturnUrl: '/', oidcCodeVerifier: 'v', oidcProviderId: 'p1' };
      delete session.oidcState;

      const res: any = mockRes();
      res.redirect = vi.fn();

      await handler()(
        mockReq({ params: { providerId: 'p1' }, session, protocol: 'http', get: vi.fn(() => 'localhost:5055') }),
        res
      );

      expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('oidc_failed'));
    });

    it('redirects with error when providerId mismatch', async () => {
      const provider = { id: 'p1', issuerUrl: 'https://issuer.example.com' };
      mockGetInstance.mockReturnValue({
        main: { oidcLogin: true },
        oidcProviders: [provider],
      });

      const session: any = {
        oidcState: 'state',
        oidcCodeVerifier: 'verifier',
        oidcProviderId: 'different-provider', // mismatch
        oidcReturnUrl: '/',
      };

      const res: any = mockRes();
      res.redirect = vi.fn();

      await handler()(
        mockReq({ params: { providerId: 'p1' }, session, protocol: 'http', get: vi.fn(() => 'localhost:5055') }),
        res
      );

      expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('oidc_failed'));
    });

    it('redirects with no_account error when user not found/created', async () => {
      const provider = { id: 'p1', issuerUrl: 'https://issuer.example.com', autoCreateUsers: false, defaultPermissions: 8 };
      mockGetInstance.mockReturnValue({
        main: { oidcLogin: true, applicationUrl: 'http://localhost:5055' },
        oidcProviders: [provider],
      });
      mockExchangeCode.mockResolvedValue({
        sub: 'sub-123',
        email: 'user@example.com',
        name: 'Test User',
      });
      mockFindOrCreateUser.mockResolvedValue(null);

      const session: any = {
        oidcState: 'state',
        oidcCodeVerifier: 'verifier',
        oidcProviderId: 'p1',
        oidcReturnUrl: '/',
      };

      const res: any = mockRes();
      res.redirect = vi.fn();

      await handler()(
        mockReq({
          params: { providerId: 'p1' },
          session,
          originalUrl: '/api/v1/auth/oidc/p1/callback?code=abc&state=state',
          protocol: 'http',
          get: vi.fn(() => 'localhost:5055'),
        }),
        res
      );

      expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('oidc_no_account'));
    });

    it('creates session and redirects on successful OIDC auth', async () => {
      const provider = { id: 'p1', issuerUrl: 'https://issuer.example.com', autoCreateUsers: true, defaultPermissions: 8 };
      mockGetInstance.mockReturnValue({
        main: { oidcLogin: true, applicationUrl: 'http://localhost:5055' },
        oidcProviders: [provider],
      });
      mockExchangeCode.mockResolvedValue({
        sub: 'sub-123',
        email: 'user@example.com',
        name: 'Test User',
        picture: null,
      });
      mockFindOrCreateUser.mockResolvedValue({ id: 10, email: 'user@example.com' });

      const session: any = {
        oidcState: 'state',
        oidcCodeVerifier: 'verifier',
        oidcProviderId: 'p1',
        oidcReturnUrl: '/home',
        regenerate: vi.fn((cb: (err?: Error) => void) => cb()),
        save: vi.fn((cb: (err?: Error) => void) => cb()),
        userId: undefined,
      };

      const res: any = mockRes();
      res.redirect = vi.fn();

      await handler()(
        mockReq({
          params: { providerId: 'p1' },
          session,
          originalUrl: '/api/v1/auth/oidc/p1/callback?code=abc&state=state',
          protocol: 'http',
          get: vi.fn(() => 'localhost:5055'),
        }),
        res
      );

      expect(session.userId).toBe(10);
      expect(res.redirect).toHaveBeenCalledWith('/home');
    });

    it('cleans up session and redirects with error on exception', async () => {
      const provider = { id: 'p1', issuerUrl: 'https://issuer.example.com' };
      mockGetInstance.mockReturnValue({
        main: { oidcLogin: true, applicationUrl: 'http://localhost:5055' },
        oidcProviders: [provider],
      });
      mockExchangeCode.mockRejectedValue(new Error('token exchange failed'));

      const session: any = {
        oidcState: 'state',
        oidcCodeVerifier: 'verifier',
        oidcProviderId: 'p1',
        oidcReturnUrl: '/',
      };

      const res: any = mockRes();
      res.redirect = vi.fn();

      await handler()(
        mockReq({
          params: { providerId: 'p1' },
          session,
          originalUrl: '/api/v1/auth/oidc/p1/callback?code=abc&state=state',
          protocol: 'http',
          get: vi.fn(() => 'localhost:5055'),
        }),
        res
      );

      // Session should be cleaned up
      expect(session.oidcState).toBeUndefined();
      expect(session.oidcCodeVerifier).toBeUndefined();
      expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('oidc_failed'));
    });
  });
});
