import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MetadataSource, WorkMetadata, EditionData } from '@server/api/metadata/types';

vi.mock('@server/logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@server/api/metadata/HardcoverProvider', () => ({
  HardcoverProvider: vi.fn(),
}));
vi.mock('@server/api/metadata/OpenLibraryProvider', () => ({
  OpenLibraryProvider: vi.fn(),
}));
vi.mock('@server/api/metadata/GoogleBooksProvider', () => ({
  GoogleBooksProvider: vi.fn(),
}));

import {
  MetadataResolver,
  DEFAULT_METADATA_PROVIDERS,
} from '@server/api/metadata/MetadataResolver';
import { HardcoverProvider } from '@server/api/metadata/HardcoverProvider';
import { OpenLibraryProvider } from '@server/api/metadata/OpenLibraryProvider';
import { GoogleBooksProvider } from '@server/api/metadata/GoogleBooksProvider';

function createMockProvider(source: MetadataSource) {
  return {
    source,
    getWork: vi.fn().mockResolvedValue(null),
    getDescription: vi.fn().mockResolvedValue(null),
    getCover: vi.fn().mockResolvedValue(null),
    getRating: vi.fn().mockResolvedValue(null),
    getEditions: vi.fn().mockResolvedValue([]),
    searchByText: vi.fn().mockResolvedValue(null),
    searchByIsbn: vi.fn().mockResolvedValue(null),
  };
}

let mockHardcover: ReturnType<typeof createMockProvider>;
let mockOpenlibrary: ReturnType<typeof createMockProvider>;
let mockGooglebooks: ReturnType<typeof createMockProvider>;

