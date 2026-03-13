import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import { writeFile } from 'fs/promises';

vi.mock('fs');
vi.mock('fs/promises');
vi.mock('@server/logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@server/api/metadata/MetadataResolver', () => ({
  DEFAULT_METADATA_PROVIDERS: {
    hardcover: { enabled: true },
    openlibrary: { enabled: true },
    googlebooks: { enabled: true },
    priority: {
      search: ['hardcover', 'openlibrary', 'googlebooks'],
      description: ['hardcover', 'openlibrary', 'googlebooks'],
      cover: ['hardcover', 'openlibrary', 'googlebooks'],
      editions: ['hardcover', 'openlibrary'],
      ratings: ['hardcover'],
    },
  },
}));

import Settings from '@server/lib/settings';
import logger from '@server/logger';

const mockedExistsSync = vi.mocked(fs.existsSync);
const mockedReadFileSync = vi.mocked(fs.readFileSync);
const mockedMkdirSync = vi.mocked(fs.mkdirSync);
const mockedWriteFile = vi.mocked(writeFile);

function resetSingleton() {
  (Settings as any)['instance'] = undefined;
}

beforeEach(() => {
  vi.resetAllMocks();
  resetSingleton();
  // Default: all dirs exist, no settings file
  mockedExistsSync.mockReturnValue(false);
  mockedWriteFile.mockResolvedValue();
});

describe('Settings — getInstance()', () => {
  it('returns the same instance on multiple calls', () => {
    const a = Settings.getInstance();
    const b = Settings.getInstance();
    expect(a).toBe(b);
  });

  it('creates config/ and config/db/ directories when absent', () => {
    Settings.getInstance();
    const calls = mockedMkdirSync.mock.calls.map((c) => String(c[0]));
    expect(calls.some((p) => p.endsWith('config'))).toBe(true);
    expect(calls.some((p) => p.includes('db'))).toBe(true);
  });
});

describe('Settings — load()', () => {
  it('returns defaultSettings when settings.json does not exist', () => {
    mockedExistsSync.mockReturnValue(false);
    const settings = Settings.getInstance();
    expect(settings.main.appTitle).toBe('Librarr');
    expect(settings.main.initialized).toBe(false);
  });

  it('merges loaded settings with defaults', () => {
    mockedExistsSync.mockImplementation((p) => {
      if (String(p).endsWith('settings.json')) return true;
      return true;
    });
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        main: { appTitle: 'CustomTitle', initialized: true },
      })
    );

    const settings = Settings.getInstance();
    expect(settings.main.appTitle).toBe('CustomTitle');
    expect(settings.main.initialized).toBe(true);
    // Defaults preserved
    expect(settings.main.localLogin).toBe(true);
  });

  it('deep merges metadataProviders.priority with defaults', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        metadataProviders: {
          priority: { search: ['openlibrary'] },
        },
      })
    );

    const settings = Settings.getInstance();
    expect(settings.metadataProviders.priority.search).toEqual([
      'openlibrary',
    ]);
    // Other priority keys come from defaults
    expect(settings.metadataProviders.priority.ratings).toEqual(['hardcover']);
  });

  it('returns defaultSettings and logs when JSON parse fails', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('not valid json{{{');

    const settings = Settings.getInstance();
    expect(settings.main.appTitle).toBe('Librarr');
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to load settings file',
      expect.any(Object)
    );
  });

  it('returns defaultSettings and logs when readFileSync throws', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const settings = Settings.getInstance();
    expect(settings.main.appTitle).toBe('Librarr');
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('Settings — save()', () => {
  it('creates config/ if absent before write', async () => {
    mockedExistsSync.mockReturnValue(false);
    const settings = Settings.getInstance();

    vi.resetAllMocks();
    mockedExistsSync.mockReturnValue(false);
    mockedWriteFile.mockResolvedValue();

    settings.save();
    await vi.waitFor(() => {
      expect(mockedMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('config'),
        { recursive: true }
      );
    });
  });

  it('calls writeFile with JSON and mode 0o600', async () => {
    mockedExistsSync.mockReturnValue(false);
    const settings = Settings.getInstance();

    vi.resetAllMocks();
    mockedExistsSync.mockReturnValue(true);
    mockedWriteFile.mockResolvedValue();

    settings.save();
    await vi.waitFor(() => {
      expect(mockedWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('settings.json'),
        expect.any(String),
        { mode: 0o600 }
      );
    });
  });

  it('logs when writeFile rejects', async () => {
    mockedExistsSync.mockReturnValue(false);
    const settings = Settings.getInstance();

    vi.resetAllMocks();
    mockedExistsSync.mockReturnValue(true);
    mockedWriteFile.mockRejectedValue(new Error('disk full'));

    settings.save();
    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to save settings file',
        expect.any(Object)
      );
    });
  });

  it('logs when mkdirSync throws in save', () => {
    mockedExistsSync.mockReturnValue(false);
    const settings = Settings.getInstance();

    vi.resetAllMocks();
    mockedExistsSync.mockReturnValue(false);
    mockedMkdirSync.mockImplementation(() => {
      throw new Error('permission denied');
    });

    settings.save();
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to create config directory',
      expect.any(Object)
    );
  });
});

