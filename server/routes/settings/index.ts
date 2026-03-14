import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import dataSource from '../../datasource';
import { User } from '../../entity/User';
import { UserType } from '../../constants/user';
import { Permission } from '../../lib/permissions';
import Settings from '../../lib/settings';
import { isAuthenticated, requirePermission, authOrSetup } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/asyncHandler';
import logger from '../../logger';
import { param, parseId, safeInt } from '../../utils/params';
import { validateConnectionTarget } from '../../utils/validateHostname';
import { DEFAULT_METADATA_PROVIDERS } from '../../api/metadata/MetadataResolver';
import type { MetadataProviderSettings } from '@server/types/settings';
import type { MetadataSource } from '../../api/metadata/types';
import { buildServerUrl } from '../../lib/serverUrl';
import { CacheRegistry } from '../../lib/cache';
import { resetMetadataResolver } from '../../lib/metadataResolverInstance';
import { UnmatchedMediaItem } from '../../entity/UnmatchedMediaItem';
import notificationManager from '../../lib/notifications';
import emailAgent from '../../lib/notifications/agents/email';
import type { SmtpSettings } from '@server/types/settings';

const EMAIL_REGEX = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

const isValidPort = (port: unknown): port is number =>
  typeof port === 'number' && Number.isFinite(port) && port >= 1 && port <= 65535;

const initializeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

const testConnectionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many test requests. Please try again later.' },
});

const router = Router();

// POST /settings/initialize - First-run setup
router.post('/initialize', initializeLimiter, asyncHandler(async (req: Request, res: Response) => {
  const settings = Settings.getInstance();

  if (settings.main.initialized) {
    return res.status(400).json({ error: 'Application already initialized' });
  }

  const { email, username, password } = req.body;

  if (!email || !username || !password) {
    return res.status(400).json({ error: 'Email, username, and password are required' });
  }

  if (typeof email !== 'string' || !EMAIL_REGEX.test(email) || email.length > 255) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  if (typeof username !== 'string' || username.trim().length < 1 || username.length > 100) {
    return res.status(400).json({ error: 'Username must be 1-100 characters' });
  }

  if (typeof password !== 'string' || password.length < 8 || password.length > 256) {
    return res.status(400).json({ error: 'Password must be 8-256 characters' });
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const userRepository = dataSource.getRepository(User);

  const adminUser = userRepository.create({
    email: email.trim(),
    username: username.trim(),
    password: hashedPassword,
    userType: UserType.LOCAL,
    permissions: Permission.ADMIN,
  });

  await userRepository.save(adminUser);

  settings.main = {
    ...settings.main,
    initialized: true,
  };
  settings.save();

  logger.info('Application initialized with admin user', { userId: adminUser.id });

  const { password: _password, ...userWithoutPassword } = adminUser;

  // Regenerate session to prevent session fixation
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  req.session.userId = adminUser.id;
  return res.json(userWithoutPassword);
}));

// GET /settings/public - Public settings (no auth required)
router.get('/public', (_req: Request, res: Response) => {
  const settings = Settings.getInstance();
  return res.json(settings.public);
});

// GET /settings/main - Get main settings
router.get(
  '/main',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_GENERAL),
  (_req: Request, res: Response) => {
    const settings = Settings.getInstance();
    const { hardcoverToken, ...rest } = settings.main;
    return res.json({ ...rest, hardcoverTokenSet: !!hardcoverToken });
  }
);

// POST /settings/main - Update main settings
router.post(
  '/main',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_GENERAL),
  (req: Request, res: Response) => {
    const settings = Settings.getInstance();
    // C3: Whitelist allowed fields to prevent arbitrary settings override
    const { appTitle, applicationUrl, hideAvailable, localLogin, plexLogin, oidcLogin, defaultPermissions, hardcoverToken, enableEbookRequests, enableAudiobookRequests, enableMusicRequests } = req.body;
    if (appTitle !== undefined) {
      if (typeof appTitle !== 'string' || appTitle.trim().length === 0 || appTitle.length > 255) {
        return res.status(400).json({ error: 'appTitle must be a non-empty string (max 255 chars)' });
      }
      settings.main.appTitle = appTitle.trim();
    }
    if (applicationUrl !== undefined) {
      if (applicationUrl !== '' && typeof applicationUrl === 'string') {
        try { new URL(applicationUrl); } catch {
          return res.status(400).json({ error: 'applicationUrl must be a valid URL' });
        }
      }
      settings.main.applicationUrl = applicationUrl;
    }
    if (hideAvailable !== undefined) settings.main.hideAvailable = !!hideAvailable;
    if (localLogin !== undefined) settings.main.localLogin = !!localLogin;
    if (plexLogin !== undefined) settings.main.plexLogin = !!plexLogin;
    if (oidcLogin !== undefined) settings.main.oidcLogin = !!oidcLogin;
    if (defaultPermissions !== undefined) {
      if (typeof defaultPermissions !== 'number' || !Number.isFinite(defaultPermissions)) {
        return res.status(400).json({ error: 'defaultPermissions must be a number' });
      }
      settings.main.defaultPermissions = defaultPermissions & ~Permission.ADMIN;
    }
    if (hardcoverToken && typeof hardcoverToken === 'string' && hardcoverToken.trim()) {
      settings.main.hardcoverToken = hardcoverToken.trim();
    }
    if (enableEbookRequests !== undefined) settings.main.enableEbookRequests = !!enableEbookRequests;
    if (enableAudiobookRequests !== undefined) settings.main.enableAudiobookRequests = !!enableAudiobookRequests;
    if (enableMusicRequests !== undefined) settings.main.enableMusicRequests = !!enableMusicRequests;
    settings.save();
    const { hardcoverToken: _hardcoverToken, ...rest } = settings.main;
    return res.json({ ...rest, hardcoverTokenSet: !!settings.main.hardcoverToken });
  }
);

