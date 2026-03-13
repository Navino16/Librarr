import logger from '../../logger';
import { MetadataProvider } from './MetadataProvider';
import { WorkMetadata, EditionData, MetadataSource } from './types';
import { HardcoverProvider } from './HardcoverProvider';
import { OpenLibraryProvider } from './OpenLibraryProvider';
import { GoogleBooksProvider } from './GoogleBooksProvider';
import type { MetadataProviderSettings } from '@server/types/settings';

export type { MetadataProviderSettings } from '@server/types/settings';

export const DEFAULT_METADATA_PROVIDERS: MetadataProviderSettings = {
  hardcover: { enabled: true },
  openlibrary: { enabled: true },
  googlebooks: { enabled: true },
  priority: {
    search: ['hardcover', 'openlibrary', 'googlebooks'],
    description: ['hardcover', 'openlibrary', 'googlebooks'],
    cover: ['hardcover', 'openlibrary', 'googlebooks'],
    editions: ['hardcover', 'openlibrary'],
    ratings: ['hardcover'],
  },
};

// ---------------------------------------------------------------------------
// ISBN detection regex — matches ISBN-10 (10 digits) or ISBN-13 (13 digits)
// ---------------------------------------------------------------------------

const ISBN_REGEX = /^\d{10}(\d{3})?$/;

// ---------------------------------------------------------------------------
// MetadataResolver
// ---------------------------------------------------------------------------

/**
 * Central orchestrator that combines multiple metadata providers with
 * configurable priority per field type.
 *
 * The resolver does NOT cache anything itself — each provider is responsible
 * for its own caching via the CacheManager instances in `caches.ts`.
 *
 * Usage:
 *   const resolver = new MetadataResolver();           // uses defaults
 *   const resolver = new MetadataResolver(customCfg);  // custom settings
 *
 *   const work = await resolver.resolveWork('12345');
 *   const editions = await resolver.fetchEditionsForRequest(
 *     { hardcoverId: '12345' }, 'ebook', 'fr'
 *   );
 */
export class MetadataResolver {
  private config: MetadataProviderSettings;
  private providers: Map<MetadataSource, MetadataProvider>;

  constructor(config?: MetadataProviderSettings) {
    this.config = config ?? DEFAULT_METADATA_PROVIDERS;
    this.providers = new Map();

    // Instantiate only the enabled providers
    if (this.config.hardcover.enabled) {
      this.providers.set('hardcover', new HardcoverProvider());
    }
    if (this.config.openlibrary.enabled) {
      this.providers.set('openlibrary', new OpenLibraryProvider());
    }
    if (this.config.googlebooks.enabled) {
      this.providers.set('googlebooks', new GoogleBooksProvider());
    }

    logger.debug('MetadataResolver initialized', {
      enabledProviders: Array.from(this.providers.keys()),
    });
  }

  // -----------------------------------------------------------------------
  // Public: resolve a full work with enrichment
  // -----------------------------------------------------------------------

  /**
   * Fetch a work by its Hardcover ID and enrich missing fields using the
   * configured priority chain. The first search provider returns the base
   * metadata, then each missing field is filled from the next available
   * provider in priority order.
   */
  async resolveWork(
    hardcoverId: string,
    locale?: string
  ): Promise<WorkMetadata | null> {
    // Get base metadata from the first enabled search provider
    const searchSources = this.config.priority.search;
    let base: WorkMetadata | null = null;

    for (const source of searchSources) {
      const provider = this.getProvider(source);
      if (!provider) continue;

      try {
        base = await provider.getWork(hardcoverId, locale);
        if (base) break;
      } catch (e) {
        logger.warn(`MetadataResolver.resolveWork: ${source}.getWork failed`, {
          error: String(e),
          hardcoverId,
        });
      }
    }

    if (!base) {
      logger.debug('MetadataResolver.resolveWork: no provider returned data', {
        hardcoverId,
      });
      return null;
    }

    // Enrich missing fields from other providers by priority
    if (!base.description) {
      const description = await this.resolveField(
        'description',
        this.config.priority.description,
        (provider) => provider.getDescription(hardcoverId, locale)
      );
      if (description) {
        base.description = description;
      }
    }

    if (!base.coverUrl) {
      const coverUrl = await this.resolveField(
        'cover',
        this.config.priority.cover,
        (provider) => provider.getCover(hardcoverId)
      );
      if (coverUrl) {
        base.coverUrl = coverUrl;
      }
    }

    if (base.averageRating == null) {
      const rating = await this.resolveField(
        'ratings',
        this.config.priority.ratings,
        (provider) => provider.getRating(hardcoverId)
      );
      if (rating != null) {
        base.averageRating = rating;
      }
    }

    return base;
  }

  // -----------------------------------------------------------------------
  // Public: fetch editions for a request
  // -----------------------------------------------------------------------