beforeEach(() => {
  vi.resetAllMocks();

  mockHardcover = createMockProvider('hardcover');
  mockOpenlibrary = createMockProvider('openlibrary');
  mockGooglebooks = createMockProvider('googlebooks');

  vi.mocked(HardcoverProvider).mockImplementation(function () {
    return mockHardcover as never;
  });
  vi.mocked(OpenLibraryProvider).mockImplementation(function () {
    return mockOpenlibrary as never;
  });
  vi.mocked(GoogleBooksProvider).mockImplementation(function () {
    return mockGooglebooks as never;
  });
});

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('MetadataResolver — constructor', () => {
  it('uses default config and instantiates all 3 providers', () => {
    new MetadataResolver();
    expect(HardcoverProvider).toHaveBeenCalledTimes(1);
    expect(OpenLibraryProvider).toHaveBeenCalledTimes(1);
    expect(GoogleBooksProvider).toHaveBeenCalledTimes(1);
  });

  it('instantiates only enabled providers', () => {
    new MetadataResolver({
      ...DEFAULT_METADATA_PROVIDERS,
      openlibrary: { enabled: false },
    });
    expect(HardcoverProvider).toHaveBeenCalledTimes(1);
    expect(OpenLibraryProvider).not.toHaveBeenCalled();
    expect(GoogleBooksProvider).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// resolveWork()
// ---------------------------------------------------------------------------

describe('MetadataResolver — resolveWork()', () => {
  const fullWork: WorkMetadata = {
    title: 'Test Book',
    description: 'A good book',
    coverUrl: 'http://example.com/cover.jpg',
    averageRating: 4.5,
    source: 'hardcover',
  };

  it('returns metadata from the first provider that responds', async () => {
    mockHardcover.getWork.mockResolvedValue(fullWork);

    const resolver = new MetadataResolver();
    const result = await resolver.resolveWork('123');

    expect(result).toEqual(fullWork);
    expect(mockHardcover.getWork).toHaveBeenCalledWith('123', undefined);
    expect(mockOpenlibrary.getWork).not.toHaveBeenCalled();
  });

  it('falls back to second provider when first returns null', async () => {
    const olWork: WorkMetadata = {
      title: 'From OL',
      description: 'desc',
      coverUrl: 'http://cover.jpg',
      averageRating: 3.0,
      source: 'openlibrary',
    };
    mockHardcover.getWork.mockResolvedValue(null);
    mockOpenlibrary.getWork.mockResolvedValue(olWork);

    const resolver = new MetadataResolver();
    const result = await resolver.resolveWork('123');

    expect(result).toEqual(olWork);
  });

  it('falls back to second provider when first throws', async () => {
    const olWork: WorkMetadata = {
      title: 'From OL',
      description: 'desc',
      coverUrl: 'http://cover.jpg',
      averageRating: 3.0,
      source: 'openlibrary',
    };
    mockHardcover.getWork.mockRejectedValue(new Error('API down'));
    mockOpenlibrary.getWork.mockResolvedValue(olWork);

    const resolver = new MetadataResolver();
    const result = await resolver.resolveWork('123');

    expect(result).toEqual(olWork);
  });

  it('enriches missing description from a secondary provider', async () => {
    mockHardcover.getWork.mockResolvedValue({
      title: 'No Desc',
      coverUrl: 'http://cover.jpg',
      averageRating: 4.0,
      source: 'hardcover',
    });
    // hardcover.getDescription → null (default)
    mockOpenlibrary.getDescription.mockResolvedValue('Enriched description');

    const resolver = new MetadataResolver();
    const result = await resolver.resolveWork('123');

    expect(result?.description).toBe('Enriched description');
  });

  it('enriches missing coverUrl from a secondary provider', async () => {
    mockHardcover.getWork.mockResolvedValue({
      title: 'No Cover',
      description: 'Has description',
      averageRating: 4.0,
      source: 'hardcover',
    });
    // hardcover.getCover → null, openlibrary.getCover → null (defaults)
    mockGooglebooks.getCover.mockResolvedValue(
      'http://google.com/cover.jpg'
    );

    const resolver = new MetadataResolver();
    const result = await resolver.resolveWork('123');

    expect(result?.coverUrl).toBe('http://google.com/cover.jpg');
  });

  it('enriches averageRating when undefined', async () => {
    mockHardcover.getWork.mockResolvedValue({
      title: 'No Rating',
      description: 'desc',
      coverUrl: 'http://cover.jpg',
      source: 'hardcover',
      // averageRating is undefined → == null is true
    });
    mockHardcover.getRating.mockResolvedValue(3.5);

    const resolver = new MetadataResolver();
    const result = await resolver.resolveWork('123');

    expect(result?.averageRating).toBe(3.5);
  });

  it('enriches description even when first provider throws during enrichment', async () => {
    mockHardcover.getWork.mockResolvedValue({
      title: 'No Desc',
      coverUrl: 'http://cover.jpg',
      averageRating: 4.0,
      source: 'hardcover',
    });
    mockHardcover.getDescription.mockRejectedValue(new Error('API timeout'));
    mockOpenlibrary.getDescription.mockResolvedValue('Enriched from OL');

    const resolver = new MetadataResolver();
    const result = await resolver.resolveWork('123');

    expect(result?.description).toBe('Enriched from OL');
  });

  it('enriches coverUrl even when first provider throws during enrichment', async () => {
    mockHardcover.getWork.mockResolvedValue({
      title: 'No Cover',
      description: 'Has description',
      averageRating: 4.0,
      source: 'hardcover',
    });
    mockHardcover.getCover.mockRejectedValue(new Error('API timeout'));
    mockOpenlibrary.getCover.mockRejectedValue(new Error('also down'));
    mockGooglebooks.getCover.mockResolvedValue('http://google.com/cover.jpg');

    const resolver = new MetadataResolver();
    const result = await resolver.resolveWork('123');

    expect(result?.coverUrl).toBe('http://google.com/cover.jpg');
  });

  it('keeps averageRating of 0 (does not enrich)', async () => {
    mockHardcover.getWork.mockResolvedValue({
      title: 'Zero Rating',
      description: 'desc',
      coverUrl: 'http://cover.jpg',
      averageRating: 0,
      source: 'hardcover',
    });

    const resolver = new MetadataResolver();
    const result = await resolver.resolveWork('123');

    expect(result?.averageRating).toBe(0);
    expect(mockHardcover.getRating).not.toHaveBeenCalled();
  });

  it('returns null when no provider returns data', async () => {
    const resolver = new MetadataResolver();
    const result = await resolver.resolveWork('123');

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// search()
// ---------------------------------------------------------------------------

describe('MetadataResolver — search()', () => {
  it('detects ISBN-13 (13 digits) and calls searchByIsbn', async () => {
    const results: WorkMetadata[] = [
      { title: 'ISBN Book', source: 'hardcover' },
    ];
    mockHardcover.searchByIsbn.mockResolvedValue(results);

    const resolver = new MetadataResolver();
    const result = await resolver.search('9780134685991');

    expect(mockHardcover.searchByIsbn).toHaveBeenCalledWith(
      '9780134685991',
      undefined
    );
    expect(mockHardcover.searchByText).not.toHaveBeenCalled();
    expect(result).toEqual(results);
  });

  it('detects ISBN-10 (10 digits) and calls searchByIsbn', async () => {
    const results: WorkMetadata[] = [
      { title: 'ISBN Book', source: 'hardcover' },
    ];
    mockHardcover.searchByIsbn.mockResolvedValue(results);

    const resolver = new MetadataResolver();
    const result = await resolver.search('0134685997');

    expect(mockHardcover.searchByIsbn).toHaveBeenCalledWith(
      '0134685997',
      undefined
    );
    expect(result).toEqual(results);
  });

  it('strips dashes and spaces before ISBN detection', async () => {
    const results: WorkMetadata[] = [
      { title: 'ISBN Book', source: 'hardcover' },
    ];
    mockHardcover.searchByIsbn.mockResolvedValue(results);

    const resolver = new MetadataResolver();
    await resolver.search('978-0-13-468599-1');

    expect(mockHardcover.searchByIsbn).toHaveBeenCalledWith(
      '9780134685991',
      undefined
    );
  });

  it('calls searchByText for non-ISBN queries', async () => {
    const results: WorkMetadata[] = [
      { title: 'Harry Potter', source: 'hardcover' },
    ];
    mockHardcover.searchByText.mockResolvedValue(results);

    const resolver = new MetadataResolver();
    const result = await resolver.search('Harry Potter');

    expect(mockHardcover.searchByText).toHaveBeenCalledWith(
      'Harry Potter',
      undefined
    );
    expect(mockHardcover.searchByIsbn).not.toHaveBeenCalled();
    expect(result).toEqual(results);
  });

  it('falls back to next provider when first returns empty results', async () => {
    mockHardcover.searchByText.mockResolvedValue([]);
    const olResults: WorkMetadata[] = [
      { title: 'From OL', source: 'openlibrary' },
    ];
    mockOpenlibrary.searchByText.mockResolvedValue(olResults);

    const resolver = new MetadataResolver();
    const result = await resolver.search('Rare Book');

    expect(result).toEqual(olResults);
  });

  it('returns empty array when all providers fail', async () => {
    mockHardcover.searchByText.mockRejectedValue(new Error('fail'));
    mockOpenlibrary.searchByText.mockRejectedValue(new Error('fail'));
    mockGooglebooks.searchByText.mockRejectedValue(new Error('fail'));

    const resolver = new MetadataResolver();
    const result = await resolver.search('Unknown');

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// fetchEditionsForRequest()
// ---------------------------------------------------------------------------

describe('MetadataResolver — fetchEditionsForRequest()', () => {
  it('combines editions from multiple providers', async () => {
    mockHardcover.getEditions.mockResolvedValue([
      { isbn13: '9780000000001', format: 'ebook', source: 'hardcover' },
    ] as EditionData[]);
    mockOpenlibrary.getEditions.mockResolvedValue([
      { isbn13: '9780000000002', format: 'ebook', source: 'openlibrary' },
    ] as EditionData[]);

    const resolver = new MetadataResolver();
    const result = await resolver.fetchEditionsForRequest(
      { hardcoverId: '123' },
      'ebook',
      'en'
    );

    expect(result).toHaveLength(2);
  });

  it('filters editions by format', async () => {
    mockHardcover.getEditions.mockResolvedValue([
      { isbn13: '111', format: 'ebook', source: 'hardcover' },
      { isbn13: '222', format: 'audiobook', source: 'hardcover' },
    ] as EditionData[]);

    const resolver = new MetadataResolver();
    const result = await resolver.fetchEditionsForRequest(
      { hardcoverId: '123' },
      'ebook',
      'en'
    );

    expect(result).toHaveLength(1);
    expect(result[0].isbn13).toBe('111');
  });

  it('filters by language (keeps requested, en fallback, and unknown)', async () => {
    mockHardcover.getEditions.mockResolvedValue([
      { isbn13: '1', format: 'ebook', language: 'fr', source: 'hardcover' },
      { isbn13: '2', format: 'ebook', language: 'en', source: 'hardcover' },
      { isbn13: '3', format: 'ebook', language: 'de', source: 'hardcover' },
      { isbn13: '4', format: 'ebook', source: 'hardcover' }, // no language
    ] as EditionData[]);

    const resolver = new MetadataResolver();
    const result = await resolver.fetchEditionsForRequest(
      { hardcoverId: '123' },
      'ebook',
      'fr'
    );

    expect(result).toHaveLength(3);
    expect(result.map((e) => e.isbn13)).toEqual(['1', '2', '4']);
  });

  it('deduplicates by isbn13 (first occurrence wins)', async () => {
    mockHardcover.getEditions.mockResolvedValue([
      {
        isbn13: '111',
        format: 'ebook',
        title: 'First',
        source: 'hardcover',
      },
    ] as EditionData[]);
    mockOpenlibrary.getEditions.mockResolvedValue([
      {
        isbn13: '111',
        format: 'ebook',
        title: 'Duplicate',
        source: 'openlibrary',
      },
    ] as EditionData[]);

    const resolver = new MetadataResolver();
    const result = await resolver.fetchEditionsForRequest(
      { hardcoverId: '123' },
      'ebook',
      'en'
    );

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('First');
  });

  it('deduplicates by asin even when isbn13 differs', async () => {
    mockHardcover.getEditions.mockResolvedValue([
      {
        isbn13: '111',
        asin: 'B001',
        format: 'ebook',
        source: 'hardcover',
      },
    ] as EditionData[]);
    mockOpenlibrary.getEditions.mockResolvedValue([
      {
        isbn13: '222',
        asin: 'B001',
        format: 'ebook',
        source: 'openlibrary',
      },
    ] as EditionData[]);

    const resolver = new MetadataResolver();
    const result = await resolver.fetchEditionsForRequest(
      { hardcoverId: '123' },
      'ebook',
      'en'
    );

    expect(result).toHaveLength(1);
    expect(result[0].isbn13).toBe('111');
  });

  it('includes editions without identifiers (cannot deduplicate)', async () => {
    mockHardcover.getEditions.mockResolvedValue([
      { format: 'ebook', title: 'No ID 1', source: 'hardcover' },
      { format: 'ebook', title: 'No ID 2', source: 'hardcover' },
    ] as EditionData[]);

    const resolver = new MetadataResolver();
    const result = await resolver.fetchEditionsForRequest(
      { hardcoverId: '123' },
      'ebook',
      'en'
    );

    expect(result).toHaveLength(2);
  });

  it('continues when a provider throws', async () => {
    mockHardcover.getEditions.mockRejectedValue(new Error('fail'));
    mockOpenlibrary.getEditions.mockResolvedValue([
      { isbn13: '111', format: 'ebook', source: 'openlibrary' },
    ] as EditionData[]);

    const resolver = new MetadataResolver();
    const result = await resolver.fetchEditionsForRequest(
      { hardcoverId: '123' },
      'ebook',
      'en'
    );

    expect(result).toHaveLength(1);
  });
});