// Permission roles
router.get(
  '/roles',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_PERMISSIONS, Permission.MANAGE_USERS),
  (_req: Request, res: Response) => {
    const settings = Settings.getInstance();
    return res.json(settings.roles);
  }
);

router.post(
  '/roles',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_PERMISSIONS),
  (req: Request, res: Response) => {
    const { name, permissions, ebookQuotaLimit, audiobookQuotaLimit, musicQuotaLimit } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (typeof permissions !== 'number') {
      return res.status(400).json({ error: 'Permissions must be a number' });
    }
    if (ebookQuotaLimit !== undefined && ebookQuotaLimit !== null && (typeof ebookQuotaLimit !== 'number' || ebookQuotaLimit < 0 || !Number.isInteger(ebookQuotaLimit))) {
      return res.status(400).json({ error: 'ebookQuotaLimit must be a positive integer or null' });
    }
    if (audiobookQuotaLimit !== undefined && audiobookQuotaLimit !== null && (typeof audiobookQuotaLimit !== 'number' || audiobookQuotaLimit < 0 || !Number.isInteger(audiobookQuotaLimit))) {
      return res.status(400).json({ error: 'audiobookQuotaLimit must be a positive integer or null' });
    }
    if (musicQuotaLimit !== undefined && musicQuotaLimit !== null && (typeof musicQuotaLimit !== 'number' || musicQuotaLimit < 0 || !Number.isInteger(musicQuotaLimit))) {
      return res.status(400).json({ error: 'musicQuotaLimit must be a positive integer or null' });
    }

    const settings = Settings.getInstance();
    const role: typeof settings.roles[number] = {
      id: parseInt(crypto.randomBytes(4).toString('hex'), 16),
      name: name.trim(),
      permissions,
      isDefault: false,
      ...(ebookQuotaLimit != null ? { ebookQuotaLimit } : {}),
      ...(audiobookQuotaLimit != null ? { audiobookQuotaLimit } : {}),
      ...(musicQuotaLimit != null ? { musicQuotaLimit } : {}),
    };
    settings.roles = [...settings.roles, role];
    settings.save();
    return res.json(role);
  }
);

router.put(
  '/roles/:id',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_PERMISSIONS),
  (req: Request, res: Response) => {
    const id = parseId(param(req.params.id));
    if (id === null) return res.status(400).json({ error: 'Invalid ID' });
    const settings = Settings.getInstance();
    const index = settings.roles.findIndex((p) => p.id === id);

    if (index === -1) {
      return res.status(404).json({ error: 'Role not found' });
    }

    // Admin role cannot be edited
    if (settings.roles[index].permissions === Permission.ADMIN) {
      return res.status(400).json({ error: 'Cannot modify the Admin role' });
    }

    const { name, permissions, isDefault, ebookQuotaLimit, audiobookQuotaLimit, musicQuotaLimit } = req.body;

    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      return res.status(400).json({ error: 'Name must be a non-empty string' });
    }
    if (permissions !== undefined && typeof permissions !== 'number') {
      return res.status(400).json({ error: 'Permissions must be a number' });
    }
    if (ebookQuotaLimit !== undefined && ebookQuotaLimit !== null && (typeof ebookQuotaLimit !== 'number' || ebookQuotaLimit < 0 || !Number.isInteger(ebookQuotaLimit))) {
      return res.status(400).json({ error: 'ebookQuotaLimit must be a positive integer or null' });
    }
    if (audiobookQuotaLimit !== undefined && audiobookQuotaLimit !== null && (typeof audiobookQuotaLimit !== 'number' || audiobookQuotaLimit < 0 || !Number.isInteger(audiobookQuotaLimit))) {
      return res.status(400).json({ error: 'audiobookQuotaLimit must be a positive integer or null' });
    }
    if (musicQuotaLimit !== undefined && musicQuotaLimit !== null && (typeof musicQuotaLimit !== 'number' || musicQuotaLimit < 0 || !Number.isInteger(musicQuotaLimit))) {
      return res.status(400).json({ error: 'musicQuotaLimit must be a positive integer or null' });
    }

    const updated = { ...settings.roles[index] };
    if (name !== undefined) updated.name = name.trim();
    if (permissions !== undefined) updated.permissions = permissions;
    if (ebookQuotaLimit !== undefined) updated.ebookQuotaLimit = ebookQuotaLimit ?? undefined;
    if (audiobookQuotaLimit !== undefined) updated.audiobookQuotaLimit = audiobookQuotaLimit ?? undefined;
    if (musicQuotaLimit !== undefined) updated.musicQuotaLimit = musicQuotaLimit ?? undefined;

    if (isDefault === true) {
      settings.roles = settings.roles.map((p) => ({ ...p, isDefault: false }));
      updated.isDefault = true;
      settings.main = { ...settings.main, defaultPermissions: updated.permissions & ~Permission.ADMIN };
    }

    settings.roles = settings.roles.map((p) => (p.id === id ? updated : p));
    settings.save();
    return res.json(updated);
  }
);