describe('Settings — getters/setters', () => {
  it('main getter returns data.main', () => {
    const settings = Settings.getInstance();
    expect(settings.main).toHaveProperty('appTitle');
    expect(settings.main).toHaveProperty('initialized');
  });

  it('main setter updates data.main', () => {
    const settings = Settings.getInstance();
    const newMain = { ...settings.main, appTitle: 'NewTitle' };
    settings.main = newMain;
    expect(settings.main.appTitle).toBe('NewTitle');
  });

  it('readarr getter returns the array', () => {
    const settings = Settings.getInstance();
    expect(Array.isArray(settings.readarr)).toBe(true);
    expect(settings.readarr).toEqual([]);
  });

  it('webhookSecret getter/setter works', () => {
    const settings = Settings.getInstance();
    expect(settings.webhookSecret).toBeUndefined();
    settings.webhookSecret = 'secret123';
    expect(settings.webhookSecret).toBe('secret123');
  });

  it('fullSettings returns all data', () => {
    const settings = Settings.getInstance();
    const full = settings.fullSettings;
    expect(full).toHaveProperty('main');
    expect(full).toHaveProperty('readarr');
    expect(full).toHaveProperty('jellyfin');
    expect(full).toHaveProperty('plex');
  });

  it('jellyfin getter/setter works', () => {
    const settings = Settings.getInstance();
    const newVal = { hostname: 'jf.local', useSsl: true };
    settings.jellyfin = newVal;
    expect(settings.jellyfin.hostname).toBe('jf.local');
    expect(settings.jellyfin.useSsl).toBe(true);
  });

  it('plex getter/setter works', () => {
    const settings = Settings.getInstance();
    const newVal = { hostname: 'plex.local', port: 32500, useSsl: true };
    settings.plex = newVal;
    expect(settings.plex.hostname).toBe('plex.local');
    expect(settings.plex.port).toBe(32500);
  });

  it('readarr setter updates the array', () => {
    const settings = Settings.getInstance();
    const newArr = [{ name: 'test' }] as unknown as typeof settings.readarr;
    settings.readarr = newArr;
    expect(settings.readarr).toHaveLength(1);
  });

  it('lidarr getter/setter works', () => {
    const settings = Settings.getInstance();
    expect(settings.lidarr).toEqual([]);
    const newArr = [{ name: 'lidarr1' }] as unknown as typeof settings.lidarr;
    settings.lidarr = newArr;
    expect(settings.lidarr).toHaveLength(1);
  });

  it('audiobookshelf getter/setter works', () => {
    const settings = Settings.getInstance();
    const newVal = { hostname: 'abs.local', port: 8000, apiKey: 'key', useSsl: false };
    settings.audiobookshelf = newVal;
    expect(settings.audiobookshelf.hostname).toBe('abs.local');
  });

  it('notifications getter/setter works', () => {
    const settings = Settings.getInstance();
    const newVal = { agents: { email: { enabled: true, types: 1, options: {} } } };
    settings.notifications = newVal;
    expect(settings.notifications.agents).toHaveProperty('email');
  });

  it('roles getter/setter works', () => {
    const settings = Settings.getInstance();
    expect(settings.roles.length).toBeGreaterThan(0);
    const newRoles = [{ id: 99, name: 'Custom', permissions: 0, isDefault: false }];
    settings.roles = newRoles;
    expect(settings.roles).toEqual(newRoles);
  });

  it('metadataProviders getter/setter works', () => {
    const settings = Settings.getInstance();
    const newVal = { ...settings.metadataProviders };
    settings.metadataProviders = newVal;
    expect(settings.metadataProviders).toBe(newVal);
  });
});

describe('Settings — public getter', () => {
  it('returns expected public fields', () => {
    const settings = Settings.getInstance();
    const pub = settings.public;
    expect(pub).toHaveProperty('appTitle', 'Librarr');
    expect(pub).toHaveProperty('initialized', false);
    expect(pub).toHaveProperty('localLogin', true);
  });

  it('bookEnabled is true when hardcoverToken is defined', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({ main: { hardcoverToken: 'token123' } })
    );

    const settings = Settings.getInstance();
    expect(settings.public.bookEnabled).toBe(true);
  });

  it('bookEnabled is false when hardcoverToken is absent', () => {
    const settings = Settings.getInstance();
    expect(settings.public.bookEnabled).toBe(false);
  });

  it('hideAvailable defaults to false', () => {
    const settings = Settings.getInstance();
    expect(settings.public.hideAvailable).toBe(false);
  });
});
