import ExternalApi from './externalapi';
import logger from '../logger';
import type {
  AudiobookshelfLibrary,
  AudiobookshelfLibraryItem,
} from '@server/types/mediaserver';

export type {
  AudiobookshelfLibrary,
  AudiobookshelfMetadata,
  AudiobookshelfEbookFile,
  AudiobookshelfLibraryItem,
} from '@server/types/mediaserver';

class AudiobookshelfApi extends ExternalApi {
  constructor(serverUrl: string, apiKey: string) {
    super({
      baseUrl: serverUrl,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.post('/api/authorize');
      return true;
    } catch {
      return false;
    }
  }

  async getLibraries(): Promise<AudiobookshelfLibrary[]> {
    try {
      const result = await this.get<{ libraries: AudiobookshelfLibrary[] }>(
        '/api/libraries'
      );
      return result.libraries || [];
    } catch (e) {
      logger.error('Audiobookshelf get libraries error', { error: e });
      return [];
    }
  }

  async getLibraryItems(
    libraryId: string
  ): Promise<AudiobookshelfLibraryItem[]> {
    const PAGE_SIZE = 500;
    const allItems: AudiobookshelfLibraryItem[] = [];
    let page = 0;

    try {
      while (true) {
        const result = await this.get<{
          results: AudiobookshelfLibraryItem[];
          total: number;
        }>(`/api/libraries/${libraryId}/items`, {
          params: { limit: String(PAGE_SIZE), page: String(page) },
        });

        const items = result.results || [];
        allItems.push(...items);

        // Stop when we've fetched all items or got an incomplete page
        if (items.length < PAGE_SIZE || allItems.length >= (result.total || 0)) {
          break;
        }
        page++;
      }

      return allItems;
    } catch (e) {
      logger.error('Audiobookshelf get library items error', { error: e });
      return allItems.length > 0 ? allItems : [];
    }
  }

  /**
   * Build the full URL for an item cover image.
   */
  getCoverUrl(itemId: string): string {
    return `${this.axios.defaults.baseURL}/api/items/${itemId}/cover`;
  }

  /**
   * Build a direct link to an item on the Audiobookshelf web UI.
   */
  getItemUrl(itemId: string): string {
    return `${this.axios.defaults.baseURL}/item/${itemId}`;
  }
}

export default AudiobookshelfApi;