router.delete(
  '/roles/:id',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_PERMISSIONS),
  (req: Request, res: Response) => {
    const id = parseId(param(req.params.id));
    if (id === null) return res.status(400).json({ error: 'Invalid ID' });
    const settings = Settings.getInstance();
    const role = settings.roles.find((p) => p.id === id);

    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }
    if (role.permissions === Permission.ADMIN) {
      return res.status(400).json({ error: 'Cannot delete the Admin role' });
    }
    if (role.isDefault) {
      return res.status(400).json({ error: 'Cannot delete the default role' });
    }

    settings.roles = settings.roles.filter((p) => p.id !== id);
    settings.save();
    return res.json({ success: true });
  }
);

// Readarr settings
router.get(
  '/readarr',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_READARR),
  (_req: Request, res: Response) => {
    const settings = Settings.getInstance();
    return res.json(settings.readarr.map(({ apiKey, ...r }) => ({ ...r, apiKeySet: !!apiKey })));
  }
);

router.post(
  '/readarr',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_READARR),
  (req: Request, res: Response) => {
    const settings = Settings.getInstance();
    const contentType = req.body.contentType;
    if (contentType && contentType !== 'ebook' && contentType !== 'audiobook') {
      return res.status(400).json({ error: 'contentType must be "ebook" or "audiobook"' });
    }
    const { name, hostname, port, apiKey, useSsl, baseUrl, activeProfileId, activeDirectory, metadataProfileId, tags } = req.body;
    if (!hostname || typeof hostname !== 'string') {
      return res.status(400).json({ error: 'hostname is required' });
    }
    if (port !== undefined && !isValidPort(port)) {
      return res.status(400).json({ error: 'port must be between 1 and 65535' });
    }
    const serverContentType = contentType || 'ebook';
    // Enforce max 1 server per content type
    const existingForType = settings.readarr.find((r) => (r.contentType || 'ebook') === serverContentType);
    if (existingForType) {
      return res.status(400).json({ error: `A Readarr server for ${serverContentType} already exists` });
    }
    settings.readarr = [...settings.readarr, { name, hostname, port, apiKey, useSsl, baseUrl, activeProfileId, activeDirectory, metadataProfileId, tags, contentType: serverContentType, id: parseInt(crypto.randomBytes(4).toString('hex'), 16) }];
    settings.save();
    return res.json(settings.readarr.map(({ apiKey: _, ...r }) => ({ ...r, apiKeySet: !!_ })));
  }
);

router.put(
  '/readarr/:id',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_READARR),
  (req: Request, res: Response) => {
    const settings = Settings.getInstance();
    const id = parseId(param(req.params.id));
    if (id === null) return res.status(400).json({ error: 'Invalid ID' });
    const contentType = req.body.contentType;
    if (contentType && contentType !== 'ebook' && contentType !== 'audiobook') {
      return res.status(400).json({ error: 'contentType must be "ebook" or "audiobook"' });
    }
    const { name, hostname, port, apiKey, useSsl, baseUrl, activeProfileId, activeDirectory, metadataProfileId, tags } = req.body;
    // Prevent changing content type if another server already exists for the target type
    if (contentType) {
      const target = settings.readarr.find((r) => r.id === id);
      if (target && (target.contentType || 'ebook') !== contentType) {
        const existingForType = settings.readarr.find((r) => r.id !== id && (r.contentType || 'ebook') === contentType);
        if (existingForType) {
          return res.status(400).json({ error: `A Readarr server for ${contentType} already exists` });
        }
      }
    }
    const allowedFields = { name, hostname, port, apiKey, useSsl, baseUrl, activeProfileId, activeDirectory, metadataProfileId, tags, contentType };
    const cleanFields = Object.fromEntries(Object.entries(allowedFields).filter(([, v]) => v !== undefined));
    settings.readarr = settings.readarr.map((r) =>
      r.id === id ? { ...r, ...cleanFields } : r
    );
    settings.save();
    return res.json(settings.readarr.map(({ apiKey: _, ...r }) => ({ ...r, apiKeySet: !!_ })));
  }
);

router.delete(
  '/readarr/:id',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_READARR),
  (req: Request, res: Response) => {
    const settings = Settings.getInstance();
    const id = parseId(param(req.params.id));
    if (id === null) return res.status(400).json({ error: 'Invalid ID' });
    settings.readarr = settings.readarr.filter((r) => r.id !== id);
    settings.save();
    return res.json(settings.readarr.map(({ apiKey: _, ...r }) => ({ ...r, apiKeySet: !!_ })));
  }
);

// Lidarr settings
router.get(
  '/lidarr',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_LIDARR),
  (_req: Request, res: Response) => {
    const settings = Settings.getInstance();
    return res.json(settings.lidarr.map(({ apiKey, ...l }) => ({ ...l, apiKeySet: !!apiKey })));
  }
);

