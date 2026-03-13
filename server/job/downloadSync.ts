import { IsNull, Not } from 'typeorm';
import dataSource from '../datasource';
import { BookRequest } from '../entity/BookRequest';
import { MusicRequest } from '../entity/MusicRequest';
import { RequestStatus } from '../constants/work';
import ReadarrApi from '../api/servarr/readarr';
import LidarrApi from '../api/servarr/lidarr';
import type { ServarrQueueItem } from '@server/types/servarr';
import Settings from '../lib/settings';
import { buildServerUrl } from '../lib/serverUrl';
import logger from '../logger';

// Cached API instances (keyed by server ID) to avoid recreating per invocation
const readarrApiCache = new Map<number, ReadarrApi>();
const lidarrApiCache = new Map<number, LidarrApi>();

function getReadarrApi(serverId: number, url: string, apiKey: string): ReadarrApi {
  let api = readarrApiCache.get(serverId);
  if (!api) {
    api = new ReadarrApi(url, apiKey);
    readarrApiCache.set(serverId, api);
  }
  return api;
}

function getLidarrApi(serverId: number, url: string, apiKey: string): LidarrApi {
  let api = lidarrApiCache.get(serverId);
  if (!api) {
    api = new LidarrApi(url, apiKey);
    lidarrApiCache.set(serverId, api);
  }
  return api;
}

/**
 * Sync download progress for approved BookRequests by polling Readarr queues.
 */
async function syncBookRequests(): Promise<void> {
  const bookRequestRepo = dataSource.getRepository(BookRequest);

  // Find all approved BookRequests that have been sent to a Readarr server
  const activeRequests = await bookRequestRepo.find({
    where: {
      status: RequestStatus.APPROVED,
      readarrServerId: Not(IsNull()),
    },
  });

  if (activeRequests.length === 0) {
    logger.debug('Download sync: no active book requests to track');
    return;
  }

  // Group requests by readarrServerId
  const byServer = new Map<number, BookRequest[]>();
  for (const req of activeRequests) {
    const serverId = req.readarrServerId!;
    if (!byServer.has(serverId)) {
      byServer.set(serverId, []);
    }
    byServer.get(serverId)!.push(req);
  }

  const settings = Settings.getInstance();

  for (const [serverId, requests] of byServer) {
    const serverSettings = settings.readarr.find((s) => s.id === serverId);
    if (!serverSettings) {
      logger.warn(`Download sync: Readarr server ${serverId} not found in settings, skipping`);
      continue;
    }

    try {
      const api = getReadarrApi(serverId, buildServerUrl(serverSettings), serverSettings.apiKey);
      const queue = await api.getQueue();

      // Build a lookup from bookId to queue item
      const queueByBookId = new Map<number, ServarrQueueItem>();
      for (const item of queue) {
        if (item.bookId) {
          queueByBookId.set(item.bookId, item);
        }
      }

      // Update each request with download progress
      for (const req of requests) {
        if (!req.readarrBookId) continue;

        const queueItem = queueByBookId.get(req.readarrBookId);
        if (queueItem) {
          // Calculate progress percentage from size/sizeleft
          const progress =
            queueItem.size > 0
              ? Math.round(((queueItem.size - queueItem.sizeleft) / queueItem.size) * 100)
              : 0;

          req.downloadProgress = progress;
          req.downloadStatus = queueItem.trackedDownloadStatus || queueItem.status;
          req.downloadTimeLeft = queueItem.timeleft || undefined;
        } else {
          // Not in queue — either finished downloading or not started yet.
          // If we previously had progress data, clear it (download may have completed
          // and availability sync will pick it up).
          if (req.downloadProgress !== undefined) {
            req.downloadProgress = undefined;
            req.downloadStatus = undefined;
            req.downloadTimeLeft = undefined;
          }
        }
      }

      await bookRequestRepo.save(requests);
      logger.debug(
        `Download sync: updated ${requests.length} book request(s) for Readarr server "${serverSettings.name}"`
      );
    } catch (e) {
      logger.error(
        `Download sync: failed to poll Readarr server "${serverSettings.name}" (id=${serverId})`,
        { error: e }
      );
      // Continue with other servers
    }
  }
}

/**
 * Sync download progress for approved MusicRequests by polling Lidarr queues.
 */
async function syncMusicRequests(): Promise<void> {
  const musicRequestRepo = dataSource.getRepository(MusicRequest);

  // Find all approved MusicRequests that have been sent to a Lidarr server
  const activeRequests = await musicRequestRepo.find({
    where: {
      status: RequestStatus.APPROVED,
      lidarrServerId: Not(IsNull()),
    },
  });

  if (activeRequests.length === 0) {
    logger.debug('Download sync: no active music requests to track');
    return;
  }

  // Group requests by lidarrServerId
  const byServer = new Map<number, MusicRequest[]>();
  for (const req of activeRequests) {
    const serverId = req.lidarrServerId!;
    if (!byServer.has(serverId)) {
      byServer.set(serverId, []);
    }
    byServer.get(serverId)!.push(req);
  }

  const settings = Settings.getInstance();

  for (const [serverId, requests] of byServer) {
    const serverSettings = settings.lidarr.find((s) => s.id === serverId);
    if (!serverSettings) {
      logger.warn(`Download sync: Lidarr server ${serverId} not found in settings, skipping`);
      continue;
    }

    try {
      const api = getLidarrApi(serverId, buildServerUrl(serverSettings), serverSettings.apiKey);
      const queue = await api.getQueue();

      // Build a lookup from albumId to queue item
      const queueByAlbumId = new Map<number, ServarrQueueItem>();
      for (const item of queue) {
        if (item.albumId) {
          queueByAlbumId.set(item.albumId, item);
        }
      }

      // Update each request with download progress
      for (const req of requests) {
        if (!req.lidarrAlbumId) continue;

        const queueItem = queueByAlbumId.get(req.lidarrAlbumId);
        if (queueItem) {
          const progress =
            queueItem.size > 0
              ? Math.round(((queueItem.size - queueItem.sizeleft) / queueItem.size) * 100)
              : 0;

          req.downloadProgress = progress;
          req.downloadStatus = queueItem.trackedDownloadStatus || queueItem.status;
          req.downloadTimeLeft = queueItem.timeleft || undefined;
        } else {
          if (req.downloadProgress !== undefined) {
            req.downloadProgress = undefined;
            req.downloadStatus = undefined;
            req.downloadTimeLeft = undefined;
          }
        }
      }

      await musicRequestRepo.save(requests);
      logger.debug(
        `Download sync: updated ${requests.length} music request(s) for Lidarr server "${serverSettings.name}"`
      );
    } catch (e) {
      logger.error(
        `Download sync: failed to poll Lidarr server "${serverSettings.name}" (id=${serverId})`,
        { error: e }
      );
    }
  }
}

/**
 * Main download sync job: polls Readarr/Lidarr queues and updates
 * download progress on active BookRequests and MusicRequests.
 */
export async function downloadSync(): Promise<void> {
  await syncBookRequests();
  await syncMusicRequests();
}
