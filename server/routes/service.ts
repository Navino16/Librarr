import { Router, Request, Response } from 'express';
import axios from 'axios';
import { Permission } from '../lib/permissions';
import Settings from '../lib/settings';
import ReadarrApi from '../api/servarr/readarr';
import LidarrApi from '../api/servarr/lidarr';
import { isAuthenticated, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { buildServerUrl } from '../lib/serverUrl';
import logger from '../logger';
import { param, parseId } from '../utils/params';

const router = Router();

// Cached health status to avoid hammering providers on every request
let cachedHealth: { providers: Record<string, boolean>; checkedAt: number } | null = null;
const HEALTH_CACHE_TTL = 60_000; // 1 minute

async function checkProvider(url: string, options?: { method?: string; data?: string; headers?: Record<string, string> }): Promise<boolean> {
  try {
    await axios({
      method: options?.method || 'get',
      url,
      timeout: 5000,
      headers: options?.headers,
      data: options?.data,
      validateStatus: (s) => s < 500,
    });
    return true;
  } catch {
    return false;
  }
}

async function getProviderHealth(): Promise<Record<string, boolean>> {
  if (cachedHealth && Date.now() - cachedHealth.checkedAt < HEALTH_CACHE_TTL) {
    return cachedHealth.providers;
  }

  const settings = Settings.getInstance();
  const token = settings.main.hardcoverToken;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers.authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  }

  const [hardcover, openlibrary, googlebooks] = await Promise.all([
    checkProvider('https://api.hardcover.app/v1/graphql', {
      method: 'post',
      headers,
      data: JSON.stringify({ query: '{ me { id } }' }),
    }),
    checkProvider('https://openlibrary.org/search.json?q=test&limit=1'),
    checkProvider('https://www.googleapis.com/books/v1/volumes?q=test&maxResults=1'),
  ]);

  const providers = { hardcover, openlibrary, googlebooks };
  cachedHealth = { providers, checkedAt: Date.now() };
  return providers;
}

// GET /service/health - Check metadata provider availability
router.get(
  '/health',
  isAuthenticated,
  asyncHandler(async (_req: Request, res: Response) => {
    const providers = await getProviderHealth();
    return res.json({ providers });
  })
);

// GET /service/readarr/:id - Get Readarr profiles/root folders
router.get(
  '/readarr/:id',
  isAuthenticated,
  requirePermission(Permission.ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const settings = Settings.getInstance();
    const serverId = parseId(param(req.params.id));
    if (serverId === null) return res.status(400).json({ error: 'Invalid ID' });
    const server = settings.readarr.find((r) => r.id === serverId);

    if (!server) {
      return res.status(404).json({ error: 'Readarr server not found' });
    }

    try {
      const api = new ReadarrApi(buildServerUrl(server), server.apiKey);
      const [qualityProfiles, metadataProfiles, rootFolders, tags] =
        await Promise.all([
          api.getQualityProfiles(),
          api.getMetadataProfiles(),
          api.getRootFolders(),
          api.getTags(),
        ]);

      return res.json({ qualityProfiles, metadataProfiles, rootFolders, tags });
    } catch (e) {
      logger.error('Readarr service error', { error: e });
      return res.status(500).json({ error: 'Failed to connect to Readarr' });
    }
  })
);

// GET /service/lidarr/:id - Get Lidarr profiles/root folders
router.get(
  '/lidarr/:id',
  isAuthenticated,
  requirePermission(Permission.ADMIN),
  asyncHandler(async (req: Request, res: Response) => {
    const settings = Settings.getInstance();
    const serverId = parseId(param(req.params.id));
    if (serverId === null) return res.status(400).json({ error: 'Invalid ID' });
    const server = settings.lidarr.find((l) => l.id === serverId);

    if (!server) {
      return res.status(404).json({ error: 'Lidarr server not found' });
    }

    try {
      const api = new LidarrApi(buildServerUrl(server), server.apiKey);
      const [qualityProfiles, metadataProfiles, rootFolders, tags] =
        await Promise.all([
          api.getQualityProfiles(),
          api.getMetadataProfiles(),
          api.getRootFolders(),
          api.getTags(),
        ]);

      return res.json({ qualityProfiles, metadataProfiles, rootFolders, tags });
    } catch (e) {
      logger.error('Lidarr service error', { error: e });
      return res.status(500).json({ error: 'Failed to connect to Lidarr' });
    }
  })
);

export default router;
