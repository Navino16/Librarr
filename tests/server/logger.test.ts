import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockCreateLogger, capturedRedactor, capturedPrintf } = vi.hoisted(() => ({
  mockCreateLogger: vi.fn().mockReturnValue({
    add: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  capturedRedactor: { fn: null as ((...args: any[]) => any) | null },
  capturedPrintf: { fn: null as ((...args: any[]) => any) | null },
}));

vi.mock('winston', () => {
  const makeFormatter = () => ({});

  const formatFn: any = (fn: (...args: any[]) => any) => {
    capturedRedactor.fn = fn;
    return () => makeFormatter();
  };
  formatFn.combine = (...args: any[]) => args;
  formatFn.timestamp = () => makeFormatter();
  formatFn.errors = () => makeFormatter();
  formatFn.json = () => makeFormatter();
  formatFn.colorize = () => makeFormatter();
  formatFn.printf = (fn: (...args: any[]) => any) => { capturedPrintf.fn = fn; return { transform: fn }; };

  return {
    default: {
      format: formatFn,
      createLogger: mockCreateLogger,
      transports: {
        Console: vi.fn(),
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Import triggers module-level code
// ---------------------------------------------------------------------------

await import('@server/logger');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captures the redactSecrets factory', () => {
    // Verifies that the logger module registered the redact function
    expect(capturedRedactor.fn).toBeTypeOf('function');
  });

  describe('printf formatter', () => {
    const getPrintf = () => capturedPrintf.fn!;

    it('captures the printf callback', () => {
      expect(capturedPrintf.fn).toBeTypeOf('function');
    });

    it('formats log line without extra meta', () => {
      const result = getPrintf()({ timestamp: '2024-01-01', level: 'info', message: 'hello', service: 'librarr' });
      expect(result).toBe('2024-01-01 [info]: hello');
    });

    it('includes meta JSON when extra fields present', () => {
      const result = getPrintf()({ timestamp: '2024-01-01', level: 'warn', message: 'test', service: 'librarr', userId: 42 });
      expect(result).toContain('2024-01-01 [warn]: test');
      expect(result).toContain('"userId":42');
    });
  });

  describe('redactSecrets', () => {
    const getRedactor = () => capturedRedactor.fn!;

    it('redacts password field', () => {
      const info = { level: 'info', message: 'test', password: 'secret123' };
      const result = getRedactor()(info);
      expect(result.password).toBe('[REDACTED]');
    });

    it('redacts apiKey field', () => {
      const info = { level: 'info', message: 'test', apiKey: 'my-key' };
      const result = getRedactor()(info);
      expect(result.apiKey).toBe('[REDACTED]');
    });

    it('redacts token field', () => {
      const info = { level: 'info', message: 'test', token: 'abc' };
      const result = getRedactor()(info);
      expect(result.token).toBe('[REDACTED]');
    });

    it('redacts secret field', () => {
      const info = { level: 'info', message: 'test', webhookSecret: 'hidden' };
      const result = getRedactor()(info);
      expect(result.webhookSecret).toBe('[REDACTED]');
    });

    it('redacts authorization field', () => {
      const info = { level: 'info', message: 'test', authorization: 'Bearer tok' };
      const result = getRedactor()(info);
      expect(result.authorization).toBe('[REDACTED]');
    });

    it('is case-insensitive for key matching', () => {
      const info = { level: 'info', message: 'test', ApiKey: 'key', myapikey: 'key2' };
      const result = getRedactor()(info);
      expect(result.ApiKey).toBe('[REDACTED]');
      expect(result.myapikey).toBe('[REDACTED]');
    });

    it('does not redact non-sensitive fields', () => {
      const info = { level: 'info', message: 'test', username: 'admin', email: 'a@b.com' };
      const result = getRedactor()(info);
      expect(result.username).toBe('admin');
      expect(result.email).toBe('a@b.com');
    });

    it('does not redact non-string values', () => {
      const info = { level: 'info', message: 'test', password: 12345 };
      const result = getRedactor()(info);
      expect(result.password).toBe(12345);
    });

    it('returns the info object', () => {
      const info = { level: 'info', message: 'test' };
      const result = getRedactor()(info);
      expect(result).toBe(info);
    });
  });
});
