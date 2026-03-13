import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { v4 as uuid } from 'uuid';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import dataSource from '../datasource';
import { User } from '../entity/User';
import { isAuthenticated, invalidateUserCache } from '../middleware/auth';
import logger from '../logger';
import { param } from '../utils/params';
import { UserType } from '../constants/user';
import { Permission, hasPermission } from '../lib/permissions';
import emailAgent from '../lib/notifications/agents/email';
import Settings from '../lib/settings';
import { createPlexPin, checkPlexPin, getPlexUser } from '../lib/plexAuth';
import { generateAuthorizationUrl, exchangeCode } from '../lib/oidcAuth';
import { findOrCreateUser } from '../lib/authHelpers';

const router = Router();

// Validate that a returnUrl is a safe relative path (prevents open redirect)
function safeReturnUrl(url: unknown): string {
  if (typeof url !== 'string') return '/';
  // Must start with / and not with // (protocol-relative URL)
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  return '/';
}

// H2: Rate limiting on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Too many attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// S15: Per-account rate limiting to prevent distributed brute force
const accountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  keyGenerator: (req: Request) => {
    const email = req.body?.email;
    return typeof email === 'string' ? `account:${email.toLowerCase().trim()}` : ipKeyGenerator(req.ip ?? '127.0.0.1', 56);
  },
  message: { error: 'Too many login attempts for this account, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { error: 'Too many reset attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /auth/local - Local login
router.post('/local', authLimiter, accountLimiter, async (req: Request, res: Response) => {
  try {
    const { email: rawEmail, password } = req.body;

    if (!rawEmail || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length > 256) {
      return res.status(400).json({ error: 'Password is too long' });
    }

    const email = typeof rawEmail === 'string' ? rawEmail.toLowerCase().trim() : rawEmail;
    const userRepository = dataSource.getRepository(User);
    const user = await userRepository.findOne({
      where: { email },
      select: ['id', 'email', 'username', 'password', 'permissions', 'userType', 'avatar'],
    });

    if (!user || !user.password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Guard: if local login is disabled, only admins can use it
    const settings = Settings.getInstance();
    if (!settings.main.localLogin && !hasPermission(user.permissions, Permission.ADMIN)) {
      return res.status(403).json({ error: 'Local login is disabled' });
    }

    const { password: _password, ...userWithoutPassword } = user;

    // Regenerate session to prevent session fixation
    req.session.regenerate((err) => {
      if (err) {
        logger.error('Session regeneration error', { error: err });
        return res.status(500).json({ error: 'Internal server error' });
      }
      req.session.userId = user.id;
      req.session.save((saveErr) => {
        if (saveErr) {
          logger.error('Session save error', { error: saveErr });
          return res.status(500).json({ error: 'Internal server error' });
        }
        return res.json(userWithoutPassword);
      });
    });
  } catch (e) {
    logger.error('Local auth error', { error: e });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/logout
router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.clearCookie('connect.sid');
    return res.json({ success: true });
  });
});

// GET /auth/me - Get current user
router.get('/me', isAuthenticated, (req: Request, res: Response) => {
  // S9: Filter notification tokens from response
  const { settings, ...userBase } = req.user!;
  if (!settings) return res.json(userBase);
  const { pushbulletAccessToken, pushoverApplicationToken, pushoverUserKey, ...safeSettings } = settings;
  return res.json({
    ...userBase,
    settings: {
      ...safeSettings,
      pushbulletAccessToken: pushbulletAccessToken ? '********' : undefined,
      pushoverApplicationToken: pushoverApplicationToken ? '********' : undefined,
      pushoverUserKey: pushoverUserKey ? '********' : undefined,
    },
  });
});

// POST /auth/reset-password - Request password reset
router.post('/reset-password', resetLimiter, async (req: Request, res: Response) => {
  try {
    const { email: rawResetEmail } = req.body;
    const normalizedEmail = typeof rawResetEmail === 'string' ? rawResetEmail.toLowerCase().trim() : rawResetEmail;
    const userRepository = dataSource.getRepository(User);
    const user = await userRepository.findOne({
      where: { email: normalizedEmail },
      select: ['id', 'email', 'userType', 'resetPasswordGuid', 'resetPasswordExpiry'],
    });

    if (user && user.userType === UserType.LOCAL) {
      user.resetPasswordGuid = uuid();
      // H1: Token expires in 1 hour
      user.resetPasswordExpiry = new Date(Date.now() + 60 * 60 * 1000);
      await userRepository.save(user);
      logger.info(`Password reset requested for user ${user.id}`);

      const settings = Settings.getInstance();
      const baseUrl = settings.main.applicationUrl?.replace(/\/+$/, '');
      if (baseUrl && user.email) {
        const resetUrl = `${baseUrl}/login/reset-password/${user.resetPasswordGuid}`;
        await emailAgent.sendPasswordReset(user.email, resetUrl, settings.main.appTitle);
      } else if (!baseUrl) {
        logger.warn('Password reset requested but applicationUrl is not configured — email not sent', { userId: user.id });
      }
    }

    // Always return success to avoid email enumeration
    return res.json({ success: true });
  } catch (e) {
    logger.error('Password reset error', { error: e });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/reset-password/:guid - Complete password reset
router.post('/reset-password/:guid', resetLimiter, async (req: Request, res: Response) => {
  try {
    const guid = param(req.params.guid);
    const { password } = req.body;

    if (!password || password.length < 8 || password.length > 256) {
      return res.status(400).json({ error: 'Password must be 8-256 characters' });
    }

    const userRepository = dataSource.getRepository(User);
    const user = await userRepository.findOne({
      where: { resetPasswordGuid: guid },
      select: ['id', 'password', 'resetPasswordGuid', 'resetPasswordExpiry'],
    });

    if (!user) {
      return res.status(404).json({ error: 'Invalid reset token' });
    }

    // H1: Check token expiry
    if (!user.resetPasswordExpiry || user.resetPasswordExpiry < new Date()) {
      user.resetPasswordGuid = undefined;
      user.resetPasswordExpiry = undefined;
      await userRepository.save(user);
      return res.status(400).json({ error: 'Reset token has expired' });
    }

    user.password = await bcrypt.hash(password, 12);
    user.resetPasswordGuid = undefined;
    user.resetPasswordExpiry = undefined;
    await userRepository.save(user);

    // Invalidate cached user data so stale sessions use the new password hash
    invalidateUserCache(user.id);

    return res.json({ success: true });
  } catch (e) {
    logger.error('Password reset completion error', { error: e });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Plex auth rate limiter
const plexAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /auth/plex - Create Plex PIN for authentication
router.post('/plex', plexAuthLimiter, async (_req: Request, res: Response) => {
  try {
    const settings = Settings.getInstance();
    if (!settings.main.plexLogin) {
      return res.status(400).json({ error: 'Plex login is disabled' });
    }

    const pin = await createPlexPin();
    return res.json({ id: pin.id, code: pin.code, clientId: pin.clientId, authUrl: pin.authUrl });
  } catch (e) {
    logger.error('Plex PIN creation error', { error: e });
    return res.status(500).json({ error: 'Failed to create Plex PIN' });
  }
});

// POST /auth/plex/poll - Poll Plex PIN status and authenticate
router.post('/plex/poll', plexAuthLimiter, async (req: Request, res: Response) => {
  try {
    const settings = Settings.getInstance();
    if (!settings.main.plexLogin) {
      return res.status(400).json({ error: 'Plex login is disabled' });
    }

    const { pinId, clientId } = req.body;
    if (!pinId || !clientId) {
      return res.status(400).json({ error: 'pinId and clientId are required' });
    }

    // Validate pinId is a positive integer and clientId is a bounded string
    const numericPinId = Number(pinId);
    if (!Number.isInteger(numericPinId) || numericPinId <= 0) {
      return res.status(400).json({ error: 'pinId must be a positive integer' });
    }
    if (typeof clientId !== 'string' || clientId.length > 64) {
      return res.status(400).json({ error: 'Invalid clientId' });
    }

    const authToken = await checkPlexPin(numericPinId, clientId);
    if (!authToken) {
      return res.json({ authenticated: false });
    }

    // Get Plex user info
    const plexUser = await getPlexUser(authToken);
    const plexAuth = settings.plexAuth;

    const user = await findOrCreateUser(
      {
        type: 'plex',
        plexId: String(plexUser.id),
        plexToken: authToken,
        email: plexUser.email,
        username: plexUser.username || plexUser.email,
        avatar: plexUser.thumb,
      },
      plexAuth.autoCreateUsers,
      plexAuth.defaultPermissions
    );

    if (!user) {
      return res.status(403).json({ error: 'No account found. Contact your administrator.' });
    }

    // Create session
    req.session.regenerate((err) => {
      if (err) {
        logger.error('Session regeneration error', { error: err });
        return res.status(500).json({ error: 'Internal server error' });
      }
      req.session.userId = user.id;
      req.session.save((saveErr) => {
        if (saveErr) {
          logger.error('Session save error', { error: saveErr });
          return res.status(500).json({ error: 'Internal server error' });
        }
        const { plexToken: _pt, password: _pw, ...safeUser } = user as User & { password?: string };
        return res.json({ authenticated: true, user: safeUser });
      });
    });
  } catch (e) {
    logger.error('Plex poll error', { error: e });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// OIDC rate limiter
const oidcAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /auth/oidc/:providerId/authorize - Redirect to OIDC provider
router.get('/oidc/:providerId/authorize', oidcAuthLimiter, async (req: Request, res: Response) => {
  try {
    const settings = Settings.getInstance();
    if (!settings.main.oidcLogin) {
      return res.status(400).json({ error: 'OIDC login is disabled' });
    }

    const providerId = param(req.params.providerId);
    const provider = settings.oidcProviders.find((p) => p.id === providerId);
    if (!provider) {
      return res.status(404).json({ error: 'OIDC provider not found' });
    }

    const returnUrl = safeReturnUrl(req.query.returnUrl);
    const baseUrl = settings.main.applicationUrl?.replace(/\/+$/, '') || `${req.protocol}://${req.get('host')}`;
    const redirectUri = `${baseUrl}/api/v1/auth/oidc/${providerId}/callback`;

    const { url, state, codeVerifier } = await generateAuthorizationUrl(provider, redirectUri);

    // Store PKCE and state in session
    req.session.oidcState = state;
    req.session.oidcCodeVerifier = codeVerifier;
    req.session.oidcProviderId = providerId;
    req.session.oidcReturnUrl = returnUrl;
    req.session.save((err) => {
      if (err) {
        logger.error('Failed to save OIDC session state', { error: err });
        return res.status(500).json({ error: 'Internal server error' });
      }
      return res.redirect(url);
    });
  } catch (e) {
    logger.error('OIDC authorize error', { error: e });
    return res.status(500).json({ error: 'Failed to initiate OIDC login' });
  }
});

// GET /auth/oidc/:providerId/callback - Handle OIDC callback
router.get('/oidc/:providerId/callback', async (req: Request, res: Response) => {
  const returnUrl = safeReturnUrl(req.session.oidcReturnUrl);
  const loginUrl = `/login?returnUrl=${encodeURIComponent(returnUrl)}`;

  try {
    const settings = Settings.getInstance();
    if (!settings.main.oidcLogin) {
      return res.redirect(`${loginUrl}&error=oidc_failed`);
    }

    const providerId = param(req.params.providerId);
    const provider = settings.oidcProviders.find((p) => p.id === providerId);
    if (!provider) {
      return res.redirect(`${loginUrl}&error=oidc_failed`);
    }

    // Validate session state
    const { oidcState, oidcCodeVerifier, oidcProviderId } = req.session;
    if (!oidcState || !oidcCodeVerifier || oidcProviderId !== providerId) {
      logger.warn('OIDC callback: invalid session state');
      return res.redirect(`${loginUrl}&error=oidc_failed`);
    }

    // Build callback URL from the current request
    const baseUrl = settings.main.applicationUrl?.replace(/\/+$/, '') || `${req.protocol}://${req.get('host')}`;
    const callbackUrl = new URL(`${baseUrl}${req.originalUrl}`);

    const claims = await exchangeCode(provider, callbackUrl, oidcCodeVerifier, oidcState);

    // Clean up OIDC session data
    delete req.session.oidcState;
    delete req.session.oidcCodeVerifier;
    delete req.session.oidcProviderId;
    delete req.session.oidcReturnUrl;

    const user = await findOrCreateUser(
      {
        type: 'oidc',
        oidcSub: claims.sub,
        oidcIssuer: provider.issuerUrl,
        email: claims.email,
        username: claims.name || claims.email || claims.sub,
        avatar: claims.picture,
      },
      provider.autoCreateUsers,
      provider.defaultPermissions
    );

    if (!user) {
      return res.redirect(`${loginUrl}&error=oidc_no_account`);
    }

    // Create session
    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    req.session.userId = user.id;
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    return res.redirect(returnUrl);
  } catch (e) {
    // Clean up OIDC session data on error
    delete req.session.oidcState;
    delete req.session.oidcCodeVerifier;
    delete req.session.oidcProviderId;
    delete req.session.oidcReturnUrl;
    logger.error('OIDC callback error', { error: e });
    return res.redirect(`${loginUrl}&error=oidc_failed`);
  }
});

export default router;