router.post(
  '/lidarr',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_LIDARR),
  (req: Request, res: Response) => {
    const settings = Settings.getInstance();
    const { name, hostname, port, apiKey, useSsl, baseUrl, activeProfileId, activeDirectory, metadataProfileId, tags, isDefault } = req.body;
    if (!hostname || typeof hostname !== 'string') {
      return res.status(400).json({ error: 'hostname is required' });
    }
    if (port !== undefined && !isValidPort(port)) {
      return res.status(400).json({ error: 'port must be between 1 and 65535' });
    }
    // Enforce unique isDefault for lidarr
    if (isDefault) {
      settings.lidarr = settings.lidarr.map((l) => ({ ...l, isDefault: false }));
    }
    settings.lidarr = [...settings.lidarr, { name, hostname, port, apiKey, useSsl, baseUrl, activeProfileId, activeDirectory, metadataProfileId, tags, isDefault, id: parseInt(crypto.randomBytes(4).toString('hex'), 16) }];
    settings.save();
    return res.json(settings.lidarr.map(({ apiKey: _, ...l }) => ({ ...l, apiKeySet: !!_ })));
  }
);

router.put(
  '/lidarr/:id',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_LIDARR),
  (req: Request, res: Response) => {
    const settings = Settings.getInstance();
    const id = parseId(param(req.params.id));
    if (id === null) return res.status(400).json({ error: 'Invalid ID' });
    const { name, hostname, port, apiKey, useSsl, baseUrl, activeProfileId, activeDirectory, metadataProfileId, tags, isDefault } = req.body;
    const allowedFields = { name, hostname, port, apiKey, useSsl, baseUrl, activeProfileId, activeDirectory, metadataProfileId, tags, isDefault };
    const cleanFields = Object.fromEntries(Object.entries(allowedFields).filter(([, v]) => v !== undefined));
    // Enforce unique isDefault for lidarr
    if (isDefault === true) {
      settings.lidarr = settings.lidarr.map((l) =>
        l.id !== id ? { ...l, isDefault: false } : l
      );
    }
    settings.lidarr = settings.lidarr.map((l) =>
      l.id === id ? { ...l, ...cleanFields } : l
    );
    settings.save();
    return res.json(settings.lidarr.map(({ apiKey: _, ...l }) => ({ ...l, apiKeySet: !!_ })));
  }
);

router.delete(
  '/lidarr/:id',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_LIDARR),
  (req: Request, res: Response) => {
    const settings = Settings.getInstance();
    const id = parseId(param(req.params.id));
    if (id === null) return res.status(400).json({ error: 'Invalid ID' });
    settings.lidarr = settings.lidarr.filter((l) => l.id !== id);
    settings.save();
    return res.json(settings.lidarr.map(({ apiKey: _, ...l }) => ({ ...l, apiKeySet: !!_ })));
  }
);

// Audiobookshelf settings
router.get(
  '/audiobookshelf',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_MEDIA_SERVERS),
  (_req: Request, res: Response) => {
    const settings = Settings.getInstance();
    const { apiKey, ...rest } = settings.audiobookshelf;
    return res.json({ ...rest, apiKeySet: !!apiKey });
  }
);

router.post(
  '/audiobookshelf',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_MEDIA_SERVERS),
  (req: Request, res: Response) => {
    const settings = Settings.getInstance();
    const { hostname, port, apiKey, useSsl, baseUrl } = req.body;
    const allowedFields = { hostname, port, apiKey, useSsl, baseUrl };
    const cleanFields = Object.fromEntries(Object.entries(allowedFields).filter(([, v]) => v !== undefined));
    settings.audiobookshelf = { ...settings.audiobookshelf, ...cleanFields };
    settings.save();
    const { apiKey: _, ...absRest } = settings.audiobookshelf;
    return res.json({ ...absRest, apiKeySet: !!_ });
  }
);

// Jellyfin settings
router.get(
  '/jellyfin',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_MEDIA_SERVERS),
  (_req: Request, res: Response) => {
    const settings = Settings.getInstance();
    const { apiKey, ...jfRest } = settings.jellyfin;
    return res.json({ ...jfRest, apiKeySet: !!apiKey });
  }
);

router.post(
  '/jellyfin',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_MEDIA_SERVERS),
  (req: Request, res: Response) => {
    const settings = Settings.getInstance();
    const { hostname, port, useSsl, baseUrl, serverId } = req.body;
    const allowedFields = { hostname, port, useSsl, baseUrl, serverId };
    const cleanFields = Object.fromEntries(Object.entries(allowedFields).filter(([, v]) => v !== undefined));
    settings.jellyfin = { ...settings.jellyfin, ...cleanFields };
    settings.save();
    const { apiKey: _jfApiKey, ...jfPostRest } = settings.jellyfin;
    return res.json({ ...jfPostRest, apiKeySet: !!_jfApiKey });
  }
);

// Plex settings
router.get(
  '/plex',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_MEDIA_SERVERS),
  (_req: Request, res: Response) => {
    const settings = Settings.getInstance();
    const { token, ...rest } = settings.plex;
    return res.json({ ...rest, tokenSet: !!token });
  }
);

