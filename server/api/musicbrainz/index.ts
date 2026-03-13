import axios from 'axios';
import ExternalApi from '../externalapi';
import { AlbumResult, ArtistResult, ArtistSummary, TrackResult } from '../../models/Music';
import cacheManager from '../../lib/cache';
import logger from '../../logger';

interface MBSearchResponse<T> {
  count: number;
  offset: number;
  'release-groups'?: T[];
  releases?: T[];
  artists?: T[];
}

interface MBReleaseGroup {
  id: string;
  title: string;
  'primary-type'?: string;
  'first-release-date'?: string;
  'artist-credit'?: MBArtistCredit[];
  tags?: Array<{ name: string; count: number }>;
}

interface MBArtistCredit {
  name: string;
  artist: {
    id: string;
    name: string;
    'sort-name'?: string;
  };
}

interface MBArtist {
  id: string;
  name: string;
  'sort-name'?: string;
  type?: string;
  country?: string;
  'life-span'?: {
    begin?: string;
    end?: string;
    ended?: boolean;
  };
  tags?: Array<{ name: string; count: number }>;
  'release-groups'?: MBReleaseGroup[];
}

interface MBRelease {
  id: string;
  title: string;
  media?: Array<{
    position: number;
    tracks?: Array<{
      id: string;
      title: string;
      length?: number;
      position: number;
    }>;
  }>;
}

class MusicBrainzApi extends ExternalApi {
  constructor() {
    super({
      baseUrl: 'https://musicbrainz.org/ws/2',
      headers: {
        'User-Agent': 'Librarr/0.1.0 ( librarr-app )',
      },
      rateLimit: 1100, // MusicBrainz requires max 1 req/s
    });
  }

  async searchAlbums(
    query: string,
    page = 1,
    limit = 20
  ): Promise<{ results: AlbumResult[]; totalResults: number }> {
    const cacheKey = `mb-search-album:${query}:${page}`;
    const cached = cacheManager.get<{ results: AlbumResult[]; totalResults: number }>(cacheKey);
    if (cached) return cached;

    try {
      const offset = (page - 1) * limit;
      const data = await this.get<MBSearchResponse<MBReleaseGroup>>(
        '/release-group',
        {
          params: {
            query,
            offset: offset.toString(),
            limit: limit.toString(),
            fmt: 'json',
          },
        }
      );

      const results: AlbumResult[] = (data['release-groups'] || []).map((rg) =>
        this.mapReleaseGroup(rg)
      );

      await this.verifyCoverArts(results);

      const result = { results, totalResults: data.count };
      cacheManager.set(cacheKey, result, 600);
      return result;
    } catch (e) {
      logger.error('MusicBrainz search error', { error: e, query });
      return { results: [], totalResults: 0 };
    }
  }

  async getReleaseGroup(mbid: string): Promise<AlbumResult | null> {
    const cacheKey = `mb-rg:${mbid}`;
    const cached = cacheManager.get<AlbumResult>(cacheKey);
    if (cached) return cached;

    try {
      const rg = await this.get<MBReleaseGroup>(
        `/release-group/${mbid}`,
        { params: { inc: 'artist-credits+tags', fmt: 'json' } }
      );

      const result = this.mapReleaseGroup(rg);

      await this.verifyCoverArts([result]);

      cacheManager.set(cacheKey, result, 3600);
      return result;
    } catch (e) {
      logger.error('MusicBrainz release group fetch error', { error: e, mbid });
      return null;
    }
  }

  async getArtist(mbid: string): Promise<ArtistResult | null> {
    const cacheKey = `mb-artist:${mbid}`;
    const cached = cacheManager.get<ArtistResult>(cacheKey);
    if (cached) return cached;

    try {
      const artist = await this.get<MBArtist>(
        `/artist/${mbid}`,
        { params: { inc: 'release-groups+tags', fmt: 'json' } }
      );

      const topAlbums = artist['release-groups']
        ?.filter((rg) => rg['primary-type'] === 'Album')
        .slice(0, 20)
        .map((rg) => this.mapReleaseGroup(rg));

      if (topAlbums?.length) {
        await this.verifyCoverArts(topAlbums);
      }

      const result: ArtistResult = {
        musicBrainzId: artist.id,
        name: artist.name,
        sortName: artist['sort-name'],
        type: artist.type,
        country: artist.country,
        beginDate: artist['life-span']?.begin,
        endDate: artist['life-span']?.end,
        genres: artist.tags
          ?.sort((a, b) => b.count - a.count)
          .slice(0, 10)
          .map((t) => t.name),
        topAlbums,
      };

      cacheManager.set(cacheKey, result, 3600);
      return result;
    } catch (e) {
      logger.error('MusicBrainz artist fetch error', { error: e, mbid });
      return null;
    }
  }

