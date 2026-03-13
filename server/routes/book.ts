import { Router, Request, Response } from 'express';
import { getBookInfo } from '../lib/search';
import { isAuthenticated } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { Permission, hasPermission } from '../lib/permissions';
import { param, parseId } from '../utils/params';
import Settings from '../lib/settings';
import dataSource from '../datasource';
import { Work } from '../entity/Work';
import { Edition } from '../entity/Edition';
import { BookRequest } from '../entity/BookRequest';
import { User } from '../entity/User';
import { getMetadataResolver } from '../lib/metadataResolverInstance';
import logger from '../logger';

const router = Router();

// ---------------------------------------------------------------------------
// Helper: enrich a work with its active requests (to avoid N+1 elsewhere)
// ---------------------------------------------------------------------------

async function loadWorkWithRelations(workId: number): Promise<Work | null> {
  const workRepo = dataSource.getRepository(Work);
  return workRepo.findOne({
    where: { id: workId },
    relations: [
      'authors',
      'authors.author',
      'editions',
      'availability',
      'series',
    ],
  });
}

async function loadWorkRequests(workId: number): Promise<BookRequest[]> {
  const requestRepo = dataSource.getRepository(BookRequest);
  return requestRepo.find({
    where: { work: { id: workId } },
    relations: ['requestedBy', 'modifiedBy'],
    order: { createdAt: 'DESC' },
  });
}

/**
 * Strip requestedBy from requests the user isn't allowed to see.
 * Users without REQUEST_VIEW_* can only see their own requestedBy.
 */
function sanitizeRequests(requests: BookRequest[], user: User): BookRequest[] {
  const canView =
    hasPermission(user.permissions, Permission.ADMIN) ||
    hasPermission(user.permissions, Permission.REQUEST_VIEW_EBOOK) ||
    hasPermission(user.permissions, Permission.REQUEST_VIEW_AUDIOBOOK);
  if (canView) return requests;

  return requests.map((r) => {
    if (r.requestedBy?.id === user.id) return r;
    return { ...r, requestedBy: undefined as unknown as User };
  });
}

// ---------------------------------------------------------------------------
// GET /book/:id - Get book details by Work ID (local database ID)
// ---------------------------------------------------------------------------

/**
 * Check if a Work has incomplete metadata (e.g. fetched during provider outage).
 * If so, attempt to re-fetch from providers and update the record in the background.
 */
function enrichWorkIfIncomplete(work: Work): void {
  if (work.description && work.coverUrl) return;

  const locale = 'en';
  getMetadataResolver().resolveWork(work.hardcoverId, locale).then(async (metadata) => {
    if (!metadata) return;
    const workRepo = dataSource.getRepository(Work);
    const updates: Partial<Work> = {};
    if (!work.description && metadata.description) updates.description = metadata.description;
    if (!work.coverUrl && metadata.coverUrl) updates.coverUrl = metadata.coverUrl;
    if (!work.pageCount && metadata.pageCount) updates.pageCount = metadata.pageCount;
    if (!work.averageRating && metadata.averageRating) updates.averageRating = metadata.averageRating;
    if (!work.publishedDate && metadata.publishedDate) updates.publishedDate = metadata.publishedDate;
    if (Object.keys(updates).length > 0) {
      await workRepo.update(work.id, updates);
      logger.info('Enriched incomplete Work metadata', { workId: work.id, fields: Object.keys(updates) });
    }
  }).catch((e) => {
    logger.debug('Background metadata enrichment failed', { workId: work.id, error: String(e) });
  });
}

router.get('/:id', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
  const idStr = param(req.params.id);
  const id = parseId(idStr);
  const currentUser = req.user!;

  // Try local Work ID first
  if (id !== null) {
    const [work, requests] = await Promise.all([
      loadWorkWithRelations(id),
      loadWorkRequests(id),
    ]);
    if (work) {
      enrichWorkIfIncomplete(work);
      return res.json({ ...work, requests: sanitizeRequests(requests, currentUser) });
    }
  }

  // Fallback: treat as Hardcover ID and lookup by hardcoverId
  const workRepo = dataSource.getRepository(Work);
  const workByHardcover = await workRepo.findOne({
    where: { hardcoverId: idStr },
    relations: ['authors', 'authors.author', 'editions', 'availability', 'series'],
  });

  if (workByHardcover) {
    const requests = await loadWorkRequests(workByHardcover.id);
    enrichWorkIfIncomplete(workByHardcover);
    return res.json({ ...workByHardcover, requests: sanitizeRequests(requests, currentUser) });
  }

  // Not found locally — resolve from external metadata providers
  const locale = (req.user as User | undefined)?.settings?.locale || 'en';
  const metadata = await getMetadataResolver().resolveWork(idStr, locale);
  if (!metadata) {
    return res.status(404).json({ error: 'Book not found' });
  }

  // Return as a lookup response (same shape as /lookup/:hardcoverId)
  return res.json({ metadata, work: null });
}));

