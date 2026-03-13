import dataSource from '../datasource';
import { Work } from '../entity/Work';
import { Author } from '../entity/Author';
import { WorkAuthor } from '../entity/WorkAuthor';
import { BookRequest } from '../entity/BookRequest';
import { User } from '../entity/User';
import { MusicAlbum } from '../entity/MusicAlbum';
import ReadarrApi from '../api/servarr/readarr';
import type { ReadarrBook, ReadarrAuthor } from '@server/types/servarr';
import LidarrApi from '../api/servarr/lidarr';
import type { LidarrAlbum } from '@server/types/servarr';
import Settings from '../lib/settings';
import { buildServerUrl } from '../lib/serverUrl';
import { RequestStatus, WorkStatus } from '../constants/work';
import { Permission, hasPermission } from '../lib/permissions';
import logger from '../logger';

/**
 * Scan a single Readarr server's library and sync Works + Authors.
 *
 * Readarr is a download manager ONLY. This job creates/updates Work records
 * with metadata from Readarr's library, but does NOT set availability flags
 * (ebookAvailable/audiobookAvailable). Availability is determined by
 * Audiobookshelf / media server syncs.
 */
async function scanReadarrServer(
  serverSettings: { id?: number; name: string; hostname: string; port: number; apiKey: string; useSsl: boolean; baseUrl?: string; contentType?: string }
): Promise<void> {
  const serverId = serverSettings.id;
  const serverName = serverSettings.name;

  logger.info(`Arr library scan: starting Readarr scan for server "${serverName}" (id=${serverId})`);

  const api = new ReadarrApi(buildServerUrl(serverSettings), serverSettings.apiKey);

  // Fetch books and authors from Readarr
  let books: ReadarrBook[];
  let authors: ReadarrAuthor[];

  try {
    [books, authors] = await Promise.all([api.getBooks(), api.getAuthors()]);
  } catch (e) {
    logger.error(`Arr library scan: failed to fetch data from Readarr server "${serverName}"`, {
      error: e,
    });
    return;
  }

  logger.info(
    `Arr library scan: Readarr "${serverName}" returned ${books.length} book(s) and ${authors.length} author(s)`
  );

  // Build a lookup of Readarr author by name for quick access
  const readarrAuthorByName = new Map<string, ReadarrAuthor>();
  for (const a of authors) {
    readarrAuthorByName.set(a.authorName, a);
  }

  // Pre-load existing Works and Authors into Maps to avoid N+1 queries
  const existingWorks = await dataSource.getRepository(Work).find({ select: ['id', 'hardcoverId', 'title', 'metadataSource'] });
  const worksByHardcoverId = new Map<string, Work>();
  for (const w of existingWorks) {
    worksByHardcoverId.set(w.hardcoverId, w);
  }

  const existingAuthors = await dataSource.getRepository(Author).find({ select: ['id', 'hardcoverId', 'name'] });
  const authorsByHardcoverId = new Map<string, Author>();
  for (const a of existingAuthors) {
    authorsByHardcoverId.set(a.hardcoverId, a);
  }

  const existingWorkAuthors = await dataSource.getRepository(WorkAuthor).find({
    relations: ['work', 'author'],
  });
  const workAuthorKeys = new Set<string>();
  for (const wa of existingWorkAuthors) {
    workAuthorKeys.add(`${wa.work.id}:${wa.author.id}`);
  }

  let createdWorks = 0;
  let updatedWorks = 0;

  // Accumulate entities for batch save
  const worksToSave: Work[] = [];
  const authorsToSave: Author[] = [];
  const workAuthorsToSave: WorkAuthor[] = [];
  // Map from foreignBookId → Author, used to defer WorkAuthor creation until IDs are assigned
  const pendingAuthors = new Map<string, Author>();

  const workRepo = dataSource.getRepository(Work);
  const authorRepo = dataSource.getRepository(Author);
  const workAuthorRepo = dataSource.getRepository(WorkAuthor);

  for (const book of books) {
    try {
      const hardcoverId = book.foreignBookId;
      if (!hardcoverId) {
        logger.debug(`Arr library scan: skipping Readarr book "${book.title}" — no foreignBookId`);
        continue;
      }

      // Find or create the Work
      let work = worksByHardcoverId.get(hardcoverId);

      if (!work) {
        work = workRepo.create({
          hardcoverId,
          title: book.title,
          metadataSource: 'readarr',
        });
        worksToSave.push(work);
        createdWorks++;
        logger.debug(`Arr library scan: created Work "${book.title}" (hardcoverId=${hardcoverId})`);
      } else {
        // Update metadata only if the Work was originally sourced from Readarr
        if (!work.metadataSource || work.metadataSource === 'readarr') {
          let changed = false;
          if (book.title && book.title !== work.title) {
            work.title = book.title;
            changed = true;
          }
          if (changed) {
            work.metadataSource = 'readarr';
            worksToSave.push(work);
            updatedWorks++;
          }
        }
      }

      // Handle author association
      if (book.authorTitle) {
        const matchingAuthor = readarrAuthorByName.get(book.authorTitle);

        if (matchingAuthor && matchingAuthor.foreignAuthorId) {
          let author = authorsByHardcoverId.get(matchingAuthor.foreignAuthorId);

          if (!author) {
            author = authorRepo.create({
              hardcoverId: matchingAuthor.foreignAuthorId,
              name: matchingAuthor.authorName,
            });
            authorsToSave.push(author);
            authorsByHardcoverId.set(matchingAuthor.foreignAuthorId, author);
            logger.debug(
              `Arr library scan: created Author "${matchingAuthor.authorName}" (hardcoverId=${matchingAuthor.foreignAuthorId})`
            );
          }

          // Defer WorkAuthor creation until after batch save (IDs needed)
          pendingAuthors.set(hardcoverId, author);
        }
      }
    } catch (e) {
      logger.error(`Arr library scan: error processing Readarr book "${book.title}"`, {
        error: e,
      });
    }
  }

  // Batch save within a transaction
  await dataSource.transaction(async (manager) => {
    // Save authors first (works may reference them)
    if (authorsToSave.length > 0) {
      const saved = await manager.save(Author, authorsToSave);
      for (const a of saved) {
        authorsByHardcoverId.set(a.hardcoverId, a);
      }
    }

    // Save works
    if (worksToSave.length > 0) {
      const saved = await manager.save(Work, worksToSave);
      for (const w of saved) {
        worksByHardcoverId.set(w.hardcoverId, w);
      }
    }

    // Now create WorkAuthor joins using the pending authors map
    for (const [hardcoverId, author] of pendingAuthors) {
      const work = worksByHardcoverId.get(hardcoverId);
      if (!work?.id || !author.id) continue;

      const key = `${work.id}:${author.id}`;
      if (!workAuthorKeys.has(key)) {
        const workAuthor = workAuthorRepo.create({ work, author, role: 'author' });
        workAuthorsToSave.push(workAuthor);
        workAuthorKeys.add(key);
      }
    }

    if (workAuthorsToSave.length > 0) {
      await manager.save(WorkAuthor, workAuthorsToSave);
    }
  });

  // Create BookRequests for monitored Readarr books that have no active request.
  // This prevents users from re-requesting books already tracked in Readarr.
  const bookRequestRepo = dataSource.getRepository(BookRequest);
  const userRepo = dataSource.getRepository(User);

  // Find first admin user to attribute auto-requests to
  const adminUser = await userRepo
    .createQueryBuilder('user')
    .where('user.permissions & :perm != 0', { perm: Permission.ADMIN })
    .getOne();

  if (adminUser) {
    // Get all work IDs that already have an active request (not DECLINED/FAILED)
    const activeRequests = await bookRequestRepo
      .createQueryBuilder('req')
      .leftJoin('req.work', 'work')
      .select('work.hardcoverId', 'hardcoverId')
      .where('req.status IN (:...statuses)', {
        statuses: [RequestStatus.PENDING, RequestStatus.APPROVED, RequestStatus.COMPLETED],
      })
      .getRawMany();
    const worksWithRequests = new Set(activeRequests.map((r: { hardcoverId: string }) => r.hardcoverId));

    const requestsToCreate: BookRequest[] = [];
    const contentType = (serverSettings.contentType || 'ebook') as 'ebook' | 'audiobook';

    for (const book of books) {
      if (!book.monitored || !book.foreignBookId) continue;

      // Skip books that already have a file (they're already available)
      if (book.statistics?.bookFileCount && book.statistics.bookFileCount > 0) continue;

      if (worksWithRequests.has(book.foreignBookId)) continue;

      const work = worksByHardcoverId.get(book.foreignBookId);
      if (!work || !work.id) continue;

      const request = bookRequestRepo.create({
        work,
        requestedBy: adminUser,
        format: contentType,
        status: RequestStatus.APPROVED,
        readarrServerId: serverId,
        readarrBookId: book.id,
        isAutoRequest: true,
      });
      requestsToCreate.push(request);
      worksWithRequests.add(book.foreignBookId);
    }

    if (requestsToCreate.length > 0) {
      await bookRequestRepo.save(requestsToCreate);

      // Update Work status to PROCESSING for newly tracked books
      const workIds = requestsToCreate.map((r) => r.work.id);
      await dataSource
        .getRepository(Work)
        .createQueryBuilder()
        .update()
        .set({ status: WorkStatus.PROCESSING })
        .whereInIds(workIds)
        .execute();

      logger.info(
        `Arr library scan: created ${requestsToCreate.length} auto-request(s) for Readarr "${serverName}"`
      );
    }
  }

  logger.info(
    `Arr library scan: Readarr "${serverName}" complete — ${createdWorks} created, ${updatedWorks} updated`
  );
}

