import ExternalApi from '../externalapi';
import logger from '../../logger';

export interface ABSLibrary {
  id: string;
  name: string;
  mediaType: string;
  folders: Array<{ id: string; fullPath: string }>;
}

export interface ABSLibraryItem {
  id: string;
  ino: string;
  libraryId: string;
  media: {
    metadata: {
      title: string;
      authorName?: string;
      isbn?: string;
      asin?: string;
      description?: string;
    };
    coverPath?: string;
    numAudioFiles?: number;
    numChapters?: number;
    duration?: number;
  };
  addedAt: number;
  updatedAt: number;
}

class AudiobookshelfApi extends ExternalApi {
  constructor(baseUrl: string, apiKey: string) {
    super({
      baseUrl,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
  }

  async getLibraries(): Promise<ABSLibrary[]> {
    try {
      const data = await this.get<{ libraries: ABSLibrary[] }>('/api/libraries');
      return data.libraries;
    } catch (e) {
      logger.error('Audiobookshelf libraries error', { error: e });
      return [];
    }
  }

  async getLibraryItems(libraryId: string, limit = 100): Promise<ABSLibraryItem[]> {
    try {
      const data = await this.get<{ results: ABSLibraryItem[] }>(
        `/api/libraries/${libraryId}/items`,
        { params: { limit: limit.toString() } }
      );
      return data.results || [];
    } catch (e) {
      logger.error('Audiobookshelf library items error', { error: e });
      return [];
    }
  }

  async getItem(itemId: string): Promise<ABSLibraryItem | null> {
    try {
      return await this.get<ABSLibraryItem>(`/api/items/${itemId}`);
    } catch (e) {
      logger.error('Audiobookshelf item error', { error: e });
      return null;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.get('/api/me');
      return true;
    } catch {
      return false;
    }
  }
}

export default AudiobookshelfApi;
