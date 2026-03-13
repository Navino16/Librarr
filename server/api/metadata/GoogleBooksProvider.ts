import ExternalApi from '../externalapi';
import logger from '../../logger';
import { MetadataProvider } from './MetadataProvider';
import { WorkMetadata, EditionData, MetadataSource } from './types';

// ---------------------------------------------------------------------------
// Google Books API response types
// ---------------------------------------------------------------------------

interface GBVolume {
  id: string;
  volumeInfo: {
    title: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    industryIdentifiers?: Array<{ type: string; identifier: string }>;
    pageCount?: number;
    categories?: string[];
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    language?: string;
  };
}

interface GBSearchResponse {
  totalItems: number;
  items?: GBVolume[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map a Google Books volume to the provider-agnostic WorkMetadata shape.
 * Google Books has no concept of Work/Edition hierarchy, so each volume
 * is treated as a standalone work.
 */
function volumeToWorkMetadata(volume: GBVolume): WorkMetadata {
  const info = volume.volumeInfo;

  // Google Books sometimes returns http: URLs for cover images
  let coverUrl: string | undefined;
  if (info.imageLinks?.thumbnail) {
    coverUrl = info.imageLinks.thumbnail.replace(/^http:/, 'https:');
  }

  return {
    title: info.title,
    description: info.description,
    coverUrl,
    publishedDate: info.publishedDate,
    pageCount: info.pageCount,
    authors: info.authors?.map((name) => ({ name })),
    genres: info.categories,
    source: 'googlebooks' as MetadataSource,
  };
}

// ---------------------------------------------------------------------------
// GoogleBooksProvider
// ---------------------------------------------------------------------------

/**
 * MetadataProvider implementation backed by the Google Books API.
 *
 * Google Books is a **limited provider** — it excels at fast ISBN lookups
 * and basic text search, but has no Work/Edition hierarchy. Most single-item
 * metadata methods (getWork, getDescription, getCover, getRating) return null,
 * and getEditions returns an empty array.
 *
 * No API key is required for the public endpoints used here.
 */
export class GoogleBooksProvider
  extends ExternalApi
  implements MetadataProvider
{
  readonly source: MetadataSource = 'googlebooks';

  constructor() {
    super({
      baseUrl: 'https://www.googleapis.com/books/v1',
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
      const params: Record<string, string> = {
        q: query,
        maxResults: '10',
      };
      if (locale) {
        params.langRestrict = locale;
      }

      const data = await this.get<GBSearchResponse>('/volumes', { params });

      if (!data.items || data.items.length === 0) return null;
      return data.items.map(volumeToWorkMetadata);
    } catch (e) {
      logger.error('GoogleBooksProvider.searchByText failed', {
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
    try {
      const params: Record<string, string> = {
        q: `isbn:${isbn}`,
        maxResults: '1',
      };
      if (locale) {
        params.langRestrict = locale;
      }

      const data = await this.get<GBSearchResponse>('/volumes', { params });

      if (!data.items || data.items.length === 0) return null;
      return data.items.map(volumeToWorkMetadata);
    } catch (e) {
      logger.error('GoogleBooksProvider.searchByIsbn failed', {
        error: String(e),
        isbn,
      });
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Work metadata — not supported by Google Books
  // -----------------------------------------------------------------------

  async getWork(
    _id: string,
    _locale?: string
  ): Promise<WorkMetadata | null> {
    return null;
  }

  async getDescription(
    _id: string,
    _locale?: string
  ): Promise<string | null> {
    return null;
  }

  async getCover(_id: string): Promise<string | null> {
    return null;
  }

  async getRating(_id: string): Promise<number | null> {
    return null;
  }

  // -----------------------------------------------------------------------
  // Editions — not supported by Google Books
  // -----------------------------------------------------------------------

  async getEditions(
    _workIdentifiers: {
      hardcoverId?: string;
      openLibraryWorkId?: string;
    },
    _locale?: string
  ): Promise<EditionData[]> {
    return [];
  }
}
