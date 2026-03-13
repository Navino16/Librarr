import 'reflect-metadata';
import crypto from 'crypto';
import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import next from 'next';
import path from 'path';
import fs from 'fs';
import { TypeormStore } from 'connect-typeorm';
import dataSource from './datasource';
import { Session } from './entity/Session';
import { checkUser, isAuthenticated } from './middleware/auth';
import { clearCookies } from './middleware/clearcookies';
import authRoutes from './routes/auth';
import settingsRoutes from './routes/settings';
import userRoutes from './routes/user';
import requestRoutes from './routes/request';
import searchRoutes from './routes/search';
import bookRoutes from './routes/book';
import musicRoutes from './routes/music';
import authorRoutes from './routes/author';
import artistRoutes from './routes/artist';
import discoverRoutes from './routes/discover';
import serviceRoutes from './routes/service';
import issueRoutes from './routes/issue';
import issueCommentRoutes from './routes/issueComment';
import cacheRoutes from './routes/cache';
import webhookRoutes from './routes/webhook';
// Ensure metadata provider caches are registered at startup
import './api/metadata/caches';
import { handleImageProxy } from './lib/imageproxy';
import { initScheduler, shutdownScheduler } from './job/schedule';
import { initNotifications } from './lib/notifications/init';
import Settings from './lib/settings';
import logger from './logger';

const dev = process.env.NODE_ENV !== 'production';
const PORT = parseInt(process.env.PORT || '5055', 10);

async function main() {
  // Ensure config directories exist
  const configDir = path.join(process.cwd(), 'config');
  const dbDir = path.join(configDir, 'db');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Initialize database
  logger.info('Initializing database...');
  await dataSource.initialize();
  logger.info('Database initialized');

  // Initialize settings
  Settings.getInstance();

  // Initialize notification agents
  initNotifications();

  // Initialize Next.js (USE_WEBPACK=true forces Webpack for V8 coverage compatibility)
  const useWebpack = process.env.USE_WEBPACK === 'true';
  const app = next({ dev, dir: process.cwd(), ...(useWebpack && { webpack: true }) });
  const handle = app.getRequestHandler();
  await app.prepare();

  const server = express();

  // Generate a per-request nonce for CSP
  server.use((_req, res, next) => {
    const nonce = crypto.randomBytes(16).toString('base64');
    res.locals.nonce = nonce;
    res.setHeader('x-nonce', nonce);
    next();
  });

  // Security headers (M6)
  server.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          (_req, res) => `'nonce-${(res as express.Response).locals.nonce}'`,
          // Next.js dev mode (HMR + webpack eval) requires these
          ...(dev ? ["'unsafe-inline'", "'unsafe-eval'"] : []),
        ],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  }));

  // Middleware
  server.use(express.json({ limit: '1mb' }));
  server.use(express.urlencoded({ extended: true, limit: '1mb' }));
  server.use(cookieParser());

  // Session secret (C1) - generate random secret if not set, persist to env
  const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
  if (!process.env.SESSION_SECRET) {
    logger.warn('SESSION_SECRET not set - generated a random secret. Set SESSION_SECRET env var for persistent sessions across restarts.');
  } else if (process.env.SESSION_SECRET.length < 16) {
    logger.warn('SESSION_SECRET is too short (< 16 chars). Use a strong secret with at least 32 characters for security.');
  } else if (process.env.SESSION_SECRET === 'change-me-in-production') {
    if (!dev) {
      logger.error('SESSION_SECRET is set to the default value "change-me-in-production". Refusing to start in production. Set a strong, unique value for SESSION_SECRET.');
      process.exit(1);
    }
    logger.warn('SESSION_SECRET is set to the default value "change-me-in-production". This is insecure! Set a strong, unique value for SESSION_SECRET.');
  }

  // Session store
  const sessionRepository = dataSource.getRepository(Session);
  server.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      store: new TypeormStore({
        cleanupLimit: 2,
        ttl: 2592000, // 30 days, matches cookie maxAge
      }).connect(sessionRepository),
      cookie: {
        secure: process.env.FORCE_HTTPS === 'true',
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        sameSite: 'lax',
      },
    })
  );

  server.use(clearCookies);

  // Lightweight ping endpoint for Docker healthchecks (no auth, no CSRF)
  server.get('/api/v1/ping', (_req, res) => res.json({ status: 'ok' }));

  // S4: CSRF protection — verify Origin/Referer on state-changing requests
  server.use('/api/', (req, res, nextFn) => {
    // Skip safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return nextFn();
    // Skip webhook routes (authenticated via token)
    if (req.path.startsWith('/v1/webhook/')) return nextFn();

    const origin = req.headers.origin;
    const referer = req.headers.referer;

    // No Origin/Referer = likely non-browser client or same-origin; allow (SameSite=Lax covers browsers)
    if (!origin && !referer) return nextFn();

    const host = req.headers.host;
    if (!host) return nextFn();

    if (origin) {
      try {
        const originHost = new URL(origin).host;
        if (originHost === host) return nextFn();
      } catch { /* invalid origin */ }
    }

    if (referer) {
      try {
        const refererHost = new URL(referer).host;
        if (refererHost === host) return nextFn();
      } catch { /* invalid referer */ }
    }

    logger.warn('CSRF validation failed', { origin, referer, host });
    res.status(403).json({ error: 'Origin validation failed' });
  });

  server.use(checkUser);

  // API routes
  server.use('/api/v1/auth', authRoutes);
  server.use('/api/v1/settings', settingsRoutes);
  server.use('/api/v1/user', userRoutes);
  server.use('/api/v1/request', requestRoutes);
  server.use('/api/v1/search', searchRoutes);
  server.use('/api/v1/book', bookRoutes);
  server.use('/api/v1/music', musicRoutes);
  server.use('/api/v1/author', authorRoutes);
  server.use('/api/v1/artist', artistRoutes);
  server.use('/api/v1/discover', discoverRoutes);
  server.use('/api/v1/service', serviceRoutes);
  server.use('/api/v1/issue', issueRoutes);
  server.use('/api/v1/issueComment', issueCommentRoutes);
  server.use('/api/v1/cache', cacheRoutes);
  server.use('/api/v1/webhook', webhookRoutes);
  server.get('/api/v1/imageproxy', isAuthenticated, handleImageProxy);

  // Global error handler for unhandled async route errors
  server.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('Unhandled route error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Internal server error' });
  });

  // Initialize background jobs
  initScheduler();

  // Next.js handler (Express 5 wildcard syntax)
  server.all('{*path}', (req, res) => {
    return handle(req, res);
  });

  const httpServer = server.listen(PORT, () => {
    logger.info(`Librarr server running on http://localhost:${PORT}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    shutdownScheduler();
    httpServer.close(() => {
      dataSource
        .destroy()
        .then(() => {
          logger.info('Database connection closed');
          process.exit(0);
        })
        .catch(() => process.exit(1));
    });
    // Force exit after 10 seconds
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Failed to start server', { error: err });
  process.exit(1);
});
