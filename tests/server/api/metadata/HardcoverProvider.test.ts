import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BookResult } from '@server/models/Book';

vi.mock('@server/logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { HardcoverProvider } from '@server/api/metadata/HardcoverProvider';
import logger from '@server/logger';

// ---------------------------------------------------------------------------
// Mock BookInfoApi
// ---------------------------------------------------------------------------

const mockApi = {
  searchBooks: vi.fn(),
  getWork: vi.fn(),
};

function createProvider(): HardcoverProvider {
  return new HardcoverProvider(mockApi as never);
}

function makeBookResult(overrides: Partial<BookResult> = {}): BookResult {
  return {
    goodreadsId: 'hc-123',
    title: 'Test Book',
    authors: [{ id: 'author-1', name: 'Author One' }],
    description: 'A test book description',
    coverUrl: 'https://hardcover.app/cover.jpg',
    publishedDate: '2024-01-01',
    pageCount: 300,
    averageRating: 4.2,
    ratingsCount: 100,
    sourceUrl: 'https://hardcover.app/books/test',
    categories: ['Fiction', 'Fantasy'],
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('HardcoverProvider — constructor', () => {
  it('uses injected api and has source "hardcover"', () => {
    const provider = createProvider();
    expect(provider.source).toBe('hardcover');
  });
});

// ---------------------------------------------------------------------------
// searchByText
// ---------------------------------------------------------------------------

describe('HardcoverProvider — searchByText()', () => {
  it('maps BookResult[] to WorkMetadata[]', async () => {
    const book = makeBookResult({
      series: { id: 'series-1', name: 'Epic Series', position: 2 },
    });
    mockApi.searchBooks.mockResolvedValue({ results: [book] });

    const provider = createProvider();
    const results = await provider.searchByText('test');

    expect(results).toHaveLength(1);
    const work = results![0];
    expect(work.hardcoverId).toBe('hc-123');
    expect(work.title).toBe('Test Book');
    expect(work.description).toBe('A test book description');
    expect(work.coverUrl).toBe('https://hardcover.app/cover.jpg');
    expect(work.averageRating).toBe(4.2);
    expect(work.genres).toEqual(['Fiction', 'Fantasy']);
    expect(work.authors).toEqual([{ name: 'Author One', hardcoverId: 'author-1' }]);
    expect(work.series).toEqual({
      name: 'Epic Series',
      hardcoverId: 'series-1',
      position: 2,
    });
    expect(work.source).toBe('hardcover');
  });

  it('passes query, page=1, limit=20 and locale to searchBooks', async () => {
    mockApi.searchBooks.mockResolvedValue({ results: [makeBookResult()] });

    const provider = createProvider();
    await provider.searchByText('fantasy novels', 'fr');

    expect(mockApi.searchBooks).toHaveBeenCalledWith('fantasy novels', 1, 20, 'fr');
  });

  it('returns null when results is empty', async () => {
    mockApi.searchBooks.mockResolvedValue({ results: [] });

    const provider = createProvider();
    const result = await provider.searchByText('nothing');

    expect(result).toBeNull();
  });

  it('returns null and logs when api throws', async () => {
    mockApi.searchBooks.mockRejectedValue(new Error('network error'));

    const provider = createProvider();
    const result = await provider.searchByText('fail');

    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      'HardcoverProvider.searchByText failed',
      expect.objectContaining({ query: 'fail' })
    );
  });

  it('maps series as undefined when not present', async () => {
    mockApi.searchBooks.mockResolvedValue({
      results: [makeBookResult({ series: undefined })],
    });

    const provider = createProvider();
    const results = await provider.searchByText('test');

    expect(results![0].series).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// searchByIsbn
// ---------------------------------------------------------------------------

describe('HardcoverProvider — searchByIsbn()', () => {
  it('delegates to searchByText (calls searchBooks with isbn)', async () => {
    mockApi.searchBooks.mockResolvedValue({ results: [makeBookResult()] });

    const provider = createProvider();
    await provider.searchByIsbn('9780000000001', 'en');

    expect(mockApi.searchBooks).toHaveBeenCalledWith('9780000000001', 1, 20, 'en');
  });
});

// ---------------------------------------------------------------------------
// getWork
// ---------------------------------------------------------------------------

describe('HardcoverProvider — getWork()', () => {
  it('returns WorkMetadata when api returns a book', async () => {
    mockApi.getWork.mockResolvedValue(makeBookResult());

    const provider = createProvider();
    const result = await provider.getWork('hc-123');

    expect(result).not.toBeNull();
    expect(result!.hardcoverId).toBe('hc-123');
    expect(result!.title).toBe('Test Book');
  });

  it('returns null when api returns null', async () => {
    mockApi.getWork.mockResolvedValue(null);

    const provider = createProvider();
    const result = await provider.getWork('hc-unknown');

    expect(result).toBeNull();
  });

  it('returns null and logs when api throws', async () => {
    mockApi.getWork.mockRejectedValue(new Error('timeout'));

    const provider = createProvider();
    const result = await provider.getWork('hc-fail');

    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      'HardcoverProvider.getWork failed',
      expect.objectContaining({ id: 'hc-fail' })
    );
  });

  it('passes locale as 2nd argument', async () => {
    mockApi.getWork.mockResolvedValue(makeBookResult());

    const provider = createProvider();
    await provider.getWork('hc-123', 'fr');

    expect(mockApi.getWork).toHaveBeenCalledWith('hc-123', 'fr');
  });
});

// ---------------------------------------------------------------------------
// getDescription / getCover / getRating
// ---------------------------------------------------------------------------

describe('HardcoverProvider — getDescription()', () => {
  it('returns description when present', async () => {
    mockApi.getWork.mockResolvedValue(makeBookResult({ description: 'Great book' }));

    const provider = createProvider();
    const result = await provider.getDescription('hc-123');

    expect(result).toBe('Great book');
  });

  it('returns null when description is absent', async () => {
    mockApi.getWork.mockResolvedValue(makeBookResult({ description: undefined }));

    const provider = createProvider();
    const result = await provider.getDescription('hc-123');

    expect(result).toBeNull();
  });

  it('returns null when getWork returns null', async () => {
    mockApi.getWork.mockResolvedValue(null);

    const provider = createProvider();
    const result = await provider.getDescription('hc-unknown');

    expect(result).toBeNull();
  });
});

describe('HardcoverProvider — getCover()', () => {
  it('returns coverUrl when present', async () => {
    mockApi.getWork.mockResolvedValue(makeBookResult({ coverUrl: 'https://img.jpg' }));

    const provider = createProvider();
    const result = await provider.getCover('hc-123');

    expect(result).toBe('https://img.jpg');
  });

  it('returns null when coverUrl is absent', async () => {
    mockApi.getWork.mockResolvedValue(makeBookResult({ coverUrl: undefined }));

    const provider = createProvider();
    const result = await provider.getCover('hc-123');

    expect(result).toBeNull();
  });

  it('returns null when getWork returns null', async () => {
    mockApi.getWork.mockResolvedValue(null);

    const provider = createProvider();
    const result = await provider.getCover('hc-unknown');

    expect(result).toBeNull();
  });

  it('returns null and logs when internal getWork throws', async () => {
    const provider = createProvider();
    vi.spyOn(provider, 'getWork').mockRejectedValue(new Error('unexpected'));

    const result = await provider.getCover('hc-fail');

    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      'HardcoverProvider.getCover failed',
      expect.objectContaining({ id: 'hc-fail' })
    );
  });
});

describe('HardcoverProvider — getRating()', () => {
  it('returns averageRating when present', async () => {
    mockApi.getWork.mockResolvedValue(makeBookResult({ averageRating: 4.5 }));

    const provider = createProvider();
    const result = await provider.getRating('hc-123');

    expect(result).toBe(4.5);
  });

  it('returns null when averageRating is absent', async () => {
    mockApi.getWork.mockResolvedValue(makeBookResult({ averageRating: undefined }));

    const provider = createProvider();
    const result = await provider.getRating('hc-123');

    expect(result).toBeNull();
  });

  it('returns null when getWork returns null', async () => {
    mockApi.getWork.mockResolvedValue(null);

    const provider = createProvider();
    const result = await provider.getRating('hc-unknown');

    expect(result).toBeNull();
  });

  it('returns null and logs when internal getWork throws', async () => {
    const provider = createProvider();
    vi.spyOn(provider, 'getWork').mockRejectedValue(new Error('unexpected'));

    const result = await provider.getRating('hc-fail');

    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      'HardcoverProvider.getRating failed',
      expect.objectContaining({ id: 'hc-fail' })
    );
  });
});

// ---------------------------------------------------------------------------
// getEditions
// ---------------------------------------------------------------------------

describe('HardcoverProvider — getEditions()', () => {
  it('returns [] when no hardcoverId', async () => {
    const provider = createProvider();
    const result = await provider.getEditions({});

    expect(result).toEqual([]);
    expect(mockApi.getWork).not.toHaveBeenCalled();
  });

  it('returns [] when api.getWork returns null', async () => {
    mockApi.getWork.mockResolvedValue(null);

    const provider = createProvider();
    const result = await provider.getEditions({ hardcoverId: 'hc-123' });

    expect(result).toEqual([]);
  });

  it('builds primary edition with isbn13 (13 chars)', async () => {
    mockApi.getWork.mockResolvedValue(
      makeBookResult({ isbn: '9780000000001', asin: undefined })
    );

    const provider = createProvider();
    const result = await provider.getEditions({ hardcoverId: 'hc-123' });

    expect(result).toHaveLength(1);
    expect(result[0].isbn13).toBe('9780000000001');
    expect(result[0].isbn10).toBeUndefined();
  });

  it('builds primary edition with isbn10 (10 chars)', async () => {
    mockApi.getWork.mockResolvedValue(
      makeBookResult({ isbn: '0000000001', asin: undefined })
    );

    const provider = createProvider();
    const result = await provider.getEditions({ hardcoverId: 'hc-123' });

    expect(result).toHaveLength(1);
    expect(result[0].isbn10).toBe('0000000001');
    expect(result[0].isbn13).toBeUndefined();
  });

  it('includes asin in primary edition', async () => {
    mockApi.getWork.mockResolvedValue(
      makeBookResult({ isbn: '9780000000001', asin: 'B00TEST123' })
    );

    const provider = createProvider();
    const result = await provider.getEditions({ hardcoverId: 'hc-123' });

    expect(result[0].asin).toBe('B00TEST123');
  });

  it('maps language via toLocale ("French" → "fr")', async () => {
    mockApi.getWork.mockResolvedValue(
      makeBookResult({
        isbn: '9780000000001',
        languages: ['French'],
      })
    );

    const provider = createProvider();
    const result = await provider.getEditions({ hardcoverId: 'hc-123' });

    expect(result[0].language).toBe('fr');
  });

  it('keeps raw language when toLocale returns undefined ("Klingon")', async () => {
    mockApi.getWork.mockResolvedValue(
      makeBookResult({
        isbn: '9780000000001',
        languages: ['Klingon'],
      })
    );

    const provider = createProvider();
    const result = await provider.getEditions({ hardcoverId: 'hc-123' });

    expect(result[0].language).toBe('Klingon');
  });

  it('classifies format via classifyFormat', async () => {
    mockApi.getWork.mockResolvedValue(
      makeBookResult({
        isbn: '9780000000001',
        editionFormat: 'Hardcover',
      })
    );

    const provider = createProvider();
    const result = await provider.getEditions({ hardcoverId: 'hc-123' });

    expect(result[0].format).toBe('hardcover');
  });

  it('parses allEditionIdentifiers: isbn:13chars → isbn13, isbn:10chars → isbn10, asin:value → asin', async () => {
    mockApi.getWork.mockResolvedValue(
      makeBookResult({
        isbn: '9780000000001',
        asin: undefined,
        allEditionIdentifiers: [
          'isbn:9781111111111',
          'isbn:1111111111',
          'asin:B00OTHER123',
        ],
      })
    );

    const provider = createProvider();
    const result = await provider.getEditions({ hardcoverId: 'hc-123' });

    // Primary edition + 3 from allEditionIdentifiers
    expect(result).toHaveLength(4);
    expect(result[1].isbn13).toBe('9781111111111');
    expect(result[2].isbn10).toBe('1111111111');
    expect(result[3].asin).toBe('B00OTHER123');
  });

  it('skips identifiers matching the primary edition (isbn and asin)', async () => {
    mockApi.getWork.mockResolvedValue(
      makeBookResult({
        isbn: '9780000000001',
        asin: 'B00TEST123',
        allEditionIdentifiers: [
          'isbn:9780000000001', // same as primary isbn → skip
          'asin:B00TEST123',   // same as primary asin → skip
          'isbn:9781111111111', // different → keep
        ],
      })
    );

    const provider = createProvider();
    const result = await provider.getEditions({ hardcoverId: 'hc-123' });

    // Primary + 1 extra
    expect(result).toHaveLength(2);
    expect(result[1].isbn13).toBe('9781111111111');
  });

  it('skips malformed identifiers (no ":", empty value)', async () => {
    mockApi.getWork.mockResolvedValue(
      makeBookResult({
        isbn: '9780000000001',
        allEditionIdentifiers: [
          'isbn',         // no colon
          'isbn:',        // empty value
          'asin:B00GOOD1', // valid
        ],
      })
    );

    const provider = createProvider();
    const result = await provider.getEditions({ hardcoverId: 'hc-123' });

    // Primary + 1 valid
    expect(result).toHaveLength(2);
    expect(result[1].asin).toBe('B00GOOD1');
  });

  it('skips primary edition when book has neither isbn nor asin', async () => {
    mockApi.getWork.mockResolvedValue(
      makeBookResult({
        isbn: undefined,
        asin: undefined,
        allEditionIdentifiers: ['isbn:9781111111111'],
      })
    );

    const provider = createProvider();
    const result = await provider.getEditions({ hardcoverId: 'hc-123' });

    // Only from allEditionIdentifiers, no primary
    expect(result).toHaveLength(1);
    expect(result[0].isbn13).toBe('9781111111111');
  });

  it('returns [] and logs when api throws', async () => {
    mockApi.getWork.mockRejectedValue(new Error('boom'));

    const provider = createProvider();
    const result = await provider.getEditions({ hardcoverId: 'hc-123' });

    expect(result).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith(
      'HardcoverProvider.getEditions failed',
      expect.objectContaining({ workIdentifiers: { hardcoverId: 'hc-123' } })
    );
  });
});
