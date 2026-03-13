import ExternalApi from '../externalapi';
import { BookResult, AuthorResult, AuthorSummary, SeriesSummary } from '../../models/Book';
import cacheManager from '../../lib/cache';
import logger from '../../logger';

// ---------------------------------------------------------------------------
// Hardcover GraphQL response types
// ---------------------------------------------------------------------------

interface HCImage {
  url: string;
}

interface HCLanguage {
  language: string;
}

interface HCEdition {
  title?: string;
  isbn_13?: string;
  isbn_10?: string;
  asin?: string;
  image?: HCImage;
  pages?: number;
  release_date?: string;
  language?: HCLanguage;
  score?: number;
  edition_format?: string;
}

interface HCAuthorRef {
  id: number;
  name: string;
  slug: string;
  image?: HCImage;
}

interface HCContribution {
  author: HCAuthorRef;
}

interface HCSeries {
  id: number;
  name: string;
  slug: string;
  books_count?: number;
}

interface HCBookSeries {
  position?: number;
  series: HCSeries;
}

interface HCSeriesBookEntry {
  position?: number;
  book: HCBook & {
    contributions?: HCContribution[];
  };
}

interface HCSeriesResponse {
  data: {
    series_by_pk: HCSeries & {
      book_series: HCSeriesBookEntry[];
    };
  };
}

interface HCBook {
  id: number;
  title: string;
  slug: string;
  description?: string;
  pages?: number;
  release_date?: string;
  image?: HCImage;
  contributions?: HCContribution[];
  cached_tags?: Record<string, { tag: string }[]>;
  editions?: HCEdition[];
  localizedEditions?: HCEdition[];
  digitalEditions?: HCEdition[];
  localizedDigitalEditions?: HCEdition[];
  ebookEditions?: HCEdition[];
  audiobookEditions?: HCEdition[];
  allEditions?: HCEdition[];
  rating?: number;
  ratings_count?: number;
  book_series?: HCBookSeries[];
}

interface HCBookWithStats extends HCBook {
  users_read_count?: number;
}

interface HCAuthorContribution {
  book: HCBookWithStats & {
    contributions?: { author: { id: number; name: string; slug: string } }[];
  };
}

interface HCAuthor {
  id: number;
  name: string;
  bio?: string;
  slug: string;
  image?: HCImage;
  contributions?: HCAuthorContribution[];
}

interface HCSearchDoc {
  id: number | string;
  title: string;
  slug: string;
  image?: HCImage;
  author_names?: string[];
  release_year?: number;
  cached_tags?: string[];
  rating?: number;
  ratings_count?: number;
  pages?: number;
}

interface HCSearchHit {
  document: HCSearchDoc;
}

interface HCSearchResponse {
  data: {
    search: {
      results: {
        hits: HCSearchHit[];
        found: number;
      };
    };
  };
}

interface HCBookResponse {
  data: {
    books: HCBook[];
  };
}

interface HCAuthorResponse {
  data: {
    authors: HCAuthor[];
  };
}

interface HCAuthorBooksResponse {
  data: {
    authors: Array<{
      contributions_aggregate: { aggregate: { count: number } };
      contributions: HCAuthorContribution[];
    }>;
  };
}

interface HCLocalizedBooksResponse {
  data: {
    books: Array<{
      id: number;
      localizedEditions: Array<{ title?: string; image?: HCImage }>;
    }>;
  };
}

// ---------------------------------------------------------------------------
// Locale to Hardcover language name mapping
// ---------------------------------------------------------------------------

const localeToHardcoverLang: Record<string, string> = {
  en: 'English',
  fr: 'French',
  de: 'German',
  es: 'Spanish; Castilian',
  it: 'Italian',
  pt: 'Portuguese',
  'pt-BR': 'Portuguese',
  nl: 'Dutch; Flemish',
  sv: 'Swedish',
  da: 'Danish',
  no: 'Norwegian',
  fi: 'Finnish',
  pl: 'Polish',
  cs: 'Czech',
  hu: 'Hungarian',
  ro: 'Romanian; Moldavian; Moldovan',
  ru: 'Russian',
  uk: 'Ukrainian',
  ja: 'Japanese',
  zh: 'Chinese',
  ko: 'Korean',
  ar: 'Arabic',
  tr: 'Turkish',
};

// ---------------------------------------------------------------------------
// Digital edition formats (ebook / audiobook)
// ---------------------------------------------------------------------------

