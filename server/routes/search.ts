import { Router, Request, Response } from 'express';
import { musicBrainz } from '../lib/search';
import { isAuthenticated } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { safeInt } from '../utils/params';
import type { WorkMetadata } from '../api/metadata/types';
import Settings from '../lib/settings';
import dataSource from '../datasource';
import { Work } from '../entity/Work';
import { BookRequest } from '../entity/BookRequest';
import { AlbumResult } from '../models/Music';
import { getMetadataResolver } from '../lib/metadataResolverInstance';
import logger from '../logger';

const router = Router();

// ---------------------------------------------------------------------------
// Types for enriched search results
// ---------------------------------------------------------------------------

interface WorkLocalInfo {
  id: number;
  status: number;
  ebookAvailable: boolean;
  audiobookAvailable: boolean;
  hasEbookEdition: boolean;
  hasAudiobookEdition: boolean;
  requests: { id: number; status: number; format: string }[];
}

interface EnrichedWorkResult extends WorkMetadata {
  work?: WorkLocalInfo;
}

interface SearchResult {
  type: 'book' | 'music';
  book?: EnrichedWorkResult;
  album?: AlbumResult;
}

interface SearchResponse {
  page: number;
  totalPages: number;
  totalResults: number;
  results: SearchResult[];
}

// ---------------------------------------------------------------------------
// GET /search?query=&type=
// ---------------------------------------------------------------------------

router.get('/', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
  const query = typeof req.query.query === 'string' ? req.query.query : '';
  const page = safeInt(req.query.page as string, 1);
  const type = req.query.type as 'book' | 'music' | 'all' | undefined;

  if (!query || query.length > 500) {
    return res.status(400).json({ error: 'Query parameter required (max 500 characters)' });
  }

  const locale = req.user?.settings?.locale || 'en';
  const searchType = type || 'all';
  const results: SearchResult[] = [];
  let totalResults = 0;

  const mainSettings = Settings.getInstance().main;
  const bookEnabled =
    (mainSettings.enableEbookRequests || mainSettings.enableAudiobookRequests) &&
    !!mainSettings.hardcoverToken;
  const musicEnabled = mainSettings.enableMusicRequests;

  // Book search via MetadataResolver
  if ((searchType === 'all' || searchType === 'book') && bookEnabled) {
    try {
      const bookResults = await getMetadataResolver().search(query, locale);
      const enriched = await enrichSearchResults(bookResults);
      for (const book of enriched) {
        results.push({ type: 'book', book });
      }
      totalResults += bookResults.length;
    } catch (e) {
      logger.error('Book search error', { error: String(e), query });
    }
  }

  // Music search via MusicBrainz (kept as-is)
  if ((searchType === 'all' || searchType === 'music') && musicEnabled) {
    try {
      const limit = searchType === 'all' ? 10 : 20;
      const musicResults = await musicBrainz.searchAlbums(query, page, limit);
      for (const album of musicResults.results) {
        results.push({ type: 'music', album });
      }
      totalResults += musicResults.totalResults;
    } catch (e) {
      logger.error('Music search error', { error: String(e), query });
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalResults / 20));

  const response: SearchResponse = {
    page,
    totalPages,
    totalResults,
    results,
  };

  return res.json(response);
}));

// ---------------------------------------------------------------------------
// Helper: enrich WorkMetadata[] with local Work data
// ---------------------------------------------------------------------------

async function enrichSearchResults(
  results: WorkMetadata[]
): Promise<EnrichedWorkResult[]> {
  if (results.length === 0) return [];

  const hardcoverIds = results
    .map((r) => r.hardcoverId)
    .filter((id): id is string => !!id);

  if (hardcoverIds.length === 0) {
    return results.map((r) => ({ ...r }));
  }

  try {
    const workRepo = dataSource.getRepository(Work);
    const requestRepo = dataSource.getRepository(BookRequest);

    // Batch load matching works
    const works = await workRepo
      .createQueryBuilder('work')
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

      for (const r of requests) {
        const wId = r.work.id;
        if (!requestsByWorkId.has(wId)) {
          requestsByWorkId.set(wId, []);
        }
        requestsByWorkId.get(wId)!.push(r);
      }
    }

    return results.map((r) => {
      const work = r.hardcoverId ? workMap.get(r.hardcoverId) : undefined;
      if (!work) return { ...r };

      const requests = requestsByWorkId.get(work.id) || [];
      return {
        ...r,
        work: {
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
    logger.warn('enrichSearchResults failed, returning unenriched', { error: String(e) });
    return results.map((r) => ({ ...r }));
  }
}

export default router;
