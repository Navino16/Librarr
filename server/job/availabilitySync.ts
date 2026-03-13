// ---------------------------------------------------------------------------
// Availability Sync — the most critical sync job in Librarr
//
// Audiobookshelf is the SOURCE OF TRUTH for ebook/audiobook availability.
// Readarr only downloads files. Jellyfin/Plex are for music only.
//
// Flow: Readarr downloads → file on disk → Audiobookshelf detects it →
//       this sync creates WorkAvailability → BookRequest marked COMPLETED
// ---------------------------------------------------------------------------

import { IsNull, LessThan, Not, In } from 'typeorm';
import { buildServerUrl } from '../lib/serverUrl';
import dataSource from '../datasource';
import logger from '../logger';
import Settings from '../lib/settings';
import AudiobookshelfApi from '../api/audiobookshelf';
import type { AudiobookshelfLibraryItem } from '@server/types/mediaserver';
import { getMetadataResolver } from '../lib/metadataResolverInstance';
import type { MetadataResolver } from '../api/metadata';
import type { WorkMetadata } from '../api/metadata/types';
import { Work } from '../entity/Work';
import { Edition } from '../entity/Edition';
import { WorkAvailability } from '../entity/WorkAvailability';
import { BookRequest } from '../entity/BookRequest';
import { Author } from '../entity/Author';
import { WorkAuthor } from '../entity/WorkAuthor';
import { WorkStatus, RequestStatus } from '../constants/work';
import { UnmatchedMediaItem } from '../entity/UnmatchedMediaItem';
import { notifyEvent } from '../lib/notifications/router';
import { NotificationType } from '../lib/notifications';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AvailabilityFormat = 'ebook' | 'audiobook';
type DetectedFormat = 'ebook' | 'audiobook' | 'both';

interface ItemMetadata {
  title: string;
  authors: string[];
  isbn?: string;
  asin?: string;
  description?: string;
  coverUrl?: string;
  publishedDate?: string;
  language?: string;
  genres?: string[];
  narrators?: string[];
  publisher?: string;
}

