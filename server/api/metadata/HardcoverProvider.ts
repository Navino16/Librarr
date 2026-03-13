import BookInfoApi from '../bookinfo';
import logger from '../../logger';
import Settings from '../../lib/settings';
import { MetadataProvider } from './MetadataProvider';
import { WorkMetadata, EditionData, MetadataSource } from './types';
import { classifyFormat } from './formatClassifier';

// ---------------------------------------------------------------------------
// Hardcover language name to ISO 639-1 locale mapping
// ---------------------------------------------------------------------------

const hardcoverLangToLocale: Record<string, string> = {
  English: 'en',
  French: 'fr',
  German: 'de',
  'Spanish; Castilian': 'es',
  Italian: 'it',
  Portuguese: 'pt',
  'Dutch; Flemish': 'nl',
  Swedish: 'sv',
  Danish: 'da',
  Norwegian: 'no',
  Finnish: 'fi',
  Polish: 'pl',
  Czech: 'cs',
  Hungarian: 'hu',
  'Romanian; Moldavian; Moldovan': 'ro',
  Russian: 'ru',
  Ukrainian: 'uk',
  Japanese: 'ja',
  Chinese: 'zh',
  Korean: 'ko',
  Arabic: 'ar',
  Turkish: 'tr',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a Hardcover language name (e.g. "French") to an ISO 639-1 code.
 * Returns undefined when the language is not recognised.
 */
function toLocale(hardcoverLang?: string): string | undefined {
  if (!hardcoverLang) return undefined;
  return hardcoverLangToLocale[hardcoverLang];
}

/**
 * Map a BookResult (returned by BookInfoApi) to the provider-agnostic
 * WorkMetadata shape. This is the central adapter between the legacy API
 * client and the new metadata layer.
 */
function bookResultToWorkMetadata(
  book: import('@server/models/Book').BookResult
): WorkMetadata {
  return {
    hardcoverId: book.goodreadsId, // goodreadsId actually stores the Hardcover ID
    title: book.title,
    description: book.description,
    coverUrl: book.coverUrl,
    publishedDate: book.publishedDate,
    pageCount: book.pageCount,
    averageRating: book.averageRating,
    ratingsCount: book.ratingsCount,
    sourceUrl: book.sourceUrl,
    authors: book.authors.map((a) => ({
      name: a.name,
      hardcoverId: a.id,
    })),
    series: book.series
      ? {
          name: book.series.name,
          hardcoverId: book.series.id,
          position: book.series.position,
        }
      : undefined,
    genres: book.categories,
    source: 'hardcover' as MetadataSource,
  };
}

// ---------------------------------------------------------------------------
// HardcoverProvider
// ---------------------------------------------------------------------------

/**
 * MetadataProvider implementation backed by the existing BookInfoApi
 * (Hardcover GraphQL client). This is a thin adapter layer that delegates
 * all network calls to BookInfoApi and maps the results to the unified
 * WorkMetadata / EditionData types.
 */
export class HardcoverProvider implements MetadataProvider {
  readonly source: MetadataSource = 'hardcover';

  private api: BookInfoApi;

  constructor(api?: BookInfoApi) {
    if (api) {
      this.api = api;
    } else {
      const token = Settings.getInstance().main.hardcoverToken || undefined;
      this.api = new BookInfoApi(token);
    }
  }

  // -----------------------------------------------------------------------
  // Search
  // -----------------------------------------------------------------------

  async searchByText(
    query: string,
    locale?: string
  ): Promise<WorkMetadata[] | null> {
    try {
      const { results } = await this.api.searchBooks(
        query,
        1,
        20,
        locale
      );
      if (results.length === 0) return null;
      return results.map(bookResultToWorkMetadata);
    } catch (e) {
      logger.error('HardcoverProvider.searchByText failed', {
        error: String(e),
        query,
      });
      return null;
    }
  }

  async searchByIsbn(
    isbn: string,
    locale?: string
  ): Promise<WorkMetadata[] | null> {
    // Hardcover's search endpoint handles ISBN queries as plain text
    return this.searchByText(isbn, locale);
  }

  // -----------------------------------------------------------------------
  // Work metadata
  // -----------------------------------------------------------------------

  async getWork(
    id: string,
    locale?: string
  ): Promise<WorkMetadata | null> {
    try {
      const book = await this.api.getWork(id, locale);
      if (!book) return null;
      return bookResultToWorkMetadata(book);
    } catch (e) {
      logger.error('HardcoverProvider.getWork failed', {
        error: String(e),
        id,
      });
      return null;
    }
  }

  async getDescription(
    id: string,
    locale?: string
  ): Promise<string | null> {
    try {
      const work = await this.getWork(id, locale);
      return work?.description ?? null;
    } catch (e) {
      logger.error('HardcoverProvider.getDescription failed', {
        error: String(e),
        id,
      });
      return null;
    }
  }

  async getCover(id: string): Promise<string | null> {
    try {
      const work = await this.getWork(id);
      return work?.coverUrl ?? null;
    } catch (e) {
      logger.error('HardcoverProvider.getCover failed', {
        error: String(e),
        id,
      });
      return null;
    }
  }

  async getRating(id: string): Promise<number | null> {
    try {
      const work = await this.getWork(id);
      return work?.averageRating ?? null;
    } catch (e) {
      logger.error('HardcoverProvider.getRating failed', {
        error: String(e),
        id,
      });
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Editions
  // -----------------------------------------------------------------------

  async getEditions(
    workIdentifiers: {
      hardcoverId?: string;
      openLibraryWorkId?: string;
    },
    locale?: string
  ): Promise<EditionData[]> {
    const id = workIdentifiers.hardcoverId;
    if (!id) return [];

    try {
      // Fetch the full work which includes edition data from Hardcover
      const book = await this.api.getWork(id, locale);
      if (!book) return [];

      const editions: EditionData[] = [];

      // The BookInfoApi.getWork already returns allEditionIdentifiers as a
      // flat list of "isbn:<value>" / "asin:<value>" strings. However that
      // only contains identifiers without full edition metadata.
      //
      // For the primary edition we can extract richer data from the
      // BookResult itself (the "best" edition selected by BookInfoApi).
      if (book.isbn || book.asin) {
        const isbn = book.isbn;
        editions.push({
          isbn13: isbn && isbn.length === 13 ? isbn : undefined,
          isbn10: isbn && isbn.length === 10 ? isbn : undefined,
          asin: book.asin,
          title: book.title,
          publisher: book.publisher,
          publishedDate: book.publishedDate,
          language: book.languages?.[0]
            ? toLocale(book.languages[0]) ?? book.languages[0]
            : undefined,
          pageCount: book.pageCount,
          coverUrl: book.coverUrl,
          format: classifyFormat(book.editionFormat),
          source: 'hardcover',
        });
      }

      // Add remaining identifiers from allEditionIdentifiers that were not
      // already included as the primary edition.
      if (book.allEditionIdentifiers) {
        const primaryIsbn = book.isbn;
        const primaryAsin = book.asin;

        for (const raw of book.allEditionIdentifiers) {
          const [type, value] = raw.split(':');
          if (!type || !value) continue;

          // Skip if this identifier matches the primary edition
          if (type === 'isbn' && value === primaryIsbn) continue;
          if (type === 'asin' && value === primaryAsin) continue;

          const edition: EditionData = {
            format: 'unknown',
            source: 'hardcover',
          };

          if (type === 'isbn') {
            if (value.length === 13) edition.isbn13 = value;
            else if (value.length === 10) edition.isbn10 = value;
          } else if (type === 'asin') {
            edition.asin = value;
          }

          editions.push(edition);
        }
      }

      return editions;
    } catch (e) {
      logger.error('HardcoverProvider.getEditions failed', {
        error: String(e),
        workIdentifiers,
      });
      return [];
    }
  }
}
