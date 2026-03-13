import { Router, Request, Response } from 'express';
import dataSource from '../datasource';
import { BookRequest } from '../entity/BookRequest';
import { MusicRequest } from '../entity/MusicRequest';
import { Work } from '../entity/Work';
import { RequestStatus, WorkStatus } from '../constants/work';
import {
  Permission,
  hasPermission,
  getManageRequestPermission,
  getAutoApprovePermission,
} from '../lib/permissions';
import { isAuthenticated } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { param, parseId, safeInt } from '../utils/params';
import { getMetadataResolver } from '../lib/metadataResolverInstance';
import {
  processApprovedBookRequest,
  processApprovedMusicRequest,
} from '../lib/requestProcessor';
import Settings from '../lib/settings';
import { notifyEvent } from '../lib/notifications/router';
import { NotificationType } from '../lib/notifications';
import { resolveEffectiveQuota, getQuotaUsage } from '../lib/quota';
import logger from '../logger';

const router = Router();

// ---------------------------------------------------------------------------
// GET /request — List requests (books + music combined)
// ---------------------------------------------------------------------------

router.get(
  '/',
  isAuthenticated,
  asyncHandler(async (req: Request, res: Response) => {
    const take = Math.min(safeInt(req.query.take as string, 20), 100);
    const skip = safeInt(req.query.skip as string, 0);
    const statusFilter = req.query.status as string | undefined;
    const formatFilter = req.query.format as string | undefined;
    const requestedByFilter = safeInt(req.query.requestedBy as string, 0) || null;
    const sort = (req.query.sort as string) || 'createdAt';
    const order = ((req.query.order as string) || 'DESC').toUpperCase() as 'ASC' | 'DESC';

    const user = req.user!;
    const isAdmin = hasPermission(user.permissions, Permission.ADMIN);
    const canViewBooks =
      isAdmin ||
      hasPermission(user.permissions, Permission.REQUEST_VIEW_EBOOK) ||
      hasPermission(user.permissions, Permission.REQUEST_VIEW_AUDIOBOOK);
    const canViewMusic =
      isAdmin ||
      hasPermission(user.permissions, Permission.REQUEST_VIEW_MUSIC);

    // --------------- Book requests ---------------
    const bookRequestRepo = dataSource.getRepository(BookRequest);
    const bookQuery = bookRequestRepo
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.work', 'work')
      .leftJoinAndSelect('request.requestedBy', 'requestedBy')
      .leftJoinAndSelect('request.modifiedBy', 'modifiedBy');

    // Filter by requestedBy if specified (requires view permission or own profile)
    if (requestedByFilter) {
      if (canViewBooks || requestedByFilter === user.id) {
        bookQuery.andWhere('requestedBy.id = :filterUserId', { filterUserId: requestedByFilter });
      } else {
        // No permission to view other users' requests
        bookQuery.andWhere('requestedBy.id = :userId', { userId: user.id });
      }
    } else if (!canViewBooks) {
      bookQuery.andWhere('requestedBy.id = :userId', { userId: user.id });
    }

    if (statusFilter) {
      const statusNum = safeInt(statusFilter, -1);
      if (statusNum >= 0) {
        bookQuery.andWhere('request.status = :status', { status: statusNum });
      }
    }

    if (formatFilter && (formatFilter === 'ebook' || formatFilter === 'audiobook')) {
      bookQuery.andWhere('request.format = :format', { format: formatFilter });
    }

    // Sorting
    const allowedSorts = ['createdAt', 'updatedAt', 'status'];
    const sortField = allowedSorts.includes(sort) ? sort : 'createdAt';
    bookQuery.orderBy(`request.${sortField}`, order === 'ASC' ? 'ASC' : 'DESC');

    // Helper: build a music query with the same filters applied
    const buildMusicQuery = () => {
      const musicRequestRepo = dataSource.getRepository(MusicRequest);
      const q = musicRequestRepo
        .createQueryBuilder('request')
        .leftJoinAndSelect('request.album', 'album')
        .leftJoinAndSelect('request.requestedBy', 'requestedBy')
        .leftJoinAndSelect('request.modifiedBy', 'modifiedBy');

      if (requestedByFilter) {
        if (canViewMusic || requestedByFilter === user.id) {
          q.andWhere('requestedBy.id = :filterUserId', { filterUserId: requestedByFilter });
        } else {
          q.andWhere('requestedBy.id = :userId', { userId: user.id });
        }
      } else if (!canViewMusic) {
        q.andWhere('requestedBy.id = :userId', { userId: user.id });
      }

      if (statusFilter) {
        const statusNum = safeInt(statusFilter, -1);
        if (statusNum >= 0) {
          q.andWhere('request.status = :status', { status: statusNum });
        }
      }

      q.orderBy(`request.${sortField}`, order === 'ASC' ? 'ASC' : 'DESC');
      return q;
    };

    // Music-only
    if (formatFilter === 'music') {
      const musicQuery = buildMusicQuery().take(take).skip(skip);
      const [results, total] = await musicQuery.getManyAndCount();
      return res.json({
        pageInfo: {
          pages: Math.ceil(total / take),
          page: Math.floor(skip / take) + 1,
          results: total,
        },
        results: results.map((r: MusicRequest) => ({ ...r, type: 'music' as const })),
      });
    }

    // Combined (no format filter): fetch both tables, merge and paginate in memory
    // to guarantee correct global ordering across both request types.
    if (!formatFilter) {
      const fetchLimit = Math.min(skip + take, 1000);

      const [bookTotal, bookResults, [allMusicResults, musicTotal]] = await Promise.all([
        bookQuery.getCount(),
        bookQuery.take(fetchLimit).skip(0).getMany(),
        buildMusicQuery().take(fetchLimit).skip(0).getManyAndCount(),
      ]);

      const total = bookTotal + musicTotal;
      const combined = [
        ...bookResults.map((r) => ({ ...r, type: 'book' as const })),
        ...allMusicResults.map((r) => ({ ...r, type: 'music' as const })),
      ];

      combined.sort((a, b) => {
        const aVal = (a as Record<string, unknown>)[sortField] as string;
        const bVal = (b as Record<string, unknown>)[sortField] as string;
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return order === 'ASC' ? cmp : -cmp;
      });

      return res.json({
        pageInfo: {
          pages: Math.ceil(total / take),
          page: Math.floor(skip / take) + 1,
          results: total,
        },
        results: combined.slice(skip, skip + take),
      });
    }

    // Book-only (ebook/audiobook format filter)
    bookQuery.take(take).skip(skip);
    const [bookResults, bookTotal] = await bookQuery.getManyAndCount();

    return res.json({
      pageInfo: {
        pages: Math.ceil(bookTotal / take),
        page: Math.floor(skip / take) + 1,
        results: bookTotal,
      },
      results: bookResults.map((r) => ({ ...r, type: 'book' as const })),
    });
  })
);

