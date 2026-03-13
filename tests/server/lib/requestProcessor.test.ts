import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mocks ----
vi.mock('@server/datasource', () => ({
  default: { getRepository: vi.fn() },
}));
vi.mock('@server/entity/BookRequest', () => ({
  BookRequest: class BookRequest {},
}));
vi.mock('@server/entity/MusicRequest', () => ({
  MusicRequest: class MusicRequest {},
}));
vi.mock('@server/entity/Edition', () => ({
  Edition: class Edition {},
}));
vi.mock('@server/entity/Work', () => ({
  Work: class Work {},
}));

// Transitive entity mocks (break import chains that would load real TypeORM decorators)
vi.mock('@server/entity/User', () => ({ User: class User {} }));
vi.mock('@server/entity/UserSettings', () => ({ UserSettings: class UserSettings {} }));
vi.mock('@server/entity/Issue', () => ({ Issue: class Issue {} }));
vi.mock('@server/entity/IssueComment', () => ({ IssueComment: class IssueComment {} }));
vi.mock('@server/entity/MusicAlbum', () => ({ MusicAlbum: class MusicAlbum {} }));
vi.mock('@server/entity/WorkAuthor', () => ({ WorkAuthor: class WorkAuthor {} }));
vi.mock('@server/entity/WorkAvailability', () => ({ WorkAvailability: class WorkAvailability {} }));
vi.mock('@server/entity/Series', () => ({ Series: class Series {} }));
vi.mock('@server/entity/Author', () => ({ Author: class Author {} }));
vi.mock('@server/logger', () => ({
  default: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));
vi.mock('@server/lib/settings', () => ({
  default: { getInstance: vi.fn() },
  ReadarrSettings: {},
}));
vi.mock('@server/lib/serverUrl', () => ({
  buildServerUrl: vi.fn().mockReturnValue('http://readarr:8787'),
}));

const { mockLookupBook, mockAddBook, mockFetchEditionsForRequest } = vi.hoisted(() => ({
  mockLookupBook: vi.fn(),
  mockAddBook: vi.fn(),
  mockFetchEditionsForRequest: vi.fn(),
}));

vi.mock('@server/api/servarr/readarr', () => ({
  default: vi.fn().mockImplementation(function () {
    return { lookupBook: mockLookupBook, addBook: mockAddBook };
  }),
}));

vi.mock('@server/lib/metadataResolverInstance', () => ({
  getMetadataResolver: vi.fn().mockReturnValue({
    fetchEditionsForRequest: mockFetchEditionsForRequest,
  }),
}));

import dataSource from '@server/datasource';
import logger from '@server/logger';
import Settings from '@server/lib/settings';
import {
  selectReadarrServer,
  processApprovedBookRequest,
  processApprovedMusicRequest,
} from '@server/lib/requestProcessor';

function makeRepo(overrides: Record<string, any> = {}) {
  return {
    find: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockImplementation((data: any) => data),
    createQueryBuilder: vi.fn().mockReturnValue({
      delete: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
    }),
    ...overrides,
  };
}

describe('requestProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dataSource.getRepository).mockReset();
  });

  // ------------------------------------------------------------------
  // selectReadarrServer
  // ------------------------------------------------------------------
  describe('selectReadarrServer', () => {
    it('returns null when no servers configured', () => {
      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [],
      } as any);

      expect(selectReadarrServer('ebook')).toBeNull();
    });

    it('returns the first server matching the format', () => {
      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [
          { id: 1, contentType: 'audiobook', isDefault: false },
          { id: 2, contentType: 'ebook', isDefault: false },
          { id: 3, contentType: 'ebook', isDefault: false },
        ],
      } as any);

      const result = selectReadarrServer('ebook');
      expect(result?.id).toBe(2);
    });

    it('returns the single server matching the content type', () => {
      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [
          { id: 1, contentType: 'ebook' },
          { id: 2, contentType: 'audiobook' },
        ],
      } as any);

      const result = selectReadarrServer('audiobook');
      expect(result?.id).toBe(2);
    });

    it('returns the specific server when serverId is provided and matches format', () => {
      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [
          { id: 1, contentType: 'ebook', isDefault: true },
          { id: 2, contentType: 'ebook', isDefault: false },
        ],
      } as any);

      const result = selectReadarrServer('ebook', 2);
      expect(result?.id).toBe(2);
    });

    it('falls back to first matching when serverId does not match format', () => {
      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [
          { id: 1, contentType: 'audiobook', isDefault: false },
          { id: 2, contentType: 'ebook', isDefault: false },
        ],
      } as any);

      // serverId=1 is audiobook, but requesting ebook → fallback
      const result = selectReadarrServer('ebook', 1);
      expect(result?.id).toBe(2);
    });

    it('returns null when serverId exists but format has no servers', () => {
      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [
          { id: 1, contentType: 'audiobook', isDefault: false },
        ],
      } as any);

      const result = selectReadarrServer('ebook', 1);
      expect(result).toBeNull();
    });
  });

  // ------------------------------------------------------------------
  // processApprovedBookRequest
  // ------------------------------------------------------------------
  describe('processApprovedBookRequest', () => {
    const makeWork = (overrides = {}) => ({
      id: 10,
      hardcoverId: 'hc-123',
      openLibraryWorkId: 'OL123',
      title: 'Test Book',
      status: 1,
      ...overrides,
    });

    const makeRequest = (overrides: Record<string, unknown> = {}) => ({
      id: 1,
      format: 'ebook',
      requestedLanguage: 'en',
      readarrServerId: null as number | null,
      readarrBookId: null as number | null,
      authorForeignId: null as string | null,
      work: makeWork(),
      status: 2, // APPROVED
      ...overrides,
    });

    function setupRepos(requestRepo = makeRepo(), workRepo = makeRepo(), editionRepo = makeRepo()) {
      vi.mocked(dataSource.getRepository)
        .mockReturnValueOnce(requestRepo as any) // BookRequest
        .mockReturnValueOnce(workRepo as any)     // Work
        .mockReturnValueOnce(editionRepo as any); // Edition (from persistEditions)
      return { requestRepo, workRepo, editionRepo };
    }

    it('loads work relation when not already loaded', async () => {
      const request = makeRequest({ work: undefined });
      const loaded = makeRequest();
      const requestRepo = makeRepo({ findOne: vi.fn().mockResolvedValue(loaded) });
      const workRepo = makeRepo();
      const editionRepo = makeRepo();

      vi.mocked(dataSource.getRepository)
        .mockReturnValueOnce(requestRepo as any)
        .mockReturnValueOnce(workRepo as any)
        .mockReturnValueOnce(editionRepo as any);

      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [{ id: 1, contentType: 'ebook', isDefault: true, apiKey: 'k', activeProfileId: 1, activeDirectory: '/books', metadataProfileId: 1 }],
      } as any);

      mockFetchEditionsForRequest.mockResolvedValue([
        { isbn13: '9781234567890', title: 'Test', format: 'ebook', language: 'en', source: 'hardcover' },
      ]);
      mockLookupBook.mockResolvedValue([
        { author: { foreignAuthorId: 'author-1' }, title: 'Test Book' },
      ]);
      mockAddBook.mockResolvedValue({ id: 42 });

      await processApprovedBookRequest(request as any);

      expect(requestRepo.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['work'],
      });
    });

    it('returns and logs error when request not found after reload', async () => {
      const request = makeRequest({ work: undefined });
      const requestRepo = makeRepo({ findOne: vi.fn().mockResolvedValue(null) });
      const workRepo = makeRepo();

      vi.mocked(dataSource.getRepository)
        .mockReturnValueOnce(requestRepo as any)
        .mockReturnValueOnce(workRepo as any);

      await processApprovedBookRequest(request as any);

      expect(vi.mocked(logger.error).mock.calls.some(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('request not found')
      )).toBe(true);
    });

    it('returns when no Readarr server configured for the format', async () => {
      const request = makeRequest();
      const { requestRepo } = setupRepos();

      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [],
      } as any);

      await processApprovedBookRequest(request as any);

      expect(vi.mocked(logger.info).mock.calls.some(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('no Readarr server configured')
      )).toBe(true);
      // Should not save (no status change)
      expect(requestRepo.save).not.toHaveBeenCalled();
    });

    it('sets status FAILED when no suitable edition found', async () => {
      const request = makeRequest();
      const { requestRepo } = setupRepos();

      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [{ id: 1, contentType: 'ebook', isDefault: true, apiKey: 'k', activeProfileId: 1, activeDirectory: '/books' }],
      } as any);

      mockFetchEditionsForRequest.mockResolvedValue([]);

      await processApprovedBookRequest(request as any);

      expect(request.status).toBe(5); // FAILED
      expect(requestRepo.save).toHaveBeenCalledWith(request);
    });

    it('looks up book in Readarr by isbn when available', async () => {
      const request = makeRequest();
      const { requestRepo: _requestRepo, workRepo: _workRepo } = setupRepos();

      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [{ id: 1, contentType: 'ebook', isDefault: true, apiKey: 'k', activeProfileId: 1, activeDirectory: '/books', metadataProfileId: 1 }],
      } as any);

      mockFetchEditionsForRequest.mockResolvedValue([
        { isbn13: '9781234567890', title: 'Ed', format: 'ebook', language: 'en', source: 'hardcover' },
      ]);
      mockLookupBook.mockResolvedValue([
        { author: { foreignAuthorId: 'a1' }, title: 'T' },
      ]);
      mockAddBook.mockResolvedValue({ id: 99 });

      await processApprovedBookRequest(request as any);

      expect(mockLookupBook).toHaveBeenCalledWith('isbn:9781234567890');
    });

    it('looks up by goodreads:foreignBookId when no isbn', async () => {
      const request = makeRequest();
      const { requestRepo: _requestRepo, workRepo: _workRepo } = setupRepos();

      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [{ id: 1, contentType: 'ebook', isDefault: true, apiKey: 'k', activeProfileId: 1, activeDirectory: '/books', metadataProfileId: 1 }],
      } as any);

      mockFetchEditionsForRequest.mockResolvedValue([
        { isbn13: undefined, isbn10: undefined, title: 'Ed', format: 'ebook', language: 'en', source: 'hardcover' },
      ]);
      mockLookupBook.mockResolvedValue([
        { author: { foreignAuthorId: 'a1' }, title: 'T' },
      ]);
      mockAddBook.mockResolvedValue({ id: 99 });

      await processApprovedBookRequest(request as any);

      expect(mockLookupBook).toHaveBeenCalledWith('goodreads:hc-123');
    });

    it('sets status FAILED when foreignAuthorId cannot be resolved', async () => {
      const request = makeRequest();
      const { requestRepo: _requestRepo } = setupRepos();

      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [{ id: 1, contentType: 'ebook', isDefault: true, apiKey: 'k', activeProfileId: 1, activeDirectory: '/books', metadataProfileId: 1 }],
      } as any);

      mockFetchEditionsForRequest.mockResolvedValue([
        { isbn13: '9781234567890', title: 'Ed', format: 'ebook', language: 'en', source: 'hardcover' },
      ]);
      // Lookup returns empty
      mockLookupBook.mockResolvedValue([]);

      await processApprovedBookRequest(request as any);

      expect(request.status).toBe(5); // FAILED
      expect(vi.mocked(logger.error).mock.calls.some(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('could not resolve foreignAuthorId')
      )).toBe(true);
    });

    it('addBook to Readarr and updates request with tracking info', async () => {
      const request = makeRequest();
      const { requestRepo, workRepo: _workRepo } = setupRepos();

      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [{ id: 1, contentType: 'ebook', isDefault: true, apiKey: 'k', activeProfileId: 1, activeDirectory: '/books', metadataProfileId: 1 }],
      } as any);

      mockFetchEditionsForRequest.mockResolvedValue([
        { isbn13: '9781234567890', title: 'Ed', format: 'ebook', language: 'en', source: 'hardcover' },
      ]);
      mockLookupBook.mockResolvedValue([
        { author: { foreignAuthorId: 'a1' }, title: 'Book Title' },
      ]);
      mockAddBook.mockResolvedValue({ id: 42 });

      await processApprovedBookRequest(request as any);

      expect(mockAddBook).toHaveBeenCalled();
      expect(request.readarrServerId).toBe(1);
      expect(request.readarrBookId).toBe(42);
      expect(request.authorForeignId).toBe('a1');
      expect(request.status).toBe(2); // APPROVED (stays)
      expect(requestRepo.save).toHaveBeenCalledWith(request);
    });

    it('updates work.status to PROCESSING', async () => {
      const work = makeWork();
      const request = makeRequest({ work });
      const { requestRepo: _requestRepo, workRepo } = setupRepos();

      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [{ id: 1, contentType: 'ebook', isDefault: true, apiKey: 'k', activeProfileId: 1, activeDirectory: '/books', metadataProfileId: 1 }],
      } as any);

      mockFetchEditionsForRequest.mockResolvedValue([
        { isbn13: '9781234567890', title: 'Ed', format: 'ebook', language: 'en', source: 'hardcover' },
      ]);
      mockLookupBook.mockResolvedValue([
        { author: { foreignAuthorId: 'a1' }, title: 'T' },
      ]);
      mockAddBook.mockResolvedValue({ id: 42 });

      await processApprovedBookRequest(request as any);

      expect(work.status).toBe(3); // PROCESSING
      expect(workRepo.save).toHaveBeenCalledWith(work);
    });

    it('sets status FAILED on unexpected exception', async () => {
      const request = makeRequest();
      const requestRepo = makeRepo();
      const workRepo = makeRepo();

      vi.mocked(dataSource.getRepository)
        .mockReturnValueOnce(requestRepo as any)
        .mockReturnValueOnce(workRepo as any);

      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [{ id: 1, contentType: 'ebook', isDefault: true, apiKey: 'k', activeProfileId: 1, activeDirectory: '/books', metadataProfileId: 1 }],
      } as any);

      mockFetchEditionsForRequest.mockRejectedValue(new Error('metadata crash'));

      await processApprovedBookRequest(request as any);

      expect(request.status).toBe(5); // FAILED
      expect(vi.mocked(logger.error).mock.calls.some(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('unexpected error')
      )).toBe(true);
    });

    it('handles save error in catch block (double try/catch)', async () => {
      const request = makeRequest();
      const requestRepo = makeRepo({
        save: vi.fn().mockRejectedValue(new Error('db down')),
      });
      const workRepo = makeRepo();

      vi.mocked(dataSource.getRepository)
        .mockReturnValueOnce(requestRepo as any)
        .mockReturnValueOnce(workRepo as any);

      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [{ id: 1, contentType: 'ebook', isDefault: true, apiKey: 'k', activeProfileId: 1, activeDirectory: '/books', metadataProfileId: 1 }],
      } as any);

      mockFetchEditionsForRequest.mockRejectedValue(new Error('boom'));

      await processApprovedBookRequest(request as any);

      // Both error logs: unexpected error + failed to save failed status
      const errorLogs = vi.mocked(logger.error).mock.calls.filter(
        (c: unknown[]) => typeof c[0] === 'string'
      );
      expect(errorLogs.some((c: unknown[]) => (c[0] as string).includes('unexpected error'))).toBe(true);
      expect(errorLogs.some((c: unknown[]) => (c[0] as string).includes('failed to save failed status'))).toBe(true);
    });

    it('warns when Readarr lookup fails and continues', async () => {
      const request = makeRequest();
      const { requestRepo: _requestRepo } = setupRepos();

      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [{ id: 1, contentType: 'ebook', isDefault: true, apiKey: 'k', activeProfileId: 1, activeDirectory: '/books', metadataProfileId: 1 }],
      } as any);

      mockFetchEditionsForRequest.mockResolvedValue([
        { isbn13: '9781234567890', title: 'Ed', format: 'ebook', language: 'en', source: 'hardcover' },
      ]);
      mockLookupBook.mockRejectedValue(new Error('lookup fail'));

      await processApprovedBookRequest(request as any);

      expect(vi.mocked(logger.warn).mock.calls.some(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('Readarr lookup failed')
      )).toBe(true);

      // Since foreignAuthorId couldn't be resolved, should fail
      expect(request.status).toBe(5); // FAILED
    });

    it('selects best edition with exact language match', async () => {
      const request = makeRequest({ requestedLanguage: 'fr' });
      const { requestRepo: _requestRepo, workRepo: _workRepo } = setupRepos();

      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [{ id: 1, contentType: 'ebook', isDefault: true, apiKey: 'k', activeProfileId: 1, activeDirectory: '/books', metadataProfileId: 1 }],
      } as any);

      mockFetchEditionsForRequest.mockResolvedValue([
        { isbn13: '111', title: 'English', format: 'ebook', language: 'en', source: 'hardcover' },
        { isbn13: '222', title: 'French', format: 'ebook', language: 'fr', source: 'hardcover' },
      ]);
      mockLookupBook.mockResolvedValue([
        { author: { foreignAuthorId: 'a1' }, title: 'T' },
      ]);
      mockAddBook.mockResolvedValue({ id: 42 });

      await processApprovedBookRequest(request as any);

      // Should use isbn:222 (French edition)
      expect(mockLookupBook).toHaveBeenCalledWith('isbn:222');
    });

    it('uses English fallback when requested language not found', async () => {
      const request = makeRequest({ requestedLanguage: 'de' });
      const { requestRepo: _requestRepo, workRepo: _workRepo } = setupRepos();

      vi.mocked(Settings.getInstance).mockReturnValue({
        readarr: [{ id: 1, contentType: 'ebook', isDefault: true, apiKey: 'k', activeProfileId: 1, activeDirectory: '/books', metadataProfileId: 1 }],
      } as any);

      mockFetchEditionsForRequest.mockResolvedValue([
        { isbn13: '111', title: 'French', format: 'ebook', language: 'fr', source: 'hardcover' },
        { isbn13: '222', title: 'English', format: 'ebook', language: 'en', source: 'hardcover' },
      ]);
      mockLookupBook.mockResolvedValue([
        { author: { foreignAuthorId: 'a1' }, title: 'T' },
      ]);
      mockAddBook.mockResolvedValue({ id: 42 });

      await processApprovedBookRequest(request as any);

      // English fallback → isbn:222
      expect(mockLookupBook).toHaveBeenCalledWith('isbn:222');
    });
  });

  // ------------------------------------------------------------------
  // processApprovedMusicRequest
  // ------------------------------------------------------------------
  describe('processApprovedMusicRequest', () => {
    it('logs warn (not yet implemented)', async () => {
      await processApprovedMusicRequest({} as any);

      expect(vi.mocked(logger.warn).mock.calls.some(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('not yet implemented')
      )).toBe(true);
    });
  });
});
