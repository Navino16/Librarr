// Work-centric enrichment for book results.
// Music enrichment will be added when MusicAlbum routes are fully implemented.

import dataSource from '../datasource';
import { Work } from '../entity/Work';
import { BookRequest } from '../entity/BookRequest';
import { MusicAlbum } from '../entity/MusicAlbum';
import logger from '../logger';
import type { EnrichedMedia } from '@server/types/enrichment';

export type { EnrichedMedia } from '@server/types/enrichment';

/**
 * Enrich search/discover results with local Work or MusicAlbum data.
 *
 * For books: looks up Works by hardcoverId (stored as goodreadsId in BookResult).
 * For music: looks up MusicAlbum by musicBrainzId.
 */
export async function enrichWithMedia<T extends object>(
  results: T[],
  mediaType: 'book' | 'music'
): Promise<(T & { media?: EnrichedMedia })[]> {
  if (results.length === 0) return results as (T & { media?: EnrichedMedia })[];

  try {
    if (mediaType === 'book') {
      return await enrichBooks(results);
    }
    if (mediaType === 'music') {
      return await enrichMusic(results);
    }
  } catch (e) {
    logger.warn('enrichWithMedia failed, returning unenriched', { error: String(e), mediaType });
  }

  return results as (T & { media?: EnrichedMedia })[];
}

async function enrichBooks<T extends object>(
  results: T[]
): Promise<(T & { media?: EnrichedMedia })[]> {
  // Extract hardcover IDs (stored as goodreadsId in BookResult)
  const hardcoverIds = results
    .map((r) => (r as T & { goodreadsId?: string }).goodreadsId)
    .filter((id): id is string => !!id);

  if (hardcoverIds.length === 0) return results as (T & { media?: EnrichedMedia })[];

  const workRepo = dataSource.getRepository(Work);
  const requestRepo = dataSource.getRepository(BookRequest);

  // Batch load matching works
  const works = await workRepo
    .createQueryBuilder('work')
    .where('work.hardcoverId IN (:...ids)', { ids: hardcoverIds })
    .getMany();

  const workMap = new Map(works.map((w) => [w.hardcoverId, w]));

  // Batch load requests
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
    const goodreadsId = (r as T & { goodreadsId?: string }).goodreadsId;
    const work = goodreadsId
      ? workMap.get(goodreadsId)
      : undefined;
    if (!work) return { ...r, media: undefined };

    const requests = requestsByWorkId.get(work.id) || [];
    return {
      ...r,
      media: {
        id: work.id,
        status: work.status,
        ebookAvailable: work.ebookAvailable,
        audiobookAvailable: work.audiobookAvailable,
        requests: requests.map((req) => ({
          id: req.id,
          status: req.status,
          format: req.format,
        })),
      },
    };
  });
}

async function enrichMusic<T extends object>(
  results: T[]
): Promise<(T & { media?: EnrichedMedia })[]> {
  const musicBrainzIds = results
    .map((r) => (r as T & { musicBrainzId?: string }).musicBrainzId)
    .filter((id): id is string => !!id);

  if (musicBrainzIds.length === 0) return results as (T & { media?: EnrichedMedia })[];

  const albumRepo = dataSource.getRepository(MusicAlbum);
  const albums = await albumRepo
    .createQueryBuilder('album')
    .leftJoinAndSelect('album.requests', 'requests')
    .where('album.musicBrainzId IN (:...ids)', { ids: musicBrainzIds })
    .getMany();

  const albumMap = new Map(albums.map((a) => [a.musicBrainzId, a]));

  return results.map((r) => {
    const musicBrainzId = (r as T & { musicBrainzId?: string }).musicBrainzId;
    const album = musicBrainzId
      ? albumMap.get(musicBrainzId)
      : undefined;
    if (!album) return { ...r, media: undefined };

    return {
      ...r,
      media: {
        id: album.id,
        status: album.status,
        requests: (album.requests || []).map((req) => ({
          id: req.id,
          status: req.status,
          format: 'music',
        })),
      },
    };
  });
}