// ---------------------------------------------------------------------------
// GET /book/:id/editions - List editions for a work
// ---------------------------------------------------------------------------

router.get('/:id/editions', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
  const idStr = param(req.params.id);
  const id = parseInt(idStr, 10);

  if (isNaN(id) || id < 1) {
    return res.status(400).json({ error: 'Invalid work ID' });
  }

  const editionRepo = dataSource.getRepository(Edition);
  const editions = await editionRepo.find({
    where: { work: { id } },
    order: { createdAt: 'DESC' },
  });

  return res.json({ results: editions });
}));

// ---------------------------------------------------------------------------
// GET /book/lookup/:hardcoverId - Lookup/resolve a book by Hardcover ID
// ---------------------------------------------------------------------------
// Returns metadata from external providers, enriched with local data if the
// Work already exists in the database. Does NOT persist anything.
// ---------------------------------------------------------------------------

router.get('/lookup/:hardcoverId', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
  const hardcoverId = param(req.params.hardcoverId);
  if (!hardcoverId) {
    return res.status(400).json({ error: 'Hardcover ID is required' });
  }

  const locale = req.user?.settings?.locale || 'en';
  const currentUser = req.user!;
  const canViewRequests =
    hasPermission(currentUser.permissions, Permission.ADMIN) ||
    hasPermission(currentUser.permissions, Permission.REQUEST_VIEW_EBOOK) ||
    hasPermission(currentUser.permissions, Permission.REQUEST_VIEW_AUDIOBOOK);

  // Check if Work already exists locally
  const workRepo = dataSource.getRepository(Work);
  const existingWork = await workRepo.findOne({
    where: { hardcoverId },
    relations: [
      'authors',
      'authors.author',
      'editions',
      'availability',
      'series',
    ],
  });

  // Fetch metadata from external providers
  const metadata = await getMetadataResolver().resolveWork(hardcoverId, locale);
  if (!metadata) {
    // If no external metadata but we have a local work, return that
    if (existingWork) {
      const requests = sanitizeRequests(await loadWorkRequests(existingWork.id), currentUser);
      return res.json({
        metadata: null,
        work: { ...existingWork, requests },
      });
    }
    return res.status(404).json({ error: 'Book not found' });
  }

  // Enrich metadata with local data if the work exists
  let localData: Record<string, unknown> | null = null;
  if (existingWork) {
    const requests = await loadWorkRequests(existingWork.id);
    localData = {
      id: existingWork.id,
      status: existingWork.status,
      ebookAvailable: existingWork.ebookAvailable,
      audiobookAvailable: existingWork.audiobookAvailable,
      hasEbookEdition: existingWork.hasEbookEdition,
      hasAudiobookEdition: existingWork.hasAudiobookEdition,
      requests: requests.map((r) => ({
        id: r.id,
        status: r.status,
        format: r.format,
        requestedBy: canViewRequests || r.requestedBy?.id === currentUser.id
          ? (r.requestedBy ? { id: r.requestedBy.id, username: r.requestedBy.username } : undefined)
          : undefined,
        createdAt: r.createdAt,
      })),
      availability: existingWork.availability,
    };
  }

  return res.json({
    metadata,
    work: localData,
  });
}));

// ---------------------------------------------------------------------------
// GET /book/:id/similar - Get similar books (same author)
// ---------------------------------------------------------------------------

router.get('/:id/similar', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
  if (!Settings.getInstance().main.hardcoverToken) {
    return res.status(503).json({ error: 'Book metadata not configured' });
  }

  const idStr = param(req.params.id);
  const locale = req.user?.settings?.locale;

  // Resolve the Hardcover ID: try local Work ID first, then hardcoverId field, then use as-is
  const numId = parseInt(idStr, 10);
  let hardcoverId: string | undefined;

  if (!isNaN(numId) && numId > 0) {
    const workRepo = dataSource.getRepository(Work);
    // Try local Work ID first
    let work = await workRepo.findOne({
      where: { id: numId },
      relations: ['authors', 'authors.author'],
    });
    // Fallback: try as hardcoverId
    if (!work) {
      work = await workRepo.findOne({
        where: { hardcoverId: idStr },
        relations: ['authors', 'authors.author'],
      });
    }
    hardcoverId = work?.hardcoverId ?? idStr;
  } else {
    hardcoverId = idStr;
  }

  const book = await getBookInfo().getWork(hardcoverId, locale);
  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }

  if (book.authors.length > 0 && book.authors[0].id) {
    const authorBooks = await getBookInfo().getAuthorBooks(book.authors[0].id, 1, 10, locale);
    const similar = authorBooks.results.filter((b) => b.goodreadsId !== hardcoverId);

    // Enrich with local Work data
    const enriched = await enrichBookResults(similar);
    return res.json({ results: enriched });
  }

  return res.json({ results: [] });
}));

