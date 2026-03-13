import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import dataSource from '../../datasource';
import { User } from '../../entity/User';
import { UserSettings } from '../../entity/UserSettings';
import { Permission, hasPermission, getAllowedNotificationTypes } from '../../lib/permissions';
import { isAuthenticated, requirePermission, invalidateUserCache } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/asyncHandler';
import { param, parseId, safeInt } from '../../utils/params';
import { UserType } from '../../constants/user';
import { BookRequest } from '../../entity/BookRequest';
import { MusicRequest } from '../../entity/MusicRequest';
import Settings from '../../lib/settings';
import { resolveEffectiveQuota, getQuotaUsage } from '../../lib/quota';

const router = Router();

const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many password change attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /user - List all users (admin/manage_users)
router.get(
  '/',
  isAuthenticated,
  requirePermission(Permission.MANAGE_USERS, Permission.ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const take = Math.min(safeInt(req.query.take as string, 25), 100);
    const skip = safeInt(req.query.skip as string, 0);

    const userRepository = dataSource.getRepository(User);
    const [users, total] = await userRepository.findAndCount({
      order: { id: 'ASC' },
      take,
      skip,
    });

    // Batch count requests per user
    const userIds = users.map((u) => u.id);
    let requestCounts: Record<number, number> = {};
    if (userIds.length > 0) {
      const bookCounts = await dataSource
        .getRepository(BookRequest)
        .createQueryBuilder('br')
        .select('br.requestedById', 'userId')
        .addSelect('COUNT(*)', 'cnt')
        .where('br.requestedById IN (:...ids)', { ids: userIds })
        .groupBy('br.requestedById')
        .getRawMany<{ userId: number; cnt: string }>();

      const musicCounts = await dataSource
        .getRepository(MusicRequest)
        .createQueryBuilder('mr')
        .select('mr.requestedById', 'userId')
        .addSelect('COUNT(*)', 'cnt')
        .where('mr.requestedById IN (:...ids)', { ids: userIds })
        .groupBy('mr.requestedById')
        .getRawMany<{ userId: number; cnt: string }>();

      for (const row of bookCounts) {
        requestCounts[row.userId] = (requestCounts[row.userId] || 0) + Number(row.cnt);
      }
      for (const row of musicCounts) {
        requestCounts[row.userId] = (requestCounts[row.userId] || 0) + Number(row.cnt);
      }
    }

    return res.json({
      pageInfo: {
        pages: Math.ceil(total / take),
        page: Math.floor(skip / take) + 1,
        results: total,
      },
      results: users.map((u) => ({
        ...u,
        requestCount: requestCounts[u.id] || 0,
      })),
    });
  })
);

// POST /user - Create a local user
router.post(
  '/',
  isAuthenticated,
  requirePermission(Permission.MANAGE_USERS, Permission.ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, username, password } = req.body;

    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Email, username and password are required' });
    }

    if (password.length < 8 || password.length > 256) {
      return res.status(400).json({ error: 'Password must be 8-256 characters' });
    }

    const userRepository = dataSource.getRepository(User);

    const existingUser = await userRepository.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    const settings = Settings.getInstance();
    const hashedPassword = await bcrypt.hash(password, 12);

    const user = userRepository.create({
      email,
      username,
      password: hashedPassword,
      userType: UserType.LOCAL,
      permissions: settings.main.defaultPermissions,
    });

    await userRepository.save(user);

    const { password: _password, ...userWithoutPassword } = user;
    return res.status(201).json(userWithoutPassword);
  })
);

// GET /user/:id - Get user by ID
router.get('/:id', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
  const id = parseId(param(req.params.id));
  if (id === null) return res.status(400).json({ error: 'Invalid ID' });
  if (req.user!.id !== id && !hasPermission(req.user!.permissions, Permission.ADMIN) && !hasPermission(req.user!.permissions, Permission.MANAGE_USERS)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const userRepository = dataSource.getRepository(User);
  const user = await userRepository.findOne({ where: { id } });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.json(user);
}));

