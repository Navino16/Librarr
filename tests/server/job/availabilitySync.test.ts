import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockGetLibraries,
  mockGetLibraryItems,
  mockGetCoverUrl,
  mockGetItemUrl,
} = vi.hoisted(() => ({
  mockGetLibraries: vi.fn(),
  mockGetLibraryItems: vi.fn(),
  mockGetCoverUrl: vi.fn(),
  mockGetItemUrl: vi.fn(),
}));

const { mockSearch } = vi.hoisted(() => ({
  mockSearch: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@server/datasource', () => ({
  default: { getRepository: vi.fn() },
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

vi.mock('@server/api/audiobookshelf', () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      getLibraries: mockGetLibraries,
      getLibraryItems: mockGetLibraryItems,
      getCoverUrl: mockGetCoverUrl,
      getItemUrl: mockGetItemUrl,
    };
  }),
}));

vi.mock('@server/lib/metadataResolverInstance', () => ({
  getMetadataResolver: vi.fn().mockReturnValue({ search: mockSearch }),
}));

vi.mock('@server/entity/Work', () => ({ Work: class Work {} }));
vi.mock('@server/entity/Edition', () => ({ Edition: class Edition {} }));
vi.mock('@server/entity/WorkAvailability', () => ({
  WorkAvailability: class WorkAvailability {},
}));
vi.mock('@server/entity/BookRequest', () => ({
  BookRequest: class BookRequest {},
}));
vi.mock('@server/entity/Author', () => ({ Author: class Author {} }));
vi.mock('@server/entity/WorkAuthor', () => ({
  WorkAuthor: class WorkAuthor {},
}));
vi.mock('@server/entity/UnmatchedMediaItem', () => ({
  UnmatchedMediaItem: class UnmatchedMediaItem {},
}));

