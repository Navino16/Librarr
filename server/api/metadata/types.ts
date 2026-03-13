export type MetadataSource = 'hardcover' | 'openlibrary' | 'googlebooks';

export type EditionFormat =
  | 'ebook'
  | 'audiobook'
  | 'paperback'
  | 'hardcover'
  | 'unknown';

export interface WorkMetadata {
  // Identity
  hardcoverId?: string;
  openLibraryWorkId?: string;

  // Metadata
  title: string;
  originalTitle?: string;
  description?: string;
  coverUrl?: string;
  publishedDate?: string;
  pageCount?: number;
  averageRating?: number;
  ratingsCount?: number;
  sourceUrl?: string;

  // Authors
  authors?: Array<{ name: string; hardcoverId?: string; role?: string }>;

  // Series
  series?: { name: string; hardcoverId?: string; position?: number };

  // Classification
  genres?: string[];

  // Source tracking
  source: MetadataSource;
}

export interface EditionData {
  isbn13?: string;
  isbn10?: string;
  asin?: string;
  title?: string;
  publisher?: string;
  publishedDate?: string;
  language?: string; // ISO 639-1
  pageCount?: number;
  coverUrl?: string;
  format: EditionFormat;
  source?: MetadataSource;
}