// ---------------------------------------------------------------------------
// GET /request/count — Count requests by status
// ---------------------------------------------------------------------------

router.get(
  '/count',
  isAuthenticated,
  asyncHandler(async (req: Request, res: Response) => {
    const bookRequestRepo = dataSource.getRepository(BookRequest);
    const user = req.user!;
    const isAdmin = hasPermission(user.permissions, Permission.ADMIN);
    const canView =
      isAdmin ||
      hasPermission(user.permissions, Permission.REQUEST_VIEW_EBOOK) ||
      hasPermission(user.permissions, Permission.REQUEST_VIEW_AUDIOBOOK);

    const buildWhere = (status: RequestStatus) => {
      if (canView) {
        return { status };
      }
      return { status, requestedBy: { id: user.id } };
    };

    const [pending, approved, declined, completed, failed] = await Promise.all([
      bookRequestRepo.count({ where: buildWhere(RequestStatus.PENDING) }),
      bookRequestRepo.count({ where: buildWhere(RequestStatus.APPROVED) }),
      bookRequestRepo.count({ where: buildWhere(RequestStatus.DECLINED) }),
      bookRequestRepo.count({ where: buildWhere(RequestStatus.COMPLETED) }),
      bookRequestRepo.count({ where: buildWhere(RequestStatus.FAILED) }),
    ]);

    return res.json({ pending, approved, declined, completed, failed });
  })
);

