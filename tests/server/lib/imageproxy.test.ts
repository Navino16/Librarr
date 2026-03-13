import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('axios');
vi.mock('@server/logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import axios from 'axios';
import { handleImageProxy } from '@server/lib/imageproxy';

const mockedAxiosGet = vi.mocked(axios.get);

function mockReq(query: Record<string, unknown> = {}): Request {
  return { query } as unknown as Request;
}

function mockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('handleImageProxy — input validation', () => {
  it('returns 400 when url is missing', async () => {
    const res = mockRes();
    await handleImageProxy(mockReq({}), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'URL parameter required' });
  });

  it('returns 400 when url is not a string', async () => {
    const res = mockRes();
    await handleImageProxy(mockReq({ url: 123 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 for non-HTTP protocol', async () => {
    const res = mockRes();
    await handleImageProxy(mockReq({ url: 'ftp://covers.openlibrary.org/image.jpg' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Only HTTP(S) URLs are allowed' });
  });
});

describe('handleImageProxy — domain validation', () => {
  it('returns 403 for disallowed domain', async () => {
    const res = mockRes();
    await handleImageProxy(mockReq({ url: 'https://evil.com/image.jpg' }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Domain not allowed' });
  });

  it('blocks subdomain bypass attempts', async () => {
    const res = mockRes();
    // evil.com.covers.openlibrary.org is allowed (it ends with .covers.openlibrary.org)
    // but evil-covers.openlibrary.org.evil.com is NOT
    await handleImageProxy(
      mockReq({ url: 'https://covers.openlibrary.org.evil.com/image.jpg' }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(403);
  });

  const allowedDomains = [
    'covers.openlibrary.org',
    'books.google.com',
    'coverartarchive.org',
    'archive.org',
    'us.archive.org',
    'i.scdn.co',
    'images-na.ssl-images-amazon.com',
    'media-amazon.com',
    'i.gr-assets.com',
    'assets.hardcover.app',
  ];

  it.each(allowedDomains)('accepts allowed domain: %s', async (domain) => {
    const imageData = Buffer.from('fake-image');
    mockedAxiosGet.mockResolvedValue({
      data: imageData,
      headers: { 'content-type': 'image/jpeg' },
    });
    const res = mockRes();
    await handleImageProxy(mockReq({ url: `https://${domain}/image.jpg` }), res);
    expect(res.status).not.toHaveBeenCalledWith(403);
  });

  it('accepts subdomains of allowed domains', async () => {
    const imageData = Buffer.from('fake-image');
    mockedAxiosGet.mockResolvedValue({
      data: imageData,
      headers: { 'content-type': 'image/png' },
    });
    const res = mockRes();
    await handleImageProxy(
      mockReq({ url: 'https://sub.media-amazon.com/image.jpg' }),
      res
    );
    expect(res.status).not.toHaveBeenCalledWith(403);
  });
});

describe('handleImageProxy — caching and fetch', () => {
  it('fetches via axios and returns image data', async () => {
    const imageData = Buffer.from('jpeg-bytes');
    mockedAxiosGet.mockResolvedValue({
      data: imageData,
      headers: { 'content-type': 'image/jpeg' },
    });

    const res = mockRes();
    await handleImageProxy(
      mockReq({ url: 'https://covers.openlibrary.org/b/id/123-L.jpg' }),
      res
    );

    expect(mockedAxiosGet).toHaveBeenCalledWith(
      'https://covers.openlibrary.org/b/id/123-L.jpg',
      expect.objectContaining({ responseType: 'arraybuffer' })
    );
    expect(res.set).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'public, max-age=86400');
    expect(res.send).toHaveBeenCalled();
  });

  it('returns cached data on second request', async () => {
    const imageData = Buffer.from('cached-image');
    mockedAxiosGet.mockResolvedValue({
      data: imageData,
      headers: { 'content-type': 'image/png' },
    });

    const url = 'https://covers.openlibrary.org/b/id/cached-test.jpg';
    const res1 = mockRes();
    await handleImageProxy(mockReq({ url }), res1);
    expect(mockedAxiosGet).toHaveBeenCalledTimes(1);

    // Second request should hit cache
    const res2 = mockRes();
    await handleImageProxy(mockReq({ url }), res2);
    expect(mockedAxiosGet).toHaveBeenCalledTimes(1); // No additional call
    expect(res2.set).toHaveBeenCalledWith('Content-Type', 'image/png');
    expect(res2.send).toHaveBeenCalled();
  });

  it('strips charset from content-type', async () => {
    const imageData = Buffer.from('image-bytes');
    mockedAxiosGet.mockResolvedValue({
      data: imageData,
      headers: { 'content-type': 'image/jpeg; charset=utf-8' },
    });

    const res = mockRes();
    await handleImageProxy(
      mockReq({ url: 'https://covers.openlibrary.org/b/id/charset-test.jpg' }),
      res
    );

    expect(res.set).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
  });
});

describe('handleImageProxy — error handling', () => {
  it('returns 502 for non-image content-type', async () => {
    mockedAxiosGet.mockResolvedValue({
      data: Buffer.from('<html>'),
      headers: { 'content-type': 'text/html' },
    });

    const res = mockRes();
    await handleImageProxy(
      mockReq({ url: 'https://covers.openlibrary.org/b/id/html-test.jpg' }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({ error: 'Non-image content type' });
  });

  it('returns 502 on network error', async () => {
    mockedAxiosGet.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = mockRes();
    await handleImageProxy(
      mockReq({ url: 'https://covers.openlibrary.org/b/id/network-error.jpg' }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch image' });
  });
});
