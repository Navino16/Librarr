import ExternalApi from './externalapi';
import logger from '../logger';
import type { PlexLibrary, PlexItem } from '@server/types/mediaserver';

export type { PlexLibrary, PlexItem } from '@server/types/mediaserver';

class PlexApi extends ExternalApi {
  constructor(serverUrl: string, token: string) {
    super({
      baseUrl: serverUrl,
      headers: {
        'X-Plex-Token': token,
        Accept: 'application/json',
      },
    });
  }

  public async testConnection(): Promise<boolean> {
    try {
      await this.get('/identity');
      return true;
    } catch (error) {
      logger.warn('Plex connection test failed', { error });
      return false;
    }
  }

  public async getLibraries(): Promise<PlexLibrary[]> {
    try {
      const result = await this.get<{
        MediaContainer: { Directory: PlexLibrary[] };
      }>('/library/sections');
      return result.MediaContainer?.Directory || [];
    } catch (error) {
      logger.error('Plex get libraries error', { error });
      return [];
    }
  }

  public async getLibraryItems(sectionKey: string): Promise<PlexItem[]> {
    try {
      const result = await this.get<{
        MediaContainer: { Metadata: PlexItem[] };
      }>(`/library/sections/${sectionKey}/all`);
      return result.MediaContainer?.Metadata || [];
    } catch (error) {
      logger.error('Plex get library items error', { error });
      return [];
    }
  }
}

export default PlexApi;