// ---------------------------------------------------------------------------
// POST /request — Create a new book request
// ---------------------------------------------------------------------------

router.post(
  '/',
  isAuthenticated,
  asyncHandler(async (req: Request, res: Response) => {
    const { workId, hardcoverId, format, requestedLanguage } = req.body;
    const user = req.user!;

    // Validate format
    if (!format || (format !== 'ebook' && format !== 'audiobook')) {
      return res.status(400).json({ error: 'format must be "ebook" or "audiobook"' });
    }

    // Enforce feature flags — requests disabled at the admin level
    const mainSettings = Settings.getInstance().main;
    if (format === 'ebook' && !mainSettings.enableEbookRequests) {
      return res.status(403).json({ error: 'Ebook requests are currently disabled' });
    }
    if (format === 'audiobook' && !mainSettings.enableAudiobookRequests) {
      return res.status(403).json({ error: 'Audiobook requests are currently disabled' });
    }

    // Check request permission based on format
    const requestPermission =
      format === 'audiobook' ? Permission.REQUEST_AUDIOBOOK : Permission.REQUEST_EBOOK;
    if (!hasPermission(user.permissions, requestPermission)) {
      return res.status(403).json({ error: 'You do not have permission to request this format' });
    }

    // Enforce quota (skip for ADMIN / BYPASS_QUOTA users — handled inside resolveEffectiveQuota)
    const quotaLimit = resolveEffectiveQuota(user, format);
    if (quotaLimit !== null) {
      const quotaUsed = await getQuotaUsage(user.id, format);
      if (quotaUsed >= quotaLimit) {
        return res.status(429).json({
          error: 'You have reached your request quota for this week',
          quotaLimit,
          quotaUsed,
        });
      }
    }

    // Must provide either workId or hardcoverId
    if (!workId && !hardcoverId) {
      return res.status(400).json({ error: 'workId or hardcoverId is required' });
    }

    // Validate workId if provided (must be a positive integer)
    if (workId !== undefined) {
      const parsedWorkId = parseId(String(workId));
      if (parsedWorkId === null) {
        return res.status(400).json({ error: 'workId must be a valid positive integer' });
      }
    }

    // Validate hardcoverId if provided (must be a non-empty string, max 100 chars)
    if (hardcoverId !== undefined) {
      if (typeof hardcoverId !== 'string' || hardcoverId.length === 0 || hardcoverId.length > 100) {
        return res.status(400).json({ error: 'hardcoverId must be a non-empty string (max 100 characters)' });
      }
    }

    // Validate requestedLanguage if provided (BCP 47 language tag)
    if (requestedLanguage !== undefined && requestedLanguage !== null && requestedLanguage !== '') {
      if (typeof requestedLanguage !== 'string' || !/^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2})?$/.test(requestedLanguage)) {
        return res.status(400).json({ error: 'requestedLanguage must be a valid BCP 47 language tag (e.g., "en", "fr", "en-US")' });
      }
    }

    // Resolve metadata outside the transaction (external API call)
    let resolvedMetadata: Awaited<ReturnType<ReturnType<typeof getMetadataResolver>['resolveWork']>> | null = null;
    if (!workId && hardcoverId) {
      const workRepo = dataSource.getRepository(Work);
      const existingWork = await workRepo.findOne({ where: { hardcoverId } });
      if (!existingWork) {
        resolvedMetadata = await getMetadataResolver().resolveWork(hardcoverId);
        if (!resolvedMetadata) {
          return res.status(404).json({ error: 'Could not resolve work metadata for this ID' });
        }
      }
    }

    // All DB writes (find/create work, duplicate check, create request, update status)
    // happen inside a single transaction to prevent race conditions
    let bookRequest: BookRequest;
    let work: Work;
    try {
      const result = await dataSource.transaction(async (manager) => {
        const txWorkRepo = manager.getRepository(Work);
        const txRequestRepo = manager.getRepository(BookRequest);

        // Find or create the Work
        let txWork: Work | null = null;

        if (workId) {
          txWork = await txWorkRepo.findOne({ where: { id: workId } });
          if (!txWork) {
            throw Object.assign(new Error('Work not found'), { statusCode: 404 });
          }
        } else if (hardcoverId) {
          txWork = await txWorkRepo.findOne({ where: { hardcoverId } });

          if (!txWork && resolvedMetadata) {
            txWork = txWorkRepo.create({
              hardcoverId: resolvedMetadata.hardcoverId || hardcoverId,
              openLibraryWorkId: resolvedMetadata.openLibraryWorkId,
              title: resolvedMetadata.title,
              originalTitle: resolvedMetadata.originalTitle,
              description: resolvedMetadata.description,
              coverUrl: resolvedMetadata.coverUrl,
              publishedDate: resolvedMetadata.publishedDate,
              pageCount: resolvedMetadata.pageCount,
              averageRating: resolvedMetadata.averageRating,
              ratingsCount: resolvedMetadata.ratingsCount,
              sourceUrl: resolvedMetadata.sourceUrl,
              genresJson: resolvedMetadata.genres ? JSON.stringify(resolvedMetadata.genres) : undefined,
              metadataSource: resolvedMetadata.source,
              status: WorkStatus.UNKNOWN,
            });
            txWork = await txWorkRepo.save(txWork);
            logger.info('Created new Work from metadata', {
              workId: txWork.id,
              hardcoverId,
              title: txWork.title,
            });
          }
        }

        if (!txWork) {
          throw Object.assign(new Error('Failed to resolve work'), { statusCode: 500 });
        }

        // Check for duplicate request: same work, same format, same user, active status
        const existingRequest = await txRequestRepo.findOne({
          where: {
            work: { id: txWork.id },
            requestedBy: { id: user.id },
            format,
            status: RequestStatus.PENDING,
          },
        });

        if (existingRequest) {
          throw Object.assign(new Error('You already have a pending request for this work and format'), {
            statusCode: 409,
            existingRequestId: existingRequest.id,
          });
        }

        // Block if content is already available (completed globally — no point requesting again)
        const completedRequest = await txRequestRepo
          .createQueryBuilder('request')
          .leftJoin('request.work', 'work')
          .where('work.id = :workId', { workId: txWork.id })
          .andWhere('request.format = :format', { format })
          .andWhere('request.status = :status', { status: RequestStatus.COMPLETED })
          .getOne();

        if (completedRequest) {
          throw Object.assign(new Error('This work is already available in this format'), {
            statusCode: 409,
          });
        }

        // Block if this user already has an approved (in-progress) request for the same work+format
        const approvedRequest = await txRequestRepo
          .createQueryBuilder('request')
          .leftJoin('request.work', 'work')
          .leftJoin('request.requestedBy', 'requester')
          .where('work.id = :workId', { workId: txWork.id })
          .andWhere('request.format = :format', { format })
          .andWhere('request.status = :status', { status: RequestStatus.APPROVED })
          .andWhere('requester.id = :userId', { userId: user.id })
          .getOne();

        if (approvedRequest) {
          throw Object.assign(new Error('You already have an approved request for this work and format'), {
            statusCode: 409,
            existingRequestId: approvedRequest.id,
          });
        }

        // Create the request
        const newRequest = txRequestRepo.create({
          work: txWork,
          requestedBy: user,
          format,
          requestedLanguage: requestedLanguage || undefined,
          status: RequestStatus.PENDING,
          isAutoRequest: false,
        });

        const savedRequest = await txRequestRepo.save(newRequest);

        // Update work status to PENDING if it was UNKNOWN
        if (txWork.status === WorkStatus.UNKNOWN) {
          txWork.status = WorkStatus.PENDING;
          await txWorkRepo.save(txWork);
        }

        return { request: savedRequest, work: txWork };
      });

      bookRequest = result.request;
      work = result.work;
    } catch (e: unknown) {
      const err = e as { statusCode?: number; existingRequestId?: number; message: string };
      if (err.statusCode) {
        return res.status(err.statusCode).json({
          error: err.message,
          ...(err.existingRequestId ? { existingRequestId: err.existingRequestId } : {}),
        });
      }
      throw e;
    }

    logger.info('Created book request', {
      requestId: bookRequest.id,
      workId: work.id,
      format,
      requestedLanguage,
      userId: user.id,
    });

    const bookRequestRepo = dataSource.getRepository(BookRequest);

    // Check for auto-approve permission
    const autoApprovePermission = getAutoApprovePermission('book', format);
    const isAutoApproved = hasPermission(user.permissions, autoApprovePermission);

    if (isAutoApproved) {
      logger.info('Auto-approving book request', {
        requestId: bookRequest.id,
        userId: user.id,
      });

      bookRequest.status = RequestStatus.APPROVED;
      bookRequest.modifiedBy = user;
      await bookRequestRepo.save(bookRequest);

      // Process asynchronously — don't block the response
      processApprovedBookRequest(bookRequest).catch((error) => {
        logger.error('Auto-approve processing failed', {
          requestId: bookRequest.id,
          error: String(error),
        });
      });
    }

    // Fire notification
    notifyEvent(
      {
        notificationType: isAutoApproved
          ? NotificationType.MEDIA_AUTO_APPROVED
          : NotificationType.MEDIA_PENDING,
        subject: isAutoApproved
          ? `Request Auto-Approved: ${work.title}`
          : `New Request: ${work.title}`,
        message: `${user.username} requested ${format} of "${work.title}".`,
        media: {
          mediaType: 'book',
          title: work.title,
          coverUrl: work.coverUrl || undefined,
          format,
        },
        request: {
          requestedBy: user.username,
          requestedById: user.id,
        },
      },
      [user.id]
    ).catch(() => {});

    // Reload with relations for the response
    const result = await bookRequestRepo.findOne({
      where: { id: bookRequest.id },
      relations: ['work', 'requestedBy'],
    });

    return res.status(201).json(result);
  })
);

