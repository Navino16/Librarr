import dataSource from '../datasource';
import { BookRequest } from '../entity/BookRequest';
import { Edition } from '../entity/Edition';
import { Work } from '../entity/Work';
import { MusicRequest } from '../entity/MusicRequest';
import { RequestStatus, WorkStatus } from '../constants/work';
import { getMetadataResolver } from './metadataResolverInstance';
import { EditionData } from '../api/metadata/types';
import ReadarrApi from '../api/servarr/readarr';
import type { ReadarrAddOptions } from '@server/types/servarr';
import type { ReadarrSettings } from '@server/types/settings';
import Settings from '../lib/settings';
import { buildServerUrl } from '../lib/serverUrl';
import { notifyEvent } from '../lib/notifications/router';
import { NotificationType } from '../lib/notifications';
import logger from '../logger';

/**
 * Select the Readarr server configured for the given content type.
 * Only one server per content type is allowed.
 */
export function selectReadarrServer(
  format: string,
  serverId?: number
): ReadarrSettings | null {
  const settings = Settings.getInstance();
  const servers = settings.readarr;

  if (serverId != null) {
    const server = servers.find((s) => s.id === serverId);
    if (server && server.contentType === format) {
      return server;
    }
  }

  return servers.find((s) => s.contentType === format) ?? null;
}

/**
 * Determine the foreignBookId to send to Readarr.
 *
 * Readarr uses a "foreignBookId" which maps to whichever metadata source
 * the server is configured with. If the server uses OpenLibrary metadata
 * and we have an openLibraryWorkId, use that. Otherwise use hardcoverId.
 */
// Returns the foreignBookId to send to Readarr.
// Currently always uses hardcoverId (maps to the GoodReads ID space).
// TODO: Support OL-based Readarr instances by checking server metadata config.
function getForeignBookId(work: Work, _server: ReadarrSettings): string {
  return work.hardcoverId;
}

/**
 * Select the best edition from a list based on language preference.
 *
 * Priority:
 * 1. Exact language match
 * 2. English ('en') fallback
 * 3. First available edition
 */
function selectBestEdition(
  editions: EditionData[],
  requestedLanguage?: string
): EditionData | null {
  if (editions.length === 0) return null;

  // Priority 1: exact language match
  if (requestedLanguage) {
    const exactMatch = editions.find(
      (e) => e.language === requestedLanguage
    );
    if (exactMatch) return exactMatch;
  }

  // Priority 2: English fallback
  const englishMatch = editions.find((e) => e.language === 'en');
  if (englishMatch) return englishMatch;

  // Priority 3: first available
  return editions[0];
}

/**
 * Persist fetched editions to the database, replacing any existing ones
 * for the same work+format combination.
 */
async function persistEditions(
  work: Work,
  format: string,
  editionsData: EditionData[]
): Promise<Edition[]> {
  const editionRepo = dataSource.getRepository(Edition);

  // Delete old editions for this work+format
  await editionRepo
    .createQueryBuilder()
    .delete()
    .from(Edition)
    .where('"workId" = :workId AND format = :format', {
      workId: work.id,
      format,
    })
    .execute();

  // Create and save new editions
  const editions = editionsData.map((ed) =>
    editionRepo.create({
      work,
      isbn13: ed.isbn13,
      isbn10: ed.isbn10,
      asin: ed.asin,
      title: ed.title,
      publisher: ed.publisher,
      publishedDate: ed.publishedDate,
      language: ed.language,
      pageCount: ed.pageCount,
      coverUrl: ed.coverUrl,
      format: ed.format,
      source: ed.source,
      matched: false,
    })
  );

  if (editions.length > 0) {
    await editionRepo.save(editions);
  }

  return editions;
}

// ---------------------------------------------------------------------------
// Book request processing
// ---------------------------------------------------------------------------

/**
 * Process an approved book request:
 * 1. Fetch editions from metadata providers
 * 2. Select the best edition based on language preference
 * 3. Send to Readarr for download
 * 4. Update request and work status
 */
