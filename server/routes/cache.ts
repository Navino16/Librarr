import { Router, Request, Response } from 'express';
import { Permission } from '../lib/permissions';
import { CacheRegistry } from '../lib/cache';
import { isAuthenticated, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { param } from '../utils/params';
import logger from '../logger';

const router = Router();

// GET /cache — list all registered caches with stats
router.get(
  '/',
  isAuthenticated,
  requirePermission(Permission.ADMIN),
  asyncHandler(async (_req: Request, res: Response) => {
    const caches = CacheRegistry.getAll().map(({ name, cache }) => {
      const stats = cache.getStats();
      return {
        name,
        keys: stats.keys,
        hits: stats.hits,
        misses: stats.misses,
        ksize: stats.ksize,
        vsize: stats.vsize,
        ttl: cache.getTtl(),
        maxKeys: cache.getMaxKeys(),
      };
    });

    return res.json(caches);
  })
);

// POST /cache/:name/flush — flush a single cache by name
router.post(
  '/:name/flush',
  isAuthenticated,
  requirePermission(Permission.ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const name = param(req.params.name);

    const flushed = CacheRegistry.flush(name);
    if (!flushed) {
      return res.status(404).json({ error: `Cache "${name}" not found` });
    }

    logger.info('Cache flushed', { name, userId: req.user?.id });
    return res.json({ success: true, name });
  })
);

// POST /cache/flush — flush all caches
router.post(
  '/flush',
  isAuthenticated,
  requirePermission(Permission.ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    CacheRegistry.flushAll();

    logger.info('All caches flushed', { userId: req.user?.id });
    return res.json({ success: true });
  })
);

export default router;
