import { IsNull, LessThan, Not } from 'typeorm';
import dataSource from '../datasource';
import { BookRequest } from '../entity/BookRequest';
import { MusicRequest } from '../entity/MusicRequest';
import { RequestStatus } from '../constants/work';
import logger from '../logger';

// Requests with stale download data older than this many hours are reset
const STALE_HOURS = 6;

/**
 * Reset stale download tracking data on BookRequests and MusicRequests.
 *
 * If a request has been approved and has download status info, but its
 * updatedAt timestamp hasn't changed in STALE_HOURS, the download tracking
 * fields are cleared. This prevents the UI from showing stale progress data
 * for downloads that may have failed silently or been removed from the queue.
 */
export async function downloadSyncReset(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);

  // Reset stale BookRequests
  const bookRequestRepo = dataSource.getRepository(BookRequest);
  const staleBookRequests = await bookRequestRepo.find({
    where: {
      status: RequestStatus.APPROVED,
      downloadStatus: Not(IsNull()),
      updatedAt: LessThan(cutoff),
    },
  });

  if (staleBookRequests.length > 0) {
    for (const req of staleBookRequests) {
      req.downloadProgress = undefined;
      req.downloadStatus = undefined;
      req.downloadTimeLeft = undefined;
    }
    await bookRequestRepo.save(staleBookRequests);
    logger.info(
      `Download sync reset: cleared stale download data on ${staleBookRequests.length} book request(s)`
    );
  }

  // Reset stale MusicRequests
  const musicRequestRepo = dataSource.getRepository(MusicRequest);
  const staleMusicRequests = await musicRequestRepo.find({
    where: {
      status: RequestStatus.APPROVED,
      downloadStatus: Not(IsNull()),
      updatedAt: LessThan(cutoff),
    },
  });

  if (staleMusicRequests.length > 0) {
    for (const req of staleMusicRequests) {
      req.downloadProgress = undefined;
      req.downloadStatus = undefined;
      req.downloadTimeLeft = undefined;
    }
    await musicRequestRepo.save(staleMusicRequests);
    logger.info(
      `Download sync reset: cleared stale download data on ${staleMusicRequests.length} music request(s)`
    );
  }

  if (staleBookRequests.length === 0 && staleMusicRequests.length === 0) {
    logger.debug('Download sync reset: no stale download data found');
  }
}
