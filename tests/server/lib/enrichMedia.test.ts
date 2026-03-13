import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('@server/entity/Work', () => ({ Work: class Work {} }));
vi.mock('@server/entity/BookRequest', () => ({ BookRequest: class BookRequest {} }));
vi.mock('@server/entity/MusicAlbum', () => ({ MusicAlbum: class MusicAlbum {} }));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import dataSource from '@server/datasource';
import logger from '@server/logger';
import { enrichWithMedia } from '@server/lib/enrichMedia';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQBRepo(getMany: any[] = []) {
  return {
    createQueryBuilder: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnThis(),
      leftJoinAndSelect: vi.fn().mockReturnThis(),
      getMany: vi.fn().mockResolvedValue(getMany),
    }),
  };
}

function setupRepos(custom: Record<string, any> = {}) {
  const repos: Record<string, any> = {
    Work: makeQBRepo(),
    BookRequest: makeQBRepo(),
    MusicAlbum: makeQBRepo(),
    ...custom,
  };

  vi.mocked(dataSource.getRepository).mockImplementation((entity: any) => {
    const name = typeof entity === 'function' ? entity.name : entity;
    return repos[name] ?? makeQBRepo();
  });

  return repos;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('enrichWithMedia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Books
  // =========================================================================

  describe('book enrichment', () => {
    it('should return results unchanged if empty', async () => {
      const result = await enrichWithMedia([], 'book');
      expect(result).toEqual([]);
    });

    it('should enrich books with Work data', async () => {
      const workData = {
        id: 10,
        hardcoverId: 'hc-1',
        status: 5,
        ebookAvailable: true,
        audiobookAvailable: false,
      };

      const requestData = {
        id: 1,
        status: 2,
        format: 'ebook',
        work: { id: 10 },
      };

      const _repos = setupRepos({
        Work: makeQBRepo([workData]),
        BookRequest: makeQBRepo([requestData]),
      });

      const books = [{ goodreadsId: 'hc-1', title: 'Test Book' }];
      const result = await enrichWithMedia(books, 'book');

      expect(result[0]).toHaveProperty('media');
      expect(result[0].media).toEqual(
        expect.objectContaining({
          id: 10,
          status: 5,
          ebookAvailable: true,
          audiobookAvailable: false,
        })
      );
      expect(result[0].media?.requests).toHaveLength(1);
    });

    it('should return results without media when no Work match', async () => {
      setupRepos(); // Empty repos

      const books = [{ goodreadsId: 'hc-unknown', title: 'Unknown Book' }];
      const result = await enrichWithMedia(books, 'book');

      expect(result[0].media).toBeUndefined();
    });

    it('should return unenriched results when exception occurs', async () => {
      vi.mocked(dataSource.getRepository).mockImplementation(() => {
        throw new Error('DB error');
      });

      const books = [{ goodreadsId: 'hc-1', title: 'Test' }];
      const result = await enrichWithMedia(books, 'book');

      expect(result).toEqual(books);
      expect(logger.warn).toHaveBeenCalledWith(
        'enrichWithMedia failed, returning unenriched',
        expect.any(Object)
      );
    });

    it('should skip when no goodreadsId present', async () => {
      setupRepos();

      const books = [{ title: 'No ID Book' }];
      const result = await enrichWithMedia(books, 'book');

      // Should return without calling createQueryBuilder for requests
      expect(result[0]).not.toHaveProperty('media');
    });

    it('should handle multiple books with mixed matches', async () => {
      const workData = {
        id: 10,
        hardcoverId: 'hc-1',
        status: 4,
        ebookAvailable: true,
        audiobookAvailable: false,
      };

      setupRepos({
        Work: makeQBRepo([workData]),
        BookRequest: makeQBRepo([]),
      });

      const books = [
        { goodreadsId: 'hc-1', title: 'Known Book' },
        { goodreadsId: 'hc-unknown', title: 'Unknown Book' },
      ];

      const result = await enrichWithMedia(books, 'book');

      expect(result[0].media).toBeDefined();
      expect(result[0].media?.id).toBe(10);
      expect(result[1].media).toBeUndefined();
    });
  });

  // =========================================================================
  // Music
  // =========================================================================

  describe('music enrichment', () => {
    it('should enrich albums with MusicAlbum data', async () => {
      const albumData = {
        id: 20,
        musicBrainzId: 'mb-1',
        status: 5,
        requests: [{ id: 1, status: 2 }],
      };

      setupRepos({
        MusicAlbum: makeQBRepo([albumData]),
      });

      const albums = [{ musicBrainzId: 'mb-1', title: 'Test Album' }];
      const result = await enrichWithMedia(albums, 'music');

      expect(result[0].media).toEqual(
        expect.objectContaining({
          id: 20,
          status: 5,
        })
      );
      expect(result[0].media?.requests).toHaveLength(1);
    });

    it('should return without media when no MusicAlbum match', async () => {
      setupRepos();

      const albums = [{ musicBrainzId: 'mb-unknown', title: 'Unknown Album' }];
      const result = await enrichWithMedia(albums, 'music');

      expect(result[0].media).toBeUndefined();
    });

    it('should skip when no musicBrainzId present', async () => {
      setupRepos();

      const albums = [{ title: 'No ID Album' }];
      const result = await enrichWithMedia(albums, 'music');

      expect(result[0]).not.toHaveProperty('media');
    });

    it('should handle empty requests array on album', async () => {
      const albumData = {
        id: 20,
        musicBrainzId: 'mb-1',
        status: 3,
        requests: [],
      };

      setupRepos({
        MusicAlbum: makeQBRepo([albumData]),
      });

      const albums = [{ musicBrainzId: 'mb-1', title: 'Test Album' }];
      const result = await enrichWithMedia(albums, 'music');

      expect(result[0].media?.requests).toHaveLength(0);
    });

    it('should handle null requests on album gracefully', async () => {
      const albumData = {
        id: 20,
        musicBrainzId: 'mb-1',
        status: 3,
        requests: null,
      };

      setupRepos({
        MusicAlbum: makeQBRepo([albumData]),
      });

      const albums = [{ musicBrainzId: 'mb-1', title: 'Test Album' }];
      const result = await enrichWithMedia(albums, 'music');

      expect(result[0].media?.requests).toHaveLength(0);
    });
  });
});