router.post(
  '/plex',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_MEDIA_SERVERS),
  (req: Request, res: Response) => {
    const settings = Settings.getInstance();
    const { hostname, port, useSsl, token, machineId } = req.body;
    const allowedFields = { hostname, port, useSsl, token, machineId };
    const cleanFields = Object.fromEntries(Object.entries(allowedFields).filter(([, v]) => v !== undefined));
    settings.plex = { ...settings.plex, ...cleanFields };
    settings.save();
    const { token: _, ...plexRest } = settings.plex;
    return res.json({ ...plexRest, tokenSet: !!_ });
  }
);

// Plex auth settings
router.get(
  '/plex-auth',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_GENERAL),
  (_req: Request, res: Response) => {
    const settings = Settings.getInstance();
    return res.json(settings.plexAuth);
  }
);

router.post(
  '/plex-auth',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_GENERAL),
  (req: Request, res: Response) => {
    const settings = Settings.getInstance();
    const { autoCreateUsers, defaultPermissions } = req.body;
    if (autoCreateUsers !== undefined) settings.plexAuth.autoCreateUsers = !!autoCreateUsers;
    if (defaultPermissions !== undefined && typeof defaultPermissions === 'number') {
      settings.plexAuth.defaultPermissions = defaultPermissions & ~Permission.ADMIN;
    }
    settings.save();
    return res.json(settings.plexAuth);
  }
);

// OIDC provider settings
router.get(
  '/oidc-providers',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_GENERAL),
  (_req: Request, res: Response) => {
    const settings = Settings.getInstance();
    return res.json(
      settings.oidcProviders.map(({ clientSecret, ...p }) => ({
        ...p,
        clientSecretSet: !!clientSecret,
      }))
    );
  }
);

router.post(
  '/oidc-providers',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_GENERAL),
  (req: Request, res: Response) => {
    const settings = Settings.getInstance();
    const { name, issuerUrl, clientId, clientSecret, scopes, autoCreateUsers, defaultPermissions } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!issuerUrl || typeof issuerUrl !== 'string') {
      return res.status(400).json({ error: 'Issuer URL is required' });
    }
    try {
      const parsed = new URL(issuerUrl);
      if (!['https:', 'http:'].includes(parsed.protocol)) {
        return res.status(400).json({ error: 'Issuer URL must use https (or http for development)' });
      }
    } catch {
      return res.status(400).json({ error: 'Issuer URL must be a valid URL' });
    }
    if (!clientId || typeof clientId !== 'string') {
      return res.status(400).json({ error: 'Client ID is required' });
    }
    if (!clientSecret || typeof clientSecret !== 'string') {
      return res.status(400).json({ error: 'Client Secret is required' });
    }

    const id = crypto.randomBytes(8).toString('hex');
    const provider = {
      id,
      name: name.trim(),
      issuerUrl: issuerUrl.trim(),
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      scopes: (scopes || 'openid email profile').trim(),
      autoCreateUsers: !!autoCreateUsers,
      defaultPermissions: typeof defaultPermissions === 'number'
        ? defaultPermissions & ~Permission.ADMIN
        : settings.main.defaultPermissions,
    };

    settings.oidcProviders = [...settings.oidcProviders, provider];
    settings.save();

    const { clientSecret: _cs, ...safe } = provider;
    return res.json({ ...safe, clientSecretSet: true });
  }
);

router.put(
  '/oidc-providers/:id',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_GENERAL),
  (req: Request, res: Response) => {
    const settings = Settings.getInstance();
    const providerId = param(req.params.id);
    const index = settings.oidcProviders.findIndex((p) => p.id === providerId);
    if (index === -1) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    const { name, issuerUrl, clientId, clientSecret, scopes, autoCreateUsers, defaultPermissions } = req.body;
    const provider = { ...settings.oidcProviders[index] };

    if (name !== undefined) provider.name = String(name).trim();
    if (issuerUrl !== undefined) {
      const trimmedUrl = String(issuerUrl).trim();
      try {
        const parsed = new URL(trimmedUrl);
        if (!['https:', 'http:'].includes(parsed.protocol)) {
          return res.status(400).json({ error: 'Issuer URL must use https (or http for development)' });
        }
      } catch {
        return res.status(400).json({ error: 'Issuer URL must be a valid URL' });
      }
      provider.issuerUrl = trimmedUrl;
    }
    if (clientId !== undefined) provider.clientId = String(clientId).trim();
    if (clientSecret !== undefined && clientSecret !== '') provider.clientSecret = String(clientSecret).trim();
    if (scopes !== undefined) provider.scopes = String(scopes).trim();
    if (autoCreateUsers !== undefined) provider.autoCreateUsers = !!autoCreateUsers;
    if (defaultPermissions !== undefined && typeof defaultPermissions === 'number') {
      provider.defaultPermissions = defaultPermissions & ~Permission.ADMIN;
    }

    settings.oidcProviders = settings.oidcProviders.map((p, i) => (i === index ? provider : p));
    settings.save();

    const { clientSecret: _cs, ...safe } = provider;
    return res.json({ ...safe, clientSecretSet: !!provider.clientSecret });
  }
);

