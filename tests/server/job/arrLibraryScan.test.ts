import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockGetBooks,
  mockGetAuthors,
  mockReadarrConstructor,
} = vi.hoisted(() => ({
  mockGetBooks: vi.fn(),
  mockGetAuthors: vi.fn(),
  mockReadarrConstructor: vi.fn(),
}));

const {
  mockGetAlbums,
  mockLidarrConstructor,
} = vi.hoisted(() => ({
  mockGetAlbums: vi.fn(),
  mockLidarrConstructor: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@server/datasource', () => ({
  default: {
    getRepository: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock('@server/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@server/lib/settings', () => ({
  default: { getInstance: vi.fn() },
}));

vi.mock('@server/lib/serverUrl', () => ({
  buildServerUrl: vi.fn().mockReturnValue('http://localhost:8787'),
}));

vi.mock('@server/api/servarr/readarr', () => ({
  default: vi.fn().mockImplementation(function () {
    mockReadarrConstructor();
    return {
      getBooks: mockGetBooks,
      getAuthors: mockGetAuthors,
    };
  }),
}));

vi.mock('@server/api/servarr/lidarr', () => ({
  default: vi.fn().mockImplementation(function () {
    mockLidarrConstructor();
    return { getAlbums: mockGetAlbums };
  }),
}));

vi.mock('@server/entity/Work', () => ({ Work: class Work {} }));
vi.mock('@server/entity/Author', () => ({ Author: class Author {} }));
vi.mock('@server/entity/WorkAuthor', () => ({ WorkAuthor: class WorkAuthor {} }));
vi.mock('@server/entity/MusicAlbum', () => ({ MusicAlbum: class MusicAlbum {} }));

// Transitive entity mocks (break import chains that would load real TypeORM decorators)
vi.mock('@server/entity/User', () => ({ User: class User {} }));
vi.mock('@server/entity/UserSettings', () => ({ UserSettings: class UserSettings {} }));
vi.mock('@server/entity/BookRequest', () => ({ BookRequest: class BookRequest {} }));
vi.mock('@server/entity/MusicRequest', () => ({ MusicRequest: class MusicRequest {} }));
vi.mock('@server/entity/Issue', () => ({ Issue: class Issue {} }));
vi.mock('@server/entity/IssueComment', () => ({ IssueComment: class IssueComment {} }));
vi.mock('@server/entity/Edition', () => ({ Edition: class Edition {} }));
vi.mock('@server/entity/WorkAvailability', () => ({ WorkAvailability: class WorkAvailability {} }));
vi.mock('@server/entity/Series', () => ({ Series: class Series {} }));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import dataSource from '@server/datasource';
import logger from '@server/logger';
import Settings from '@server/lib/settings';
import { arrLibraryScan } from '@server/job/arrLibraryScan';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQueryBuilder(overrides: Record<string, any> = {}) {
  const qb: any = {};
  qb.select = vi.fn().mockReturnValue(qb);
  qb.where = vi.fn().mockReturnValue(qb);
  qb.andWhere = vi.fn().mockReturnValue(qb);
  qb.leftJoin = vi.fn().mockReturnValue(qb);
  qb.update = vi.fn().mockReturnValue(qb);
  qb.set = vi.fn().mockReturnValue(qb);
  qb.whereInIds = vi.fn().mockReturnValue(qb);
  qb.execute = vi.fn().mockResolvedValue(undefined);
  qb.getOne = vi.fn().mockResolvedValue(null);
  qb.getMany = vi.fn().mockResolvedValue([]);
  qb.getRawMany = vi.fn().mockResolvedValue([]);
  return Object.assign(qb, overrides);
}

function makeRepo(overrides: Record<string, any> = {}) {
  return {
    find: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockImplementation((data: any) => Promise.resolve(data)),
    create: vi.fn().mockImplementation((data: any) => ({ ...data })),
    delete: vi.fn().mockResolvedValue({ affected: 0 }),
    createQueryBuilder: vi.fn().mockReturnValue(makeQueryBuilder()),
    ...overrides,
  };
}

function setupRepos(custom: Record<string, any> = {}) {
  const repos: Record<string, any> = {
    Work: makeRepo(),
    Author: makeRepo(),
    WorkAuthor: makeRepo(),
    MusicAlbum: makeRepo(),
    User: makeRepo(),
    BookRequest: makeRepo(),
    ...custom,
  };

  vi.mocked(dataSource.getRepository).mockImplementation((entity: any) => {
    const name = typeof entity === 'function' ? entity.name : entity;
    return repos[name] ?? makeRepo();
  });

  return repos;
}

function setupTransaction() {
  const mockManager = {
    save: vi.fn().mockImplementation((_entity: any, data: any) => {
      // Return saved entities with IDs
      if (Array.isArray(data)) {
        return Promise.resolve(
          data.map((d: any, i: number) => ({ ...d, id: d.id || i + 1 }))
        );
      }
      return Promise.resolve({ ...data, id: data.id || 1 });
    }),
  };

  vi.mocked(dataSource.transaction).mockImplementation(async (cb: any) =>
    cb(mockManager)
  );

  return mockManager;
}

function makeSettings(overrides: Record<string, any> = {}) {
  const defaults = {
    readarr: [],
    lidarr: [],
    ...overrides,
  };

  vi.mocked(Settings.getInstance).mockReturnValue(defaults as any);
  return defaults;
}

function makeReadarrServer(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    name: 'Readarr Default',
    hostname: 'readarr.local',
    port: 8787,
    apiKey: 'readarr-key',
    useSsl: false,
    baseUrl: '',
    ...overrides,
  };
}

function makeLidarrServer(overrides: Record<string, any> = {}) {
  return {
    id: 2,
    name: 'Lidarr Default',
    hostname: 'lidarr.local',
    port: 8686,
    apiKey: 'lidarr-key',
    useSsl: false,
    baseUrl: '',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('arrLibraryScan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBooks.mockResolvedValue([]);
    mockGetAuthors.mockResolvedValue([]);
    mockGetAlbums.mockResolvedValue([]);
  });

  // =========================================================================
  // Readarr
  // =========================================================================

  describe('readarr', () => {
    it('should skip when no readarr servers configured', async () => {
      makeSettings({ readarr: [] });
      await arrLibraryScan('readarr');
      expect(logger.debug).toHaveBeenCalledWith(
        'Arr library scan: no Readarr servers configured, skipping'
      );
    });

    it('should fetch books and authors and log counts', async () => {
      makeSettings({ readarr: [makeReadarrServer()] });
      const _repos = setupRepos();
      setupTransaction();

      mockGetBooks.mockResolvedValue([
        { foreignBookId: 'hc-1', title: 'Book 1', authorTitle: null },
      ]);
      mockGetAuthors.mockResolvedValue([
        { authorName: 'Author 1', foreignAuthorId: 'fa-1' },
      ]);

      await arrLibraryScan('readarr');

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('1 book(s) and 1 author(s)')
      );
    });

    it('should return early when API call fails', async () => {
      makeSettings({ readarr: [makeReadarrServer()] });
      setupRepos();

      mockGetBooks.mockRejectedValue(new Error('connection refused'));

      await arrLibraryScan('readarr');

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed to fetch data'),
        expect.any(Object)
      );
      // Should not attempt to process books
      expect(vi.mocked(dataSource.transaction)).not.toHaveBeenCalled();
    });

    it('should create new Work when foreignBookId is unknown', async () => {
      makeSettings({ readarr: [makeReadarrServer()] });
      const repos = setupRepos();
      const _mgr = setupTransaction();

      mockGetBooks.mockResolvedValue([
        { foreignBookId: 'hc-new', title: 'New Book', authorTitle: null },
      ]);
      mockGetAuthors.mockResolvedValue([]);

      await arrLibraryScan('readarr');

      expect(repos.Work.create).toHaveBeenCalledWith(
        expect.objectContaining({
          hardcoverId: 'hc-new',
          title: 'New Book',
          metadataSource: 'readarr',
        })
      );
    });

    it('should update Work title when metadataSource is readarr', async () => {
      makeSettings({ readarr: [makeReadarrServer()] });
      const repos = setupRepos();
      setupTransaction();

      const existingWork = {
        id: 1,
        hardcoverId: 'hc-1',
        title: 'Old Title',
        metadataSource: 'readarr',
      };

      repos.Work.find.mockResolvedValue([existingWork]);
      mockGetBooks.mockResolvedValue([
        { foreignBookId: 'hc-1', title: 'Updated Title', authorTitle: null },
      ]);
      mockGetAuthors.mockResolvedValue([]);

      await arrLibraryScan('readarr');

      expect(existingWork.title).toBe('Updated Title');
    });

    it('should NOT update Work title when metadataSource is hardcover', async () => {
      makeSettings({ readarr: [makeReadarrServer()] });
      const repos = setupRepos();
      setupTransaction();

      const existingWork = {
        id: 1,
        hardcoverId: 'hc-1',
        title: 'Hardcover Title',
        metadataSource: 'hardcover',
      };

      repos.Work.find.mockResolvedValue([existingWork]);
      mockGetBooks.mockResolvedValue([
        { foreignBookId: 'hc-1', title: 'Readarr Title', authorTitle: null },
      ]);
      mockGetAuthors.mockResolvedValue([]);

      await arrLibraryScan('readarr');

      expect(existingWork.title).toBe('Hardcover Title');
    });

    it('should skip book without foreignBookId', async () => {
      makeSettings({ readarr: [makeReadarrServer()] });
      setupRepos();
      setupTransaction();

      mockGetBooks.mockResolvedValue([
        { foreignBookId: undefined, title: 'No ID Book', authorTitle: null },
      ]);
      mockGetAuthors.mockResolvedValue([]);

      await arrLibraryScan('readarr');

      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('no foreignBookId')
      );
    });

    it('should create Author when foreignAuthorId is unknown', async () => {
      makeSettings({ readarr: [makeReadarrServer()] });
      const repos = setupRepos();
      setupTransaction();

      mockGetBooks.mockResolvedValue([
        { foreignBookId: 'hc-1', title: 'Book 1', authorTitle: 'Author One' },
      ]);
      mockGetAuthors.mockResolvedValue([
        { authorName: 'Author One', foreignAuthorId: 'fa-1' },
      ]);

      await arrLibraryScan('readarr');

      expect(repos.Author.create).toHaveBeenCalledWith(
        expect.objectContaining({
          hardcoverId: 'fa-1',
          name: 'Author One',
        })
      );
    });

    it('should link WorkAuthor via transaction', async () => {
      makeSettings({ readarr: [makeReadarrServer()] });
      const repos = setupRepos();
      const mgr = setupTransaction();

      mockGetBooks.mockResolvedValue([
        { foreignBookId: 'hc-1', title: 'Book 1', authorTitle: 'Author One' },
      ]);
      mockGetAuthors.mockResolvedValue([
        { authorName: 'Author One', foreignAuthorId: 'fa-1' },
      ]);

      // WorkAuthor find returns empty to show no existing links
      repos.WorkAuthor.find.mockResolvedValue([]);

      await arrLibraryScan('readarr');

      // Transaction should save WorkAuthor entities
      expect(mgr.save).toHaveBeenCalled();
    });

    it('should NOT create duplicate WorkAuthor', async () => {
      makeSettings({ readarr: [makeReadarrServer()] });
      const repos = setupRepos();
      const _mgr = setupTransaction();

      const existingWork = { id: 1, hardcoverId: 'hc-1', title: 'Book', metadataSource: 'readarr' };
      const existingAuthor = { id: 10, hardcoverId: 'fa-1', name: 'Author One' };

      repos.Work.find.mockResolvedValue([existingWork]);
      repos.Author.find.mockResolvedValue([existingAuthor]);
      repos.WorkAuthor.find.mockResolvedValue([
        { work: { id: 1 }, author: { id: 10 } },
      ]);

      mockGetBooks.mockResolvedValue([
        { foreignBookId: 'hc-1', title: 'Book', authorTitle: 'Author One' },
      ]);
      mockGetAuthors.mockResolvedValue([
        { authorName: 'Author One', foreignAuthorId: 'fa-1' },
      ]);

      await arrLibraryScan('readarr');

      // WorkAuthor.create should not be called since link already exists
      expect(repos.WorkAuthor.create).not.toHaveBeenCalled();
    });

    it('should catch per-book error and continue', async () => {
      makeSettings({ readarr: [makeReadarrServer()] });
      const repos = setupRepos();
      setupTransaction();

      // Make work.find throw on first call to simulate error in processing
      repos.Work.find.mockResolvedValue([]);

      mockGetBooks.mockResolvedValue([
        { foreignBookId: 'hc-1', title: 'Book 1', authorTitle: null },
        { foreignBookId: 'hc-2', title: 'Book 2', authorTitle: null },
      ]);
      mockGetAuthors.mockResolvedValue([]);

      // Make create throw for first book
      let callCount = 0;
      repos.Work.create.mockImplementation((data: any) => {
        callCount++;
        if (callCount === 1) throw new Error('creation error');
        return { ...data };
      });

      await arrLibraryScan('readarr');

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('error processing Readarr book'),
        expect.any(Object)
      );
      // Second book should still be created
      expect(repos.Work.create).toHaveBeenCalledTimes(2);
    });

    it('should catch per-server error and continue', async () => {
      const server1 = makeReadarrServer({ id: 1, name: 'Server 1' });
      const server2 = makeReadarrServer({ id: 2, name: 'Server 2' });
      makeSettings({ readarr: [server1, server2] });
      const _repos = setupRepos();
      setupTransaction();

      // First server throws during API call setup
      mockGetBooks
        .mockRejectedValueOnce(new Error('server 1 error'))
        .mockResolvedValueOnce([]);
      mockGetAuthors
        .mockRejectedValueOnce(new Error('server 1 error'))
        .mockResolvedValueOnce([]);

      await arrLibraryScan('readarr');

      // Should log error for server 1 but still process server 2
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed to fetch data'),
        expect.any(Object)
      );
    });

    it('should not update when title is unchanged', async () => {
      makeSettings({ readarr: [makeReadarrServer()] });
      const repos = setupRepos();
      setupTransaction();

      const existingWork = {
        id: 1,
        hardcoverId: 'hc-1',
        title: 'Same Title',
        metadataSource: 'readarr',
      };

      repos.Work.find.mockResolvedValue([existingWork]);
      mockGetBooks.mockResolvedValue([
        { foreignBookId: 'hc-1', title: 'Same Title', authorTitle: null },
      ]);
      mockGetAuthors.mockResolvedValue([]);

      await arrLibraryScan('readarr');

      // The title stays the same, no update push to worksToSave
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('0 created, 0 updated')
      );
    });
  });

  // =========================================================================
  // Lidarr
  // =========================================================================

  describe('lidarr', () => {
    it('should skip when no lidarr servers configured', async () => {
      makeSettings({ lidarr: [] });
      await arrLibraryScan('lidarr');
      expect(logger.debug).toHaveBeenCalledWith(
        'Arr library scan: no Lidarr servers configured, skipping'
      );
    });

    it('should fetch albums and log count', async () => {
      makeSettings({ lidarr: [makeLidarrServer()] });
      const _repos = setupRepos();

      mockGetAlbums.mockResolvedValue([
        {
          id: 1,
          foreignAlbumId: 'mb-1',
          title: 'Album 1',
          artist: { artistName: 'Artist 1', foreignArtistId: 'fa-1' },
        },
      ]);

      await arrLibraryScan('lidarr');

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('1 album(s)')
      );
    });

    it('should return early when API call fails', async () => {
      makeSettings({ lidarr: [makeLidarrServer()] });
      setupRepos();

      mockGetAlbums.mockRejectedValue(new Error('lidarr down'));

      await arrLibraryScan('lidarr');

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed to fetch data from Lidarr'),
        expect.any(Object)
      );
    });

    it('should create new MusicAlbum when foreignAlbumId is unknown', async () => {
      makeSettings({ lidarr: [makeLidarrServer()] });
      const repos = setupRepos();
      setupTransaction();

      mockGetAlbums.mockResolvedValue([
        {
          id: 100,
          foreignAlbumId: 'mb-new',
          title: 'New Album',
          artist: { artistName: 'Artist X', foreignArtistId: 'fa-x' },
          added: '2024-01-01',
        },
      ]);

      await arrLibraryScan('lidarr');

      expect(repos.MusicAlbum.create).toHaveBeenCalledWith(
        expect.objectContaining({
          musicBrainzId: 'mb-new',
          foreignAlbumId: 'mb-new',
          title: 'New Album',
          artistName: 'Artist X',
          artistForeignId: 'fa-x',
        })
      );
    });

    it('should update album fields when changed', async () => {
      makeSettings({ lidarr: [makeLidarrServer()] });
      const repos = setupRepos();
      setupTransaction();

      const existingAlbum = {
        id: 1,
        musicBrainzId: 'mb-1',
        title: 'Old Album Title',
        artistName: 'Artist 1',
        artistForeignId: 'fa-1',
        foreignAlbumId: 'mb-1',
        serviceId: 2,
        externalServiceId: 100,
      };

      repos.MusicAlbum.find.mockResolvedValue([existingAlbum]);

      mockGetAlbums.mockResolvedValue([
        {
          id: 100,
          foreignAlbumId: 'mb-1',
          title: 'Updated Album Title',
          artist: { artistName: 'Artist 1', foreignArtistId: 'fa-1' },
        },
      ]);

      await arrLibraryScan('lidarr');

      expect(existingAlbum.title).toBe('Updated Album Title');
    });

    it('should NOT save when nothing changed', async () => {
      makeSettings({ lidarr: [makeLidarrServer()] });
      const repos = setupRepos();

      const existingAlbum = {
        id: 1,
        musicBrainzId: 'mb-1',
        title: 'Same Title',
        artistName: 'Artist 1',
        artistForeignId: 'fa-1',
        foreignAlbumId: 'mb-1',
        serviceId: 2,
        externalServiceId: 100,
      };

      repos.MusicAlbum.find.mockResolvedValue([existingAlbum]);

      mockGetAlbums.mockResolvedValue([
        {
          id: 100,
          foreignAlbumId: 'mb-1',
          title: 'Same Title',
          artist: { artistName: 'Artist 1', foreignArtistId: 'fa-1' },
        },
      ]);

      await arrLibraryScan('lidarr');

      // Transaction should not be called since no albumsToSave
      expect(vi.mocked(dataSource.transaction)).not.toHaveBeenCalled();
    });

    it('should skip album without foreignAlbumId', async () => {
      makeSettings({ lidarr: [makeLidarrServer()] });
      setupRepos();

      mockGetAlbums.mockResolvedValue([
        { id: 1, foreignAlbumId: undefined, title: 'No ID Album' },
      ]);

      await arrLibraryScan('lidarr');

      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('no foreignAlbumId')
      );
    });

    it('should batch save in transaction', async () => {
      makeSettings({ lidarr: [makeLidarrServer()] });
      const _repos = setupRepos();
      const mgr = setupTransaction();

      mockGetAlbums.mockResolvedValue([
        {
          id: 1,
          foreignAlbumId: 'mb-1',
          title: 'Album 1',
          artist: { artistName: 'A1', foreignArtistId: 'fa-1' },
        },
        {
          id: 2,
          foreignAlbumId: 'mb-2',
          title: 'Album 2',
          artist: { artistName: 'A2', foreignArtistId: 'fa-2' },
        },
      ]);

      await arrLibraryScan('lidarr');

      expect(vi.mocked(dataSource.transaction)).toHaveBeenCalled();
      expect(mgr.save).toHaveBeenCalled();
    });

    it('should catch per-album error and continue', async () => {
      makeSettings({ lidarr: [makeLidarrServer()] });
      const repos = setupRepos();
      setupTransaction();

      mockGetAlbums.mockResolvedValue([
        { id: 1, foreignAlbumId: 'mb-1', title: 'Album 1' },
        { id: 2, foreignAlbumId: 'mb-2', title: 'Album 2' },
      ]);

      let callCount = 0;
      repos.MusicAlbum.create.mockImplementation((data: any) => {
        callCount++;
        if (callCount === 1) throw new Error('album error');
        return { ...data };
      });

      await arrLibraryScan('lidarr');

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('error processing Lidarr album'),
        expect.any(Object)
      );
    });

    it('should catch per-server error and continue', async () => {
      const server1 = makeLidarrServer({ id: 1, name: 'Lidarr 1' });
      const server2 = makeLidarrServer({ id: 2, name: 'Lidarr 2' });
      makeSettings({ lidarr: [server1, server2] });
      setupRepos();

      mockGetAlbums
        .mockRejectedValueOnce(new Error('server 1 down'))
        .mockResolvedValueOnce([]);

      await arrLibraryScan('lidarr');

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed to fetch data from Lidarr'),
        expect.any(Object)
      );
    });

    it('should fill missing artistName when album already exists', async () => {
      makeSettings({ lidarr: [makeLidarrServer()] });
      const repos = setupRepos();
      setupTransaction();

      const existingAlbum = {
        id: 1,
        musicBrainzId: 'mb-1',
        title: 'Album',
        artistName: undefined as string | undefined,
        artistForeignId: undefined as string | undefined,
        foreignAlbumId: 'mb-1',
        serviceId: 2,
        externalServiceId: 100,
      };

      repos.MusicAlbum.find.mockResolvedValue([existingAlbum]);

      mockGetAlbums.mockResolvedValue([
        {
          id: 100,
          foreignAlbumId: 'mb-1',
          title: 'Album',
          artist: { artistName: 'New Artist', foreignArtistId: 'new-fa' },
        },
      ]);

      await arrLibraryScan('lidarr');

      expect(existingAlbum.artistName).toBe('New Artist');
      expect(existingAlbum.artistForeignId).toBe('new-fa');
    });
  });
});
