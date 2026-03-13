import { Router, Request, Response } from 'express';
import { getBookInfo } from '../lib/search';
import { isAuthenticated } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { param, parseId, safeInt } from '../utils/params';
import Settings from '../lib/settings';
import dataSource from '../datasource';
import { Author } from '../entity/Author';
import { enrichBookResults } from './book';

const router = Router();

// ---------------------------------------------------------------------------
// GET /author/:id - Author detail
// ---------------------------------------------------------------------------
// Accepts either a local Author ID (numeric) or a Hardcover author ID (string).
// If a local Author is found, it is returned with its works.
// Otherwise, falls back to the Hardcover API for metadata.
// ---------------------------------------------------------------------------

router.get('/:id', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
  if (!Settings.getInstance().main.hardcoverToken) {
    return res.status(503).json({ error: 'Book metadata not configured' });
  }

  const idStr = param(req.params.id);
  const numId = parseId(idStr);

  // Try local database first (by numeric ID)
  if (numId) {
    const authorRepo = dataSource.getRepository(Author);
    const localAuthor = await authorRepo.findOne({
      where: { id: numId },
      relations: ['works', 'works.work'],
    });

    if (localAuthor) {
      // Also fetch from Hardcover for full metadata (bio, photo, etc.)
      const locale = req.user?.settings?.locale;
      const externalAuthor = await getBookInfo().getAuthor(localAuthor.hardcoverId, locale);

      return res.json({
        id: localAuthor.id,
        hardcoverId: localAuthor.hardcoverId,
        name: localAuthor.name,
        bio: externalAuthor?.bio || localAuthor.bio || undefined,
        photoUrl: externalAuthor?.photoUrl || localAuthor.photoUrl || undefined,
        sourceUrl: externalAuthor?.sourceUrl || localAuthor.sourceUrl || undefined,
        works: localAuthor.works.map((wa) => wa.work).filter(Boolean),
        topBooks: externalAuthor?.topBooks || [],
      });
    }
  }

  // Fall back to Hardcover API lookup by Hardcover ID
  const locale = req.user?.settings?.locale;
  const author = await getBookInfo().getAuthor(idStr, locale);
  if (!author) {
    return res.status(404).json({ error: 'Author not found' });
  }

  // Check if the author exists locally by Hardcover ID
  const authorRepo = dataSource.getRepository(Author);
  const localByHardcover = await authorRepo.findOne({
    where: { hardcoverId: idStr },
    relations: ['works', 'works.work'],
  });

  return res.json({
    id: localByHardcover?.id || undefined,
    hardcoverId: author.goodreadsId, // goodreadsId field stores Hardcover ID
    name: author.name,
    bio: author.bio,
    photoUrl: author.photoUrl,
    sourceUrl: author.sourceUrl,
    works: localByHardcover?.works.map((wa) => wa.work).filter(Boolean) || [],
    topBooks: author.topBooks || [],
  });
}));

// ---------------------------------------------------------------------------
// GET /author/:id/books - Author's works with pagination
// ---------------------------------------------------------------------------
// Returns books by this author, enriched with local Work data.
// ---------------------------------------------------------------------------

router.get('/:id/books', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
  if (!Settings.getInstance().main.hardcoverToken) {
    return res.status(503).json({ error: 'Book metadata not configured' });
  }

  const idStr = param(req.params.id);
  const page = Math.max(1, safeInt(req.query.page as string, 1));
  const limit = Math.min(safeInt(req.query.limit as string, 20), 100);
  const locale = req.user?.settings?.locale;

  // Determine the Hardcover author ID
  let hardcoverAuthorId = idStr;
  const numId = parseId(idStr);
  if (numId) {
    const authorRepo = dataSource.getRepository(Author);
    const localAuthor = await authorRepo.findOne({ where: { id: numId } });
    if (localAuthor) {
      hardcoverAuthorId = localAuthor.hardcoverId;
    }
  }

  const result = await getBookInfo().getAuthorBooks(hardcoverAuthorId, page, limit, locale);
  const enriched = await enrichBookResults(result.results);
  return res.json({ results: enriched, page, totalResults: result.totalResults });
}));

export default router;