const EBOOK_FORMATS = ['ebook', 'Kindle', 'Kindle Edition'];
const AUDIOBOOK_FORMATS = ['Audiobook', 'Audible Audio', 'Audio CD'];
const DIGITAL_FORMATS = [...EBOOK_FORMATS, ...AUDIOBOOK_FORMATS];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectAllEditionIdentifiers(editions?: HCEdition[]): string[] | undefined {
  if (!editions || editions.length === 0) return undefined;
  const ids = new Set<string>();
  for (const ed of editions) {
    if (ed.isbn_13) ids.add(`isbn:${ed.isbn_13}`);
    if (ed.isbn_10) ids.add(`isbn:${ed.isbn_10}`);
    if (ed.asin) ids.add(`asin:${ed.asin}`);
  }
  return ids.size > 0 ? Array.from(ids) : undefined;
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

class BookInfoApi extends ExternalApi {
  constructor(token?: string) {
    const headers: Record<string, string> = {};
    if (token) {
      headers.authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    }
    super({
      baseUrl: 'https://api.hardcover.app/v1',
      headers,
      rateLimit: 1000,
    });
  }

  private async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    return this.post<T>('/graphql', { query, variables });
  }

  // -------------------------------------------------------------------------
  // Mappers
  // -------------------------------------------------------------------------

  private mapSearchDoc(doc: HCSearchDoc): BookResult {
    const authors: AuthorSummary[] = (doc.author_names || []).map((name) => ({ name }));

    return {
      goodreadsId: doc.id.toString(),
      title: doc.title,
      authors,
      coverUrl: doc.image?.url || undefined,
      publishedDate: doc.release_year?.toString(),
      categories: doc.cached_tags?.slice(0, 10),
      averageRating: doc.rating || undefined,
      ratingsCount: doc.ratings_count || undefined,
      pageCount: doc.pages || undefined,
      sourceUrl: `https://hardcover.app/books/${doc.slug}`,
    };
  }

  private mapBook(book: HCBook): BookResult {
    const localizedDigital = book.localizedDigitalEditions?.[0];
    const digital = book.digitalEditions?.[0];
    const localized = book.localizedEditions?.[0];
    const fallback = book.editions?.[0];

    const authors: AuthorSummary[] = (book.contributions || []).map((c) => ({
      id: c.author.id.toString(),
      name: c.author.name,
    }));

    const genres: string[] = [];
    if (book.cached_tags?.Genre) {
      for (const g of book.cached_tags.Genre) {
        genres.push(g.tag);
      }
    }

    // Prefer digital editions: localized digital > digital > localized > any
    const edition = localizedDigital || digital || localized || fallback;

    const bs = book.book_series?.[0];
    const series: SeriesSummary | undefined = bs
      ? {
          id: bs.series.id.toString(),
          name: bs.series.name,
          position: bs.position,
          booksCount: bs.series.books_count,
        }
      : undefined;

    return {
      goodreadsId: book.id.toString(),
      isbn: edition?.isbn_13 || edition?.isbn_10 || undefined,
      asin: edition?.asin || undefined,
      title: localizedDigital?.title || localized?.title || book.title,
      authors,
      description: book.description || undefined,
      coverUrl: localizedDigital?.image?.url || localized?.image?.url || book.image?.url || undefined,
      publishedDate: edition?.release_date || book.release_date || undefined,
      pageCount: edition?.pages || book.pages || undefined,
      categories: genres.length > 0 ? genres.slice(0, 10) : undefined,
      languages: edition?.language?.language ? [edition.language.language] : undefined,
      averageRating: book.rating || undefined,
      ratingsCount: book.ratings_count || undefined,
      sourceUrl: `https://hardcover.app/books/${book.slug}`,
      editionFormat: edition?.edition_format || undefined,
      hasEbookEdition: !!(book.ebookEditions?.length),
      hasAudiobookEdition: !!(book.audiobookEditions?.length),
      allEditionIdentifiers: collectAllEditionIdentifiers(book.allEditions),
      series,
    };
  }

  private mapAuthorBook(book: HCBookWithStats & {
    contributions?: { author: { id: number; name: string; slug: string } }[];
  }): BookResult {
    const authors: AuthorSummary[] = (book.contributions || []).map((c) => ({
      id: c.author.id.toString(),
      name: c.author.name,
    }));

    return {
      goodreadsId: book.id.toString(),
      title: book.title,
      authors,
      coverUrl: book.image?.url || undefined,
      publishedDate: book.release_date || undefined,
      pageCount: book.pages || undefined,
      averageRating: book.rating || undefined,
      ratingsCount: book.ratings_count || undefined,
      sourceUrl: `https://hardcover.app/books/${book.slug}`,
    };
  }

  // -------------------------------------------------------------------------
  // Batch localization
  // -------------------------------------------------------------------------

  /**
   * Fetch localized title/cover for a batch of Hardcover IDs.
   * Results are cached per-ID for 24 hours.
   * Returns a Map keyed by hardcoverId string.
   */
  async getLocalizedData(
    hardcoverIds: string[],
    locale: string
  ): Promise<Map<string, { title: string; coverUrl?: string }>> {
    type LocalizedEntry = { title: string; coverUrl?: string };
    const result = new Map<string, LocalizedEntry>();
    const hardcoverLang = localeToHardcoverLang[locale];
    if (!hardcoverLang || hardcoverLang === 'English') return result;

    // Check cache first, collect missing IDs
    const missingIds: number[] = [];
    for (const id of hardcoverIds) {
      const cacheKey = `hc-l10n:${id}:${locale}`;
      const cached = cacheManager.get<LocalizedEntry | null>(cacheKey);
      if (cached !== undefined) {
        // cached can be null (no localization available) or a valid entry
        if (cached) result.set(id, cached);
      } else {
        const parsed = parseInt(id, 10);
        if (!isNaN(parsed)) missingIds.push(parsed);
      }
    }

    if (missingIds.length === 0) return result;

    try {
      const data = await this.graphql<HCLocalizedBooksResponse>(
        `query LocalizeTitles($ids: [Int!]!, $lang: String!) {
          books(where: {id: {_in: $ids}}) {
            id
            localizedEditions: editions(
              where: {language: {language: {_eq: $lang}}}
              limit: 1
              order_by: {score: desc_nulls_last}
            ) {
              title
              image { url }
            }
          }
        }`,
        { ids: missingIds, lang: hardcoverLang }
      );

      const fetchedIds = new Set<string>();
      for (const book of data.data.books) {
        const localized = book.localizedEditions?.[0];
        const idStr = book.id.toString();
        fetchedIds.add(idStr);
        if (localized?.title) {
          const entry: LocalizedEntry = {
            title: localized.title,
            coverUrl: localized.image?.url,
          };
          result.set(idStr, entry);
          cacheManager.set(`hc-l10n:${idStr}:${locale}`, entry, 86400); // 24h
        } else {
          // Cache miss (no localization) to avoid re-fetching
          cacheManager.set(`hc-l10n:${idStr}:${locale}`, null, 86400);
        }
      }

      // IDs not returned by the API also get a null cache entry
      for (const id of missingIds) {
        if (!fetchedIds.has(id.toString())) {
          cacheManager.set(`hc-l10n:${id}:${locale}`, null, 86400);
        }
      }

      return result;
    } catch (e) {
      logger.error('Hardcover localization error', { error: String(e) });
      return result;
    }
  }

  async localizeResults(results: BookResult[], locale: string): Promise<BookResult[]> {
    const ids = results.filter((r) => r.goodreadsId).map((r) => r.goodreadsId!);
    const localizedMap = await this.getLocalizedData(ids, locale);
    if (localizedMap.size === 0) return results;

    return results.map((r) => {
      const localized = r.goodreadsId ? localizedMap.get(r.goodreadsId) : undefined;
      if (!localized) return r;
      return {
        ...r,
        title: localized.title,
        coverUrl: localized.coverUrl || r.coverUrl,
      };
    });
  }

  // -------------------------------------------------------------------------
  // Public methods
  // -------------------------------------------------------------------------

  async getTrending(limit = 20, page = 1, locale?: string): Promise<{ results: BookResult[]; totalResults: number }> {
    const lang = locale || 'en';
    const cacheKey = `hc-trending:${page}:${lang}`;
    const cached = cacheManager.get<{ results: BookResult[]; totalResults: number }>(cacheKey);
    if (cached) return cached;

    try {
      const data = await this.graphql<HCSearchResponse>(
        `query Trending($limit: Int!, $page: Int!) {
          search(query: "*", query_type: "books", per_page: $limit, page: $page, sort: "activities_count:desc") {
            results
          }
        }`,
        { limit, page }
      );

      const searchResult = data.data.search.results;
      const hits = searchResult?.hits || [];
      let results = hits.map((hit) => this.mapSearchDoc(hit.document));
      const totalResults = searchResult?.found || results.length;

      results = await this.localizeResults(results, lang);

      const result = { results, totalResults };
      cacheManager.set(cacheKey, result, 600);
      return result;
    } catch (e) {
      logger.error('Hardcover trending fetch error', { error: String(e) });
      return { results: [], totalResults: 0 };
    }
  }

  async searchBooks(
    query: string,
    _page = 1,
    limit = 20,
    locale?: string
  ): Promise<{ results: BookResult[]; totalResults: number }> {
    const lang = locale || 'en';
    const cacheKey = `hc-search:${query}:${lang}`;
    const cached = cacheManager.get<{ results: BookResult[]; totalResults: number }>(cacheKey);
    if (cached) return cached;

    try {
      const data = await this.graphql<HCSearchResponse>(
        `query Search($query: String!, $limit: Int!) {
          search(query: $query, query_type: "books", per_page: $limit, page: 1) {
            results
          }
        }`,
        { query, limit }
      );

      const searchResult = data.data.search.results;
      const hits = searchResult?.hits || [];
      let results = hits.map((hit) => this.mapSearchDoc(hit.document));

      results = await this.localizeResults(results, lang);

      const result = { results, totalResults: searchResult?.found || results.length };
      cacheManager.set(cacheKey, result, 600);
      return result;
    } catch (e) {
      logger.error('Hardcover search error', { error: String(e), query });
      return { results: [], totalResults: 0 };
    }
  }

  async getWork(bookId: string, locale?: string): Promise<BookResult | null> {
    const lang = locale || 'en';
    const hardcoverLang = localeToHardcoverLang[lang] || localeToHardcoverLang['en'];
    const cacheKey = `hc-work:${bookId}:${lang}`;
    const cached = cacheManager.get<BookResult>(cacheKey);
    if (cached) return cached;

    try {
      const data = await this.graphql<HCBookResponse>(
        `query GetBook($id: Int!, $lang: String!, $digitalFormats: [String!]!, $ebookFormats: [String!]!, $audiobookFormats: [String!]!) {
          books(where: {id: {_eq: $id}}) {
            id
            title
            slug
            description
            pages
            release_date
            image { url }
            contributions { author { id name slug image { url } } }
            cached_tags
            editions(limit: 1, order_by: {score: desc_nulls_last}) {
              isbn_13 isbn_10 asin edition_format language { language }
            }
            localizedEditions: editions(
              where: {language: {language: {_eq: $lang}}}
              limit: 1
              order_by: {score: desc_nulls_last}
            ) {
              title
              isbn_13 isbn_10 asin edition_format
              image { url }
              pages
              release_date
              language { language }
            }
            digitalEditions: editions(
              where: {edition_format: {_in: $digitalFormats}}
              limit: 1
              order_by: {score: desc_nulls_last}
            ) {
              title
              isbn_13 isbn_10 asin edition_format
              image { url }
              pages
              release_date
              language { language }
            }
            localizedDigitalEditions: editions(
              where: {language: {language: {_eq: $lang}}, edition_format: {_in: $digitalFormats}}
              limit: 1
              order_by: {score: desc_nulls_last}
            ) {
              title
              isbn_13 isbn_10 asin edition_format
              image { url }
              pages
              release_date
              language { language }
            }
            ebookEditions: editions(
              where: {edition_format: {_in: $ebookFormats}}
              limit: 1
              order_by: {score: desc_nulls_last}
            ) {
              edition_format
            }
            audiobookEditions: editions(
              where: {edition_format: {_in: $audiobookFormats}}
              limit: 1
              order_by: {score: desc_nulls_last}
            ) {
              edition_format
            }
            allEditions: editions {
              isbn_13 isbn_10 asin
            }
            rating
            ratings_count
            book_series { position series { id name slug books_count } }
          }
        }`,
        {
          id: parseInt(bookId, 10),
          lang: hardcoverLang,
          digitalFormats: DIGITAL_FORMATS,
          ebookFormats: EBOOK_FORMATS,
          audiobookFormats: AUDIOBOOK_FORMATS,
        }
      );

      const book = data.data.books[0];
      if (!book) return null;

      const result = this.mapBook(book);
      cacheManager.set(cacheKey, result, 3600);
      return result;
    } catch (e) {
      logger.error('Hardcover book fetch error', { error: String(e), bookId });
      return null;
    }
  }

  async getAuthor(authorId: string, _locale?: string): Promise<AuthorResult | null> {
    const cacheKey = `hc-author:${authorId}`;
    const cached = cacheManager.get<AuthorResult>(cacheKey);
    if (cached) return cached;

    try {
      const data = await this.graphql<HCAuthorResponse>(
        `query GetAuthor($id: Int!) {
          authors(where: {id: {_eq: $id}}) {
            id
            name
            bio
            slug
            image { url }
            contributions(limit: 30) {
              book {
                id title slug pages release_date
                image { url }
                rating ratings_count users_read_count
                contributions { author { id name slug } }
              }
            }
          }
        }`,
        { id: parseInt(authorId, 10) }
      );

      const author = data.data.authors[0];
      if (!author) return null;

      // Deduplicate: first by book ID, then by normalized base title
      // (strip subtitle after ": "). Keeps the entry with the highest
      // users_read_count (first after sort). "Dune" and "Dune Messiah"
      // remain distinct while "A Hymn to Life" and
      // "A Hymn to Life: Shame has to Change Sides" are merged.
      const sorted = (author.contributions || [])
        .filter((c) => c.book)
        .sort((a, b) => (b.book.users_read_count || 0) - (a.book.users_read_count || 0));

      const seenIds = new Set<number>();
      const seenTitles = new Set<string>();
      const topBooks: BookResult[] = [];
      for (const c of sorted) {
        if (seenIds.has(c.book.id)) continue;
        seenIds.add(c.book.id);
        const key = c.book.title.split(': ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
        if (seenTitles.has(key)) continue;
        seenTitles.add(key);
        topBooks.push(this.mapAuthorBook(c.book));
      }

      const result: AuthorResult = {
        goodreadsId: author.id.toString(),
        name: author.name,
        bio: author.bio || undefined,
        photoUrl: author.image?.url || undefined,
        sourceUrl: `https://hardcover.app/authors/${author.slug}`,
        topBooks,
      };

      cacheManager.set(cacheKey, result, 3600);
      return result;
    } catch (e) {
      logger.error('Hardcover author fetch error', { error: String(e), authorId });
      return null;
    }
  }

  async getAuthorBooks(
    authorId: string,
    page = 1,
    limit = 20,
    locale?: string
  ): Promise<{ results: BookResult[]; totalResults: number }> {
    const lang = locale || 'en';
    const cacheKey = `hc-author-books:${authorId}:${page}:${limit}:${lang}`;
    const cached = cacheManager.get<{ results: BookResult[]; totalResults: number }>(cacheKey);
    if (cached) return cached;

    try {
      // Fetch more than needed to account for deduplication and null books
      const fetchLimit = limit * 3;
      const offset = (page - 1) * fetchLimit;

      const data = await this.graphql<HCAuthorBooksResponse>(
        `query AuthorBooks($id: Int!, $limit: Int!, $offset: Int!) {
          authors(where: {id: {_eq: $id}}) {
            contributions_aggregate { aggregate { count } }
            contributions(
              limit: $limit,
              offset: $offset,
              order_by: {book: {users_read_count: desc_nulls_last}}
            ) {
              book {
                id title slug pages release_date
                image { url }
                rating ratings_count users_read_count
                contributions { author { id name slug } }
              }
            }
          }
        }`,
        { id: parseInt(authorId, 10), limit: fetchLimit, offset }
      );

      const author = data.data.authors[0];
      if (!author) return { results: [], totalResults: 0 };

      const totalResults = author.contributions_aggregate.aggregate.count;

      // Deduplicate: first by book ID (same work listed multiple times),
      // then by normalized base title to catch edition variants like
      // "A Hymn to Life" vs "A Hymn to Life: Shame has to Change Sides".
      const seenIds = new Set<number>();
      const seenTitles = new Set<string>();
      const deduped: BookResult[] = [];
      for (const c of author.contributions) {
        if (!c.book) continue;
        if (seenIds.has(c.book.id)) continue;
        seenIds.add(c.book.id);
        const key = c.book.title.split(': ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
        if (seenTitles.has(key)) continue;
        seenTitles.add(key);
        deduped.push(this.mapAuthorBook(c.book));
      }

      let results = deduped.slice(0, limit);
      results = await this.localizeResults(results, lang);

      const result = { results, totalResults };
      cacheManager.set(cacheKey, result, 600);
      return result;
    } catch (e) {
      logger.error('Hardcover author books fetch error', { error: String(e), authorId });
      return { results: [], totalResults: 0 };
    }
  }

  async getSeriesBooks(seriesId: string, locale?: string): Promise<BookResult[]> {
    const cacheKey = `hc-series:${seriesId}:${locale || 'en'}`;
    const cached = cacheManager.get<BookResult[]>(cacheKey);
    if (cached) return cached;

    try {
      const data = await this.graphql<HCSeriesResponse>(
        `query GetSeries($id: Int!) {
          series_by_pk(id: $id) {
            id
            name
            slug
            books_count
            book_series(order_by: {position: asc}) {
              position
              book {
                id
                title
                slug
                pages
                release_date
                image { url }
                contributions { author { id name slug } }
                rating
                ratings_count
                editions(limit: 1, order_by: {score: desc_nulls_last}) { language { language } score }
              }
            }
          }
        }`,
        { id: parseInt(seriesId, 10) }
      );

      const series = data.data.series_by_pk;
      if (!series) return [];

      const targetLang = localeToHardcoverLang[locale || 'en'] || localeToHardcoverLang['en'];

      // Deduplicate by position: multiple editions/translations share the
      // same position number. Priority: user's locale > has cover > most ratings.
      const byPosition = new Map<number | undefined, HCSeriesBookEntry>();
      for (const entry of series.book_series) {
        const pos = entry.position;
        const existing = byPosition.get(pos);
        if (!existing) {
          byPosition.set(pos, entry);
          continue;
        }

        const entryLang = entry.book.editions?.[0]?.language?.language;
        const existingLang = existing.book.editions?.[0]?.language?.language;

        // Prefer the edition matching the user's locale
        const entryMatchesLocale = entryLang === targetLang;
        const existingMatchesLocale = existingLang === targetLang;
        if (entryMatchesLocale && !existingMatchesLocale) {
          byPosition.set(pos, entry);
          continue;
        }
        if (existingMatchesLocale) continue;

        // Prefer English as fallback
        const entryIsEnglish = entryLang === 'English';
        const existingIsEnglish = existingLang === 'English';
        // Prefer English as fallback; otherwise keep the first entry
        if (entryIsEnglish && !existingIsEnglish) {
          byPosition.set(pos, entry);
        }
      }

      let results = Array.from(byPosition.values()).map((entry) => {
        const book = entry.book;
        const authors: AuthorSummary[] = (book.contributions || []).map((c) => ({
          id: c.author.id.toString(),
          name: c.author.name,
        }));

        return {
          goodreadsId: book.id.toString(),
          title: book.title,
          authors,
          coverUrl: book.image?.url || undefined,
          publishedDate: book.release_date || undefined,
          pageCount: book.pages || undefined,
          averageRating: book.rating || undefined,
          ratingsCount: book.ratings_count || undefined,
          sourceUrl: `https://hardcover.app/books/${book.slug}`,
          series: {
            id: series.id.toString(),
            name: series.name,
            position: entry.position,
            booksCount: series.books_count,
          },
        } as BookResult;
      });

      results = await this.localizeResults(results, locale || 'en');

      cacheManager.set(cacheKey, results, 3600);
      return results;
    } catch (e) {
      logger.error('Hardcover series fetch error', { error: String(e), seriesId });
      return [];
    }
  }
  /**
   * Lightweight query: fetch only the edition identifiers for a book.
   * Used by sync jobs to enrich Media without fetching full metadata.
   */
  async getEditionIdentifiers(bookId: string): Promise<string[] | undefined> {
    const cacheKey = `hc-edition-ids:${bookId}`;
    const cached = cacheManager.get<string[]>(cacheKey);
    if (cached) return cached;

    try {
      const data = await this.graphql<{
        data: { books: Array<{ editions?: HCEdition[] }> };
      }>(
        `query GetEditionIds($id: Int!) {
          books(where: {id: {_eq: $id}}) {
            editions { isbn_13 isbn_10 asin }
          }
        }`,
        { id: parseInt(bookId, 10) }
      );

      const editions = data.data.books[0]?.editions;
      const result = collectAllEditionIdentifiers(editions);
      if (result) cacheManager.set(cacheKey, result, 86400); // 24h
      return result;
    } catch (e) {
      logger.error('Hardcover edition identifiers fetch error', {
        error: String(e),
        bookId,
      });
      return undefined;
    }
  }
}

export default BookInfoApi;