// GET /user/:id/quota - Get user's quota usage
router.get('/:id/quota', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
  const id = parseId(param(req.params.id));
  if (id === null) return res.status(400).json({ error: 'Invalid ID' });
  if (req.user!.id !== id && !hasPermission(req.user!.permissions, Permission.ADMIN) && !hasPermission(req.user!.permissions, Permission.MANAGE_USERS)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const userRepository = dataSource.getRepository(User);
  const user = await userRepository.findOne({ where: { id } });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const [ebookLimit, audiobookLimit, musicLimit] = [
    resolveEffectiveQuota(user, 'ebook'),
    resolveEffectiveQuota(user, 'audiobook'),
    resolveEffectiveQuota(user, 'music'),
  ];
  const [ebookUsed, audiobookUsed, musicUsed] = await Promise.all([
    getQuotaUsage(id, 'ebook'),
    getQuotaUsage(id, 'audiobook'),
    getQuotaUsage(id, 'music'),
  ]);

  return res.json({
    ebook: {
      limit: ebookLimit,
      used: ebookUsed,
      remaining: ebookLimit !== null ? Math.max(0, ebookLimit - ebookUsed) : null,
    },
    audiobook: {
      limit: audiobookLimit,
      used: audiobookUsed,
      remaining: audiobookLimit !== null ? Math.max(0, audiobookLimit - audiobookUsed) : null,
    },
    music: {
      limit: musicLimit,
      used: musicUsed,
      remaining: musicLimit !== null ? Math.max(0, musicLimit - musicUsed) : null,
    },
  });
}));

// PUT /user/:id - Update user
router.put('/:id', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
  const id = parseId(param(req.params.id));
  if (id === null) return res.status(400).json({ error: 'Invalid ID' });
  if (req.user!.id !== id && !hasPermission(req.user!.permissions, Permission.ADMIN) && !hasPermission(req.user!.permissions, Permission.MANAGE_USERS)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const userRepository = dataSource.getRepository(User);
  const user = await userRepository.findOne({ where: { id } });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // S10/S11: Prevent non-admins from modifying admin users
  if (hasPermission(user.permissions, Permission.ADMIN) && !hasPermission(req.user!.permissions, Permission.ADMIN)) {
    return res.status(403).json({ error: 'Only admins can modify admin users' });
  }

  const { username, email, avatar, ebookQuotaLimit, audiobookQuotaLimit, musicQuotaLimit } = req.body;

  // Validate string fields
  if (username !== undefined) {
    if (typeof username !== 'string' || username.length === 0 || username.length > 100) {
      return res.status(400).json({ error: 'Username must be between 1 and 100 characters' });
    }
    user.username = username;
  }

  if (email !== undefined) {
    if (typeof email !== 'string' || email.length === 0 || email.length > 255) {
      return res.status(400).json({ error: 'Email must be between 1 and 255 characters' });
    }
    // Check email uniqueness
    if (email !== user.email) {
      const existingUser = await userRepository.findOne({ where: { email } });
      if (existingUser && existingUser.id !== user.id) {
        return res.status(409).json({ error: 'A user with this email already exists' });
      }
    }
    user.email = email;
  }

  if (avatar !== undefined) {
    if (avatar !== null && avatar !== '' && (typeof avatar !== 'string' || avatar.length > 500)) {
      return res.status(400).json({ error: 'Avatar must be a string of at most 500 characters' });
    }
    user.avatar = avatar;
  }

  // Quota fields only modifiable by admin/manager
  if (hasPermission(req.user!.permissions, Permission.ADMIN) || hasPermission(req.user!.permissions, Permission.MANAGE_USERS)) {
    if (ebookQuotaLimit !== undefined) {
      if (ebookQuotaLimit !== null && typeof ebookQuotaLimit !== 'number') return res.status(400).json({ error: 'ebookQuotaLimit must be a number or null' });
      user.ebookQuotaLimit = ebookQuotaLimit;
    }
    if (audiobookQuotaLimit !== undefined) {
      if (audiobookQuotaLimit !== null && typeof audiobookQuotaLimit !== 'number') return res.status(400).json({ error: 'audiobookQuotaLimit must be a number or null' });
      user.audiobookQuotaLimit = audiobookQuotaLimit;
    }
    if (musicQuotaLimit !== undefined) {
      if (musicQuotaLimit !== null && typeof musicQuotaLimit !== 'number') return res.status(400).json({ error: 'musicQuotaLimit must be a number or null' });
      user.musicQuotaLimit = musicQuotaLimit;
    }
  }

  await userRepository.save(user);
  invalidateUserCache(user.id);
  return res.json(user);
}));