interface AvailabilitySyncOptions {
  fullScan?: boolean;
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

function detectFormat(item: AudiobookshelfLibraryItem): DetectedFormat {
  const hasAudio =
    (item.media?.numAudioFiles ?? 0) > 0 || (item.media?.duration ?? 0) > 0;
  const hasEbook = !!item.media?.ebookFile;

  if (hasAudio && hasEbook) return 'both';
  if (hasAudio) return 'audiobook';
  return 'ebook';
}

/**
 * Expand a detected format into the list of individual availability formats.
 */
function expandFormats(format: DetectedFormat): AvailabilityFormat[] {
  if (format === 'both') return ['ebook', 'audiobook'];
  return [format];
}

// ---------------------------------------------------------------------------
// Metadata extraction from Audiobookshelf item
// ---------------------------------------------------------------------------

function extractMetadata(
  item: AudiobookshelfLibraryItem,
  api: AudiobookshelfApi
): ItemMetadata | null {
  const meta = item.media?.metadata;
  if (!meta?.title) return null;

  const title = meta.subtitle
    ? `${meta.title}: ${meta.subtitle}`
    : meta.title;

  // Normalize ISBN: strip hyphens and spaces
  const rawIsbn = meta.isbn?.replace(/[-\s]/g, '');
  const isbn =
    rawIsbn && (rawIsbn.length === 10 || rawIsbn.length === 13)
      ? rawIsbn
      : undefined;

  const asin = meta.asin?.trim() || undefined;

  return {
    title,
    authors: (meta.authors || []).map((a) => a.name).filter(Boolean),
    isbn,
    asin,
    description: meta.description || undefined,
    coverUrl: item.media?.coverPath ? api.getCoverUrl(item.id) : undefined,
    publishedDate: meta.publishedDate || meta.publishedYear || undefined,
    language: meta.language || undefined,
    genres: meta.genres?.length ? meta.genres : undefined,
    narrators: (meta.narrators || []).map((n) => n.name).filter(Boolean),
    publisher: meta.publisher || undefined,
  };
}

// ---------------------------------------------------------------------------
// Repository accessors
// ---------------------------------------------------------------------------

const workRepo = () => dataSource.getRepository(Work);
const editionRepo = () => dataSource.getRepository(Edition);
const availabilityRepo = () => dataSource.getRepository(WorkAvailability);
const bookRequestRepo = () => dataSource.getRepository(BookRequest);
const authorRepo = () => dataSource.getRepository(Author);
const workAuthorRepo = () => dataSource.getRepository(WorkAuthor);
const unmatchedRepo = () => dataSource.getRepository(UnmatchedMediaItem);

// ---------------------------------------------------------------------------
// Title matching helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a title for comparison: lowercase, strip accents, remove
 * punctuation, series numbering patterns like "Series 13 - ", and extra spaces.
 */
function normalizeTitle(title: string): string {
  return title
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .toLowerCase()
    .replace(/[\s\-–—:,.'"""''()[\]{}!?]/g, ' ')     // punctuation → space
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check whether two titles refer to the same work.
 * Returns true only when one normalized title fully contains the other,
 * which avoids false positives from partial keyword overlap.
 */
function isTitleMatch(itemTitle: string, resultTitle: string): boolean {
  const a = normalizeTitle(itemTitle);
  const b = normalizeTitle(resultTitle);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

// ---------------------------------------------------------------------------
// Work matching / creation (exact identifiers only — no fuzzy matching)
// ---------------------------------------------------------------------------

/**
 * Try to find an existing Work by ISBN or ASIN through the Edition table,
 * or search Hardcover for a match. If nothing is found, creates an orphan Work.
 * Returns { work, isNew } where isNew is true if the Work was created during this call.
 */
async function findOrCreateWork(
  meta: ItemMetadata,
  resolver: MetadataResolver
): Promise<{ work: Work; isNew: boolean } | null> {
  // 1. ISBN exact match via Edition table
  if (meta.isbn) {
    const edition = await editionRepo().findOne({
      where: meta.isbn.length === 13
        ? { isbn13: meta.isbn }
        : { isbn10: meta.isbn },
      relations: ['work'],
    });
    if (edition?.work) {
      logger.debug('Availability sync: matched Work via ISBN edition', {
        isbn: meta.isbn,
        workId: edition.work.id,
      });
      return { work: edition.work, isNew: false };
    }
  }

  // 2. ASIN exact match via Edition table
  if (meta.asin) {
    const edition = await editionRepo().findOne({
      where: { asin: meta.asin },
      relations: ['work'],
    });
    if (edition?.work) {
      logger.debug('Availability sync: matched Work via ASIN edition', {
        asin: meta.asin,
        workId: edition.work.id,
      });
      return { work: edition.work, isNew: false };
    }
  }

  // 3a. Search by ISBN — trusted match (no title check needed)
  let hardcoverResult: WorkMetadata | null = null;
  if (meta.isbn) {
    try {
      const results = await resolver.search(meta.isbn);
      if (results.length > 0) {
        hardcoverResult = results[0];
        logger.debug('Availability sync: matched via ISBN search', {
          isbn: meta.isbn,
          hardcoverId: hardcoverResult.hardcoverId,
        });
      }
    } catch (e) {
      logger.warn('Availability sync: ISBN search failed', {
        error: String(e),
        isbn: meta.isbn,
      });
    }
  }

  // 3b. Fallback: search by title+author — requires title validation
  if (!hardcoverResult) {
    const authorStr = meta.authors.length > 0 ? meta.authors[0] : '';
    const searchQuery = authorStr
      ? `${meta.title} ${authorStr}`
      : meta.title;

    try {
      const results = await resolver.search(searchQuery);
      if (results.length > 0) {
        const best = results[0];
        if (best.title && isTitleMatch(meta.title, best.title)) {
          hardcoverResult = best;
        } else {
          logger.debug('Availability sync: search result rejected — title mismatch', {
            itemTitle: meta.title,
            resultTitle: best.title,
          });
        }
      }
    } catch (e) {
      logger.warn('Availability sync: Hardcover search failed', {
        error: String(e),
        title: meta.title,
      });
    }
  }

  // 4. Check if Work already exists by hardcoverId
  if (hardcoverResult?.hardcoverId) {
    const existingWork = await workRepo().findOne({
      where: { hardcoverId: hardcoverResult.hardcoverId },
    });
    if (existingWork) {
      logger.debug('Availability sync: matched Work via Hardcover ID', {
        hardcoverId: hardcoverResult.hardcoverId,
        workId: existingWork.id,
      });
      return { work: existingWork, isNew: false };
    }
  }

  // 5. Create a new Work from Hardcover result
  if (hardcoverResult?.hardcoverId) {
    const work = await createWorkFromMetadata(hardcoverResult, meta);
    return { work, isNew: true };
  }

  // 6. No Hardcover match — skip
  logger.warn('Availability sync: no Hardcover match, skipping item', {
    title: meta.title,
    authors: meta.authors,
    isbn: meta.isbn,
    asin: meta.asin,
  });
  return null;
}

/**
 * Create a Work entity from Hardcover metadata, enriched with ABS metadata
 * where Hardcover fields are missing.
 */
async function createWorkFromMetadata(
  hcMeta: WorkMetadata,
  absMeta: ItemMetadata
): Promise<Work> {
  const work = workRepo().create({
    hardcoverId: hcMeta.hardcoverId!,
    title: hcMeta.title || absMeta.title,
    description: hcMeta.description || absMeta.description,
    coverUrl: hcMeta.coverUrl || absMeta.coverUrl,
    publishedDate: hcMeta.publishedDate || absMeta.publishedDate,
    pageCount: hcMeta.pageCount,
    averageRating: hcMeta.averageRating,
    ratingsCount: hcMeta.ratingsCount,
    sourceUrl: hcMeta.sourceUrl,
    genresJson: hcMeta.genres?.length
      ? JSON.stringify(hcMeta.genres)
      : absMeta.genres?.length
        ? JSON.stringify(absMeta.genres)
        : undefined,
    status: WorkStatus.UNKNOWN,
    metadataSource: 'hardcover',
    lastMetadataRefresh: new Date(),
  });

  const savedWork = await workRepo().save(work);

  // Create authors from Hardcover data
  if (hcMeta.authors?.length) {
    for (const authorData of hcMeta.authors) {
      await linkAuthor(savedWork, authorData.name, authorData.hardcoverId, 'author');
    }
  } else if (absMeta.authors.length) {
    for (const authorName of absMeta.authors) {
      await linkAuthor(savedWork, authorName, undefined, 'author');
    }
  }

  logger.info('Availability sync: created Work from Hardcover', {
    workId: savedWork.id,
    hardcoverId: savedWork.hardcoverId,
    title: savedWork.title,
  });

  return savedWork;
}


/**
 * Find or create an Author entity and link it to a Work via WorkAuthor.
 */
async function linkAuthor(
  work: Work,
  name: string,
  hardcoverId?: string,
  role?: string
): Promise<void> {
  let author: Author | null = null;

  if (hardcoverId) {
    author = await authorRepo().findOne({ where: { hardcoverId } });
    if (!author) {
      try {
        author = authorRepo().create({ hardcoverId, name });
        author = await authorRepo().save(author);
      } catch {
        // Concurrent insert — re-query
        author = await authorRepo().findOne({ where: { hardcoverId } });
      }
    }
  } else {
    author = await authorRepo().findOne({ where: { name } });
    if (!author) {
      const syntheticId = `abs-author-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      try {
        author = authorRepo().create({ hardcoverId: syntheticId, name });
        author = await authorRepo().save(author);
      } catch {
        // Concurrent insert — re-query by name
        author = await authorRepo().findOne({ where: { name } });
      }
    }
  }

  if (!author) {
    logger.warn('linkAuthor: failed to find or create author', { name, hardcoverId });
    return;
  }

  // Check if the link already exists
  const existing = await workAuthorRepo().findOne({
    where: {
      work: { id: work.id },
      author: { id: author.id },
    },
  });

  if (!existing) {
    const workAuthor = workAuthorRepo().create({
      work,
      author,
      role: role || 'author',
    });
    await workAuthorRepo().save(workAuthor);
  }
}

// ---------------------------------------------------------------------------
// Availability upsert
// ---------------------------------------------------------------------------

/**
 * Create or update a WorkAvailability record for a given work+format+source.
 * Returns { isNew } — true if this is a newly created availability.
 */
async function upsertAvailability(
  work: Work,
  format: AvailabilityFormat,
  source: string,
  sourceItemId: string,
  sourceUrl?: string
): Promise<{ isNew: boolean }> {
  const existing = await availabilityRepo().findOne({
    where: {
      work: { id: work.id },
      format,
      source,
    },
  });

  if (existing) {
    existing.lastVerifiedAt = new Date();
    existing.sourceItemId = sourceItemId;
    if (sourceUrl) existing.sourceUrl = sourceUrl;
    await availabilityRepo().save(existing);
    return { isNew: false };
  }

  const availability = availabilityRepo().create({
    work,
    format,
    source,
    sourceItemId,
    sourceUrl,
    lastVerifiedAt: new Date(),
  });
  await availabilityRepo().save(availability);
  return { isNew: true };
}

// ---------------------------------------------------------------------------
// Request completion
// ---------------------------------------------------------------------------

/**
 * Find approved BookRequests for this work+format and mark them COMPLETED.
 */
async function completeMatchingRequests(
  work: Work,
  format: AvailabilityFormat
): Promise<number> {
  const requests = await bookRequestRepo().find({
    where: {
      work: { id: work.id },
      format,
      status: RequestStatus.APPROVED,
    },
    relations: ['requestedBy'],
  });

  if (requests.length === 0) return 0;

  for (const request of requests) {
    request.status = RequestStatus.COMPLETED;

    // Notify the requesting user that media is now available
    if (request.requestedBy) {
      notifyEvent(
        {
          notificationType: NotificationType.MEDIA_AVAILABLE,
          subject: `Now Available: ${work.title}`,
          message: `Your ${format} request for "${work.title}" is now available!`,
          media: {
            mediaType: 'book',
            title: work.title,
            coverUrl: work.coverUrl || undefined,
            format,
          },
          request: {
            requestedBy: request.requestedBy.username,
            requestedById: request.requestedBy.id,
          },
        },
        []
      ).catch(() => {});
    }
  }
  await bookRequestRepo().save(requests);

  logger.info('Availability sync: completed matching requests', {
    workId: work.id,
    format,
    count: requests.length,
  });

  return requests.length;
}

// ---------------------------------------------------------------------------
// Work status + flags update
// ---------------------------------------------------------------------------

/**
 * Recalculate and update the Work's availability flags and status based on
 * current WorkAvailability records.
 */
async function updateWorkAvailabilityFlags(work: Work): Promise<void> {
  const allAvailability = await availabilityRepo().find({
    where: { work: { id: work.id } },
  });

  const hasEbook = allAvailability.some((a) => a.format === 'ebook');
  const hasAudiobook = allAvailability.some((a) => a.format === 'audiobook');

  let newStatus = work.status;
  if (hasEbook && hasAudiobook) {
    newStatus = WorkStatus.AVAILABLE;
  } else if (hasEbook || hasAudiobook) {
    if (
      work.status === WorkStatus.UNKNOWN ||
      work.status === WorkStatus.PENDING ||
      work.status === WorkStatus.PROCESSING
    ) {
      newStatus = WorkStatus.PARTIALLY_AVAILABLE;
    }
    if (work.status === WorkStatus.PARTIALLY_AVAILABLE) {
      newStatus = WorkStatus.PARTIALLY_AVAILABLE;
    }
  } else if (allAvailability.length === 0) {
    if (
      work.status === WorkStatus.AVAILABLE ||
      work.status === WorkStatus.PARTIALLY_AVAILABLE
    ) {
      newStatus = WorkStatus.UNKNOWN;
    }
  }

  if (
    work.ebookAvailable !== hasEbook ||
    work.audiobookAvailable !== hasAudiobook ||
    work.status !== newStatus
  ) {
    work.ebookAvailable = hasEbook;
    work.audiobookAvailable = hasAudiobook;
    work.status = newStatus;
    await workRepo().save(work);
  }
}

// ---------------------------------------------------------------------------
// Edition cleanup after match
// ---------------------------------------------------------------------------

async function cleanupEditionsAfterMatch(
  work: Work,
  format: AvailabilityFormat,
  identifier: { type: 'isbn13' | 'isbn10' | 'asin'; value: string }
): Promise<void> {
  const matchCondition: Record<string, string> = {};
  matchCondition[identifier.type] = identifier.value;

  const matchedEdition = await editionRepo().findOne({
    where: {
      work: { id: work.id },
      format,
      ...matchCondition,
    },
  });

  if (matchedEdition) {
    matchedEdition.matched = true;
    await editionRepo().save(matchedEdition);

    await editionRepo().delete({
      work: { id: work.id },
      format,
      matched: false,
      id: Not(matchedEdition.id),
    });
  }
}

// ---------------------------------------------------------------------------
// Work enrichment from ABS metadata
// ---------------------------------------------------------------------------

async function enrichWorkFromAbs(
  work: Work,
  meta: ItemMetadata
): Promise<void> {
  let changed = false;

  if (!work.description && meta.description) {
    work.description = meta.description;
    changed = true;
  }

  if (!work.coverUrl && meta.coverUrl) {
    work.coverUrl = meta.coverUrl;
    changed = true;
  }

  if (!work.publishedDate && meta.publishedDate) {
    work.publishedDate = meta.publishedDate;
    changed = true;
  }

  if (!work.genresJson && meta.genres?.length) {
    work.genresJson = JSON.stringify(meta.genres);
    changed = true;
  }

  if (changed) {
    await workRepo().save(work);
  }
}

// ---------------------------------------------------------------------------
// Unmatched item tracking
// ---------------------------------------------------------------------------

async function upsertUnmatchedItem(
  item: AudiobookshelfLibraryItem,
  meta: ItemMetadata,
  detectedFormat: DetectedFormat,
  libraryName: string,
  api: AudiobookshelfApi,
  reason: 'unmatched' | 'duplicate' = 'unmatched'
): Promise<void> {
  const repo = unmatchedRepo();
  const existing = await repo.findOne({ where: { sourceItemId: item.id } });

  if (existing) {
    existing.title = meta.title;
    existing.authors = meta.authors.length ? meta.authors.join(', ') : undefined;
    existing.isbn = meta.isbn;
    existing.asin = meta.asin;
    existing.format = detectedFormat;
    existing.libraryName = libraryName;
    existing.sourceUrl = api.getItemUrl(item.id);
    existing.reason = reason;
    existing.lastAttemptedAt = new Date();
    await repo.save(existing);
  } else {
    const entry = repo.create({
      sourceItemId: item.id,
      source: 'audiobookshelf',
      title: meta.title,
      authors: meta.authors.length ? meta.authors.join(', ') : undefined,
      isbn: meta.isbn,
      asin: meta.asin,
      format: detectedFormat,
      libraryName,
      sourceUrl: api.getItemUrl(item.id),
      reason,
    });
    await repo.save(entry);
  }
}

async function removeFromUnmatched(sourceItemId: string): Promise<void> {
  await unmatchedRepo().delete({ sourceItemId });
}

async function removeStaleUnmatchedItems(
  source: string,
  syncStartTime: Date
): Promise<number> {
  const result = await unmatchedRepo().delete({
    source,
    lastAttemptedAt: LessThan(syncStartTime),
  });
  return result.affected ?? 0;
}

// ---------------------------------------------------------------------------
// Stale availability cleanup
// ---------------------------------------------------------------------------

async function removeStaleAvailability(
  source: string,
  syncStartTime: Date
): Promise<number> {
  const stale = await availabilityRepo().find({
    where: [
      {
        source,
        lastVerifiedAt: LessThan(syncStartTime),
      },
      {
        source,
        lastVerifiedAt: IsNull(),
      },
    ],
    relations: ['work'],
  });

  if (stale.length === 0) return 0;

  const affectedWorkIds = new Set(
    stale.filter((a) => a.work).map((a) => a.work.id)
  );

  await availabilityRepo().remove(stale);

  // Batch-load affected works and update flags
  if (affectedWorkIds.size > 0) {
    const works = await workRepo().find({
      where: { id: In([...affectedWorkIds]) },
    });
    for (const work of works) {
      await updateWorkAvailabilityFlags(work);
    }
  }

  logger.info('Availability sync: removed stale availability records', {
    source,
    count: stale.length,
    affectedWorks: affectedWorkIds.size,
  });

  return stale.length;
}

// ---------------------------------------------------------------------------
// Audiobookshelf sync
// ---------------------------------------------------------------------------

async function syncAudiobookshelf(options: AvailabilitySyncOptions): Promise<void> {
  const settings = Settings.getInstance();
  const absSettings = settings.audiobookshelf;

  if (!absSettings.hostname || !absSettings.apiKey) {
    logger.debug('Availability sync: Audiobookshelf not configured, skipping');
    return;
  }

  const serverUrl = buildServerUrl(absSettings);

  const api = new AudiobookshelfApi(serverUrl, absSettings.apiKey);
  const resolver = getMetadataResolver();
  const syncStartTime = new Date();
  const source = 'audiobookshelf';
  const scanType = options.fullScan ? 'full' : 'incremental';

  logger.info(`Availability sync: starting Audiobookshelf ${scanType} sync`, { serverUrl });

  const libraries = await api.getLibraries();
  if (libraries.length === 0) {
    logger.warn('Availability sync: no libraries found in Audiobookshelf');
    return;
  }

  let totalItems = 0;
  let newWorks = 0;
  let newAvailability = 0;
  let completedRequests = 0;
  let errors = 0;

  // P19: Track only item IDs + minimal context instead of full objects
  const processedItemIds = new Map<string, {
    detectedFormat: DetectedFormat;
    libraryName: string;
    title: string;
    authors: string;
    isbn?: string;
    asin?: string;
  }>();

  for (const library of libraries) {
    if (library.mediaType !== 'book') {
      logger.debug('Availability sync: skipping non-book library', {
        library: library.name,
        mediaType: library.mediaType,
      });
      continue;
    }

    const items = await api.getLibraryItems(library.id);
    logger.info('Availability sync: processing library', {
      library: library.name,
      itemCount: items.length,
    });

    let libraryNewWorks = 0;
    let libraryNewAvail = 0;

    for (const item of items) {
      try {
        totalItems++;

        const meta = extractMetadata(item, api);
        if (!meta) {
          logger.debug('Availability sync: skipping item with no title', {
            itemId: item.id,
          });
          continue;
        }

        const detectedFormat = detectFormat(item);
        const formats = expandFormats(detectedFormat);

        const found = await findOrCreateWork(meta, resolver);
        if (!found) {
          await upsertUnmatchedItem(item, meta, detectedFormat, library.name, api);
          continue;
        }

        const { work, isNew: isNewWork } = found;

        await removeFromUnmatched(item.id);

        // P19: Store only IDs and minimal context
        processedItemIds.set(item.id, {
          detectedFormat,
          libraryName: library.name,
          title: meta.title,
          authors: meta.authors.join(', '),
          isbn: meta.isbn,
          asin: meta.asin,
        });

        if (isNewWork) {
          newWorks++;
          libraryNewWorks++;
        }

        // Upsert availability for each format
        for (const format of formats) {
          const { isNew } = await upsertAvailability(
            work,
            format,
            source,
            item.id,
            api.getItemUrl(item.id)
          );

          if (isNew) {
            newAvailability++;
            libraryNewAvail++;

            const completed = await completeMatchingRequests(work, format);
            completedRequests += completed;
          }
        }

        await updateWorkAvailabilityFlags(work);

        // Clean up editions if we matched by ISBN or ASIN
        if (meta.isbn) {
          const identifierType = meta.isbn.length === 13 ? 'isbn13' as const : 'isbn10' as const;
          for (const format of formats) {
            await cleanupEditionsAfterMatch(work, format, {
              type: identifierType,
              value: meta.isbn,
            });
          }
        } else if (meta.asin) {
          for (const format of formats) {
            await cleanupEditionsAfterMatch(work, format, {
              type: 'asin',
              value: meta.asin,
            });
          }
        }

        await enrichWorkFromAbs(work, meta);
      } catch (e) {
        errors++;
        logger.error('Availability sync: error processing item', {
          itemId: item.id,
          error: String(e),
        });
      }
    }

    logger.info(
      `Availability sync: finished library "${library.name}" — ` +
        `${items.length} items, ${libraryNewWorks} new works, ${libraryNewAvail} new availability`,
      {
        library: library.name,
        items: items.length,
        newWorks: libraryNewWorks,
        newAvailability: libraryNewAvail,
      }
    );
  }

  // Detect duplicates: items that matched a Work but whose sourceItemId is not
  // the "winning" one in work_availability
  const currentAvailabilityIds = new Set(
    (await availabilityRepo().find({ where: { source }, select: ['sourceItemId'] }))
      .map((a) => a.sourceItemId)
  );
  let duplicates = 0;
  for (const [itemId, ctx] of processedItemIds) {
    if (!currentAvailabilityIds.has(itemId)) {
      // Reconstruct minimal unmatched item for tracking
      const unmatchedItem = { id: itemId } as AudiobookshelfLibraryItem;
      const unmatchedMeta: ItemMetadata = {
        title: ctx.title,
        authors: ctx.authors ? ctx.authors.split(', ') : [],
        isbn: ctx.isbn,
        asin: ctx.asin,
      };
      await upsertUnmatchedItem(unmatchedItem, unmatchedMeta, ctx.detectedFormat, ctx.libraryName, api, 'duplicate');
      duplicates++;
    }
  }
  if (duplicates > 0) {
    logger.info('Availability sync: detected duplicate ABS items', { duplicates });
  }

  // Remove stale availability (items no longer in ABS)
  const staleRemoved = await removeStaleAvailability(source, syncStartTime);

  // Remove unmatched items that are no longer in ABS
  const staleUnmatched = await removeStaleUnmatchedItems(source, syncStartTime);

  logger.info('Availability sync: Audiobookshelf sync complete', {
    totalItems,
    newWorks,
    newAvailability,
    completedRequests,
    staleRemoved,
    staleUnmatched,
    errors,
  });
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function availabilitySync(options: AvailabilitySyncOptions = {}): Promise<void> {
  logger.info('Availability sync: starting');

  try {
    await syncAudiobookshelf(options);
  } catch (e) {
    logger.error('Availability sync: Audiobookshelf sync failed', {
      error: String(e),
    });
  }

  logger.info('Availability sync: finished');
}