/**
 * Scan a single Lidarr server's library and sync MusicAlbums.
 */
async function scanLidarrServer(
  serverSettings: { id?: number; name: string; hostname: string; port: number; apiKey: string; useSsl: boolean; baseUrl?: string }
): Promise<void> {
  const serverId = serverSettings.id;
  const serverName = serverSettings.name;

  logger.info(`Arr library scan: starting Lidarr scan for server "${serverName}" (id=${serverId})`);

  const api = new LidarrApi(buildServerUrl(serverSettings), serverSettings.apiKey);

  let albums: LidarrAlbum[];

  try {
    albums = await api.getAlbums();
  } catch (e) {
    logger.error(`Arr library scan: failed to fetch data from Lidarr server "${serverName}"`, {
      error: e,
    });
    return;
  }

  logger.info(
    `Arr library scan: Lidarr "${serverName}" returned ${albums.length} album(s)`
  );

  // Pre-load existing albums into a Map
  const albumRepo = dataSource.getRepository(MusicAlbum);
  const existingAlbums = await albumRepo.find({ select: ['id', 'musicBrainzId', 'title', 'artistName', 'artistForeignId', 'foreignAlbumId', 'serviceId', 'externalServiceId'] });
  const albumsByMusicBrainzId = new Map<string, MusicAlbum>();
  for (const a of existingAlbums) {
    albumsByMusicBrainzId.set(a.musicBrainzId, a);
  }

  let created = 0;
  let updated = 0;
  const albumsToSave: MusicAlbum[] = [];

  for (const album of albums) {
    try {
      const foreignAlbumId = album.foreignAlbumId;
      if (!foreignAlbumId) {
        logger.debug(`Arr library scan: skipping Lidarr album "${album.title}" — no foreignAlbumId`);
        continue;
      }

      let musicAlbum = albumsByMusicBrainzId.get(foreignAlbumId);

      if (!musicAlbum) {
        musicAlbum = albumRepo.create({
          musicBrainzId: foreignAlbumId,
          foreignAlbumId: foreignAlbumId,
          title: album.title,
          artistName: album.artist?.artistName,
          artistForeignId: album.artist?.foreignArtistId,
          serviceId: serverId,
          externalServiceId: album.id,
          mediaAddedAt: album.added ? new Date(album.added) : undefined,
        });
        albumsToSave.push(musicAlbum);
        albumsByMusicBrainzId.set(foreignAlbumId, musicAlbum);
        created++;
        logger.debug(
          `Arr library scan: created MusicAlbum "${album.title}" (musicBrainzId=${foreignAlbumId})`
        );
      } else {
        let changed = false;

        if (album.title && album.title !== musicAlbum.title) {
          musicAlbum.title = album.title;
          changed = true;
        }
        if (album.artist?.artistName && !musicAlbum.artistName) {
          musicAlbum.artistName = album.artist.artistName;
          changed = true;
        }
        if (album.artist?.foreignArtistId && !musicAlbum.artistForeignId) {
          musicAlbum.artistForeignId = album.artist.foreignArtistId;
          changed = true;
        }
        if (!musicAlbum.foreignAlbumId) {
          musicAlbum.foreignAlbumId = foreignAlbumId;
          changed = true;
        }
        if (musicAlbum.serviceId !== serverId || musicAlbum.externalServiceId !== album.id) {
          musicAlbum.serviceId = serverId;
          musicAlbum.externalServiceId = album.id;
          changed = true;
        }

        if (changed) {
          albumsToSave.push(musicAlbum);
          updated++;
        }
      }
    } catch (e) {
      logger.error(`Arr library scan: error processing Lidarr album "${album.title}"`, {
        error: e,
      });
    }
  }

  // Batch save within a transaction
  if (albumsToSave.length > 0) {
    await dataSource.transaction(async (manager) => {
      await manager.save(MusicAlbum, albumsToSave);
    });
  }

  logger.info(
    `Arr library scan: Lidarr "${serverName}" complete — ${created} created, ${updated} updated`
  );
}

/**
 * Main arr library scan job.
 *
 * For 'readarr': scans all configured Readarr servers, creating/updating Work
 * and Author records. Does NOT set availability flags.
 *
 * For 'lidarr': scans all configured Lidarr servers, creating/updating
 * MusicAlbum records.
 */
export async function arrLibraryScan(type: 'readarr' | 'lidarr'): Promise<void> {
  const settings = Settings.getInstance();

  if (type === 'readarr') {
    const servers = settings.readarr;
    if (servers.length === 0) {
      logger.debug('Arr library scan: no Readarr servers configured, skipping');
      return;
    }

    for (const server of servers) {
      try {
        await scanReadarrServer(server);
      } catch (e) {
        logger.error(`Arr library scan: unexpected error scanning Readarr server "${server.name}"`, {
          error: e,
        });
      }
    }
  } else if (type === 'lidarr') {
    const servers = settings.lidarr;
    if (servers.length === 0) {
      logger.debug('Arr library scan: no Lidarr servers configured, skipping');
      return;
    }

    for (const server of servers) {
      try {
        await scanLidarrServer(server);
      } catch (e) {
        logger.error(`Arr library scan: unexpected error scanning Lidarr server "${server.name}"`, {
          error: e,
        });
      }
    }
  }
}
