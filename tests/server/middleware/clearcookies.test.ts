import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { clearCookies } from '@server/middleware/clearcookies';

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    path: '/api/v1/test',
    session: undefined,
    cookies: {},
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response {
  return {
    clearCookie: vi.fn(),
  } as unknown as Response;
}

describe('clearCookies', () => {
  it('clears cookie when API path, no session userId, and cookie exists', () => {
    const req = mockReq({
      path: '/api/v1/something',
      session: {} as never,
      cookies: { 'connect.sid': 'abc123' },
    });
    const res = mockRes();
    const next = vi.fn();

    clearCookies(req, res, next);

    expect(res.clearCookie).toHaveBeenCalledWith('connect.sid');
    expect(next).toHaveBeenCalled();
  });

  it('does not clear cookie when path is not API', () => {
    const req = mockReq({
      path: '/login',
      session: {} as never,
      cookies: { 'connect.sid': 'abc123' },
    });
    const res = mockRes();
    const next = vi.fn();

    clearCookies(req, res, next);

    expect(res.clearCookie).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('does not clear cookie when session has userId', () => {
    const req = mockReq({
      path: '/api/v1/test',
      session: { userId: 1 } as never,
      cookies: { 'connect.sid': 'abc123' },
    });
    const res = mockRes();
    const next = vi.fn();

    clearCookies(req, res, next);

    expect(res.clearCookie).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('does not clear cookie when no connect.sid cookie', () => {
    const req = mockReq({
      path: '/api/v1/test',
      session: {} as never,
      cookies: {},
    });
    const res = mockRes();
    const next = vi.fn();

    clearCookies(req, res, next);

    expect(res.clearCookie).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('always calls next', () => {
    const req = mockReq({ path: '/some/path' });
    const res = mockRes();
    const next = vi.fn();

    clearCookies(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('clears cookie when session is undefined (no userId)', () => {
    const req = mockReq({
      path: '/api/v1/test',
      session: undefined as never,
      cookies: { 'connect.sid': 'abc123' },
    });
    const res = mockRes();
    const next = vi.fn();

    clearCookies(req, res, next);

    expect(res.clearCookie).toHaveBeenCalledWith('connect.sid');
    expect(next).toHaveBeenCalled();
  });

  it('clears cookie for nested API paths', () => {
    const req = mockReq({
      path: '/api/v1/user/settings',
      session: {} as never,
      cookies: { 'connect.sid': 'xyz' },
    });
    const res = mockRes();
    const next = vi.fn();

    clearCookies(req, res, next);

    expect(res.clearCookie).toHaveBeenCalledWith('connect.sid');
    expect(next).toHaveBeenCalled();
  });

  it('does not clear cookie when cookies object is undefined', () => {
    const req = mockReq({
      path: '/api/v1/test',
      session: {} as never,
      cookies: undefined as never,
    });
    const res = mockRes();
    const next = vi.fn();

    clearCookies(req, res, next);

    expect(res.clearCookie).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
