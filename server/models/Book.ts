export interface SeriesSummary {
  id: string;
  name: string;
  position?: number;
  booksCount?: number;
}

export interface BookResult {
  goodreadsId?: string;
  openLibraryId?: string;
  isbn?: string;
  asin?: string;
  googleBooksId?: string;
  title: string;
  authors: AuthorSummary[];
  description?: string;
  coverUrl?: string;
  publishedDate?: string;
  publisher?: string;
  pageCount?: number;
  categories?: string[];
  languages?: string[];
  averageRating?: number;
  ratingsCount?: number;
  sourceUrl?: string;
  editionFormat?: string;
  hasEbookEdition?: boolean;
  hasAudiobookEdition?: boolean;
  allEditionIdentifiers?: string[];
  series?: SeriesSummary;
}

export interface AuthorSummary {
  id?: string;
  name: string;
}

export interface AuthorResult {
  goodreadsId?: string;
  openLibraryId?: string;
  name: string;
  bio?: string;
  photoUrl?: string;
  birthDate?: string;
  deathDate?: string;
  wikipedia?: string;
  sourceUrl?: string;
  topBooks?: BookResult[];
}
