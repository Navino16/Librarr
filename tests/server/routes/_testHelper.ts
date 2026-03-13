import { vi } from 'vitest';

/**
 * Shared helpers for route handler tests.
 *
 * Instead of using supertest, we capture the route handlers at registration
 * time by mocking Express Router, then call them directly with mock req/res.
 */

/** Build a minimal mock Express Request. */
export function mockReq(overrides: Record<string, any> = {}): any {
  return {
    params: {},
    query: {},
    body: {},
    user: undefined,
    session: {},
    ip: '127.0.0.1',
    ...overrides,
  };
}

/** Build a chainable mock Express Response. */
export function mockRes(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  res.clearCookie = vi.fn().mockReturnValue(res);
  return res;
}