router.delete(
  '/oidc-providers/:id',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_GENERAL),
  (req: Request, res: Response) => {
    const settings = Settings.getInstance();
    const providerId = param(req.params.id);
    const exists = settings.oidcProviders.some((p) => p.id === providerId);
    if (!exists) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    settings.oidcProviders = settings.oidcProviders.filter((p) => p.id !== providerId);
    settings.save();
    return res.json({ success: true });
  }
);

// GET /settings/servers-for-request — lightweight server list for request approval
router.get(
  '/servers-for-request',
  isAuthenticated,
  requirePermission(
    Permission.MANAGE_REQUESTS_EBOOK,
    Permission.MANAGE_REQUESTS_AUDIOBOOK,
    Permission.MANAGE_REQUESTS_MUSIC
  ),
  (req: Request, res: Response) => {
    const { type, format } = req.query;
    const settings = Settings.getInstance();

    if (type === 'book') {
      const contentType = format === 'audiobook' ? 'audiobook' : 'ebook';
      const servers = settings.readarr
        .filter((s) => (s.contentType || 'ebook') === contentType)
        .map(({ id, name }) => ({ id, name }));
      return res.json(servers);
    }

    if (type === 'music') {
      const servers = settings.lidarr
        .map(({ id, name, isDefault }) => ({ id, name, isDefault }));
      return res.json(servers);
    }

    return res.status(400).json({ error: 'type must be "book" or "music"' });
  }
);

// Test connections — allow unauthenticated access during setup (app not initialized)
router.post(
  '/readarr/test',
  testConnectionLimiter,
  authOrSetup(Permission.MANAGE_SETTINGS_READARR),
  async (req: Request, res: Response) => {
    try {
      const { hostname, port, apiKey, useSsl, baseUrl, serverId } = req.body;
      const hostError = await validateConnectionTarget(hostname, port);
      if (hostError) return res.status(400).json({ error: hostError });
      const s = Settings.getInstance();
      const resolvedKey = apiKey || (serverId && s.readarr.find((r) => r.id === serverId)?.apiKey);
      if (!resolvedKey) return res.status(400).json({ error: 'API key is required' });
      const url = buildServerUrl(hostname, port, useSsl, baseUrl);
      const { default: ReadarrApi } = await import('../../api/servarr/readarr');
      const api = new ReadarrApi(url, resolvedKey);
      const success = await api.testConnection();
      return res.json({ success });
    } catch (err) {
      logger.warn('Readarr connection test failed', { error: err instanceof Error ? err.message : err });
      return res.json({ success: false });
    }
  }
);

router.post(
  '/lidarr/test',
  testConnectionLimiter,
  authOrSetup(Permission.MANAGE_SETTINGS_LIDARR),
  async (req: Request, res: Response) => {
    try {
      const { hostname, port, apiKey, useSsl, baseUrl, serverId } = req.body;
      const hostError = await validateConnectionTarget(hostname, port);
      if (hostError) return res.status(400).json({ error: hostError });
      const s = Settings.getInstance();
      const resolvedKey = apiKey || (serverId && s.lidarr.find((l) => l.id === serverId)?.apiKey);
      if (!resolvedKey) return res.status(400).json({ error: 'API key is required' });
      const url = buildServerUrl(hostname, port, useSsl, baseUrl);
      const { default: LidarrApi } = await import('../../api/servarr/lidarr');
      const api = new LidarrApi(url, resolvedKey);
      const success = await api.testConnection();
      return res.json({ success });
    } catch (err) {
      logger.warn('Lidarr connection test failed', { error: err instanceof Error ? err.message : err });
      return res.json({ success: false });
    }
  }
);

router.post(
  '/audiobookshelf/test',
  testConnectionLimiter,
  authOrSetup(Permission.MANAGE_SETTINGS_MEDIA_SERVERS),
  async (req: Request, res: Response) => {
    try {
      const { hostname, port, apiKey, useSsl, baseUrl } = req.body;
      const hostError = await validateConnectionTarget(hostname, port);
      if (hostError) return res.status(400).json({ error: hostError });
      const s = Settings.getInstance();
      const resolvedKey = apiKey || s.audiobookshelf.apiKey;
      if (!resolvedKey) return res.status(400).json({ error: 'API key is required' });
      const url = buildServerUrl(hostname, port, useSsl, baseUrl);
      const { default: AudiobookshelfApi } = await import('../../api/audiobookshelf');
      const api = new AudiobookshelfApi(url, resolvedKey);
      const success = await api.testConnection();
      return res.json({ success });
    } catch (err) {
      logger.warn('Audiobookshelf connection test failed', { error: err instanceof Error ? err.message : err });
      return res.json({ success: false });
    }
  }
);

router.post(
  '/jellyfin/test',
  testConnectionLimiter,
  authOrSetup(Permission.MANAGE_SETTINGS_MEDIA_SERVERS),
  async (req: Request, res: Response) => {
    try {
      const { hostname, port, useSsl, baseUrl } = req.body;
      const hostError = await validateConnectionTarget(hostname, port);
      if (hostError) return res.status(400).json({ error: hostError });
      const url = buildServerUrl(hostname, port, useSsl, baseUrl);
      const { default: JellyfinApi } = await import('../../api/jellyfin');
      const api = new JellyfinApi(url);
      const success = await api.testConnection();
      return res.json({ success });
    } catch (err) {
      logger.warn('Jellyfin connection test failed', { error: err instanceof Error ? err.message : err });
      return res.json({ success: false });
    }
  }
);