// DELETE /user/:id - Delete user
router.delete(
  '/:id',
  isAuthenticated,
  requirePermission(Permission.MANAGE_USERS, Permission.ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseId(param(req.params.id));
    if (id === null) return res.status(400).json({ error: 'Invalid ID' });
    if (req.user!.id === id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const userRepository = dataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id } });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // S10: Prevent non-admins from deleting admin users
    if (hasPermission(user.permissions, Permission.ADMIN) && !hasPermission(req.user!.permissions, Permission.ADMIN)) {
      return res.status(403).json({ error: 'Only admins can delete admin users' });
    }

    await userRepository.remove(user);
    return res.json({ success: true });
  })
);

// GET /user/:id/settings/main
router.get('/:id/settings/main', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
  const id = parseId(param(req.params.id));
  if (id === null) return res.status(400).json({ error: 'Invalid ID' });
  if (req.user!.id !== id && !hasPermission(req.user!.permissions, Permission.ADMIN) && !hasPermission(req.user!.permissions, Permission.MANAGE_USERS)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const settingsRepository = dataSource.getRepository(UserSettings);
  let settings = await settingsRepository.findOne({
    where: { user: { id } },
  });

  if (!settings) {
    settings = settingsRepository.create({ user: { id } as User });
    await settingsRepository.save(settings);
  }

  // Filter out sensitive notification tokens from response
  const { pushbulletAccessToken: _pb, pushoverApplicationToken: _pa, pushoverUserKey: _pk, ...safeSettings } = settings;
  return res.json({
    ...safeSettings,
    pushbulletAccessToken: _pb ? '********' : undefined,
    pushoverApplicationToken: _pa ? '********' : undefined,
    pushoverUserKey: _pk ? '********' : undefined,
  });
}));

// POST /user/:id/settings/main
router.post('/:id/settings/main', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
  const id = parseId(param(req.params.id));
  if (id === null) return res.status(400).json({ error: 'Invalid ID' });
  if (req.user!.id !== id && !hasPermission(req.user!.permissions, Permission.ADMIN) && !hasPermission(req.user!.permissions, Permission.MANAGE_USERS)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const settingsRepository = dataSource.getRepository(UserSettings);
  let settings = await settingsRepository.findOne({
    where: { user: { id } },
  });

  if (!settings) {
    settings = settingsRepository.create({ user: { id } as User });
  }

  // Whitelist allowed fields to prevent mass assignment
  const { locale, discordId, telegramChatId, pushbulletAccessToken, pushoverApplicationToken, pushoverUserKey } = req.body;
  if (locale !== undefined) {
    if (typeof locale !== 'string' || !/^[a-z]{2}(-[A-Z]{2})?$/.test(locale)) {
      return res.status(400).json({ error: 'locale must be a valid BCP 47 language tag (e.g., "en", "fr")' });
    }
    settings.locale = locale;
  }
  if (discordId !== undefined) settings.discordId = discordId;
  if (telegramChatId !== undefined) settings.telegramChatId = telegramChatId;
  if (pushbulletAccessToken !== undefined) settings.pushbulletAccessToken = pushbulletAccessToken;
  if (pushoverApplicationToken !== undefined) settings.pushoverApplicationToken = pushoverApplicationToken;
  if (pushoverUserKey !== undefined) settings.pushoverUserKey = pushoverUserKey;

  await settingsRepository.save(settings);
  invalidateUserCache(id);
  const { pushbulletAccessToken: _pb, pushoverApplicationToken: _pa, pushoverUserKey: _pk, ...safeSettings } = settings;
  return res.json({
    ...safeSettings,
    pushbulletAccessToken: _pb ? '********' : undefined,
    pushoverApplicationToken: _pa ? '********' : undefined,
    pushoverUserKey: _pk ? '********' : undefined,
  });
}));

