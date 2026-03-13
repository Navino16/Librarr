import ExternalApi from '../externalapi';
import logger from '../../logger';
import { MetadataProvider } from './MetadataProvider';
import { WorkMetadata, EditionData, EditionFormat, MetadataSource } from './types';
import { classifyFormat } from './formatClassifier';

// ---------------------------------------------------------------------------
// OpenLibrary language key to ISO 639-1 locale mapping
// ---------------------------------------------------------------------------

const OL_LANG_MAP: Record<string, string> = {
  eng: 'en',
  fre: 'fr',
  ger: 'de',
  spa: 'es',
  ita: 'it',
  por: 'pt',
  dut: 'nl',
  swe: 'sv',
  dan: 'da',
  nor: 'no',
  fin: 'fi',
  pol: 'pl',
  cze: 'cs',
  hun: 'hu',
  rum: 'ro',
  rus: 'ru',
  ukr: 'uk',
  jpn: 'ja',
  chi: 'zh',
  kor: 'ko',
  ara: 'ar',
  tur: 'tr',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert an OpenLibrary language key (e.g. "/languages/fre") to an
 * ISO 639-1 code (e.g. "fr"). Returns undefined when unrecognised.
 */
function olLangToLocale(langKey?: string): string | undefined {
  if (!langKey) return undefined;
  // Extract the language code from the key path, e.g. "/languages/fre" → "fre"
  const code = langKey.split('/').pop();
  if (!code) return undefined;
  return OL_LANG_MAP[code];
}

/**
 * Classify OpenLibrary's physical_format field into a normalised EditionFormat.
 * Falls back to the generic classifyFormat from formatClassifier.ts which
 * already handles most common strings.
 */
function classifyOLFormat(format?: string): EditionFormat {
  return classifyFormat(format);
}

/**
 * Normalise an OpenLibrary work key to just the ID part.
 * Accepts "/works/OL45804W" or "OL45804W" and always returns "OL45804W".
 */
function normaliseWorkId(id: string): string {
  return id.replace(/^\/works\//, '');
}

/**
 * Extract a text description from OpenLibrary's description field which can
 * be either a plain string or an object with a `value` property.
 */
function extractDescription(
  description?: string | { value: string }
): string | undefined {
  if (!description) return undefined;
  if (typeof description === 'string') return description;
  return description.value;
}

// ---------------------------------------------------------------------------
// OpenLibrary API response types (partial)
// ---------------------------------------------------------------------------

interface OLSearchDoc {
  key: string; // e.g. "/works/OL45804W"
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  number_of_pages_median?: number;
  subject?: string[];
}

interface OLSearchResponse {
  docs: OLSearchDoc[];
  numFound: number;
}

interface OLWorkResponse {
  key: string;
  title: string;
  description?: string | { value: string };
  covers?: number[];
  subjects?: string[];
}

interface OLEditionResponse {
  key: string;
  title?: string;
  isbn_13?: string[];
  isbn_10?: string[];
  publishers?: string[];
  publish_date?: string;
  languages?: Array<{ key: string }>;
  physical_format?: string;
  number_of_pages?: number;
  covers?: number[];
  works?: Array<{ key: string }>;
}

interface OLEditionsListResponse {
  entries: OLEditionResponse[];
}

// ---------------------------------------------------------------------------
// OpenLibraryProvider
// ---------------------------------------------------------------------------

/**
 * MetadataProvider implementation backed by the OpenLibrary REST API.
 *
 * OpenLibrary is a free, open-source library catalog with excellent ISBN and
 * edition coverage. It uses a simple REST API with JSON responses.
 *
 * Rate limit: 3 req/s when a proper User-Agent is provided (1 req/s otherwise).
 * We set a 340ms minimum gap between requests to stay under 3 req/s.
 */
export class OpenLibraryProvider
  extends ExternalApi
  implements MetadataProvider
{
  readonly source: MetadataSource = 'openlibrary';

  constructor() {
    super({
      baseUrl: 'https://openlibrary.org',
      headers: {
        'User-Agent': 'Librarr/1.0 (https://github.com/librarr)',
      },
      rateLimit: 340, // ~3 requests per second
    });
  }

  // -----------------------------------------------------------------------
  // Search
  // -----------------------------------------------------------------------

  async searchByText(
    query: string,
    locale?: string
  ): Promise<WorkMetadata[] | null> {
    try {
      const params: Record<string, string | number> = {
        q: query,
        limit: 20,
      };
      if (locale) {
        params.language = locale;
      }

      const data = await this.get<OLSearchResponse>('/search.json', {
        params,
      });

      if (!data.docs || data.docs.length === 0) return null;

      return data.docs.map((doc) => this.searchDocToWorkMetadata(doc));
    } catch (e) {
      logger.error('OpenLibraryProvider.searchByText failed', {
        error: String(e),
        query,
      });
      return null;
    }
  }

  async searchByIsbn(
    isbn: string,
    _locale?: string
  ): Promise<WorkMetadata[] | null> {
    try {
      // Fetch the edition directly by ISBN
      const edition = await this.get<OLEditionResponse>(
        `/isbn/${isbn}.json`
      );

      if (!edition) return null;

      // Get the work key from the edition to fetch full work data
      const workKey = edition.works?.[0]?.key;
      if (!workKey) {
        // No linked work — build a minimal WorkMetadata from the edition
        return [this.editionToWorkMetadata(edition)];
      }

      // Fetch the full work
      const work = await this.get<OLWorkResponse>(`${workKey}.json`);
      if (!work) {
        return [this.editionToWorkMetadata(edition)];
      }

      const metadata = this.workToWorkMetadata(work);

      // Enrich with edition-level data if work data is sparse
      if (!metadata.coverUrl && edition.covers?.[0]) {
        metadata.coverUrl = `https://covers.openlibrary.org/b/id/${edition.covers[0]}-L.jpg`;
      }

      return [metadata];
    } catch (e: unknown) {
      // 404 means the ISBN is not in OpenLibrary — not an error
      if (this.isNotFound(e)) return null;

      logger.error('OpenLibraryProvider.searchByIsbn failed', {
        error: String(e),
        isbn,
      });
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Work metadata
  // -----------------------------------------------------------------------

  async getWork(
    id: string,
    _locale?: string
  ): Promise<WorkMetadata | null> {
    try {
      const workId = normaliseWorkId(id);
      const work = await this.get<OLWorkResponse>(
        `/works/${workId}.json`
      );
      if (!work) return null;
      return this.workToWorkMetadata(work);
    } catch (e: unknown) {
      if (this.isNotFound(e)) return null;

      logger.error('OpenLibraryProvider.getWork failed', {
        error: String(e),
        id,
      });
      return null;
    }
  }

  async getDescription(
    id: string,
    _locale?: string
  ): Promise<string | null> {
    try {
      const workId = normaliseWorkId(id);
      const work = await this.get<OLWorkResponse>(
        `/works/${workId}.json`
      );
      if (!work) return null;
      return extractDescription(work.description) ?? null;
    } catch (e: unknown) {
      if (this.isNotFound(e)) return null;

      logger.error('OpenLibraryProvider.getDescription failed', {
        error: String(e),
        id,
      });
      return null;
    }
  }

  async getCover(id: string): Promise<string | null> {
    try {
      const workId = normaliseWorkId(id);
      const work = await this.get<OLWorkResponse>(
        `/works/${workId}.json`
      );
      if (!work?.covers?.[0]) return null;
      return `https://covers.openlibrary.org/b/id/${work.covers[0]}-L.jpg`;
    } catch (e: unknown) {
      if (this.isNotFound(e)) return null;

      logger.error('OpenLibraryProvider.getCover failed', {
        error: String(e),
        id,
      });
      return null;
    }
  }

  async getRating(_id: string): Promise<number | null> {
    // OpenLibrary public API does not easily expose ratings
    return null;
  }

  // -----------------------------------------------------------------------
  // Editions
  // -----------------------------------------------------------------------

  async getEditions(
    workIdentifiers: {
      hardcoverId?: string;
      openLibraryWorkId?: string;
    },
    _locale?: string
  ): Promise<EditionData[]> {
    const id = workIdentifiers.openLibraryWorkId;
    if (!id) return [];

    try {
      const workId = normaliseWorkId(id);
      const data = await this.get<OLEditionsListResponse>(
        `/works/${workId}/editions.json`,
        { params: { limit: 50 } }
      );

      if (!data.entries || data.entries.length === 0) return [];

      // Only include editions that have at least one ISBN
      return data.entries
        .filter((entry) => entry.isbn_13?.length || entry.isbn_10?.length)
        .map((entry) => this.editionResponseToEditionData(entry));
    } catch (e) {
      logger.error('OpenLibraryProvider.getEditions failed', {
        error: String(e),
        workIdentifiers,
      });
      return [];
    }
  }

  // -----------------------------------------------------------------------
  // Private mapping helpers
  // -----------------------------------------------------------------------

  /**
   * Map an OpenLibrary search doc to WorkMetadata.
   */
  private searchDocToWorkMetadata(doc: OLSearchDoc): WorkMetadata {
    const workId = doc.key.replace(/^\/works\//, '');
    return {
      openLibraryWorkId: workId,
      title: doc.title,
      authors: doc.author_name?.map((name) => ({ name })),
      publishedDate: doc.first_publish_year?.toString(),
      coverUrl: doc.cover_i
        ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
        : undefined,
      pageCount: doc.number_of_pages_median,
      genres: doc.subject?.slice(0, 10),
      sourceUrl: `https://openlibrary.org${doc.key}`,
      source: 'openlibrary',
    };
  }

  /**
   * Map an OpenLibrary work response to WorkMetadata.
   */
  private workToWorkMetadata(work: OLWorkResponse): WorkMetadata {
    const workId = work.key.replace(/^\/works\//, '');
    return {
      openLibraryWorkId: workId,
      title: work.title,
      description: extractDescription(work.description),
      coverUrl: work.covers?.[0]
        ? `https://covers.openlibrary.org/b/id/${work.covers[0]}-L.jpg`
        : undefined,
      genres: work.subjects?.slice(0, 10),
      sourceUrl: `https://openlibrary.org${work.key}`,
      source: 'openlibrary',
    };
  }

  /**
   * Build a minimal WorkMetadata from an edition response (used when a work
   * cannot be fetched but the edition itself has enough data).
   */
  private editionToWorkMetadata(edition: OLEditionResponse): WorkMetadata {
    return {
      openLibraryWorkId: edition.works?.[0]?.key?.replace(
        /^\/works\//,
        ''
      ),
      title: edition.title ?? 'Unknown Title',
      coverUrl: edition.covers?.[0]
        ? `https://covers.openlibrary.org/b/id/${edition.covers[0]}-L.jpg`
        : undefined,
      pageCount: edition.number_of_pages,
      sourceUrl: `https://openlibrary.org${edition.key}`,
      source: 'openlibrary',
    };
  }

  /**
   * Map an OpenLibrary edition response to the normalised EditionData type.
   */
  private editionResponseToEditionData(entry: OLEditionResponse): EditionData {
    return {
      isbn13: entry.isbn_13?.[0],
      isbn10: entry.isbn_10?.[0],
      title: entry.title,
      publisher: entry.publishers?.[0],
      publishedDate: entry.publish_date,
      language: olLangToLocale(entry.languages?.[0]?.key),
      format: classifyOLFormat(entry.physical_format),
      pageCount: entry.number_of_pages,
      coverUrl: entry.covers?.[0]
        ? `https://covers.openlibrary.org/b/id/${entry.covers[0]}-L.jpg`
        : undefined,
      source: 'openlibrary',
    };
  }

  /**
   * Check whether an error is a 404 Not Found response.
   */
  private isNotFound(error: unknown): boolean {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const status = (error as any)?.response?.status;
    return status === 404;
  }
}