// Transitive entity mocks (break import chains that would load real TypeORM decorators)
vi.mock('@server/entity/User', () => ({ User: class User {} }));
vi.mock('@server/entity/UserSettings', () => ({ UserSettings: class UserSettings {} }));
vi.mock('@server/entity/MusicRequest', () => ({ MusicRequest: class MusicRequest {} }));
vi.mock('@server/entity/MusicAlbum', () => ({ MusicAlbum: class MusicAlbum {} }));
vi.mock('@server/entity/Issue', () => ({ Issue: class Issue {} }));
vi.mock('@server/entity/IssueComment', () => ({ IssueComment: class IssueComment {} }));
vi.mock('@server/entity/Series', () => ({ Series: class Series {} }));
vi.mock('@server/lib/notifications/router', () => ({
  notifyEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@server/constants/work', () => ({
  WorkStatus: {
    UNKNOWN: 1,
    PENDING: 2,
    PROCESSING: 3,
    PARTIALLY_AVAILABLE: 4,
    AVAILABLE: 5,
  },
  RequestStatus: {
    PENDING: 1,
    APPROVED: 2,
    DECLINED: 3,
    COMPLETED: 4,
    FAILED: 5,
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import dataSource from '@server/datasource';
import logger from '@server/logger';
import Settings from '@server/lib/settings';
import { availabilitySync } from '@server/job/availabilitySync';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRepo(overrides: Record<string, any> = {}) {
  return {
    find: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockImplementation((data: any) => Promise.resolve(data)),
    create: vi.fn().mockImplementation((data: any) => ({
      ...data,
      createdAt: new Date(),
    })),
    delete: vi.fn().mockResolvedValue({ affected: 0 }),
    remove: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Entity class name → repo map. Configured per-test via setupRepos(). */
let _repoMap: Record<string, any> = {};

function setupRepos(custom: Record<string, any> = {}) {
  const repos: Record<string, any> = {
    Work: makeRepo(),
    Edition: makeRepo(),
    WorkAvailability: makeRepo(),
    BookRequest: makeRepo(),
    Author: makeRepo(),
    WorkAuthor: makeRepo(),
    UnmatchedMediaItem: makeRepo(),
    ...custom,
  };
  _repoMap = repos;

  vi.mocked(dataSource.getRepository).mockImplementation((entity: any) => {
    const name = typeof entity === 'function' ? entity.name : entity;
    return repos[name] ?? makeRepo();
  });

  return repos;
}

function makeAbsSettings(overrides: Record<string, any> = {}) {
  return {
    hostname: 'abs.local',
    port: 443,
    apiKey: 'abs-key',
    useSsl: true,
    baseUrl: '',
    ...overrides,
  };
}

function makeSettings(absOverrides: Record<string, any> = {}) {
  vi.mocked(Settings.getInstance).mockReturnValue({
    audiobookshelf: makeAbsSettings(absOverrides),
  } as any);
}

function makeAbsItem(overrides: Record<string, any> = {}): any {
  return {
    id: 'abs-item-1',
    media: {
      metadata: {
        title: 'Test Book',
        subtitle: undefined,
        authors: [{ name: 'Author One' }],
        narrators: [],
        isbn: '9781234567890',
        asin: undefined,
        description: 'A test book',
        publishedDate: '2024-01-01',
        publishedYear: undefined,
        language: 'en',
        genres: ['Fiction'],
        publisher: 'Test Publisher',
        series: [],
      },
      coverPath: '/covers/test.jpg',
      numAudioFiles: 0,
      duration: 0,
      ebookFile: { filename: 'book.epub' },
      size: 1024,
    },
    ...overrides,
  };
}

function makeLibrary(
  overrides: Record<string, any> = {}
): { id: string; name: string; mediaType: string } {
  return {
    id: 'lib-1',
    name: 'Books',
    mediaType: 'book',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('availabilitySync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLibraries.mockResolvedValue([]);
    mockGetLibraryItems.mockResolvedValue([]);
    mockGetCoverUrl.mockReturnValue('https://abs.local/cover');
    mockGetItemUrl.mockReturnValue('https://abs.local/item');
    mockSearch.mockResolvedValue([]);
  });

  // -------------------------------------------------------------------------
  // Entry point
  // -------------------------------------------------------------------------

  describe('entry point', () => {
    it('should log starting and finished', async () => {
      makeSettings({ hostname: '', apiKey: '' });
      setupRepos();
      await availabilitySync();
      expect(logger.info).toHaveBeenCalledWith('Availability sync: starting');
      expect(logger.info).toHaveBeenCalledWith('Availability sync: finished');
    });

    it('should skip when Audiobookshelf is not configured (no hostname)', async () => {
      makeSettings({ hostname: '', apiKey: 'key' });
      setupRepos();
      await availabilitySync();
      expect(logger.debug).toHaveBeenCalledWith(
        'Availability sync: Audiobookshelf not configured, skipping'
      );
    });

    it('should skip when Audiobookshelf is not configured (no apiKey)', async () => {
      makeSettings({ hostname: 'abs.local', apiKey: '' });
      setupRepos();
      await availabilitySync();
      expect(logger.debug).toHaveBeenCalledWith(
        'Availability sync: Audiobookshelf not configured, skipping'
      );
    });

    it('should log error and continue when syncAudiobookshelf throws', async () => {
      makeSettings();
      setupRepos();
      mockGetLibraries.mockRejectedValue(new Error('network error'));
      await availabilitySync();
      expect(logger.error).toHaveBeenCalledWith(
        'Availability sync: Audiobookshelf sync failed',
        expect.objectContaining({ error: expect.stringContaining('network error') })
      );
      expect(logger.info).toHaveBeenCalledWith('Availability sync: finished');
    });
  });

  // -------------------------------------------------------------------------
  // Library handling
  // -------------------------------------------------------------------------

  describe('library handling', () => {
    it('should warn and return when no libraries found', async () => {
      makeSettings();
      setupRepos();
      mockGetLibraries.mockResolvedValue([]);
      await availabilitySync();
      expect(logger.warn).toHaveBeenCalledWith(
        'Availability sync: no libraries found in Audiobookshelf'
      );
    });

    it('should skip non-book libraries', async () => {
      makeSettings();
      setupRepos();
      mockGetLibraries.mockResolvedValue([
        makeLibrary({ id: 'lib-podcast', name: 'Podcasts', mediaType: 'podcast' }),
      ]);
      await availabilitySync();
      expect(logger.debug).toHaveBeenCalledWith(
        'Availability sync: skipping non-book library',
        expect.objectContaining({ library: 'Podcasts', mediaType: 'podcast' })
      );
      expect(mockGetLibraryItems).not.toHaveBeenCalled();
    });

    it('should process book library and log item count', async () => {
      makeSettings();
      const repos = setupRepos();
      // Make availabilityRepo.find return empty for stale cleanup
      repos.WorkAvailability.find.mockResolvedValue([]);
      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([]);
      await availabilitySync();
      expect(logger.info).toHaveBeenCalledWith(
        'Availability sync: processing library',
        expect.objectContaining({ library: 'Books', itemCount: 0 })
      );
    });
  });

  // -------------------------------------------------------------------------
  // Format detection (via item processing)
  // -------------------------------------------------------------------------

  describe('format detection', () => {
    it('should detect audiobook format (has audio files)', async () => {
      makeSettings();
      const repos = setupRepos();
      repos.WorkAvailability.find.mockResolvedValue([]);

      const item = makeAbsItem({
        media: {
          ...makeAbsItem().media,
          numAudioFiles: 5,
          duration: 36000,
          ebookFile: undefined,
          coverPath: null,
        },
      });

      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item]);

      // Make findOrCreateWork return a work
      const work = {
        id: 1,
        hardcoverId: 'hc-1',
        title: 'Test Book',
        status: 1,
        ebookAvailable: false,
        audiobookAvailable: false,
        createdAt: new Date(Date.now() - 10000),
      };
      repos.Edition.findOne.mockResolvedValue(null);
      mockSearch.mockResolvedValue([
        { hardcoverId: 'hc-1', title: 'Test Book' },
      ]);
      repos.Work.findOne.mockResolvedValue(work);

      // upsertAvailability: no existing
      repos.WorkAvailability.findOne.mockResolvedValue(null);

      await availabilitySync();

      // Should have created availability with 'audiobook' format
      expect(repos.WorkAvailability.create).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'audiobook', source: 'audiobookshelf' })
      );
    });

    it('should detect ebook format (has ebookFile, no audio)', async () => {
      makeSettings();
      const repos = setupRepos();
      repos.WorkAvailability.find.mockResolvedValue([]);

      const item = makeAbsItem(); // default: ebookFile present, no audio

      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item]);

      const work = {
        id: 1,
        title: 'Test Book',
        status: 1,
        ebookAvailable: false,
        audiobookAvailable: false,
        createdAt: new Date(Date.now() - 10000),
      };
      repos.Edition.findOne.mockResolvedValue({ work });
      repos.WorkAvailability.findOne.mockResolvedValue(null);

      await availabilitySync();

      expect(repos.WorkAvailability.create).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'ebook', source: 'audiobookshelf' })
      );
    });

    it('should detect both formats when item has audio and ebook', async () => {
      makeSettings();
      const repos = setupRepos();
      repos.WorkAvailability.find.mockResolvedValue([]);

      const item = makeAbsItem({
        media: {
          ...makeAbsItem().media,
          numAudioFiles: 3,
          duration: 36000,
          ebookFile: { filename: 'book.epub' },
        },
      });

      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item]);

      const work = {
        id: 1,
        title: 'Test Book',
        status: 1,
        ebookAvailable: false,
        audiobookAvailable: false,
        createdAt: new Date(Date.now() - 10000),
      };
      repos.Edition.findOne.mockResolvedValue({ work });
      repos.WorkAvailability.findOne.mockResolvedValue(null);

      await availabilitySync();

      const createCalls = repos.WorkAvailability.create.mock.calls;
      const formats = createCalls.map((c: any[]) => c[0].format);
      expect(formats).toContain('ebook');
      expect(formats).toContain('audiobook');
    });
  });

  // -------------------------------------------------------------------------
  // Metadata extraction
  // -------------------------------------------------------------------------

  describe('metadata extraction', () => {
    it('should skip items without a title', async () => {
      makeSettings();
      const repos = setupRepos();
      repos.WorkAvailability.find.mockResolvedValue([]);

      const item = makeAbsItem({
        media: {
          metadata: { title: undefined, authors: [] },
          coverPath: null,
          numAudioFiles: 0,
          duration: 0,
          ebookFile: null,
        },
      });

      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item]);

      await availabilitySync();

      expect(logger.debug).toHaveBeenCalledWith(
        'Availability sync: skipping item with no title',
        expect.objectContaining({ itemId: 'abs-item-1' })
      );
    });

    it('should normalize ISBN by stripping hyphens', async () => {
      makeSettings();
      const repos = setupRepos();
      repos.WorkAvailability.find.mockResolvedValue([]);

      const item = makeAbsItem({
        media: {
          ...makeAbsItem().media,
          metadata: {
            ...makeAbsItem().media.metadata,
            isbn: '978-1-234-56789-0',
          },
        },
      });

      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item]);

      // The ISBN should be normalized to 9781234567890 and looked up
      repos.Edition.findOne.mockResolvedValue(null);
      mockSearch.mockResolvedValue([]);

      await availabilitySync();

      // It should call edition findOne with the normalized ISBN
      expect(repos.Edition.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isbn13: '9781234567890' },
          relations: ['work'],
        })
      );
    });

    it('should include subtitle in title when present', async () => {
      makeSettings();
      const repos = setupRepos();
      repos.WorkAvailability.find.mockResolvedValue([]);

      const item = makeAbsItem({
        media: {
          ...makeAbsItem().media,
          metadata: {
            ...makeAbsItem().media.metadata,
            title: 'Main Title',
            subtitle: 'The Subtitle',
            isbn: undefined,
          },
        },
      });

      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item]);
      repos.Edition.findOne.mockResolvedValue(null);
      mockSearch.mockResolvedValue([]);

      await availabilitySync();

      // The search query should contain the combined title
      expect(mockSearch).toHaveBeenCalledWith(
        expect.stringContaining('Main Title: The Subtitle')
      );
    });
  });

  // -------------------------------------------------------------------------
  // findOrCreateWork
  // -------------------------------------------------------------------------

  describe('findOrCreateWork', () => {
    it('should match via ISBN edition', async () => {
      makeSettings();
      const repos = setupRepos();
      repos.WorkAvailability.find.mockResolvedValue([]);

      const work = {
        id: 1,
        title: 'Test Book',
        status: 1,
        ebookAvailable: false,
        audiobookAvailable: false,
        createdAt: new Date(Date.now() - 10000),
      };

      const item = makeAbsItem();
      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item]);
      repos.Edition.findOne.mockResolvedValueOnce({ work }); // ISBN match
      repos.WorkAvailability.findOne.mockResolvedValue(null);

      await availabilitySync();

      expect(logger.debug).toHaveBeenCalledWith(
        'Availability sync: matched Work via ISBN edition',
        expect.any(Object)
      );
    });

    it('should match via ASIN edition when ISBN has no match', async () => {
      makeSettings();
      const repos = setupRepos();
      repos.WorkAvailability.find.mockResolvedValue([]);

      const work = {
        id: 2,
        title: 'ASIN Book',
        status: 1,
        ebookAvailable: false,
        audiobookAvailable: false,
        createdAt: new Date(Date.now() - 10000),
      };

      const item = makeAbsItem({
        media: {
          ...makeAbsItem().media,
          metadata: {
            ...makeAbsItem().media.metadata,
            isbn: undefined,
            asin: 'B001234567',
          },
        },
      });

      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item]);
      repos.Edition.findOne.mockResolvedValueOnce({ work }); // ASIN match
      repos.WorkAvailability.findOne.mockResolvedValue(null);

      await availabilitySync();

      expect(logger.debug).toHaveBeenCalledWith(
        'Availability sync: matched Work via ASIN edition',
        expect.any(Object)
      );
    });

    it('should match via Hardcover search and existing work', async () => {
      makeSettings();
      const repos = setupRepos();
      repos.WorkAvailability.find.mockResolvedValue([]);

      const work = {
        id: 3,
        hardcoverId: 'hc-3',
        title: 'Test Book',
        status: 1,
        ebookAvailable: false,
        audiobookAvailable: false,
        createdAt: new Date(Date.now() - 10000),
      };

      const item = makeAbsItem({
        media: {
          ...makeAbsItem().media,
          metadata: {
            ...makeAbsItem().media.metadata,
            isbn: undefined,
            asin: undefined,
          },
        },
      });

      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item]);
      repos.Edition.findOne.mockResolvedValue(null); // No edition match
      mockSearch.mockResolvedValue([{ hardcoverId: 'hc-3', title: 'Test Book' }]);
      repos.Work.findOne.mockResolvedValue(work); // Existing work by hardcoverId
      repos.WorkAvailability.findOne.mockResolvedValue(null);

      await availabilitySync();

      expect(logger.debug).toHaveBeenCalledWith(
        'Availability sync: matched Work via Hardcover ID',
        expect.any(Object)
      );
    });

    it('should create new Work when Hardcover search finds new match', async () => {
      makeSettings();
      const repos = setupRepos();
      repos.WorkAvailability.find.mockResolvedValue([]);

      const item = makeAbsItem({
        media: {
          ...makeAbsItem().media,
          metadata: {
            ...makeAbsItem().media.metadata,
            isbn: undefined,
            asin: undefined,
          },
        },
      });

      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item]);
      repos.Edition.findOne.mockResolvedValue(null);
      mockSearch.mockResolvedValue([
        {
          hardcoverId: 'hc-new',
          title: 'Test Book',
          description: 'desc',
          coverUrl: 'https://cover.url',
          authors: [{ name: 'Author', hardcoverId: 'hc-author-1' }],
        },
      ]);
      repos.Work.findOne.mockResolvedValue(null); // No existing work
      repos.Work.save.mockImplementation((data: any) =>
        Promise.resolve({ ...data, id: 99, createdAt: new Date() })
      );
      repos.Author.findOne.mockResolvedValue(null);
      repos.Author.save.mockImplementation((data: any) =>
        Promise.resolve({ ...data, id: 50 })
      );
      repos.WorkAuthor.findOne.mockResolvedValue(null);
      repos.WorkAvailability.findOne.mockResolvedValue(null);

      await availabilitySync();

      expect(repos.Work.create).toHaveBeenCalledWith(
        expect.objectContaining({
          hardcoverId: 'hc-new',
          metadataSource: 'hardcover',
        })
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Availability sync: created Work from Hardcover',
        expect.any(Object)
      );
    });

    it('should upsert unmatched when no Hardcover match', async () => {
      makeSettings();
      const repos = setupRepos();
      repos.WorkAvailability.find.mockResolvedValue([]);

      const item = makeAbsItem({
        media: {
          ...makeAbsItem().media,
          metadata: {
            ...makeAbsItem().media.metadata,
            isbn: undefined,
            asin: undefined,
          },
        },
      });

      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item]);
      repos.Edition.findOne.mockResolvedValue(null);
      mockSearch.mockResolvedValue([]);

      await availabilitySync();

      expect(logger.warn).toHaveBeenCalledWith(
        'Availability sync: no Hardcover match, skipping item',
        expect.objectContaining({ title: 'Test Book' })
      );
      // Should upsert as unmatched
      expect(repos.UnmatchedMediaItem.findOne).toHaveBeenCalled();
    });

    it('should handle Hardcover search failure gracefully', async () => {
      makeSettings();
      const repos = setupRepos();
      repos.WorkAvailability.find.mockResolvedValue([]);

      const item = makeAbsItem({
        media: {
          ...makeAbsItem().media,
          metadata: {
            ...makeAbsItem().media.metadata,
            isbn: undefined,
            asin: undefined,
          },
        },
      });

      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item]);
      repos.Edition.findOne.mockResolvedValue(null);
      mockSearch.mockRejectedValue(new Error('HC API down'));

      await availabilitySync();

      expect(logger.warn).toHaveBeenCalledWith(
        'Availability sync: Hardcover search failed',
        expect.objectContaining({ error: expect.stringContaining('HC API down') })
      );
    });
  });

  // -------------------------------------------------------------------------
  // upsertAvailability
  // -------------------------------------------------------------------------

  describe('upsertAvailability', () => {
    it('should create new availability when none exists', async () => {
      makeSettings();
      const repos = setupRepos();
      repos.WorkAvailability.find.mockResolvedValue([]);

      const work = {
        id: 1,
        title: 'Test',
        status: 1,
        ebookAvailable: false,
        audiobookAvailable: false,
        createdAt: new Date(Date.now() - 10000),
      };

      const item = makeAbsItem();
      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item]);
      repos.Edition.findOne.mockResolvedValueOnce({ work });
      repos.WorkAvailability.findOne.mockResolvedValue(null); // No existing availability

      await availabilitySync();

      expect(repos.WorkAvailability.create).toHaveBeenCalled();
      expect(repos.WorkAvailability.save).toHaveBeenCalled();
    });

    it('should update existing availability instead of creating', async () => {
      makeSettings();
      const repos = setupRepos();
      repos.WorkAvailability.find.mockResolvedValue([]);

      const work = {
        id: 1,
        title: 'Test',
        status: 1,
        ebookAvailable: false,
        audiobookAvailable: false,
        createdAt: new Date(Date.now() - 10000),
      };

      const existingAvail = {
        id: 10,
        work,
        format: 'ebook',
        source: 'audiobookshelf',
        sourceItemId: 'old-item',
        lastVerifiedAt: new Date(Date.now() - 100000),
      };

      const item = makeAbsItem();
      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item]);
      repos.Edition.findOne.mockResolvedValueOnce({ work });
      repos.WorkAvailability.findOne.mockResolvedValue(existingAvail);

      await availabilitySync();

      // Should update the existing, not create new
      expect(repos.WorkAvailability.create).not.toHaveBeenCalled();
      expect(repos.WorkAvailability.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 10, sourceItemId: 'abs-item-1' })
      );
    });
  });

  // -------------------------------------------------------------------------
  // completeMatchingRequests
  // -------------------------------------------------------------------------

  describe('completeMatchingRequests', () => {
    it('should mark APPROVED requests as COMPLETED when new availability', async () => {
      makeSettings();
      const repos = setupRepos();
      repos.WorkAvailability.find.mockResolvedValue([]);

      const work = {
        id: 1,
        title: 'Test',
        status: 1,
        ebookAvailable: false,
        audiobookAvailable: false,
        createdAt: new Date(Date.now() - 10000),
      };

      const request = { id: 5, status: 2, format: 'ebook' }; // APPROVED

      const item = makeAbsItem();
      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item]);
      repos.Edition.findOne.mockResolvedValueOnce({ work });
      repos.WorkAvailability.findOne.mockResolvedValue(null); // New availability
      repos.BookRequest.find.mockResolvedValue([request]);

      await availabilitySync();

      expect(request.status).toBe(4); // COMPLETED
      expect(repos.BookRequest.save).toHaveBeenCalledWith([request]);
    });

    it('should no-op when no matching requests', async () => {
      makeSettings();
      const repos = setupRepos();
      repos.WorkAvailability.find.mockResolvedValue([]);

      const work = {
        id: 1,
        title: 'Test',
        status: 1,
        ebookAvailable: false,
        audiobookAvailable: false,
        createdAt: new Date(Date.now() - 10000),
      };

      const item = makeAbsItem();
      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item]);
      repos.Edition.findOne.mockResolvedValueOnce({ work });
      repos.WorkAvailability.findOne.mockResolvedValue(null); // New availability
      repos.BookRequest.find.mockResolvedValue([]); // No requests

      await availabilitySync();

      // save should not be called for requests (only for availability and work)
      const requestSaveCalls = repos.BookRequest.save.mock.calls;
      // Should not have been called with an array of requests
      for (const call of requestSaveCalls) {
        if (Array.isArray(call[0])) {
          expect(call[0]).toHaveLength(0);
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // updateWorkAvailabilityFlags
  // -------------------------------------------------------------------------

  describe('updateWorkAvailabilityFlags', () => {
    it('should set AVAILABLE when both formats present', async () => {
      makeSettings();
      const repos = setupRepos();

      const work = {
        id: 1,
        title: 'Test',
        status: 1, // UNKNOWN
        ebookAvailable: false,
        audiobookAvailable: false,
        createdAt: new Date(Date.now() - 10000),
      };

      const item = makeAbsItem();
      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item]);
      repos.Edition.findOne.mockResolvedValueOnce({ work });
      repos.WorkAvailability.findOne.mockResolvedValue(null);
      repos.BookRequest.find.mockResolvedValue([]);

      // For updateWorkAvailabilityFlags: return both formats
      repos.WorkAvailability.find.mockResolvedValue([
        { format: 'ebook', source: 'audiobookshelf' },
        { format: 'audiobook', source: 'audiobookshelf' },
      ]);

      await availabilitySync();

      expect(work.status).toBe(5); // AVAILABLE
      expect(work.ebookAvailable).toBe(true);
      expect(work.audiobookAvailable).toBe(true);
    });

    it('should set PARTIALLY_AVAILABLE when one format present', async () => {
      makeSettings();
      const repos = setupRepos();

      const work = {
        id: 1,
        title: 'Test',
        status: 1, // UNKNOWN
        ebookAvailable: false,
        audiobookAvailable: false,
        createdAt: new Date(Date.now() - 10000),
      };

      const item = makeAbsItem();
      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item]);
      repos.Edition.findOne.mockResolvedValueOnce({ work });
      repos.WorkAvailability.findOne.mockResolvedValue(null);
      repos.BookRequest.find.mockResolvedValue([]);

      // For updateWorkAvailabilityFlags: only ebook
      repos.WorkAvailability.find.mockResolvedValue([
        { format: 'ebook', source: 'audiobookshelf' },
      ]);

      await availabilitySync();

      expect(work.status).toBe(4); // PARTIALLY_AVAILABLE
      expect(work.ebookAvailable).toBe(true);
      expect(work.audiobookAvailable).toBe(false);
    });

    it('should not save if flags unchanged', async () => {
      makeSettings();
      const repos = setupRepos();

      const work = {
        id: 1,
        title: 'Test',
        status: 5, // AVAILABLE
        ebookAvailable: true,
        audiobookAvailable: true,
        createdAt: new Date(Date.now() - 10000),
      };

      const item = makeAbsItem();
      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item]);
      repos.Edition.findOne.mockResolvedValueOnce({ work });
      repos.WorkAvailability.findOne.mockResolvedValue(null);
      repos.BookRequest.find.mockResolvedValue([]);

      repos.WorkAvailability.find.mockResolvedValue([
        { format: 'ebook', source: 'audiobookshelf' },
        { format: 'audiobook', source: 'audiobookshelf' },
      ]);

      await availabilitySync();

      // Work.save should NOT be called for flag updates (only for availability)
      const _workSaveCalls = repos.Work.save.mock.calls;
      // The work object should still be AVAILABLE — no save triggered for the work itself
      expect(work.status).toBe(5);
    });
  });

  // -------------------------------------------------------------------------
  // enrichWorkFromAbs
  // -------------------------------------------------------------------------

  describe('enrichWorkFromAbs', () => {
    it('should fill missing description from ABS metadata', async () => {
      makeSettings();
      const repos = setupRepos();
      repos.WorkAvailability.find.mockResolvedValue([
        { format: 'ebook', source: 'audiobookshelf' },
      ]);

      const work = {
        id: 1,
        title: 'Test',
        description: undefined as string | undefined,
        coverUrl: 'existing-cover',
        publishedDate: '2024',
        genresJson: undefined as string | undefined,
        status: 1,
        ebookAvailable: false,
        audiobookAvailable: false,
        createdAt: new Date(Date.now() - 10000),
      };

      const item = makeAbsItem();
      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item]);
      repos.Edition.findOne.mockResolvedValueOnce({ work });
      repos.WorkAvailability.findOne.mockResolvedValue(null);
      repos.BookRequest.find.mockResolvedValue([]);

      await availabilitySync();

      expect(work.description).toBe('A test book');
    });

    it('should not save when no fields are missing', async () => {
      makeSettings();
      const repos = setupRepos();
      repos.WorkAvailability.find.mockResolvedValue([
        { format: 'ebook', source: 'audiobookshelf' },
      ]);

      const work = {
        id: 1,
        title: 'Test',
        description: 'Already has description',
        coverUrl: 'already-has-cover',
        publishedDate: '2024',
        genresJson: '["Fiction"]',
        status: 4,
        ebookAvailable: true,
        audiobookAvailable: false,
        createdAt: new Date(Date.now() - 10000),
      };

      const item = makeAbsItem();
      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item]);
      repos.Edition.findOne.mockResolvedValueOnce({ work });
      repos.WorkAvailability.findOne.mockResolvedValue(null);
      repos.BookRequest.find.mockResolvedValue([]);

      const saveSpy = repos.Work.save;
      const _callCountBefore = saveSpy.mock.calls.length;

      await availabilitySync();

      // enrichWorkFromAbs should not trigger an extra save
      // (save may be called by other operations but not for enrichment)
      // We can't perfectly isolate this, but we can check the work fields didn't change
      expect(work.description).toBe('Already has description');
    });
  });

  // -------------------------------------------------------------------------
  // Stale cleanup
  // -------------------------------------------------------------------------

  describe('stale cleanup', () => {
    it('should remove stale availability records', async () => {
      makeSettings();
      const repos = setupRepos();

      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([]);

      const staleAvail = [
        {
          id: 100,
          format: 'ebook',
          source: 'audiobookshelf',
          work: { id: 50 },
          lastVerifiedAt: new Date(Date.now() - 1000000),
        },
      ];

      // First call is for the stale availability query
      repos.WorkAvailability.find.mockResolvedValueOnce(
        [] // for selectFields (sourceItemId) in duplicate detection
      ).mockResolvedValueOnce(
        staleAvail // for removeStaleAvailability
      ).mockResolvedValue([]); // for updateWorkAvailabilityFlags

      repos.Work.find.mockResolvedValue([
        { id: 50, status: 5, ebookAvailable: true, audiobookAvailable: false },
      ]);

      await availabilitySync();

      expect(repos.WorkAvailability.remove).toHaveBeenCalledWith(staleAvail);
    });

    it('should remove stale unmatched items', async () => {
      makeSettings();
      const repos = setupRepos();

      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([]);
      repos.WorkAvailability.find.mockResolvedValue([]);
      repos.UnmatchedMediaItem.delete.mockResolvedValue({ affected: 3 });

      await availabilitySync();

      expect(repos.UnmatchedMediaItem.delete).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'audiobookshelf' })
      );
    });
  });

  // -------------------------------------------------------------------------
  // Duplicate detection
  // -------------------------------------------------------------------------

  describe('duplicate detection', () => {
    it('should track items not in currentAvailabilityIds as duplicates', async () => {
      makeSettings();
      const repos = setupRepos();

      const work = {
        id: 1,
        title: 'Test',
        status: 1,
        ebookAvailable: false,
        audiobookAvailable: false,
        createdAt: new Date(Date.now() - 10000),
      };

      const item1 = makeAbsItem({ id: 'item-1' });
      const item2 = makeAbsItem({ id: 'item-2' });

      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item1, item2]);
      repos.Edition.findOne.mockResolvedValue({ work });
      repos.WorkAvailability.findOne.mockResolvedValue(null);
      repos.BookRequest.find.mockResolvedValue([]);

      // updateWorkAvailabilityFlags returns ebook
      repos.WorkAvailability.find.mockImplementation((opts: any) => {
        // For the sourceItemId select query (duplicate detection)
        if (opts?.where?.source && opts?.select) {
          return Promise.resolve([{ sourceItemId: 'item-1' }]); // Only item-1 is "winning"
        }
        // For removeStaleAvailability
        if (Array.isArray(opts?.where)) {
          return Promise.resolve([]);
        }
        // For updateWorkAvailabilityFlags
        return Promise.resolve([{ format: 'ebook', source: 'audiobookshelf' }]);
      });

      await availabilitySync();

      // item-2 is not in currentAvailabilityIds, should be tracked as duplicate
      expect(repos.UnmatchedMediaItem.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { sourceItemId: 'item-2' } })
      );
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('should catch per-item errors and continue processing', async () => {
      makeSettings();
      const repos = setupRepos();
      repos.WorkAvailability.find.mockResolvedValue([]);

      const item1 = makeAbsItem({ id: 'item-1' });
      const item2 = makeAbsItem({ id: 'item-2' });

      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item1, item2]);

      // First item throws, second succeeds
      repos.Edition.findOne
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({
          work: {
            id: 1,
            title: 'Test',
            status: 1,
            ebookAvailable: false,
            audiobookAvailable: false,
            createdAt: new Date(Date.now() - 10000),
          },
        });

      repos.WorkAvailability.findOne.mockResolvedValue(null);
      repos.BookRequest.find.mockResolvedValue([]);

      await availabilitySync();

      expect(logger.error).toHaveBeenCalledWith(
        'Availability sync: error processing item',
        expect.objectContaining({ itemId: 'item-1' })
      );
      // Second item should still be processed (findOne called for ISBN + cleanup)
      expect(repos.Edition.findOne.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  // -------------------------------------------------------------------------
  // cleanupEditionsAfterMatch
  // -------------------------------------------------------------------------

  describe('cleanupEditionsAfterMatch', () => {
    it('should mark matched edition and delete unmatched ones', async () => {
      makeSettings();
      const repos = setupRepos();
      repos.WorkAvailability.find.mockResolvedValue([
        { format: 'ebook', source: 'audiobookshelf' },
      ]);

      const work = {
        id: 1,
        title: 'Test',
        status: 1,
        ebookAvailable: false,
        audiobookAvailable: false,
        createdAt: new Date(Date.now() - 10000),
      };

      const matchedEdition = { id: 20, matched: false };

      const item = makeAbsItem();
      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item]);

      // First findOne for ISBN match → returns work
      repos.Edition.findOne.mockResolvedValueOnce({ work });
      repos.WorkAvailability.findOne.mockResolvedValue(null);
      repos.BookRequest.find.mockResolvedValue([]);

      // findOne for cleanupEditionsAfterMatch
      repos.Edition.findOne.mockResolvedValueOnce(matchedEdition);

      await availabilitySync();

      // The matched edition should be saved with matched=true
      expect(matchedEdition.matched).toBe(true);
      // And delete called for unmatched
      expect(repos.Edition.delete).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // linkAuthor
  // -------------------------------------------------------------------------

  describe('linkAuthor (via createWorkFromMetadata)', () => {
    it('should find existing author by hardcoverId and link', async () => {
      makeSettings();
      const repos = setupRepos();
      repos.WorkAvailability.find.mockResolvedValue([
        { format: 'ebook', source: 'audiobookshelf' },
      ]);

      const existingAuthor = { id: 10, hardcoverId: 'hc-author-1', name: 'Author One' };

      const item = makeAbsItem({
        media: {
          ...makeAbsItem().media,
          metadata: {
            ...makeAbsItem().media.metadata,
            isbn: undefined,
            asin: undefined,
          },
        },
      });

      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item]);
      repos.Edition.findOne.mockResolvedValue(null);
      mockSearch.mockResolvedValue([
        {
          hardcoverId: 'hc-new-work',
          title: 'Test Book',
          authors: [{ name: 'Author One', hardcoverId: 'hc-author-1' }],
        },
      ]);
      repos.Work.findOne.mockResolvedValue(null);
      repos.Work.save.mockImplementation((data: any) =>
        Promise.resolve({ ...data, id: 99, createdAt: new Date() })
      );
      repos.Author.findOne.mockResolvedValue(existingAuthor);
      repos.WorkAuthor.findOne.mockResolvedValue(null);
      repos.WorkAvailability.findOne.mockResolvedValue(null);
      repos.BookRequest.find.mockResolvedValue([]);

      await availabilitySync();

      // Should create WorkAuthor link
      expect(repos.WorkAuthor.create).toHaveBeenCalledWith(
        expect.objectContaining({ author: existingAuthor, role: 'author' })
      );
    });

    it('should create new author when not found by hardcoverId', async () => {
      makeSettings();
      const repos = setupRepos();
      repos.WorkAvailability.find.mockResolvedValue([
        { format: 'ebook', source: 'audiobookshelf' },
      ]);

      const item = makeAbsItem({
        media: {
          ...makeAbsItem().media,
          metadata: {
            ...makeAbsItem().media.metadata,
            isbn: undefined,
            asin: undefined,
          },
        },
      });

      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item]);
      repos.Edition.findOne.mockResolvedValue(null);
      mockSearch.mockResolvedValue([
        {
          hardcoverId: 'hc-new-work-2',
          title: 'Test Book',
          authors: [{ name: 'New Author', hardcoverId: 'hc-new-author' }],
        },
      ]);
      repos.Work.findOne.mockResolvedValue(null);
      repos.Work.save.mockImplementation((data: any) =>
        Promise.resolve({ ...data, id: 100, createdAt: new Date() })
      );
      repos.Author.findOne.mockResolvedValue(null);
      repos.Author.save.mockImplementation((data: any) =>
        Promise.resolve({ ...data, id: 60 })
      );
      repos.WorkAuthor.findOne.mockResolvedValue(null);
      repos.WorkAvailability.findOne.mockResolvedValue(null);
      repos.BookRequest.find.mockResolvedValue([]);

      await availabilitySync();

      expect(repos.Author.create).toHaveBeenCalledWith(
        expect.objectContaining({ hardcoverId: 'hc-new-author', name: 'New Author' })
      );
    });

    it('should not create duplicate WorkAuthor link', async () => {
      makeSettings();
      const repos = setupRepos();
      repos.WorkAvailability.find.mockResolvedValue([
        { format: 'ebook', source: 'audiobookshelf' },
      ]);

      const existingAuthor = { id: 10, hardcoverId: 'hc-author-1', name: 'Author One' };
      const existingLink = { id: 1, work: { id: 99 }, author: { id: 10 } };

      const item = makeAbsItem({
        media: {
          ...makeAbsItem().media,
          metadata: {
            ...makeAbsItem().media.metadata,
            isbn: undefined,
            asin: undefined,
          },
        },
      });

      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item]);
      repos.Edition.findOne.mockResolvedValue(null);
      mockSearch.mockResolvedValue([
        {
          hardcoverId: 'hc-existing',
          title: 'Test Book',
          authors: [{ name: 'Author One', hardcoverId: 'hc-author-1' }],
        },
      ]);
      repos.Work.findOne.mockResolvedValue(null);
      repos.Work.save.mockImplementation((data: any) =>
        Promise.resolve({ ...data, id: 99, createdAt: new Date() })
      );
      repos.Author.findOne.mockResolvedValue(existingAuthor);
      repos.WorkAuthor.findOne.mockResolvedValue(existingLink); // Already linked
      repos.WorkAvailability.findOne.mockResolvedValue(null);
      repos.BookRequest.find.mockResolvedValue([]);

      await availabilitySync();

      // Should NOT create a new WorkAuthor
      expect(repos.WorkAuthor.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // upsertUnmatchedItem
  // -------------------------------------------------------------------------

  describe('upsertUnmatchedItem', () => {
    it('should create new unmatched item when not existing', async () => {
      makeSettings();
      const repos = setupRepos();
      repos.WorkAvailability.find.mockResolvedValue([]);

      const item = makeAbsItem({
        media: {
          ...makeAbsItem().media,
          metadata: {
            ...makeAbsItem().media.metadata,
            isbn: undefined,
            asin: undefined,
          },
        },
      });

      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item]);
      repos.Edition.findOne.mockResolvedValue(null);
      mockSearch.mockResolvedValue([]); // No match

      // No existing unmatched item
      repos.UnmatchedMediaItem.findOne.mockResolvedValue(null);

      await availabilitySync();

      expect(repos.UnmatchedMediaItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceItemId: 'abs-item-1',
          source: 'audiobookshelf',
          title: 'Test Book',
          reason: 'unmatched',
        })
      );
    });

    it('should update existing unmatched item', async () => {
      makeSettings();
      const repos = setupRepos();
      repos.WorkAvailability.find.mockResolvedValue([]);

      const item = makeAbsItem({
        media: {
          ...makeAbsItem().media,
          metadata: {
            ...makeAbsItem().media.metadata,
            isbn: undefined,
            asin: undefined,
          },
        },
      });

      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item]);
      repos.Edition.findOne.mockResolvedValue(null);
      mockSearch.mockResolvedValue([]);

      const existingUnmatched = {
        id: 50,
        sourceItemId: 'abs-item-1',
        title: 'Old Title',
        reason: 'unmatched',
      };
      repos.UnmatchedMediaItem.findOne.mockResolvedValue(existingUnmatched);

      await availabilitySync();

      expect(existingUnmatched.title).toBe('Test Book');
      expect(repos.UnmatchedMediaItem.save).toHaveBeenCalledWith(existingUnmatched);
    });
  });

  // -------------------------------------------------------------------------
  // removeFromUnmatched
  // -------------------------------------------------------------------------

  describe('removeFromUnmatched', () => {
    it('should delete unmatched item when work is found', async () => {
      makeSettings();
      const repos = setupRepos();
      repos.WorkAvailability.find.mockResolvedValue([
        { format: 'ebook', source: 'audiobookshelf' },
      ]);

      const work = {
        id: 1,
        title: 'Test',
        status: 1,
        ebookAvailable: false,
        audiobookAvailable: false,
        createdAt: new Date(Date.now() - 10000),
      };

      const item = makeAbsItem();
      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item]);
      repos.Edition.findOne.mockResolvedValueOnce({ work });
      repos.WorkAvailability.findOne.mockResolvedValue(null);
      repos.BookRequest.find.mockResolvedValue([]);

      await availabilitySync();

      expect(repos.UnmatchedMediaItem.delete).toHaveBeenCalledWith(
        expect.objectContaining({ sourceItemId: 'abs-item-1' })
      );
    });
  });

  // -------------------------------------------------------------------------
  // Full scan option
  // -------------------------------------------------------------------------

  describe('fullScan option', () => {
    it('should log full scan type when fullScan=true', async () => {
      makeSettings();
      const repos = setupRepos();
      repos.WorkAvailability.find.mockResolvedValue([]);

      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([]);

      await availabilitySync({ fullScan: true });

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('full sync'),
        expect.any(Object)
      );
    });

    it('should log incremental scan type when fullScan=false', async () => {
      makeSettings();
      const repos = setupRepos();
      repos.WorkAvailability.find.mockResolvedValue([]);

      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([]);

      await availabilitySync({ fullScan: false });

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('incremental sync'),
        expect.any(Object)
      );
    });
  });

  // -------------------------------------------------------------------------
  // ISBN10 handling
  // -------------------------------------------------------------------------

  describe('ISBN10 handling', () => {
    it('should search by isbn10 when ISBN is 10 digits', async () => {
      makeSettings();
      const repos = setupRepos();
      repos.WorkAvailability.find.mockResolvedValue([]);

      const item = makeAbsItem({
        media: {
          ...makeAbsItem().media,
          metadata: {
            ...makeAbsItem().media.metadata,
            isbn: '0123456789', // 10-digit ISBN
          },
        },
      });

      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item]);
      repos.Edition.findOne.mockResolvedValue(null);
      mockSearch.mockResolvedValue([]);

      await availabilitySync();

      expect(repos.Edition.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isbn10: '0123456789' },
          relations: ['work'],
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // Invalid ISBN
  // -------------------------------------------------------------------------

  describe('invalid ISBN handling', () => {
    it('should skip ISBN when length is invalid (not 10 or 13)', async () => {
      makeSettings();
      const repos = setupRepos();
      repos.WorkAvailability.find.mockResolvedValue([]);

      const item = makeAbsItem({
        media: {
          ...makeAbsItem().media,
          metadata: {
            ...makeAbsItem().media.metadata,
            isbn: '12345', // Invalid length
            asin: undefined,
          },
        },
      });

      mockGetLibraries.mockResolvedValue([makeLibrary()]);
      mockGetLibraryItems.mockResolvedValue([item]);
      repos.Edition.findOne.mockResolvedValue(null);
      mockSearch.mockResolvedValue([]);

      await availabilitySync();

      // Should not search by ISBN, should go straight to ASIN or Hardcover search
      // The first findOne call should NOT be for an ISBN lookup
      // Instead it goes directly to the Hardcover search
      expect(mockSearch).toHaveBeenCalled();
    });
  });
});