router.post(
  '/plex/test',
  testConnectionLimiter,
  authOrSetup(Permission.MANAGE_SETTINGS_MEDIA_SERVERS),
  async (req: Request, res: Response) => {
    try {
      const { hostname, port, useSsl, token } = req.body;
      if (!token) {
        return res.json({ success: false });
      }
      const hostError = await validateConnectionTarget(hostname, port);
      if (hostError) return res.status(400).json({ error: hostError });
      const protocol = useSsl ? 'https' : 'http';
      const url = `${protocol}://${hostname}:${port}`;
      const { default: PlexApi } = await import('../../api/plexapi');
      const api = new PlexApi(url, token);
      const success = await api.testConnection();
      return res.json({ success });
    } catch (err) {
      logger.warn('Plex connection test failed', { error: err instanceof Error ? err.message : err });
      return res.json({ success: false });
    }
  }
);

// Jobs
router.get(
  '/jobs',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_JOBS),
  async (_req: Request, res: Response) => {
    const { getJobs } = await import('../../job/schedule');
    return res.json(getJobs());
  }
);

router.post(
  '/jobs/:id/run',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_JOBS),
  async (req: Request, res: Response) => {
    const { runJob } = await import('../../job/schedule');
    const success = runJob(param(req.params.id));
    return res.json({ success });
  }
);

// ---------------------------------------------------------------------------
// Metadata providers settings
// ---------------------------------------------------------------------------

const VALID_METADATA_SOURCES: MetadataSource[] = [
  'hardcover',
  'openlibrary',
  'googlebooks',
];

function isValidMetadataSource(val: unknown): val is MetadataSource {
  return typeof val === 'string' && VALID_METADATA_SOURCES.includes(val as MetadataSource);
}

function isValidSourceArray(val: unknown): val is MetadataSource[] {
  return (
    Array.isArray(val) &&
    val.every((item) => isValidMetadataSource(item))
  );
}

router.get(
  '/metadata-providers',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_METADATA),
  (_req: Request, res: Response) => {
    const settings = Settings.getInstance();
    return res.json(settings.metadataProviders);
  }
);

router.post(
  '/metadata-providers',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_METADATA),
  (req: Request, res: Response) => {
    const settings = Settings.getInstance();
    const body = req.body as Partial<MetadataProviderSettings>;

    const updated = { ...settings.metadataProviders };

    // Validate and update enabled flags for each provider
    for (const source of VALID_METADATA_SOURCES) {
      if (body[source] !== undefined) {
        if (
          typeof body[source] !== 'object' ||
          body[source] === null ||
          typeof body[source].enabled !== 'boolean'
        ) {
          return res.status(400).json({
            error: `${source} must be an object with an "enabled" boolean field`,
          });
        }
        updated[source] = { enabled: body[source].enabled };
      }
    }

    // Validate and update priority arrays
    if (body.priority !== undefined) {
      if (typeof body.priority !== 'object' || body.priority === null) {
        return res.status(400).json({ error: 'priority must be an object' });
      }

      const priorityKeys = [
        'search',
        'description',
        'cover',
        'editions',
        'ratings',
      ] as const;

      const updatedPriority = { ...updated.priority };

      for (const key of priorityKeys) {
        if (body.priority[key] !== undefined) {
          if (!isValidSourceArray(body.priority[key])) {
            return res.status(400).json({
              error: `priority.${key} must be an array of valid metadata sources (${VALID_METADATA_SOURCES.join(', ')})`,
            });
          }
          updatedPriority[key] = body.priority[key];
        }
      }

      updated.priority = updatedPriority;
    }

    // Ensure at least one provider is enabled
    const anyEnabled =
      updated.hardcover.enabled ||
      updated.openlibrary.enabled ||
      updated.googlebooks.enabled;
    if (!anyEnabled) {
      return res.status(400).json({
        error: 'At least one metadata provider must be enabled',
      });
    }

    settings.metadataProviders = updated;
    settings.save();

    // Reset the MetadataResolver so it picks up the new configuration
    resetMetadataResolver();

    // Flush metadata caches since provider configuration changed
    for (const source of VALID_METADATA_SOURCES) {
      CacheRegistry.flush(source);
    }

    logger.info('Metadata provider settings updated', {
      userId: req.user?.id,
    });

    return res.json(settings.metadataProviders);
  }
);

// POST /settings/metadata-providers/reset — reset to defaults
router.post(
  '/metadata-providers/reset',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_METADATA),
  (req: Request, res: Response) => {
    const settings = Settings.getInstance();
    settings.metadataProviders = { ...DEFAULT_METADATA_PROVIDERS };
    settings.save();

    resetMetadataResolver();

    for (const source of VALID_METADATA_SOURCES) {
      CacheRegistry.flush(source);
    }

    logger.info('Metadata provider settings reset to defaults', {
      userId: req.user?.id,
    });

    return res.json(settings.metadataProviders);
  }
);

// ---------------------------------------------------------------------------
// Notification settings
// ---------------------------------------------------------------------------

