import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockSearchBooks } = vi.hoisted(() => ({
  mockSearchBooks: vi.fn(),
}));

const { mockSearchAlbums } = vi.hoisted(() => ({
  mockSearchAlbums: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@server/api/bookinfo', () => ({
  default: vi.fn().mockImplementation(function (this: any, token?: string) {
    this.token = token;
    this.searchBooks = mockSearchBooks;
    return this;
  }),
}));

vi.mock('@server/api/musicbrainz', () => ({
  default: vi.fn().mockImplementation(function () {
    return { searchAlbums: mockSearchAlbums };
  }),
}));

vi.mock('@server/lib/enrichMedia', () => ({
  enrichWithMedia: vi.fn().mockImplementation((results: any[]) => Promise.resolve(results)),
}));

vi.mock('@server/lib/availability', () => ({
  isBookFullyAvailable: vi.fn().mockReturnValue(false),
  isMusicFullyAvailable: vi.fn().mockReturnValue(false),
}));

vi.mock('@server/lib/settings', () => ({
  default: { getInstance: vi.fn() },
}));

vi.mock('@server/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@server/datasource', () => ({
  default: { getRepository: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import Settings from '@server/lib/settings';
import { enrichWithMedia } from '@server/lib/enrichMedia';
import { isBookFullyAvailable, isMusicFullyAvailable } from '@server/lib/availability';
import logger from '@server/logger';
import { unifiedSearch, getBookInfo } from '@server/lib/search';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSettings(overrides: Record<string, any> = {}) {
  const defaults = {
    main: {
      enableEbookRequests: true,
      enableAudiobookRequests: true,
      enableMusicRequests: true,
      hardcoverToken: 'hc-token',
      hideAvailable: false,
      ...overrides,
    },
  };
  vi.mocked(Settings.getInstance).mockReturnValue(defaults as any);
  return defaults;
}

function makeBookResult(overrides: Record<string, any> = {}): any {
  return {
    goodreadsId: 'hc-1',
    title: 'Test Book',
    authors: [{ name: 'Author One' }],
    coverUrl: 'https://cover.url',
    averageRating: 4.0,
    ratingsCount: 100,
    ...overrides,
  };
}

function makeAlbumResult(overrides: Record<string, any> = {}): any {
  return {
    musicBrainzId: 'mb-1',
    title: 'Test Album',
    artists: [{ name: 'Artist One' }],
    coverUrl: 'https://cover.url',
    popularity: 50,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('unifiedSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchBooks.mockResolvedValue({ results: [], totalResults: 0 });
    mockSearchAlbums.mockResolvedValue({ results: [], totalResults: 0 });
  });

  it('should return empty results when both book and music are disabled', async () => {
    makeSettings({
      enableEbookRequests: false,
      enableAudiobookRequests: false,
      enableMusicRequests: false,
    });

    const result = await unifiedSearch('test');

    expect(result.results).toHaveLength(0);
    expect(result.totalResults).toBe(0);
  });

  it('should search books only when type=book', async () => {
    makeSettings();

    const book = makeBookResult();
    mockSearchBooks.mockResolvedValue({ results: [book], totalResults: 1 });

    const result = await unifiedSearch('test', 1, 'book');

    expect(mockSearchBooks).toHaveBeenCalled();
    expect(mockSearchAlbums).not.toHaveBeenCalled();
    expect(result.results).toHaveLength(1);
    expect(result.results[0].type).toBe('book');
  });

  it('should search music only when type=music', async () => {
    makeSettings();

    const album = makeAlbumResult();
    mockSearchAlbums.mockResolvedValue({ results: [album], totalResults: 1 });

    const result = await unifiedSearch('test', 1, 'music');

    expect(mockSearchBooks).not.toHaveBeenCalled();
    expect(mockSearchAlbums).toHaveBeenCalled();
    expect(result.results).toHaveLength(1);
    expect(result.results[0].type).toBe('music');
  });

  it('should search both when type=all', async () => {
    makeSettings();

    const book = makeBookResult();
    const album = makeAlbumResult();
    mockSearchBooks.mockResolvedValue({ results: [book], totalResults: 1 });
    mockSearchAlbums.mockResolvedValue({ results: [album], totalResults: 1 });

    const result = await unifiedSearch('test', 1, 'all');

    expect(mockSearchBooks).toHaveBeenCalled();
    expect(mockSearchAlbums).toHaveBeenCalled();
    expect(result.results).toHaveLength(2);
    expect(result.totalResults).toBe(2);
  });

  it('should sort results by relevance (title match = higher score)', async () => {
    makeSettings();

    const exactMatch = makeBookResult({ title: 'dragon', goodreadsId: 'hc-exact' });
    const partialMatch = makeBookResult({ title: 'The Dragon Keeper', goodreadsId: 'hc-partial' });
    mockSearchBooks.mockResolvedValue({
      results: [partialMatch, exactMatch],
      totalResults: 2,
    });

    const result = await unifiedSearch('dragon', 1, 'book');

    // Exact title match should be ranked first
    expect(result.results[0].book?.goodreadsId).toBe('hc-exact');
  });

  it('should skip book search when no hardcoverToken', async () => {
    makeSettings({ hardcoverToken: '' });

    const _result = await unifiedSearch('test', 1, 'all');

    expect(mockSearchBooks).not.toHaveBeenCalled();
  });

  it('should skip book search when ebook and audiobook requests are both disabled', async () => {
    makeSettings({
      enableEbookRequests: false,
      enableAudiobookRequests: false,
      hardcoverToken: 'token',
    });

    const _result = await unifiedSearch('test', 1, 'book');

    expect(mockSearchBooks).not.toHaveBeenCalled();
  });

  it('should enrich results with enrichWithMedia', async () => {
    makeSettings();

    const book = makeBookResult();
    mockSearchBooks.mockResolvedValue({ results: [book], totalResults: 1 });

    await unifiedSearch('test', 1, 'book');

    expect(enrichWithMedia).toHaveBeenCalledWith([book], 'book');
  });

  it('should filter available items when hideAvailable=true', async () => {
    makeSettings({ hideAvailable: true });

    const book = makeBookResult();
    mockSearchBooks.mockResolvedValue({ results: [book], totalResults: 1 });

    // Make the book "fully available"
    vi.mocked(enrichWithMedia).mockResolvedValue([
      { ...book, media: { id: 1, status: 5, ebookAvailable: true, audiobookAvailable: true, requests: [] } },
    ]);
    vi.mocked(isBookFullyAvailable).mockReturnValue(true);

    const result = await unifiedSearch('test', 1, 'book');

    expect(result.results).toHaveLength(0);
  });

  it('should NOT filter when hideAvailable=false', async () => {
    makeSettings({ hideAvailable: false });

    const book = makeBookResult();
    mockSearchBooks.mockResolvedValue({ results: [book], totalResults: 1 });
    vi.mocked(enrichWithMedia).mockResolvedValue([
      { ...book, media: { id: 1, status: 5, ebookAvailable: true, audiobookAvailable: true, requests: [] } },
    ]);

    const result = await unifiedSearch('test', 1, 'book');

    expect(result.results).toHaveLength(1);
  });

  it('should catch search error and return empty results', async () => {
    makeSettings();
    mockSearchBooks.mockRejectedValue(new Error('API error'));

    const result = await unifiedSearch('test', 1, 'book');

    expect(logger.error).toHaveBeenCalledWith(
      'Unified search error',
      expect.any(Object)
    );
    expect(result.results).toHaveLength(0);
  });

  it('should calculate totalPages correctly', async () => {
    makeSettings();

    mockSearchBooks.mockResolvedValue({
      results: [makeBookResult()],
      totalResults: 45,
    });

    const result = await unifiedSearch('test', 1, 'book');

    expect(result.totalPages).toBe(3); // ceil(45/20) = 3
  });

  it('should boost score for author match', async () => {
    makeSettings();

    const authorMatch = makeBookResult({
      title: 'Unknown Thing',
      authors: [{ name: 'Stephen King' }],
      goodreadsId: 'hc-author',
      coverUrl: undefined,
      averageRating: undefined,
      ratingsCount: 0,
    });
    const noAuthorMatch = makeBookResult({
      title: 'Unrelated Title',
      authors: [{ name: 'Nobody' }],
      goodreadsId: 'hc-no-author',
      coverUrl: undefined,
      averageRating: undefined,
      ratingsCount: 0,
    });

    mockSearchBooks.mockResolvedValue({
      results: [noAuthorMatch, authorMatch],
      totalResults: 2,
    });

    const result = await unifiedSearch('stephen king', 1, 'book');

    // Author match should get +15 boost
    expect(result.results[0].book?.goodreadsId).toBe('hc-author');
  });

  it('should boost score for cover and rating', async () => {
    makeSettings();

    const withBoosts = makeBookResult({
      title: 'Test',
      coverUrl: 'https://cover.url',
      averageRating: 4.5,
      ratingsCount: 10000,
      goodreadsId: 'hc-boosted',
    });
    const withoutBoosts = makeBookResult({
      title: 'Test',
      coverUrl: undefined,
      averageRating: 2.0,
      ratingsCount: 0,
      goodreadsId: 'hc-unboosted',
    });

    mockSearchBooks.mockResolvedValue({
      results: [withoutBoosts, withBoosts],
      totalResults: 2,
    });

    const result = await unifiedSearch('test', 1, 'book');

    expect(result.results[0].book?.goodreadsId).toBe('hc-boosted');
  });

  it('should return page number in response', async () => {
    makeSettings();

    const result = await unifiedSearch('test', 3, 'book');

    expect(result.page).toBe(3);
  });

  it('should filter available music when hideAvailable=true', async () => {
    makeSettings({ hideAvailable: true });

    const album = makeAlbumResult();
    mockSearchAlbums.mockResolvedValue({ results: [album], totalResults: 1 });
    vi.mocked(enrichWithMedia).mockResolvedValue([
      { ...album, media: { id: 1, status: 5, requests: [] } },
    ]);
    vi.mocked(isMusicFullyAvailable).mockReturnValue(true);

    const result = await unifiedSearch('test', 1, 'music');

    expect(result.results).toHaveLength(0);
  });

  it('should default to type=all when no type specified', async () => {
    makeSettings();

    mockSearchBooks.mockResolvedValue({ results: [], totalResults: 0 });
    mockSearchAlbums.mockResolvedValue({ results: [], totalResults: 0 });

    await unifiedSearch('test');

    expect(mockSearchBooks).toHaveBeenCalled();
    expect(mockSearchAlbums).toHaveBeenCalled();
  });
});

describe('getBookInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return cached instance when token unchanged', () => {
    makeSettings({ hardcoverToken: 'same-token' });

    const first = getBookInfo();
    const second = getBookInfo();

    expect(first).toBe(second);
  });

  it('should recreate instance when token changes', () => {
    makeSettings({ hardcoverToken: 'token-1' });
    const first = getBookInfo();

    makeSettings({ hardcoverToken: 'token-2' });
    const second = getBookInfo();

    expect(first).not.toBe(second);
  });
});
