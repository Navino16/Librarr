import ServarrApi, { ServarrProfile } from './base';
import logger from '../../logger';
import type {
  LidarrAlbum,
  LidarrArtist,
  LidarrAddOptions,
} from '@server/types/servarr';

export type {
  LidarrAlbum,
  LidarrArtist,
  LidarrAddOptions,
} from '@server/types/servarr';

class LidarrApi extends ServarrApi {
  constructor(baseUrl: string, apiKey: string) {
    super(baseUrl, apiKey);
  }

  async getQualityProfiles(): Promise<ServarrProfile[]> {
    return this.getProfiles('/api/v1/qualityprofile');
  }

  async getMetadataProfiles(): Promise<ServarrProfile[]> {
    return this.getProfiles('/api/v1/metadataprofile');
  }

  async getAlbums(): Promise<LidarrAlbum[]> {
    return this.get<LidarrAlbum[]>('/api/v1/album');
  }

  async getAlbum(id: number): Promise<LidarrAlbum> {
    return this.get<LidarrAlbum>(`/api/v1/album/${id}`);
  }

  async lookupAlbum(term: string): Promise<LidarrAlbum[]> {
    return this.get<LidarrAlbum[]>('/api/v1/album/lookup', {
      params: { term },
    });
  }

  async addAlbum(options: LidarrAddOptions): Promise<LidarrAlbum> {
    try {
      return await this.post<LidarrAlbum>('/api/v1/album', options);
    } catch (e) {
      logger.error('Lidarr add album error', { error: e });
      throw e;
    }
  }

  async getArtists(): Promise<LidarrArtist[]> {
    return this.get<LidarrArtist[]>('/api/v1/artist');
  }
}

export default LidarrApi;
