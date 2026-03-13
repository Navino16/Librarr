import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AxiosInstance, AxiosError } from 'axios';

vi.mock('axios');
vi.mock('@server/logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import axios from 'axios';
import ExternalApi from '@server/api/externalapi';
import logger from '@server/logger';

const mockedAxiosCreate = vi.mocked(axios.create);
const mockedIsAxiosError = vi.mocked(axios.isAxiosError);

// Subclass to expose protected methods
class TestApi extends ExternalApi {
  public doGet<T>(path: string, config?: Record<string, unknown>) {
    return this.get<T>(path, config);
  }
  public doPost<T>(path: string, data?: unknown, config?: Record<string, unknown>) {
    return this.post<T>(path, data, config);
  }
}

let mockAxiosInstance: {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  interceptors: { response: { use: ReturnType<typeof vi.fn> } };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();

  // Clear per-host rate limiting static map between tests
  // @ts-expect-error accessing private static
  ExternalApi.lastRequestTimeByHost.clear();

  mockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: { response: { use: vi.fn() } },
  };
  mockedAxiosCreate.mockReturnValue(mockAxiosInstance as unknown as AxiosInstance);
  mockedIsAxiosError.mockReturnValue(false);
});

afterEach(() => {
  vi.useRealTimers();
});

function makeAxiosError(status: number | null, code?: string): AxiosError {
  const err = new Error('request failed') as AxiosError;
  err.isAxiosError = true;
  err.response = status ? { status, data: null, headers: {}, statusText: '', config: {} as never } : undefined;
  err.code = code;
  err.config = { url: '/test' } as never;
  return err;
}

describe('ExternalApi — constructor', () => {
  it('creates an axios instance with baseURL, headers and timeout', () => {
    new TestApi({ baseUrl: 'https://api.example.com', headers: { 'X-Key': '123' } });
    expect(mockedAxiosCreate).toHaveBeenCalledWith({
      baseURL: 'https://api.example.com',
      headers: { Accept: 'application/json', 'X-Key': '123' },
      timeout: 15000,
    });
  });

  it('handles an invalid baseUrl by using the raw string as hostname', () => {
    const api = new TestApi({ baseUrl: 'not-a-url' });
    // Should not throw — hostname falls back to the raw string
    expect(api).toBeDefined();
    expect(mockedAxiosCreate).toHaveBeenCalled();
  });
});

describe('ExternalApi — get()', () => {
  it('returns response.data on success', async () => {
    mockAxiosInstance.get.mockResolvedValue({ data: { ok: true } });
    const api = new TestApi({ baseUrl: 'https://api.example.com' });
    const result = await api.doGet('/path');
    expect(result).toEqual({ ok: true });
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/path', undefined);
  });

  it('passes config to axios', async () => {
    mockAxiosInstance.get.mockResolvedValue({ data: 'ok' });
    const api = new TestApi({ baseUrl: 'https://api.example.com' });
    await api.doGet('/path', { params: { q: 'test' } });
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/path', { params: { q: 'test' } });
  });
});

describe('ExternalApi — post()', () => {
  it('returns response.data on success', async () => {
    mockAxiosInstance.post.mockResolvedValue({ data: { created: true } });
    const api = new TestApi({ baseUrl: 'https://api.example.com' });
    const result = await api.doPost('/items', { name: 'test' });
    expect(result).toEqual({ created: true });
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/items', { name: 'test' }, undefined);
  });

  it('passes data and config to axios', async () => {
    mockAxiosInstance.post.mockResolvedValue({ data: 'ok' });
    const api = new TestApi({ baseUrl: 'https://api.example.com' });
    await api.doPost('/items', { x: 1 }, { headers: { 'X-Custom': 'val' } });
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/items', { x: 1 }, { headers: { 'X-Custom': 'val' } });
  });
});

