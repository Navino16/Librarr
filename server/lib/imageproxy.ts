import axios from 'axios';
import { Request, Response } from 'express';
import { CacheManager, CacheRegistry } from './cache';
import logger from '../logger';

// Bounded cache for image proxy: max 100 entries, 24h TTL
const imageCache = CacheRegistry.register('imageproxy', new CacheManager(86400, 100));

export async function handleImageProxy(req: Request, res: Response) {
  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL parameter required' });
  }

  try {
    // Validate URL is from allowed domains
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return res.status(400).json({ error: 'Only HTTP(S) URLs are allowed' });
    }
    const allowedHosts = [
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

    // M4: Exact match or proper suffix check to prevent subdomain bypass
    if (!allowedHosts.some((h) => parsedUrl.hostname === h || parsedUrl.hostname.endsWith('.' + h))) {
      return res.status(403).json({ error: 'Domain not allowed' });
    }

    const cacheKey = `img:${url}`;
    const cached = imageCache.get<{ data: Buffer; contentType: string }>(cacheKey);

    if (cached) {
      res.set('Content-Type', cached.contentType);
      res.set('Cache-Control', 'public, max-age=86400');
      return res.send(cached.data);
    }

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000,
      maxContentLength: 10 * 1024 * 1024, // 10MB max
    });

    const contentType = response.headers['content-type'] || 'image/jpeg';
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'];
    const baseType = contentType.split(';')[0].trim().toLowerCase();
    if (!allowedTypes.includes(baseType)) {
      return res.status(502).json({ error: 'Non-image content type' });
    }
    const data = Buffer.from(response.data);

    imageCache.set(cacheKey, { data, contentType: baseType }, 86400);

    res.set('Content-Type', baseType);
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(data);
  } catch (e) {
    logger.warn('Image proxy error', { url, error: e });
    return res.status(502).json({ error: 'Failed to fetch image' });
  }
}