// ---------------------------------------------------------------------------
// GET /request/:id — Get single request
// ---------------------------------------------------------------------------

router.get(
  '/:id',
  isAuthenticated,
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseId(param(req.params.id));
    if (!id) return res.status(400).json({ error: 'Invalid ID' });

    const bookRequestRepo = dataSource.getRepository(BookRequest);
    const bookRequest = await bookRequestRepo.findOne({
      where: { id },
      relations: ['work', 'requestedBy', 'modifiedBy'],
    });

    if (!bookRequest) {
      // Try music request
      const musicRequestRepo = dataSource.getRepository(MusicRequest);
      const musicRequest = await musicRequestRepo.findOne({
        where: { id },
        relations: ['album', 'requestedBy', 'modifiedBy'],
      });

      if (!musicRequest) {
        return res.status(404).json({ error: 'Request not found' });
      }

      // Check visibility
      const user = req.user!;
      const isAdmin = hasPermission(user.permissions, Permission.ADMIN);
      const canView =
        isAdmin ||
        hasPermission(user.permissions, Permission.REQUEST_VIEW_MUSIC);
      if (!canView && musicRequest.requestedBy?.id !== user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      return res.json({ ...musicRequest, type: 'music' });
    }

    // Check visibility for book request
    const user = req.user!;
    const isAdmin = hasPermission(user.permissions, Permission.ADMIN);
    const canView =
      isAdmin ||
      hasPermission(user.permissions, Permission.REQUEST_VIEW_EBOOK) ||
      hasPermission(user.permissions, Permission.REQUEST_VIEW_AUDIOBOOK);
    if (!canView && bookRequest.requestedBy?.id !== user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    return res.json({ ...bookRequest, type: 'book' });
  })
);