// ---------------------------------------------------------------------------
// GET /book/:id/series - Get all books in the same series
// ---------------------------------------------------------------------------

router.get('/:id/series', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
  if (!Settings.getInstance().main.hardcoverToken) {
    return res.status(503).json({ error: 'Book metadata not configured' });
  }

  const idStr = param(req.params.id);
  const locale = req.user?.settings?.locale;

  // Resolve the Hardcover ID: try local Work ID first, then hardcoverId field, then use as-is
  const numId = parseInt(idStr, 10);
  let hardcoverId: string;

  if (!isNaN(numId) && numId > 0) {
    const workRepo = dataSource.getRepository(Work);
    let work = await workRepo.findOne({ where: { id: numId } });
    if (!work) {
      work = await workRepo.findOne({ where: { hardcoverId: idStr } });
    }
    hardcoverId = work?.hardcoverId ?? idStr;
  } else {
    hardcoverId = idStr;
  }

  const book = await getBookInfo().getWork(hardcoverId, locale);
  if (!book?.series) {
    return res.json({ results: [], seriesName: null });
  }

  const seriesBooks = await getBookInfo().getSeriesBooks(book.series.id, locale);
  const enriched = await enrichBookResults(seriesBooks);
  return res.json({ results: enriched, seriesName: book.series.name });
}));

// ---------------------------------------------------------------------------
// Helper: enrich BookResult[] with local Work data
// ---------------------------------------------------------------------------
// For each result that has a hardcoverId (stored as goodreadsId in BookResult),
// check if a matching Work exists locally and attach status/request info.
// ---------------------------------------------------------------------------

async function enrichBookResults<T extends { goodreadsId?: string }>(
  results: T[]
): Promise<(T & { media?: WorkLocalData })[]> {
  if (results.length === 0) return results as (T & { media?: WorkLocalData })[];

  const hardcoverIds = results
    .map((r) => r.goodreadsId)
    .filter((id): id is string => !!id);

  if (hardcoverIds.length === 0) return results as (T & { media?: WorkLocalData })[];

  try {
    const workRepo = dataSource.getRepository(Work);
    const requestRepo = dataSource.getRepository(BookRequest);

    // Batch load all matching works
    const works = await workRepo
      .createQueryBuilder('work')
      .leftJoinAndSelect('work.availability', 'availability')
      .where('work.hardcoverId IN (:...ids)', { ids: hardcoverIds })
      .getMany();

    const workMap = new Map(works.map((w) => [w.hardcoverId, w]));

    // Batch load requests for those works
    const workIds = works.map((w) => w.id);
    const requestsByWorkId = new Map<number, BookRequest[]>();
    if (workIds.length > 0) {
      const requests = await requestRepo
        .createQueryBuilder('request')
        .leftJoinAndSelect('request.work', 'work')
        .where('work.id IN (:...workIds)', { workIds })
        .getMany();

      for (const req of requests) {
        const wId = req.work.id;
        if (!requestsByWorkId.has(wId)) {
          requestsByWorkId.set(wId, []);
        }
        requestsByWorkId.get(wId)!.push(req);
      }
    }

    return results.map((r) => {
      const work = r.goodreadsId ? workMap.get(r.goodreadsId) : undefined;
      if (!work) return { ...r, media: undefined };

      const requests = requestsByWorkId.get(work.id) || [];
      return {
        ...r,
        media: {
          id: work.id,
          status: work.status,
          ebookAvailable: work.ebookAvailable,
          audiobookAvailable: work.audiobookAvailable,
          hasEbookEdition: work.hasEbookEdition,
          hasAudiobookEdition: work.hasAudiobookEdition,
          requests: requests.map((req) => ({
            id: req.id,
            status: req.status,
            format: req.format,
          })),
        },
      };
    });
  } catch (e) {
    logger.warn('enrichBookResults failed, returning unenriched', { error: String(e) });
    return results as (T & { media?: WorkLocalData })[];
  }
}

interface WorkLocalData {
  id: number;
  status: number;
  ebookAvailable: boolean;
  audiobookAvailable: boolean;
  hasEbookEdition: boolean;
  hasAudiobookEdition: boolean;
  requests: { id: number; status: number; format: string }[];
}

export { enrichBookResults };
export type { WorkLocalData };
export default router;
