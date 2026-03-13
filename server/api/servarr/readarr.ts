import ServarrApi, { ServarrProfile } from './base';
import logger from '../../logger';
import type {
  ReadarrBook,
  ReadarrAuthor,
  ReadarrAddOptions,
} from '@server/types/servarr';

export type {
  ReadarrBook,
  ReadarrAuthor,
  ReadarrAddOptions,
} from '@server/types/servarr';

class ReadarrApi extends ServarrApi {
  constructor(baseUrl: string, apiKey: string) {
    super(baseUrl, apiKey);
  }

  async getQualityProfiles(): Promise<ServarrProfile[]> {
    return this.getProfiles('/api/v1/qualityprofile');
  }

  async getMetadataProfiles(): Promise<ServarrProfile[]> {
    return this.getProfiles('/api/v1/metadataprofile');
  }

  async getBooks(): Promise<ReadarrBook[]> {
    return this.get<ReadarrBook[]>('/api/v1/book');
  }

  async getBook(id: number): Promise<ReadarrBook> {
    return this.get<ReadarrBook>(`/api/v1/book/${id}`);
  }

  async lookupBook(term: string): Promise<ReadarrBook[]> {
    return this.get<ReadarrBook[]>('/api/v1/book/lookup', {
      params: { term },
    });
  }

  async addBook(options: ReadarrAddOptions): Promise<ReadarrBook> {
    try {
      return await this.post<ReadarrBook>('/api/v1/book', options);
    } catch (e) {
      logger.error('Readarr add book error', { error: e });
      throw e;
    }
  }

  async lookupAuthor(term: string): Promise<ReadarrAuthor[]> {
    return this.get<ReadarrAuthor[]>('/api/v1/author/lookup', {
      params: { term },
    });
  }

  async getAuthors(): Promise<ReadarrAuthor[]> {
    return this.get<ReadarrAuthor[]>('/api/v1/author');
  }

}

export default ReadarrApi;