// ---------------------------------------------------------------------------
// PUT /request/:id — Update request (approve / decline)
// ---------------------------------------------------------------------------

router.put(
  '/:id',
  isAuthenticated,
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseId(param(req.params.id));
    if (!id) return res.status(400).json({ error: 'Invalid ID' });

    const { status, declineReason } = req.body;
    const user = req.user!;

    if (status == null) {
      return res.status(400).json({ error: 'status is required' });
    }

    // Validate declineReason length
    if (declineReason !== undefined && declineReason !== null) {
      if (typeof declineReason !== 'string' || declineReason.length > 1000) {
        return res.status(400).json({ error: 'declineReason must be a string (max 1000 characters)' });
      }
    }

    // Validate status value
    const validStatuses = [
      RequestStatus.PENDING,
      RequestStatus.APPROVED,
      RequestStatus.DECLINED,
      RequestStatus.COMPLETED,
      RequestStatus.FAILED,
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const bookRequestRepo = dataSource.getRepository(BookRequest);
    const bookRequest = await bookRequestRepo.findOne({
      where: { id },
      relations: ['work', 'requestedBy'],
    });

    if (!bookRequest) {
      // Try music request
      const musicRequestRepo = dataSource.getRepository(MusicRequest);
      const musicRequest = await musicRequestRepo.findOne({
        where: { id },
        relations: ['album', 'requestedBy'],
      });

      if (!musicRequest) {
        return res.status(404).json({ error: 'Request not found' });
      }

      // Permission check: must be admin or have MANAGE_REQUESTS_MUSIC
      const managePermission = getManageRequestPermission('music');
      if (!hasPermission(user.permissions, managePermission)) {
        return res.status(403).json({ error: 'Forbidden — manage requests permission required' });
      }

      musicRequest.status = status;
      musicRequest.modifiedBy = user;
      if (status === RequestStatus.DECLINED && declineReason) {
        musicRequest.declineReason = declineReason;
      }

      await musicRequestRepo.save(musicRequest);

      if (status === RequestStatus.APPROVED) {
        processApprovedMusicRequest(musicRequest).catch((error) => {
          logger.error('Music request processing failed', {
            requestId: musicRequest.id,
            error: String(error),
          });
        });
      }

      // Fire notification for music request status change
      if (
        status === RequestStatus.APPROVED ||
        status === RequestStatus.DECLINED
      ) {
        const albumTitle = musicRequest.album?.title || 'Unknown Album';
        notifyEvent(
          {
            notificationType:
              status === RequestStatus.APPROVED
                ? NotificationType.MEDIA_APPROVED
                : NotificationType.MEDIA_DECLINED,
            subject: `Request ${status === RequestStatus.APPROVED ? 'Approved' : 'Declined'}: ${albumTitle}`,
            message: `Your request for "${albumTitle}" has been ${status === RequestStatus.APPROVED ? 'approved' : 'declined'}.`,
            media: {
              mediaType: 'music',
              title: albumTitle,
              coverUrl: musicRequest.album?.coverUrl || undefined,
              format: 'music',
            },
            request: {
              requestedBy: musicRequest.requestedBy?.username || 'Unknown',
              requestedById: musicRequest.requestedBy?.id,
            },
          },
          [user.id]
        ).catch(() => {});
      }

      return res.json({ ...musicRequest, type: 'music' });
    }

    // Permission check for book requests
    const managePermission = getManageRequestPermission(
      'book',
      bookRequest.format
    );
    if (!hasPermission(user.permissions, managePermission)) {
      return res.status(403).json({ error: 'Forbidden — manage requests permission required' });
    }

    bookRequest.status = status;
    bookRequest.modifiedBy = user;

    if (status === RequestStatus.DECLINED && declineReason) {
      bookRequest.declineReason = declineReason;
    }

    await bookRequestRepo.save(bookRequest);

    // If approving, trigger processing
    if (status === RequestStatus.APPROVED) {
      processApprovedBookRequest(bookRequest).catch((error) => {
        logger.error('Book request processing failed', {
          requestId: bookRequest.id,
          error: String(error),
        });
      });
    }

    // If declining, update work status if no more active requests
    if (status === RequestStatus.DECLINED && bookRequest.work) {
      await updateWorkStatusAfterRequestChange(bookRequest.work.id);
    }

    // Fire notification for book request status change
    if (
      status === RequestStatus.APPROVED ||
      status === RequestStatus.DECLINED
    ) {
      const workTitle = bookRequest.work?.title || 'Unknown Book';
      notifyEvent(
        {
          notificationType:
            status === RequestStatus.APPROVED
              ? NotificationType.MEDIA_APPROVED
              : NotificationType.MEDIA_DECLINED,
          subject: `Request ${status === RequestStatus.APPROVED ? 'Approved' : 'Declined'}: ${workTitle}`,
          message: `Your ${bookRequest.format} request for "${workTitle}" has been ${status === RequestStatus.APPROVED ? 'approved' : 'declined'}.`,
          media: {
            mediaType: 'book',
            title: workTitle,
            coverUrl: bookRequest.work?.coverUrl || undefined,
            format: bookRequest.format,
          },
          request: {
            requestedBy: bookRequest.requestedBy?.username || 'Unknown',
            requestedById: bookRequest.requestedBy?.id,
          },
        },
        [user.id]
      ).catch(() => {});
    }

    // Reload with all relations
    const result = await bookRequestRepo.findOne({
      where: { id },
      relations: ['work', 'requestedBy', 'modifiedBy'],
    });

    return res.json({ ...result, type: 'book' });
  })
);