describe('ExternalApi — retry logic', () => {
  it('retries and succeeds after a transient 5xx error', async () => {
    const err = makeAxiosError(502);
    mockedIsAxiosError.mockReturnValue(true);
    mockAxiosInstance.get
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ data: 'recovered' });

    const api = new TestApi({ baseUrl: 'https://api.example.com' });
    const promise = api.doGet('/flaky');

    // Advance past the 500ms retry delay
    await vi.advanceTimersByTimeAsync(600);

    const result = await promise;
    expect(result).toBe('recovered');
    expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
  });

  it('retries on 429 rate limit response', async () => {
    const err = makeAxiosError(429);
    mockedIsAxiosError.mockReturnValue(true);
    mockAxiosInstance.get
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ data: 'ok' });

    const api = new TestApi({ baseUrl: 'https://api.example.com' });
    const promise = api.doGet('/limited');
    await vi.advanceTimersByTimeAsync(600);

    expect(await promise).toBe('ok');
  });

  it('retries on retryable network error (ECONNREFUSED)', async () => {
    const err = makeAxiosError(null, 'ECONNREFUSED');
    mockedIsAxiosError.mockReturnValue(true);
    mockAxiosInstance.get
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ data: 'connected' });

    const api = new TestApi({ baseUrl: 'https://api.example.com' });
    const promise = api.doGet('/down');
    await vi.advanceTimersByTimeAsync(600);

    expect(await promise).toBe('connected');
  });

  it('exhausts retries then throws', async () => {
    const err = makeAxiosError(500);
    mockedIsAxiosError.mockReturnValue(true);
    mockAxiosInstance.get.mockRejectedValue(err);

    const api = new TestApi({ baseUrl: 'https://api.example.com', retries: 2 });
    const promise = api.doGet('/always-fail');
    // Attach handler immediately to prevent unhandled-rejection warning
    // while timers advance. The original promise remains rejected for assertion.
    promise.catch(() => {});

    // 500ms + 1000ms delays
    await vi.advanceTimersByTimeAsync(600);
    await vi.advanceTimersByTimeAsync(1100);

    await expect(promise).rejects.toThrow('request failed');
    expect(mockAxiosInstance.get).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('throws immediately on non-retryable 4xx error', async () => {
    const err = makeAxiosError(404);
    mockedIsAxiosError.mockReturnValue(true);
    mockAxiosInstance.get.mockRejectedValue(err);

    const api = new TestApi({ baseUrl: 'https://api.example.com' });

    await expect(api.doGet('/missing')).rejects.toThrow('request failed');
    expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
  });

  it('does not retry when retries is 0', async () => {
    const err = makeAxiosError(500);
    mockedIsAxiosError.mockReturnValue(true);
    mockAxiosInstance.get.mockRejectedValue(err);

    const api = new TestApi({ baseUrl: 'https://api.example.com', retries: 0 });

    await expect(api.doGet('/no-retry')).rejects.toThrow('request failed');
    expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
  });
});

describe('ExternalApi — response interceptor', () => {
  it('logs warning when error has response status', () => {
    new TestApi({ baseUrl: 'https://api.example.com' });

    const [, errorHandler] = mockAxiosInstance.interceptors.response.use.mock.calls[0];

    const err = {
      response: { status: 503 },
      config: { url: '/broken' },
    };

    let thrown: unknown;
    try {
      errorHandler(err);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBe(err);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('503'),
      expect.objectContaining({ status: 503, url: '/broken' })
    );
  });

  it('rethrows error without logging when no response', () => {
    new TestApi({ baseUrl: 'https://api.example.com' });

    const [, errorHandler] = mockAxiosInstance.interceptors.response.use.mock.calls[0];

    const err = { code: 'ECONNREFUSED' };

    let thrown: unknown;
    try {
      errorHandler(err);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBe(err);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe('ExternalApi — rate limiting', () => {
  it('delays requests to respect the minimum interval', async () => {
    mockAxiosInstance.get.mockResolvedValue({ data: 'ok' });
    const api = new TestApi({ baseUrl: 'https://rate.example.com', rateLimit: 1000 });

    // First request — no delay
    const p1 = api.doGet('/a');
    await vi.advanceTimersByTimeAsync(0);
    await p1;

    // Second request — should wait ~1000ms
    const p2 = api.doGet('/b');
    // Should not have fired yet
    expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1100);
    await p2;
    expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
  });

  it('does not delay when rateLimit is 0', async () => {
    mockAxiosInstance.get.mockResolvedValue({ data: 'ok' });
    const api = new TestApi({ baseUrl: 'https://fast.example.com', rateLimit: 0 });

    await api.doGet('/a');
    await api.doGet('/b');
    expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
  });
});