const VALID_NOTIFICATION_AGENTS = ['discord', 'webhook', 'email'];

router.get(
  '/notifications',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_NOTIFICATIONS),
  (_req: Request, res: Response) => {
    const settings = Settings.getInstance();
    const smtp = settings.notifications.smtp;
    const maskedSmtp = smtp
      ? { ...smtp, authPass: smtp.authPass ? '********' : '' }
      : undefined;
    return res.json({
      agents: settings.notifications.agents,
      smtp: maskedSmtp,
    });
  }
);

router.post(
  '/notifications/:agentId',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_NOTIFICATIONS),
  (req: Request, res: Response) => {
    const agentId = param(req.params.agentId);
    if (!VALID_NOTIFICATION_AGENTS.includes(agentId)) {
      return res.status(400).json({ error: 'Invalid agent ID' });
    }
    const { enabled, types, options } = req.body;
    const settings = Settings.getInstance();

    const config = settings.notifications.agents[agentId] || {
      enabled: false,
      types: 0,
      options: {},
    };

    if (enabled !== undefined) config.enabled = !!enabled;
    if (typeof types === 'number') config.types = types;
    if (options && typeof options === 'object') {
      config.options = { ...config.options, ...options };
    }

    settings.notifications = {
      ...settings.notifications,
      agents: { ...settings.notifications.agents, [agentId]: config },
    };
    settings.save();

    logger.info('Notification agent updated', { agentId, userId: req.user?.id });
    return res.json(config);
  }
);

router.post(
  '/notifications/smtp/config',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_NOTIFICATIONS),
  (req: Request, res: Response) => {
    const settings = Settings.getInstance();
    const body = req.body as Partial<SmtpSettings>;

    const current = settings.notifications.smtp || {
      host: '',
      port: 587,
      secure: false,
      authUser: '',
      authPass: '',
      senderAddress: '',
      senderName: 'Librarr',
      requireTls: false,
      allowSelfSigned: false,
    };

    const updated: SmtpSettings = {
      host: body.host !== undefined ? String(body.host) : current.host,
      port: body.port !== undefined ? Number(body.port) : current.port,
      secure: body.secure !== undefined ? !!body.secure : current.secure,
      authUser: body.authUser !== undefined ? String(body.authUser) : current.authUser,
      authPass: body.authPass !== undefined ? String(body.authPass) : current.authPass,
      senderAddress: body.senderAddress !== undefined ? String(body.senderAddress) : current.senderAddress,
      senderName: body.senderName !== undefined ? String(body.senderName) : current.senderName,
      requireTls: body.requireTls !== undefined ? !!body.requireTls : current.requireTls,
      allowSelfSigned: body.allowSelfSigned !== undefined ? !!body.allowSelfSigned : current.allowSelfSigned,
    };

    settings.notifications = { ...settings.notifications, smtp: updated };
    settings.save();

    logger.info('SMTP settings updated', { userId: req.user?.id });
    return res.json({ ...updated, authPass: updated.authPass ? '********' : '' });
  }
);

router.post(
  '/notifications/:agentId/test',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_NOTIFICATIONS),
  asyncHandler(async (req: Request, res: Response) => {
    const agentId = param(req.params.agentId);
    if (!VALID_NOTIFICATION_AGENTS.includes(agentId)) {
      return res.status(400).json({ error: 'Invalid agent ID' });
    }

    if (agentId === 'email') {
      const recipientEmail = req.body.recipientEmail || req.user?.email;
      if (!recipientEmail) {
        return res.status(400).json({ error: 'No recipient email provided' });
      }
      const success = await emailAgent.test(recipientEmail);
      return res.json({ success });
    }

    const success = await notificationManager.testAgent(agentId);
    return res.json({ success });
  })
);

// ---------------------------------------------------------------------------
// Unmatched media items
// ---------------------------------------------------------------------------

router.get(
  '/unmatched',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_MEDIA_SERVERS),
  asyncHandler(async (req: Request, res: Response) => {
    const take = Math.min(safeInt(req.query.take as string, 25), 100);
    const skip = safeInt(req.query.skip as string, 0);

    const repo = dataSource.getRepository(UnmatchedMediaItem);
    const [results, total] = await repo.findAndCount({
      order: { lastAttemptedAt: 'DESC' },
      take,
      skip,
    });

    return res.json({
      pageInfo: {
        pages: Math.ceil(total / take),
        page: Math.floor(skip / take) + 1,
        results: total,
      },
      results,
    });
  })
);

router.get(
  '/unmatched/count',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_MEDIA_SERVERS),
  asyncHandler(async (_req: Request, res: Response) => {
    const count = await dataSource.getRepository(UnmatchedMediaItem).count();
    return res.json({ count });
  })
);

router.delete(
  '/unmatched/:id',
  isAuthenticated,
  requirePermission(Permission.MANAGE_SETTINGS_MEDIA_SERVERS),
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseId(param(req.params.id));
    if (id === null) return res.status(400).json({ error: 'Invalid ID' });
    const repo = dataSource.getRepository(UnmatchedMediaItem);
    const item = await repo.findOne({ where: { id } });

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    await repo.remove(item);
    return res.json({ success: true });
  })
);

export default router;