// ---------------------------------------------------------------------------
// DELETE /request/:id — Delete/cancel request
// ---------------------------------------------------------------------------

router.delete(
  '/:id',
  isAuthenticated,
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseId(param(req.params.id));
    if (!id) return res.status(400).json({ error: 'Invalid ID' });

    const user = req.user!;
    const isAdmin = hasPermission(user.permissions, Permission.ADMIN);

    const bookRequestRepo = dataSource.getRepository(BookRequest);
    const bookRequest = await bookRequestRepo.findOne({
      where: { id },
      relations: ['work', 'requestedBy'],
    });

    if (!bookRequest) {
      // Try music request
      const musicRequestRepo = dataSource.getRepository(MusicRequest);
      const musicRequest = await musicRequestRepo.findOne({
        where: { id },
        relations: ['album', 'requestedBy'],
      });

      if (!musicRequest) {
        return res.status(404).json({ error: 'Request not found' });
      }

      // Permission: owner or admin
      const isOwner = musicRequest.requestedBy?.id === user.id;
      const canManage = hasPermission(
        user.permissions,
        Permission.MANAGE_REQUESTS_MUSIC
      );
      if (!isOwner && !isAdmin && !canManage) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      await musicRequestRepo.remove(musicRequest);
      return res.json({ success: true });
    }

    // Permission: owner or admin/manager with manage permission
    const isOwner = bookRequest.requestedBy?.id === user.id;
    const canManage = hasPermission(
      user.permissions,
      getManageRequestPermission('book', bookRequest.format)
    );
    if (!isOwner && !isAdmin && !canManage) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const workId = bookRequest.work?.id;

    await bookRequestRepo.remove(bookRequest);

    // Update work status if no more active requests
    if (workId) {
      await updateWorkStatusAfterRequestChange(workId);
    }

    return res.json({ success: true });
  })
);

// ---------------------------------------------------------------------------
// Helper: Update Work status when requests are removed or declined
// ---------------------------------------------------------------------------

async function updateWorkStatusAfterRequestChange(
  workId: number
): Promise<void> {
  const workRepo = dataSource.getRepository(Work);
  const bookRequestRepo = dataSource.getRepository(BookRequest);

  const work = await workRepo.findOne({ where: { id: workId } });
  if (!work) return;

  // Check if there are any active requests left
  const activeCount = await bookRequestRepo
    .createQueryBuilder('request')
    .leftJoin('request.work', 'work')
    .where('work.id = :workId', { workId })
    .andWhere('request.status IN (:...statuses)', {
      statuses: [RequestStatus.PENDING, RequestStatus.APPROVED],
    })
    .getCount();

  // If no active requests and work was PENDING, reset to UNKNOWN
  // (unless it's already AVAILABLE or PARTIALLY_AVAILABLE)
  if (
    activeCount === 0 &&
    (work.status === WorkStatus.PENDING || work.status === WorkStatus.PROCESSING)
  ) {
    work.status = WorkStatus.UNKNOWN;
    await workRepo.save(work);
  }
}

export default router;
