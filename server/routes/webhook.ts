import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { In } from 'typeorm';
import dataSource from '../datasource';
import { BookRequest } from '../entity/BookRequest';
import { Work } from '../entity/Work';
import { RequestStatus } from '../constants/work';
import { asyncHandler } from '../middleware/asyncHandler';
import Settings from '../lib/settings';
import logger from '../logger';

const router = Router();

// S1: Webhook authentication
function getOrCreateWebhookSecret(): string {
  const settings = Settings.getInstance();
  if (!settings.webhookSecret) {
    settings.webhookSecret = crypto.randomBytes(32).toString('hex');
    settings.save();
  }
  return settings.webhookSecret;
}

// -------------------------------------------------------------------
// Readarr webhook payload types
// -------------------------------------------------------------------

interface ReadarrWebhookBook {
  id: number;
  title: string;
  foreignBookId: string; // This is the Hardcover ID (mapped to Work.hardcoverId)
}

interface ReadarrWebhookBookFile {
  id: number;
  path: string;
  quality?: string;
}

interface ReadarrWebhookPayload {
  eventType: string;
  instanceName?: string;
  book?: ReadarrWebhookBook;
  bookFile?: ReadarrWebhookBookFile;
  downloadClient?: string;
  downloadClientType?: string;
  downloadId?: string;
  isUpgrade?: boolean;
  message?: string; // Present on DownloadFailed
}

// -------------------------------------------------------------------
// POST /api/v1/webhook/readarr — Readarr webhook handler
//
// No authentication required (internal network call from Readarr).
// Always returns 200 to avoid Readarr treating transient errors as
// permanent webhook failures.
// -------------------------------------------------------------------

router.post(
  '/readarr',
  asyncHandler(async (req: Request, res: Response) => {
    // S1: Validate webhook token — accept via header (preferred) or query param (legacy)
    const secret = getOrCreateWebhookSecret();
    const headerToken = req.headers?.['x-webhook-token'];
    const headerTokenStr = typeof headerToken === 'string' ? headerToken : '';
    const token = headerTokenStr || (typeof req.query.token === 'string' ? req.query.token : '');
    const tokenHash = crypto.createHmac('sha256', 'webhook-verify').update(token).digest();
    const secretHash = crypto.createHmac('sha256', 'webhook-verify').update(secret).digest();
    if (!crypto.timingSafeEqual(tokenHash, secretHash)) {
      logger.warn('Readarr webhook received with invalid token');
      return res.status(401).json({ error: 'Invalid webhook token' });
    }

    const payload = req.body as ReadarrWebhookPayload;
    const { eventType } = payload;

    logger.info('Readarr webhook received', {
      eventType,
      bookTitle: payload.book?.title,
      foreignBookId: payload.book?.foreignBookId,
    });

    // Validate that we have a book reference
    if (!payload.book?.foreignBookId) {
      logger.warn('Readarr webhook missing book.foreignBookId, ignoring', {
        eventType,
      });
      return res.status(200).json({ status: 'ignored', reason: 'no book reference' });
    }

    const foreignBookId = payload.book.foreignBookId;

    // Find the Work that matches this Readarr book via hardcoverId
    const workRepository = dataSource.getRepository(Work);
    const work = await workRepository.findOne({
      where: { hardcoverId: foreignBookId },
    });

    if (!work) {
      logger.warn(
        `Readarr webhook: no Work found for foreignBookId="${foreignBookId}" (title: "${payload.book.title}"). ` +
          'This book may not have been requested through Librarr.',
        { eventType, foreignBookId }
      );
      return res.status(200).json({ status: 'ignored', reason: 'work not found' });
    }

    // Find active BookRequests for this Work (status = APPROVED)
    const requestRepository = dataSource.getRepository(BookRequest);
    const activeRequests = await requestRepository.find({
      where: {
        work: { id: work.id },
        status: In([RequestStatus.APPROVED]),
      },
      relations: ['work'],
    });

    if (activeRequests.length === 0) {
      logger.debug(
        `Readarr webhook: no active (APPROVED) BookRequests for Work "${work.title}" (id=${work.id}), ignoring`,
        { eventType, workId: work.id }
      );
      return res.status(200).json({ status: 'ignored', reason: 'no active requests' });
    }

    // Handle different event types
    switch (eventType) {
      case 'Grab': {
        // Book found by indexer, download started
        logger.info(
          `Readarr Grab: download started for "${payload.book.title}" — updating ${activeRequests.length} request(s)`,
          {
            workId: work.id,
            downloadClient: payload.downloadClient,
            downloadId: payload.downloadId,
          }
        );

        for (const request of activeRequests) {
          request.downloadStatus = 'downloading';
          request.downloadProgress = 0;
        }

        await requestRepository.save(activeRequests);
        break;
      }

      case 'Download':
      case 'BookFileImport': {
        // File imported successfully into Readarr
        // IMPORTANT: Do NOT change request status to COMPLETED.
        // That is availabilitySync's job once the file appears in a media server
        // (Audiobookshelf).
        logger.info(
          `Readarr ${eventType}: file imported for "${payload.book.title}" — ` +
            `updating ${activeRequests.length} request(s). ` +
            'Status stays APPROVED; awaiting media server detection by availabilitySync.',
          {
            workId: work.id,
            filePath: payload.bookFile?.path,
            isUpgrade: payload.isUpgrade,
          }
        );

        for (const request of activeRequests) {
          request.downloadProgress = 100;
          request.downloadStatus = 'imported';
        }

        await requestRepository.save(activeRequests);
        break;
      }

      case 'DownloadFailed': {
        // Download failed
        logger.warn(
          `Readarr DownloadFailed: download failed for "${payload.book.title}" — ` +
            `updating ${activeRequests.length} request(s)`,
          {
            workId: work.id,
            message: payload.message,
            downloadClient: payload.downloadClient,
          }
        );

        for (const request of activeRequests) {
          request.downloadStatus = 'failed';
          request.downloadProgress = 0;
        }

        await requestRepository.save(activeRequests);
        break;
      }

      case 'Test': {
        // Readarr sends a Test event when verifying the webhook configuration
        logger.info('Readarr webhook test event received');
        break;
      }

      default: {
        logger.debug(`Readarr webhook: unhandled event type "${eventType}", ignoring`, {
          eventType,
        });
      }
    }

    return res.status(200).json({ status: 'ok' });
  })
);

export default router;
