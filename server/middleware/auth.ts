import { Request, Response, NextFunction } from 'express';
import dataSource from '../datasource';
import { User } from '../entity/User';
import { Permission, hasPermission } from '../lib/permissions';
import Settings from '../lib/settings';

// In-memory user cache with short TTL to reduce DB queries
const userCache = new Map<number, { user: User; expiresAt: number }>();
const USER_CACHE_TTL = 30_000; // 30 seconds

// Periodically evict expired entries to prevent unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of userCache) {
    if (entry.expiresAt <= now) {
      userCache.delete(key);
    }
  }
}, 60_000).unref();

export function invalidateUserCache(userId: number): void {
  userCache.delete(userId);
}

export async function checkUser(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  // Skip for non-API routes (static assets, Next.js pages)
  if (!req.path.startsWith('/api/')) {
    return next();
  }

  if (req.session?.userId) {
    const now = Date.now();
    const cached = userCache.get(req.session.userId);

    if (cached && cached.expiresAt > now) {
      req.user = cached.user;
    } else {
      const userRepository = dataSource.getRepository(User);
      const user = await userRepository.findOne({
        where: { id: req.session.userId },
        relations: ['settings'],
      });
      if (user) {
        req.user = user;
        userCache.set(req.session.userId, { user, expiresAt: now + USER_CACHE_TTL });
      }
    }
  }
  next();
}

export function isAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

/**
 * Middleware that skips auth when the app is not yet initialized.
 * Used for test connection endpoints during the setup wizard.
 * Once initialized, requires authentication + specified permission.
 */
export function authOrSetup(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const settings = Settings.getInstance();
    if (!settings.main.initialized) {
      return next();
    }
    isAuthenticated(req, res, () => {
      requirePermission(permission)(req, res, next);
    });
  };
}

export function requirePermission(...permissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const hasRequired = permissions.some((p) =>
      hasPermission(req.user!.permissions, p)
    );
    if (!hasRequired) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  };
}
