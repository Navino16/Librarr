import ExternalApi from '../externalapi';
import type {
  ServarrProfile,
  ServarrRootFolder,
  ServarrTag,
  ServarrQueueItem,
} from '@server/types/servarr';

export type {
  ServarrProfile,
  ServarrRootFolder,
  ServarrTag,
  ServarrQueueItem,
} from '@server/types/servarr';

export default class ServarrApi extends ExternalApi {
  protected apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    super({
      baseUrl,
      headers: {
        'X-Api-Key': apiKey,
      },
    });
    this.apiKey = apiKey;
  }

  async getProfiles(endpoint: string): Promise<ServarrProfile[]> {
    return this.get<ServarrProfile[]>(endpoint);
  }

  async getRootFolders(): Promise<ServarrRootFolder[]> {
    return this.get<ServarrRootFolder[]>('/api/v1/rootfolder');
  }

  async getTags(): Promise<ServarrTag[]> {
    return this.get<ServarrTag[]>('/api/v1/tag');
  }

  async getQueue(): Promise<ServarrQueueItem[]> {
    const PAGE_SIZE = 50;
    const allRecords: ServarrQueueItem[] = [];
    let page = 1;

    while (true) {
      const data = await this.get<{
        records: ServarrQueueItem[];
        totalRecords: number;
      }>('/api/v1/queue', {
        params: {
          pageSize: String(PAGE_SIZE),
          page: String(page),
          includeUnknownAuthorItems: 'true',
        },
      });

      const records = data.records || [];
      allRecords.push(...records);

      if (records.length < PAGE_SIZE || allRecords.length >= (data.totalRecords || 0)) {
        break;
      }
      page++;
    }

    return allRecords;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.get('/api/v1/system/status');
      return true;
    } catch {
      return false;
    }
  }
}
