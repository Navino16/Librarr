import { WorkMetadata, EditionData, MetadataSource } from './types';

export interface MetadataProvider {
  readonly source: MetadataSource;

  // Search
  searchByText(
    query: string,
    locale?: string
  ): Promise<WorkMetadata[] | null>;
  searchByIsbn(
    isbn: string,
    locale?: string
  ): Promise<WorkMetadata[] | null>;

  // Work metadata
  getWork(id: string, locale?: string): Promise<WorkMetadata | null>;
  getDescription(id: string, locale?: string): Promise<string | null>;
  getCover(id: string): Promise<string | null>;
  getRating(id: string): Promise<number | null>;

  // Editions
  getEditions(
    workIdentifiers: {
      hardcoverId?: string;
      openLibraryWorkId?: string;
    },
    locale?: string
  ): Promise<EditionData[]>;
}
