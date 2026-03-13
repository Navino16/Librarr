import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AxiosInstance } from 'axios';

vi.mock('axios');
vi.mock('@server/logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import axios from 'axios';
import JellyfinApi from '@server/api/jellyfin/index';
import logger from '@server/logger';

const mockedAxiosCreate = vi.mocked(axios.create);

let mockAxiosInstance: {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  interceptors: { response: { use: ReturnType<typeof vi.fn> } };
};

beforeEach(() => {
  vi.resetAllMocks();

  mockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: { response: { use: vi.fn() } },
  };
  mockedAxiosCreate.mockReturnValue(
    mockAxiosInstance as unknown as AxiosInstance
  );
});

describe('JellyfinApi — constructor', () => {
  it('passes serverUrl and X-Emby-Authorization header', () => {
    new JellyfinApi('http://jellyfin:8096');

    expect(mockedAxiosCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'http://jellyfin:8096',
        headers: expect.objectContaining({
          'X-Emby-Authorization': expect.stringContaining('MediaBrowser'),
        }),
      })
    );
  });
});

describe('JellyfinApi — authenticate()', () => {
  it('POSTs /Users/AuthenticateByName and returns mapped result', async () => {
    mockAxiosInstance.post.mockResolvedValue({
      data: {
        User: {
          Id: 'user-id-1',
          Name: 'admin',
          Policy: { IsAdministrator: true },
        },
        AccessToken: 'token-abc',
      },
    });

    const api = new JellyfinApi('http://jellyfin:8096');
    const result = await api.authenticate('admin', 'password');

    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/Users/AuthenticateByName',
      { Username: 'admin', Pw: 'password' },
      undefined
    );
    expect(result).toEqual({
      userId: 'user-id-1',
      token: 'token-abc',
      username: 'admin',
      isAdmin: true,
    });
  });

  it('returns null and logs on error', async () => {
    mockAxiosInstance.post.mockRejectedValue(new Error('auth failed'));

    const api = new JellyfinApi('http://jellyfin:8096');
    const result = await api.authenticate('user', 'wrong');

    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      'Jellyfin auth error',
      expect.any(Object)
    );
  });
});

describe('JellyfinApi — getUsers()', () => {
  it('GETs /Users with X-Emby-Token header', async () => {
    const users = [
      { Id: 'u1', Name: 'Admin', Policy: { IsAdministrator: true } },
    ];
    mockAxiosInstance.get.mockResolvedValue({ data: users });

    const api = new JellyfinApi('http://jellyfin:8096');
    const result = await api.getUsers('my-token');

    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/Users', {
      headers: { 'X-Emby-Token': 'my-token' },
    });
    expect(result).toEqual(users);
  });

  it('returns [] and logs on error', async () => {
    mockAxiosInstance.get.mockRejectedValue(new Error('forbidden'));

    const api = new JellyfinApi('http://jellyfin:8096');
    const result = await api.getUsers('bad-token');

    expect(result).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith(
      'Jellyfin get users error',
      expect.any(Object)
    );
  });
});

describe('JellyfinApi — getUser()', () => {
  it('GETs /Users/<id> with token header', async () => {
    const user = { Id: 'u1', Name: 'Admin', Policy: { IsAdministrator: true } };
    mockAxiosInstance.get.mockResolvedValue({ data: user });

    const api = new JellyfinApi('http://jellyfin:8096');
    const result = await api.getUser('u1', 'my-token');

    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/Users/u1', {
      headers: { 'X-Emby-Token': 'my-token' },
    });
    expect(result).toEqual(user);
  });

  it('returns null on error (no log)', async () => {
    mockAxiosInstance.get.mockRejectedValue(new Error('not found'));

    const api = new JellyfinApi('http://jellyfin:8096');
    const result = await api.getUser('u1', 'my-token');

    expect(result).toBeNull();
    expect(logger.error).not.toHaveBeenCalled();
  });
});

describe('JellyfinApi — testConnection()', () => {
  it('GETs /System/Info/Public and returns true on success', async () => {
    mockAxiosInstance.get.mockResolvedValue({ data: {} });

    const api = new JellyfinApi('http://jellyfin:8096');
    const result = await api.testConnection('my-token');

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/System/Info/Public',
      { headers: { 'X-Emby-Token': 'my-token' } }
    );
    expect(result).toBe(true);
  });

  it('passes empty headers when no token', async () => {
    mockAxiosInstance.get.mockResolvedValue({ data: {} });

    const api = new JellyfinApi('http://jellyfin:8096');
    await api.testConnection();

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/System/Info/Public',
      { headers: {} }
    );
  });

  it('returns false on error', async () => {
    mockAxiosInstance.get.mockRejectedValue(new Error('refused'));

    const api = new JellyfinApi('http://jellyfin:8096');
    const result = await api.testConnection();

    expect(result).toBe(false);
  });
});

describe('JellyfinApi — getLibraries()', () => {
  it('GETs /Library/VirtualFolders with token', async () => {
    const libraries = [{ ItemId: 'lib1', Name: 'Books' }];
    mockAxiosInstance.get.mockResolvedValue({ data: libraries });

    const api = new JellyfinApi('http://jellyfin:8096');
    const result = await api.getLibraries('api-key');

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/Library/VirtualFolders',
      { headers: { 'X-Emby-Token': 'api-key' } }
    );
    expect(result).toEqual(libraries);
  });

  it('returns [] when result is null/falsy', async () => {
    mockAxiosInstance.get.mockResolvedValue({ data: null });

    const api = new JellyfinApi('http://jellyfin:8096');
    const result = await api.getLibraries('api-key');

    expect(result).toEqual([]);
  });

  it('returns [] and logs on error', async () => {
    mockAxiosInstance.get.mockRejectedValue(new Error('fail'));

    const api = new JellyfinApi('http://jellyfin:8096');
    const result = await api.getLibraries('api-key');

    expect(result).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith(
      'Jellyfin get libraries error',
      expect.any(Object)
    );
  });
});

describe('JellyfinApi — getLibraryItems()', () => {
  it('GETs /Items with params and token header', async () => {
    const items = [{ Id: 'i1', Name: 'Book 1' }];
    mockAxiosInstance.get.mockResolvedValue({ data: { Items: items } });

    const api = new JellyfinApi('http://jellyfin:8096');
    const result = await api.getLibraryItems('parent1', 'api-key');

    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/Items', {
      params: {
        ParentId: 'parent1',
        Recursive: 'true',
        Fields: 'ProviderIds',
      },
      headers: { 'X-Emby-Token': 'api-key' },
    });
    expect(result).toEqual(items);
  });

  it('returns [] when Items is null/falsy', async () => {
    mockAxiosInstance.get.mockResolvedValue({ data: { Items: null } });

    const api = new JellyfinApi('http://jellyfin:8096');
    const result = await api.getLibraryItems('parent1', 'api-key');

    expect(result).toEqual([]);
  });

  it('returns [] and logs on error', async () => {
    mockAxiosInstance.get.mockRejectedValue(new Error('fail'));

    const api = new JellyfinApi('http://jellyfin:8096');
    const result = await api.getLibraryItems('parent1', 'api-key');

    expect(result).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith(
      'Jellyfin get library items error',
      expect.any(Object)
    );
  });
});