  /**
   * Fetch editions matching the requested format and language, combining
   * results from multiple providers in priority order.
   *
   * Language filtering: keeps editions matching the requested language,
   * 'en' as a fallback, or editions with unknown/missing language.
   *
   * Deduplication: editions are deduplicated by isbn13, isbn10, or asin
   * so that the same edition from multiple providers appears only once.
   */
  async fetchEditionsForRequest(
    workIdentifiers: {
      hardcoverId?: string;
      openLibraryWorkId?: string;
    },
    format: 'ebook' | 'audiobook',
    language: string
  ): Promise<EditionData[]> {
    const editionSources = this.config.priority.editions;
    const allEditions: EditionData[] = [];

    for (const source of editionSources) {
      const provider = this.getProvider(source);
      if (!provider) continue;

      try {
        const editions = await provider.getEditions(
          workIdentifiers,
          language
        );
        allEditions.push(...editions);
      } catch (e) {
        logger.warn(
          `MetadataResolver.fetchEditionsForRequest: ${source}.getEditions failed`,
          { error: String(e), workIdentifiers }
        );
      }
    }

    // Filter by format
    const formatFiltered = allEditions.filter(
      (ed) => ed.format === format
    );

    // Filter by language: keep requested language, 'en' fallback, or unknown
    const langFiltered = formatFiltered.filter((ed) => {
      if (!ed.language) return true; // unknown language — include
      return ed.language === language || ed.language === 'en';
    });

    // Deduplicate by isbn13, isbn10, or asin
    return this.deduplicateEditions(langFiltered);
  }

  // -----------------------------------------------------------------------
  // Public: search
  // -----------------------------------------------------------------------

  /**
   * Search for works by text query or ISBN. ISBN detection is automatic:
   * if the cleaned query matches a 10- or 13-digit number, it is treated
   * as an ISBN search.
   *
   * Providers are tried in priority order; the first non-empty result wins.
   */
  async search(
    query: string,
    locale?: string
  ): Promise<WorkMetadata[]> {
    const cleaned = query.replace(/[-\s]/g, '');
    const isIsbn = ISBN_REGEX.test(cleaned);

    const searchSources = this.config.priority.search;

    for (const source of searchSources) {
      const provider = this.getProvider(source);
      if (!provider) continue;

      try {
        const results = isIsbn
          ? await provider.searchByIsbn(cleaned, locale)
          : await provider.searchByText(query, locale);

        if (results && results.length > 0) {
          return results;
        }
      } catch (e) {
        logger.warn(
          `MetadataResolver.search: ${source} search failed, trying next`,
          { error: String(e), query, isIsbn }
        );
      }
    }

    return [];
  }

  // -----------------------------------------------------------------------
  // Private: resolve a single field from prioritized providers
  // -----------------------------------------------------------------------

  /**
   * Iterate through sources in priority order and return the first non-null
   * value returned by the getter function.
   */
  private async resolveField<T>(
    fieldType: string,
    sources: MetadataSource[],
    getter: (provider: MetadataProvider) => Promise<T | null>
  ): Promise<T | null> {
    for (const source of sources) {
      const provider = this.getProvider(source);
      if (!provider) continue;

      try {
        const value = await getter(provider);
        if (value != null) return value;
      } catch (e) {
        logger.warn(
          `MetadataResolver.resolveField(${fieldType}): ${source} failed`,
          { error: String(e) }
        );
      }
    }

    return null;
  }

  // -----------------------------------------------------------------------
  // Private: provider helpers
  // -----------------------------------------------------------------------

  /**
   * Return a provider by source name, or undefined if not enabled.
   */
  private getProvider(source: MetadataSource): MetadataProvider | undefined {
    return this.providers.get(source);
  }

  // -----------------------------------------------------------------------
  // Private: deduplication
  // -----------------------------------------------------------------------

  /**
   * Remove duplicate editions based on isbn13, isbn10, or asin.
   * The first occurrence of each identifier wins (preserving priority order).
   */
  private deduplicateEditions(editions: EditionData[]): EditionData[] {
    const seen = new Set<string>();
    const result: EditionData[] = [];

    for (const edition of editions) {
      // Build a dedup key from available identifiers
      const keys: string[] = [];
      if (edition.isbn13) keys.push(`isbn13:${edition.isbn13}`);
      if (edition.isbn10) keys.push(`isbn10:${edition.isbn10}`);
      if (edition.asin) keys.push(`asin:${edition.asin}`);

      // If no identifiers at all, always include (cannot deduplicate)
      if (keys.length === 0) {
        result.push(edition);
        continue;
      }

      // Check if ANY of this edition's keys were already seen
      const isDuplicate = keys.some((key) => seen.has(key));
      if (!isDuplicate) {
        keys.forEach((key) => seen.add(key));
        result.push(edition);
      }
    }

    return result;
  }
}
