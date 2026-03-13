import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { Permission } from '@server/lib/permissions';

// Mock the datasource (imported by auth.ts at top level)
vi.mock('@server/datasource', () => ({
  default: {
    getRepository: vi.fn(),
  },
}));

// Mock User entity to prevent TypeORM decorator evaluation
vi.mock('@server/entity/User', () => ({
  User: class User {},
}));

// Mock Settings singleton
vi.mock('@server/lib/settings', () => ({
  default: {
    getInstance: vi.fn(),
  },
}));

import { isAuthenticated, requirePermission, authOrSetup, checkUser, invalidateUserCache } from '@server/middleware/auth';
import Settings from '@server/lib/settings';
import dataSource from '@server/datasource';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { user: undefined, ...overrides } as unknown as Request;
}

function mockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response;
}

describe('checkUser', () => {
  beforeEach(() => {
    vi.mocked(dataSource.getRepository).mockReset();
    // Clear cache between tests by invalidating known IDs
    invalidateUserCache(1);
    invalidateUserCache(2);
  });

  it('skips non-API routes and calls next', async () => {
    const req = mockReq({ path: '/login', session: { userId: 1 } as any });
    const res = mockRes();
    const next = vi.fn();

    await checkUser(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('calls next without setting user when no session', async () => {
    const req = mockReq({ path: '/api/v1/test', session: undefined as any });
    const res = mockRes();
    const next = vi.fn();

    await checkUser(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('calls next without setting user when session has no userId', async () => {
    const req = mockReq({ path: '/api/v1/test', session: {} as any });
    const res = mockRes();
    const next = vi.fn();

    await checkUser(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('looks up user from DB and sets req.user', async () => {
    const fakeUser = { id: 1, permissions: Permission.ADMIN };
    const findOne = vi.fn().mockResolvedValue(fakeUser);
    vi.mocked(dataSource.getRepository).mockReturnValue({ findOne } as any);

    const req = mockReq({ path: '/api/v1/test', session: { userId: 1 } as any });
    const res = mockRes();
    const next = vi.fn();

    await checkUser(req, res, next);

    expect(findOne).toHaveBeenCalledWith({
      where: { id: 1 },
      relations: ['settings'],
    });
    expect(req.user).toBe(fakeUser);
    expect(next).toHaveBeenCalled();
  });

  it('does not set req.user when user not found in DB', async () => {
    const findOne = vi.fn().mockResolvedValue(null);
    vi.mocked(dataSource.getRepository).mockReturnValue({ findOne } as any);

    const req = mockReq({ path: '/api/v1/test', session: { userId: 999 } as any });
    const res = mockRes();
    const next = vi.fn();

    await checkUser(req, res, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('uses cached user on subsequent calls', async () => {
    const fakeUser = { id: 2, permissions: Permission.ADMIN };
    const findOne = vi.fn().mockResolvedValue(fakeUser);
    vi.mocked(dataSource.getRepository).mockReturnValue({ findOne } as any);

    const req1 = mockReq({ path: '/api/v1/test', session: { userId: 2 } as any });
    await checkUser(req1, mockRes(), vi.fn());
    expect(findOne).toHaveBeenCalledTimes(1);

    // Second call should use cache
    const req2 = mockReq({ path: '/api/v1/test', session: { userId: 2 } as any });
    await checkUser(req2, mockRes(), vi.fn());
    expect(findOne).toHaveBeenCalledTimes(1); // Still 1, from cache
    expect(req2.user).toBe(fakeUser);
  });
});

describe('invalidateUserCache', () => {
  it('forces DB lookup after invalidation', async () => {
    const fakeUser = { id: 1, permissions: Permission.ADMIN };
    const findOne = vi.fn().mockResolvedValue(fakeUser);
    vi.mocked(dataSource.getRepository).mockReturnValue({ findOne } as any);

    // Populate cache
    const req1 = mockReq({ path: '/api/v1/test', session: { userId: 1 } as any });
    await checkUser(req1, mockRes(), vi.fn());
    expect(findOne).toHaveBeenCalledTimes(1);

    // Invalidate
    invalidateUserCache(1);

    // Should query DB again
    const req2 = mockReq({ path: '/api/v1/test', session: { userId: 1 } as any });
    await checkUser(req2, mockRes(), vi.fn());
    expect(findOne).toHaveBeenCalledTimes(2);
  });
});

describe('isAuthenticated', () => {
  it('calls next when user exists', () => {
    const req = mockReq({ user: { id: 1 } as any });
    const res = mockRes();
    const next = vi.fn();

    isAuthenticated(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 401 when no user', () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    isAuthenticated(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });
});

describe('requirePermission', () => {
  it('calls next when user has the required permission', () => {
    const req = mockReq({
      user: { id: 1, permissions: Permission.ADMIN } as any,
    });
    const res = mockRes();
    const next = vi.fn();

    requirePermission(Permission.MANAGE_USERS)(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('returns 401 when no user', () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    requirePermission(Permission.MANAGE_USERS)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 403 when user lacks permission', () => {
    const req = mockReq({
      user: { id: 1, permissions: Permission.REQUEST_EBOOK } as any,
    });
    const res = mockRes();
    const next = vi.fn();

    requirePermission(Permission.MANAGE_USERS)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
  });

  it('passes if user has any of the listed permissions', () => {
    const req = mockReq({
      user: { id: 1, permissions: Permission.MANAGE_USERS } as any,
    });
    const res = mockRes();
    const next = vi.fn();

    requirePermission(Permission.REQUEST_EBOOK, Permission.MANAGE_USERS)(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('authOrSetup', () => {
  beforeEach(() => {
    vi.mocked(Settings.getInstance).mockReset();
  });

  it('skips auth when app is not initialized', () => {
    vi.mocked(Settings.getInstance).mockReturnValue({
      main: { initialized: false },
    } as any);

    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    authOrSetup(Permission.MANAGE_SETTINGS_GENERAL)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('requires auth + permission when app is initialized', () => {
    vi.mocked(Settings.getInstance).mockReturnValue({
      main: { initialized: true },
    } as any);

    const req = mockReq({
      user: { id: 1, permissions: Permission.ADMIN } as any,
    });
    const res = mockRes();
    const next = vi.fn();

    authOrSetup(Permission.MANAGE_SETTINGS_GENERAL)(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('returns 401 when initialized and no user', () => {
    vi.mocked(Settings.getInstance).mockReturnValue({
      main: { initialized: true },
    } as any);

    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    authOrSetup(Permission.MANAGE_SETTINGS_GENERAL)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 403 when initialized and user lacks permission', () => {
    vi.mocked(Settings.getInstance).mockReturnValue({
      main: { initialized: true },
    } as any);

    const req = mockReq({
      user: { id: 1, permissions: Permission.REQUEST_EBOOK } as any,
    });
    const res = mockRes();
    const next = vi.fn();

    authOrSetup(Permission.MANAGE_SETTINGS_GENERAL)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});
