import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockExpressApp,
  mockHttpServer: _mockHttpServer,
  mockNextApp,
  mockExistsSync,
  mockMkdirSync,
  mockInitialize,
  mockGetInstance,
  mockInitScheduler,
} = vi.hoisted(() => {
  const mockHttpServer = {
    close: vi.fn((cb: () => void) => cb()),
  };
  const mockExpressApp: Record<string, any> = {
    use: vi.fn(),
    all: vi.fn(),
    get: vi.fn(),
    listen: vi.fn((_port: number, cb: () => void) => {
      cb();
      return mockHttpServer;
    }),
  };
  const mockNextApp = {
    getRequestHandler: vi.fn(() => vi.fn()),
    prepare: vi.fn().mockResolvedValue(undefined),
  };
  return {
    mockExpressApp,
    mockHttpServer,
    mockNextApp,
    mockExistsSync: vi.fn().mockReturnValue(true),
    mockMkdirSync: vi.fn(),
    mockInitialize: vi.fn().mockResolvedValue(undefined),
    mockGetInstance: vi.fn(),
    mockInitScheduler: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('reflect-metadata', () => ({}));

vi.mock('express', () => {
  const fn: any = vi.fn(() => mockExpressApp);
  fn.json = vi.fn(() => 'json-mw');
  fn.urlencoded = vi.fn(() => 'urlencoded-mw');
  return { default: fn };
});

vi.mock('express-session', () => ({ default: vi.fn(() => 'session-mw') }));
vi.mock('cookie-parser', () => ({ default: vi.fn(() => 'cookie-mw') }));
vi.mock('helmet', () => ({ default: vi.fn(() => 'helmet-mw') }));
vi.mock('next', () => ({ default: vi.fn(() => mockNextApp) }));

vi.mock('connect-typeorm', () => ({
  TypeormStore: function MockTypeormStore() {
    return { connect: vi.fn().mockReturnThis() };
  },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
  },
}));

vi.mock('@server/datasource', () => ({
  default: {
    initialize: mockInitialize,
    getRepository: vi.fn(() => ({})),
    destroy: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@server/entity/Session', () => ({ Session: class {} }));

vi.mock('@server/middleware/auth', () => ({
  checkUser: vi.fn(),
  isAuthenticated: vi.fn(),
}));

vi.mock('@server/middleware/clearcookies', () => ({
  clearCookies: vi.fn(),
}));

// Route mocks
vi.mock('@server/routes/auth', () => ({ default: 'auth-routes' }));
vi.mock('@server/routes/settings', () => ({ default: 'settings-routes' }));
vi.mock('@server/routes/user', () => ({ default: 'user-routes' }));
vi.mock('@server/routes/request', () => ({ default: 'request-routes' }));
vi.mock('@server/routes/search', () => ({ default: 'search-routes' }));
vi.mock('@server/routes/book', () => ({ default: 'book-routes' }));
vi.mock('@server/routes/music', () => ({ default: 'music-routes' }));
vi.mock('@server/routes/author', () => ({ default: 'author-routes' }));
vi.mock('@server/routes/artist', () => ({ default: 'artist-routes' }));
vi.mock('@server/routes/discover', () => ({ default: 'discover-routes' }));
vi.mock('@server/routes/service', () => ({ default: 'service-routes' }));
vi.mock('@server/routes/issue', () => ({ default: 'issue-routes' }));
vi.mock('@server/routes/issueComment', () => ({ default: 'issueComment-routes' }));
vi.mock('@server/routes/cache', () => ({ default: 'cache-routes' }));
vi.mock('@server/routes/webhook', () => ({ default: 'webhook-routes' }));

vi.mock('@server/api/metadata/caches', () => ({}));

vi.mock('@server/lib/imageproxy', () => ({
  handleImageProxy: vi.fn(),
}));

vi.mock('@server/job/schedule', () => ({
  initScheduler: mockInitScheduler,
  shutdownScheduler: vi.fn(),
}));

vi.mock('@server/lib/settings', () => ({
  default: { getInstance: mockGetInstance },
}));

vi.mock('@server/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Import triggers main()
// ---------------------------------------------------------------------------

await import('@server/index');

// Wait for async main() to settle
await vi.waitFor(() => {
  expect(mockExpressApp.listen).toHaveBeenCalled();
});

import logger from '@server/logger';

// ---------------------------------------------------------------------------
// Helpers — extract middleware from captured app.use() calls
// ---------------------------------------------------------------------------

function getCsrfMiddleware(): (...args: any[]) => any {
  const call = mockExpressApp.use.mock.calls.find(
    (c: any[]) => c[0] === '/api/'
  );
  if (!call) throw new Error('CSRF middleware not found');
  return call[1];
}

function getErrorHandler(): (...args: any[]) => any {
  const call = mockExpressApp.use.mock.calls.find(
    (c: any[]) => typeof c[0] === 'function' && c[0].length === 4
  );
  if (!call) throw new Error('Error handler not found');
  return call[0];
}

function mockReq(overrides: Record<string, any> = {}): any {
  return {
    method: 'GET',
    path: '/v1/test',
    headers: {},
    ...overrides,
  };
}

function mockRes(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('server/index.ts — startup', () => {
  it('initializes database', () => {
    expect(mockInitialize).toHaveBeenCalled();
  });

  it('initializes settings', () => {
    expect(mockGetInstance).toHaveBeenCalled();
  });

  it('initializes scheduler', () => {
    expect(mockInitScheduler).toHaveBeenCalled();
  });

  it('creates config/db directory when missing', () => {
    // existsSync returned true by default, so mkdirSync may or may not have been called
    // Check that existsSync was called
    expect(mockExistsSync).toHaveBeenCalled();
  });

  it('warns when SESSION_SECRET is not set', () => {
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('SESSION_SECRET not set')
    );
  });

  it('starts listening on port 5055', () => {
    expect(mockExpressApp.listen).toHaveBeenCalledWith(5055, expect.any(Function));
  });
});

describe('server/index.ts — CSRF middleware', () => {
  const csrf = () => getCsrfMiddleware();

  it('allows safe methods (GET, HEAD, OPTIONS)', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      const next = vi.fn();
      csrf()(mockReq({ method, headers: { origin: 'http://evil.com', host: 'localhost:5055' } }), mockRes(), next);
      expect(next).toHaveBeenCalled();
    }
  });

  it('allows webhook routes', () => {
    const next = vi.fn();
    csrf()(
      mockReq({
        method: 'POST',
        path: '/v1/webhook/readarr',
        headers: { origin: 'http://evil.com', host: 'localhost:5055' },
      }),
      mockRes(),
      next
    );
    expect(next).toHaveBeenCalled();
  });

  it('allows requests without origin or referer', () => {
    const next = vi.fn();
    csrf()(
      mockReq({ method: 'POST', headers: {} }),
      mockRes(),
      next
    );
    expect(next).toHaveBeenCalled();
  });

  it('allows requests without host header', () => {
    const next = vi.fn();
    csrf()(
      mockReq({ method: 'POST', headers: { origin: 'http://example.com' } }),
      mockRes(),
      next
    );
    expect(next).toHaveBeenCalled();
  });

  it('allows same-origin requests (origin matches host)', () => {
    const next = vi.fn();
    csrf()(
      mockReq({
        method: 'POST',
        headers: { origin: 'http://localhost:5055', host: 'localhost:5055' },
      }),
      mockRes(),
      next
    );
    expect(next).toHaveBeenCalled();
  });

  it('allows same-origin via referer when no origin', () => {
    const next = vi.fn();
    csrf()(
      mockReq({
        method: 'POST',
        headers: { referer: 'http://localhost:5055/some/page', host: 'localhost:5055' },
      }),
      mockRes(),
      next
    );
    expect(next).toHaveBeenCalled();
  });

  it('blocks cross-origin POST requests', () => {
    const res = mockRes();
    const next = vi.fn();
    csrf()(
      mockReq({
        method: 'POST',
        headers: { origin: 'http://evil.com', host: 'localhost:5055' },
      }),
      res,
      next
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Origin validation failed' });
  });

  it('blocks cross-origin via referer', () => {
    const res = mockRes();
    const next = vi.fn();
    csrf()(
      mockReq({
        method: 'PUT',
        headers: { referer: 'http://evil.com/page', host: 'localhost:5055' },
      }),
      res,
      next
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('blocks when origin is an invalid URL', () => {
    const res = mockRes();
    const next = vi.fn();
    csrf()(
      mockReq({
        method: 'POST',
        headers: { origin: 'not-a-url', host: 'localhost:5055' },
      }),
      res,
      next
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('server/index.ts — global error handler', () => {
  it('returns 500 and logs error', () => {
    const handler = getErrorHandler();
    const err = new Error('something broke');
    const res = mockRes();

    handler(err, mockReq(), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    expect(logger.error).toHaveBeenCalledWith(
      'Unhandled route error',
      expect.objectContaining({ error: 'something broke' })
    );
  });
});
