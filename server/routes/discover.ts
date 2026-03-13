import { Router, Request, Response } from 'express';
import { isAuthenticated } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { Permission, hasPermission } from '../lib/permissions';
import { safeInt } from '../utils/params';
import { getBookInfo, musicBrainz } from '../lib/search';
import Settings from '../lib/settings';
import dataSource from '../datasource';
import { BookRequest } from '../entity/BookRequest';
import { enrichBookResults } from './book';
import { Work } from '../entity/Work';

const router = Router();

// ---------------------------------------------------------------------------
// GET /discover/books - Trending/popular books
// ---------------------------------------------------------------------------

router.get('/books', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
  const mainSettings = Settings.getInstance().main;
  if (!mainSettings.hardcoverToken || (!mainSettings.enableEbookRequests && !mainSettings.enableAudiobookRequests)) {
    return res.json({ results: [], page: 1, totalResults: 0 });
  }

  const page = Math.max(1, safeInt(req.query.page as string, 1));
  const locale = req.user?.settings?.locale;
  const trending = await getBookInfo().getTrending(20, page, locale);

  // Enrich with local Work data (status, requests, availability)
  const enriched = await enrichBookResults(trending.results);
  return res.json({ results: enriched, page, totalResults: trending.totalResults });
}));

// ---------------------------------------------------------------------------
// GET /discover/music - Trending/popular music
// ---------------------------------------------------------------------------

router.get('/music', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
  const mainMusicSettings = Settings.getInstance().main;
  if (!mainMusicSettings.enableMusicRequests) {
    return res.json({ results: [], page: 1, totalResults: 0 });
  }
  const page = Math.max(1, safeInt(req.query.page as string, 1));
  const albums = await musicBrainz.searchAlbums('*', page, 20);
  return res.json({ results: albums.results, page, totalResults: albums.totalResults });
}));

// ---------------------------------------------------------------------------
// GET /discover/recent - Recently requested media
// ---------------------------------------------------------------------------

router.get('/recent', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.min(safeInt(req.query.limit as string, 20), 50);
  const locale = req.user?.settings?.locale;
  const user = req.user!;
  const isAdmin = hasPermission(user.permissions, Permission.ADMIN);
  const canViewRequests =
    isAdmin ||
    hasPermission(user.permissions, Permission.REQUEST_VIEW_EBOOK) ||
    hasPermission(user.permissions, Permission.REQUEST_VIEW_AUDIOBOOK);

  const requestRepo = dataSource.getRepository(BookRequest);
  const query = requestRepo
    .createQueryBuilder('request')
    .leftJoinAndSelect('request.work', 'work')
    .leftJoinAndSelect('work.authors', 'workAuthor')
    .leftJoinAndSelect('workAuthor.author', 'author')
    .leftJoinAndSelect('request.requestedBy', 'requestedBy')
    .orderBy('request.createdAt', 'DESC')
    .take(limit);

  const recentRequests = await query.getMany();

  // Group all requests by work ID
  type RequestEntry = { id: number; format: string; status: number; requestedBy?: { id: number; username: string }; createdAt: Date };
  const workRequestsMap = new Map<number, RequestEntry[]>();
  const workMap = new Map<number, Work>();
  const orderedWorkIds: number[] = [];

  for (const r of recentRequests) {
    if (!r.work) continue;
    const workId = r.work.id;

    if (!workRequestsMap.has(workId)) {
      workRequestsMap.set(workId, []);
      workMap.set(workId, r.work);
      orderedWorkIds.push(workId);
    }

    workRequestsMap.get(workId)!.push({
      id: r.id,
      format: r.format,
      status: r.status,
      requestedBy: r.requestedBy
        ? { id: r.requestedBy.id, username: r.requestedBy.username }
        : undefined,
      createdAt: r.createdAt,
    });
  }

  // Strip requestedBy for users without view-request permission (keep own)
  const stripRequestedBy = (entry: RequestEntry): RequestEntry => {
    if (canViewRequests) return entry;
    if (entry.requestedBy?.id === user.id) return entry;
    const { requestedBy: _, ...rest } = entry;
    return rest;
  };

  // Build results ordered by most recent request, with ALL requests per work
  const results: Array<{
    type: 'book';
    work: Work;
    request: RequestEntry;
    requests: RequestEntry[];
  }> = orderedWorkIds.map((workId) => {
    const allRequests = workRequestsMap.get(workId)!.map(stripRequestedBy);
    return {
      type: 'book' as const,
      work: workMap.get(workId)!,
      request: allRequests[0], // most recent (already ordered by createdAt DESC)
      requests: allRequests,
    };
  });

  // Localize work titles and covers for the user's locale
  if (locale) {
    const hardcoverIds = results
      .map((r) => r.work.hardcoverId)
      .filter((id): id is string => !!id);

    if (hardcoverIds.length > 0) {
      const localizedMap = await getBookInfo().getLocalizedData(hardcoverIds, locale);
      if (localizedMap.size > 0) {
        for (const r of results) {
          const localized = r.work.hardcoverId ? localizedMap.get(r.work.hardcoverId) : undefined;
          if (localized) {
            r.work = { ...r.work, title: localized.title, coverUrl: localized.coverUrl || r.work.coverUrl };
          }
        }
      }
    }
  }

  return res.json({ results });
}));

export default router;
