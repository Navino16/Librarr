import ExternalApi from '../externalapi';
import logger from '../../logger';
import type {
  JellyfinAuthResponse,
  JellyfinUser,
  JellyfinLibrary,
  JellyfinLibraryItem,
} from '@server/types/mediaserver';

export type {
  JellyfinAuthResponse,
  JellyfinUser,
  JellyfinLibrary,
  JellyfinLibraryItem,
} from '@server/types/mediaserver';

class JellyfinApi extends ExternalApi {
  private serverUrl: string;

  constructor(serverUrl: string) {
    super({
      baseUrl: serverUrl,
      headers: {
        'X-Emby-Authorization':
          'MediaBrowser Client="Librarr", Device="Server", DeviceId="librarr", Version="0.1.0"',
      },
    });
    this.serverUrl = serverUrl;
  }

  async authenticate(
    username: string,
    password: string
  ): Promise<{ userId: string; token: string; username: string; isAdmin: boolean } | null> {
    try {
      const result = await this.post<JellyfinAuthResponse>(
        '/Users/AuthenticateByName',
        { Username: username, Pw: password }
      );

      return {
        userId: result.User.Id,
        token: result.AccessToken,
        username: result.User.Name,
        isAdmin: result.User.Policy.IsAdministrator,
      };
    } catch (e) {
      logger.error('Jellyfin auth error', { error: e });
      return null;
    }
  }

  async getUsers(token: string): Promise<JellyfinUser[]> {
    try {
      return await this.get<JellyfinUser[]>('/Users', {
        headers: { 'X-Emby-Token': token },
      });
    } catch (e) {
      logger.error('Jellyfin get users error', { error: e });
      return [];
    }
  }

  async getUser(userId: string, token: string): Promise<JellyfinUser | null> {
    try {
      return await this.get<JellyfinUser>(`/Users/${userId}`, {
        headers: { 'X-Emby-Token': token },
      });
    } catch {
      return null;
    }
  }

  async testConnection(token?: string): Promise<boolean> {
    try {
      const headers = token ? { 'X-Emby-Token': token } : {};
      await this.get('/System/Info/Public', { headers });
      return true;
    } catch {
      return false;
    }
  }

  async getLibraries(apiKey: string): Promise<JellyfinLibrary[]> {
    try {
      const result = await this.get<JellyfinLibrary[]>(
        '/Library/VirtualFolders',
        { headers: { 'X-Emby-Token': apiKey } }
      );
      return result || [];
    } catch (e) {
      logger.error('Jellyfin get libraries error', { error: e });
      return [];
    }
  }

  async getLibraryItems(
    parentId: string,
    apiKey: string
  ): Promise<JellyfinLibraryItem[]> {
    try {
      const result = await this.get<{ Items: JellyfinLibraryItem[] }>(
        '/Items',
        {
          params: {
            ParentId: parentId,
            Recursive: 'true',
            Fields: 'ProviderIds',
          },
          headers: { 'X-Emby-Token': apiKey },
        }
      );
      return result.Items || [];
    } catch (e) {
      logger.error('Jellyfin get library items error', { error: e });
      return [];
    }
  }
}

export default JellyfinApi;