  async getArtistAlbums(mbid: string, limit = 25): Promise<AlbumResult[]> {
    const cacheKey = `mb-artist-albums:${mbid}`;
    const cached = cacheManager.get<AlbumResult[]>(cacheKey);
    if (cached) return cached;

    try {
      const data = await this.get<MBSearchResponse<MBReleaseGroup>>(
        '/release-group',
        {
          params: {
            artist: mbid,
            type: 'album',
            limit: limit.toString(),
            fmt: 'json',
          },
        }
      );

      const results = (data['release-groups'] || []).map((rg) =>
        this.mapReleaseGroup(rg)
      );

      await this.verifyCoverArts(results);

      cacheManager.set(cacheKey, results, 3600);
      return results;
    } catch (e) {
      logger.error('MusicBrainz artist albums error', { error: e, mbid });
      return [];
    }
  }

  async getTracks(releaseGroupId: string): Promise<TrackResult[]> {
    const cacheKey = `mb-tracks:${releaseGroupId}`;
    const cached = cacheManager.get<TrackResult[]>(cacheKey);
    if (cached) return cached;

    try {
      // First get releases for this release group
      const data = await this.get<MBSearchResponse<{ id: string }>>(
        '/release',
        {
          params: {
            'release-group': releaseGroupId,
            limit: '1',
            fmt: 'json',
          },
        }
      );

      if (!data.releases?.length) return [];

      // Then get tracks for the first release
      const release = await this.get<MBRelease>(
        `/release/${data.releases[0].id}`,
        { params: { inc: 'recordings', fmt: 'json' } }
      );

      const tracks: TrackResult[] = [];
      for (const medium of release.media || []) {
        for (const track of medium.tracks || []) {
          tracks.push({
            musicBrainzId: track.id,
            title: track.title,
            duration: track.length ? Math.round(track.length / 1000) : undefined,
            position: track.position,
            discNumber: medium.position,
          });
        }
      }

      cacheManager.set(cacheKey, tracks, 3600);
      return tracks;
    } catch (e) {
      logger.error('MusicBrainz tracks fetch error', { error: e, releaseGroupId });
      return [];
    }
  }

  /**
   * Verify cover art existence for a batch of albums via HEAD requests.
   * Sets coverUrl only for albums whose cover art actually exists on CoverArtArchive.
   * Results are cached individually to avoid repeated checks.
   */
  private async verifyCoverArts(albums: AlbumResult[]): Promise<void> {
    const toCheck = albums.filter((a) => a.musicBrainzId && !a.coverUrl);
    if (toCheck.length === 0) return;

    await Promise.allSettled(
      toCheck.map(async (album) => {
        const mbid = album.musicBrainzId!;
        const cacheKey = `cover-exists:${mbid}`;
        const cached = cacheManager.get<string | false>(cacheKey);

        if (cached !== undefined) {
          if (cached) album.coverUrl = cached;
          return;
        }

        const url = `https://coverartarchive.org/release-group/${mbid}/front-250`;
        try {
          await axios.head(url, { timeout: 3000 });
          album.coverUrl = url;
          cacheManager.set(cacheKey, url, 86400); // cache 24h
        } catch {
          cacheManager.set(cacheKey, false, 3600); // cache miss 1h
        }
      })
    );
  }

  private mapReleaseGroup(rg: MBReleaseGroup): AlbumResult {
    const typeMap: Record<string, AlbumResult['type']> = {
      Album: 'album',
      Single: 'single',
      EP: 'ep',
    };

    const artists: ArtistSummary[] = (rg['artist-credit'] || []).map((ac) => ({
      id: ac.artist.id,
      name: ac.artist.name,
    }));

    return {
      musicBrainzId: rg.id,
      title: rg.title,
      artists,
      releaseDate: rg['first-release-date'],
      type: typeMap[rg['primary-type'] || ''] || 'album',
      genres: rg.tags
        ?.sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map((t) => t.name),
    };
  }
}

export default MusicBrainzApi;