// POST /user/:id/settings/password
router.post('/:id/settings/password', isAuthenticated, passwordChangeLimiter, asyncHandler(async (req: Request, res: Response) => {
  const id = parseId(param(req.params.id));
  if (id === null) return res.status(400).json({ error: 'Invalid ID' });
  if (req.user!.id !== id && !hasPermission(req.user!.permissions, Permission.ADMIN) && !hasPermission(req.user!.permissions, Permission.MANAGE_USERS)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { currentPassword, newPassword } = req.body;

  if (!newPassword || newPassword.length < 8 || newPassword.length > 256) {
    return res.status(400).json({ error: 'Password must be 8-256 characters' });
  }

  const userRepository = dataSource.getRepository(User);
  const user = await userRepository.findOne({
    where: { id },
    select: ['id', 'password'],
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // If changing own password, verify current password
  if (req.user!.id === id && user.password) {
    if (!currentPassword) {
      return res.status(400).json({ error: 'Current password is required' });
    }
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
  }

  user.password = await bcrypt.hash(newPassword, 12);
  await userRepository.save(user);
  return res.json({ success: true });
}));

// GET /user/:id/settings/notifications
router.get('/:id/settings/notifications', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
  const id = parseId(param(req.params.id));
  if (id === null) return res.status(400).json({ error: 'Invalid ID' });
  if (req.user!.id !== id && !hasPermission(req.user!.permissions, Permission.ADMIN) && !hasPermission(req.user!.permissions, Permission.MANAGE_USERS)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const settingsRepository = dataSource.getRepository(UserSettings);
  let settings = await settingsRepository.findOne({
    where: { user: { id } },
  });

  if (!settings) {
    settings = settingsRepository.create({ user: { id } as User });
    await settingsRepository.save(settings);
  }

  return res.json({ notificationTypes: settings.notificationTypes });
}));

// POST /user/:id/settings/notifications
router.post('/:id/settings/notifications', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
  const id = parseId(param(req.params.id));
  if (id === null) return res.status(400).json({ error: 'Invalid ID' });
  if (req.user!.id !== id && !hasPermission(req.user!.permissions, Permission.ADMIN) && !hasPermission(req.user!.permissions, Permission.MANAGE_USERS)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { notificationTypes } = req.body;
  if (typeof notificationTypes !== 'number') {
    return res.status(400).json({ error: 'notificationTypes must be a number' });
  }

  // Mask notification types against the target user's permissions
  const userRepository = dataSource.getRepository(User);
  const targetUser = await userRepository.findOne({ where: { id } });
  if (!targetUser) return res.status(404).json({ error: 'User not found' });

  const allowed = getAllowedNotificationTypes(targetUser.permissions);
  const maskedTypes = notificationTypes & allowed;

  const settingsRepository = dataSource.getRepository(UserSettings);
  let settings = await settingsRepository.findOne({
    where: { user: { id } },
  });

  if (!settings) {
    settings = settingsRepository.create({ user: { id } as User });
  }

  settings.notificationTypes = maskedTypes;
  await settingsRepository.save(settings);

  return res.json({ notificationTypes: settings.notificationTypes });
}));

// GET /user/:id/settings/permissions
router.get(
  '/:id/settings/permissions',
  isAuthenticated,
  requirePermission(Permission.MANAGE_USERS, Permission.ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseId(param(req.params.id));
    if (id === null) return res.status(400).json({ error: 'Invalid ID' });
    const userRepository = dataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id } });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ permissions: user.permissions });
  })
);

// POST /user/:id/settings/permissions
router.post(
  '/:id/settings/permissions',
  isAuthenticated,
  requirePermission(Permission.MANAGE_USERS, Permission.ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseId(param(req.params.id));
    if (id === null) {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    // Cannot change your own permissions
    if (req.user!.id === id) {
      return res.status(400).json({ error: 'Cannot change your own permissions' });
    }

    const { permissions } = req.body;

    if (typeof permissions !== 'number') {
      return res.status(400).json({ error: 'permissions must be a number' });
    }

    // Only admins can grant ADMIN permission
    if ((permissions & Permission.ADMIN) && !hasPermission(req.user!.permissions, Permission.ADMIN)) {
      return res.status(403).json({ error: 'Only admins can grant admin permission' });
    }

    // Anti-escalation: non-admins can only grant permissions they have themselves
    if (!hasPermission(req.user!.permissions, Permission.ADMIN)) {
      const grantedNew = permissions & ~req.user!.permissions;
      if (grantedNew !== 0) {
        return res.status(403).json({ error: 'Cannot grant permissions you do not have' });
      }
    }

    const userRepository = dataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id } });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // S11: Prevent non-admins from modifying admin user permissions
    if (hasPermission(user.permissions, Permission.ADMIN) && !hasPermission(req.user!.permissions, Permission.ADMIN)) {
      return res.status(403).json({ error: 'Only admins can modify admin users' });
    }

    user.permissions = permissions;
    await userRepository.save(user);
    invalidateUserCache(user.id);
    return res.json({ permissions: user.permissions });
  })
);

export default router;
