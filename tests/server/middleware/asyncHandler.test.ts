import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { asyncHandler } from '@server/middleware/asyncHandler';

function mockReq(): Request {
  return {} as Request;
}

function mockRes(): Response {
  return {} as Response;
}

describe('asyncHandler', () => {
  it('calls the wrapped function with req, res, next', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const next = vi.fn();
    const handler = asyncHandler(fn);

    const req = mockReq();
    const res = mockRes();
    await handler(req, res, next);

    expect(fn).toHaveBeenCalledWith(req, res, next);
  });

  it('does not call next when handler resolves', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const next = vi.fn();

    await asyncHandler(fn)(mockReq(), mockRes(), next);

    expect(next).not.toHaveBeenCalled();
  });

  it('calls next with error when handler rejects', async () => {
    const error = new Error('async failure');
    const fn = vi.fn().mockRejectedValue(error);
    const next = vi.fn();

    await asyncHandler(fn)(mockReq(), mockRes(), next);

    // Wait for the catch to fire
    await new Promise((r) => setTimeout(r, 0));

    expect(next).toHaveBeenCalledWith(error);
  });

  it('propagates synchronous throw (not caught by .catch)', () => {
    const error = new Error('sync throw');
    const fn = vi.fn().mockImplementation(() => {
      throw error;
    });
    const next = vi.fn();

    expect(() => asyncHandler(fn)(mockReq(), mockRes(), next)).toThrow(error);
  });

  it('returns a function', () => {
    const handler = asyncHandler(vi.fn().mockResolvedValue(undefined));
    expect(typeof handler).toBe('function');
  });

  it('forwards the resolved value through Promise.resolve', async () => {
    const fn = vi.fn().mockResolvedValue('result');
    const next = vi.fn();

    await asyncHandler(fn)(mockReq(), mockRes(), next);

    expect(next).not.toHaveBeenCalled();
  });
});