export async function processApprovedBookRequest(
  request: BookRequest
): Promise<void> {
  const requestRepo = dataSource.getRepository(BookRequest);
  const workRepo = dataSource.getRepository(Work);

  try {
    // Load request with work relation if not already loaded
    if (!request.work) {
      const loaded = await requestRepo.findOne({
        where: { id: request.id },
        relations: ['work'],
      });
      if (!loaded) {
        logger.error('processApprovedBookRequest: request not found', {
          requestId: request.id,
        });
        return;
      }
      request = loaded;
    }

    const work = request.work;
    const format = request.format as 'ebook' | 'audiobook';
    const language = request.requestedLanguage || 'en';

    // Step 1: Select Readarr server
    const server = selectReadarrServer(format, request.readarrServerId ?? undefined);
    if (!server) {
      logger.info(
        'processApprovedBookRequest: no Readarr server configured for format, keeping request pending',
        { format, requestId: request.id }
      );
      // No download manager configured — leave request as-is so it can
      // be processed later when a Readarr server is added.
      return;
    }

    // Step 2: Fetch editions from metadata providers
    const resolver = getMetadataResolver();
    const editions = await resolver.fetchEditionsForRequest(
      {
        hardcoverId: work.hardcoverId,
        openLibraryWorkId: work.openLibraryWorkId,
      },
      format,
      language
    );

    logger.info('processApprovedBookRequest: fetched editions', {
      requestId: request.id,
      workId: work.id,
      editionCount: editions.length,
      format,
      language,
    });

    // Step 3: Persist editions
    await persistEditions(work, format, editions);

    // Step 4: Select best edition
    const bestEdition = selectBestEdition(editions, request.requestedLanguage);
    if (!bestEdition) {
      logger.warn(
        'processApprovedBookRequest: no suitable edition found',
        { requestId: request.id, workId: work.id, format, language }
      );
      request.status = RequestStatus.FAILED;
      await requestRepo.save(request);
      notifyRequestFailed(request, work);
      return;
    }

    // Step 5: Resolve identifiers
    const foreignBookId = getForeignBookId(work, server);
    const isbn = bestEdition.isbn13 || bestEdition.isbn10;

    logger.info('processApprovedBookRequest: selected edition', {
      requestId: request.id,
      isbn,
      language: bestEdition.language,
      title: bestEdition.title,
      foreignBookId,
    });

    // Step 6: Send to Readarr
    const readarrApi = new ReadarrApi(buildServerUrl(server), server.apiKey);

    // First, look up the book in Readarr to get author info
    const lookupTerm = isbn
      ? `isbn:${isbn}`
      : `goodreads:${foreignBookId}`;

    let foreignAuthorId = '';
    let foreignEditionId = '';
    let bookTitle = work.title;

    try {
      const lookupResults = await readarrApi.lookupBook(lookupTerm);
      if (lookupResults && lookupResults.length > 0) {
        const match = lookupResults[0];
        // Readarr returns author inline; Bookshelf (Hardcover fork) does not
        const matchAny = match as unknown as {
          author?: { foreignAuthorId?: string };
          authorTitle?: string;
          foreignEditionId?: string;
          title?: string;
        };
        foreignAuthorId = matchAny.author?.foreignAuthorId ?? '';
        foreignEditionId = matchAny.foreignEditionId ?? '';
        bookTitle = matchAny.title || bookTitle;

        // Bookshelf fallback: use authorTitle to look up author separately
        // authorTitle format: "lastname, firstname BookTitle"
        if (!foreignAuthorId && matchAny.authorTitle) {
          const title = matchAny.title || bookTitle;
          let authorName = matchAny.authorTitle;
          if (title) {
            const titleIdx = authorName.indexOf(title);
            if (titleIdx > 0) {
              authorName = authorName.substring(0, titleIdx).trim();
            }
          }
          try {
            const authors = await readarrApi.lookupAuthor(authorName);
            if (authors && authors.length > 0) {
              foreignAuthorId = authors[0].foreignAuthorId;
            }
          } catch (e) {
            logger.warn('processApprovedBookRequest: author lookup fallback failed', {
              error: String(e),
              authorName,
            });
          }
        }
      }
    } catch (e) {
      logger.warn('processApprovedBookRequest: Readarr lookup failed, using work data', {
        error: String(e),
        lookupTerm,
      });
    }

    // If we still don't have a foreignAuthorId, we can't properly add to Readarr
    if (!foreignAuthorId) {
      logger.error(
        'processApprovedBookRequest: could not resolve foreignAuthorId',
        { requestId: request.id, lookupTerm }
      );
      request.status = RequestStatus.FAILED;
      await requestRepo.save(request);
      notifyRequestFailed(request, work);
      return;
    }

    const addOptions: ReadarrAddOptions = {
      title: bookTitle,
      foreignBookId,
      qualityProfileId: server.activeProfileId,
      metadataProfileId: server.metadataProfileId,
      rootFolderPath: server.activeDirectory,
      tags: server.tags,
      monitored: true,
      // Bookshelf requires editions array; Readarr ignores it
      ...(foreignEditionId && {
        foreignEditionId,
        anyEditionOk: true,
        editions: [{ foreignEditionId, title: bookTitle, monitored: true }],
      }),
      addOptions: {
        addType: 'automatic',
        searchForNewBook: true,
      },
      author: {
        foreignAuthorId,
        qualityProfileId: server.activeProfileId,
        metadataProfileId: server.metadataProfileId,
        rootFolderPath: server.activeDirectory,
        tags: server.tags,
        monitored: true,
      },
    };

    const readarrBook = await readarrApi.addBook(addOptions);

    // Step 7: Update request with Readarr tracking info
    request.readarrServerId = server.id;
    request.readarrBookId = readarrBook.id;
    request.authorForeignId = foreignAuthorId;
    request.status = RequestStatus.APPROVED;
    await requestRepo.save(request);

    // Step 8: Update work status to PROCESSING
    work.status = WorkStatus.PROCESSING;
    await workRepo.save(work);

    logger.info('processApprovedBookRequest: book sent to Readarr', {
      requestId: request.id,
      readarrBookId: readarrBook.id,
      readarrServerId: server.id,
    });
  } catch (error) {
    logger.error('processApprovedBookRequest: unexpected error', {
      requestId: request.id,
      error: String(error),
    });

    // Mark request as failed
    try {
      request.status = RequestStatus.FAILED;
      await requestRepo.save(request);
      notifyRequestFailed(request, request.work);
    } catch (saveError) {
      logger.error('processApprovedBookRequest: failed to save failed status', {
        requestId: request.id,
        error: String(saveError),
      });
    }
  }
}

function notifyRequestFailed(request: BookRequest, work?: Work): void {
  const title = work?.title || 'Unknown Book';
  notifyEvent(
    {
      notificationType: NotificationType.MEDIA_FAILED,
      subject: `Request Failed: ${title}`,
      message: `The ${request.format} request for "${title}" could not be processed.`,
      media: {
        mediaType: 'book',
        title,
        coverUrl: work?.coverUrl || undefined,
        format: request.format,
      },
      request: {
        requestedBy: request.requestedBy?.username || 'Unknown',
        requestedById: request.requestedBy?.id,
      },
    },
    []
  ).catch(() => {});
}

// ---------------------------------------------------------------------------
// Music request processing (stub)
// ---------------------------------------------------------------------------

/**
 * Process an approved music request.
 * TODO: Implement Lidarr integration (similar pattern to book requests).
 */
export async function processApprovedMusicRequest(
  _request: MusicRequest
): Promise<void> {
  logger.warn('processApprovedMusicRequest is not yet implemented');
}
