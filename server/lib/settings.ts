import fs from 'fs';
import { writeFile } from 'fs/promises';
import path from 'path';
import logger from '../logger';
import { Permission } from './permissions';
import { DEFAULT_METADATA_PROVIDERS } from '../api/metadata/MetadataResolver';
import type {
  ReadarrSettings,
  LidarrSettings,
  AudiobookshelfSettings,
  JellyfinSettings,
  PlexSettings,
  MainSettings,
  PermissionRole,
  MetadataProviderSettings,
  AllSettings,
  OidcProviderSettings,
  PlexAuthSettings,
} from '@server/types/settings';

export type {
  ReadarrSettings,
  LidarrSettings,
  AudiobookshelfSettings,
  JellyfinSettings,
  PlexSettings,
  NotificationAgentConfig,
  SmtpSettings,
  MainSettings,
  PermissionRole,
  MetadataProviderSettings,
  AllSettings,
  OidcProviderSettings,
  PlexAuthSettings,
} from '@server/types/settings';

const CONFIG_DIR = process.env.CONFIG_DIR || path.join(process.cwd(), 'config');
const SETTINGS_PATH = path.join(CONFIG_DIR, 'settings.json');

const defaultSettings: AllSettings = {
  main: {
    appTitle: 'Librarr',
    hideAvailable: false,
    localLogin: true,
    plexLogin: false,
    oidcLogin: false,
    defaultPermissions:
      Permission.REQUEST_EBOOK |
      Permission.REQUEST_AUDIOBOOK |
      Permission.REQUEST_MUSIC |
      Permission.CREATE_ISSUES |
      Permission.VIEW_ISSUES,
    initialized: false,
    enableEbookRequests: true,
    enableAudiobookRequests: true,
    enableMusicRequests: false,
  },
  jellyfin: {
    hostname: '',
    useSsl: false,
  },
  plex: {
    hostname: '',
    port: 32400,
    useSsl: false,
  },
  readarr: [],
  lidarr: [],
  audiobookshelf: {
    hostname: '',
    port: 13378,
    apiKey: '',
    useSsl: false,
  },
  metadataProviders: { ...DEFAULT_METADATA_PROVIDERS },
  notifications: {
    agents: {},
  },
  roles: [
    {
      id: 0,
      name: 'Admin',
      permissions: Permission.ADMIN,
      isDefault: false,
    },
    {
      id: 1,
      name: 'Manager',
      permissions:
        Permission.MANAGE_USERS |
        Permission.REQUEST_EBOOK |
        Permission.REQUEST_AUDIOBOOK |
        Permission.REQUEST_MUSIC |
        Permission.MANAGE_REQUESTS_EBOOK |
        Permission.MANAGE_REQUESTS_AUDIOBOOK |
        Permission.MANAGE_REQUESTS_MUSIC |
        Permission.REQUEST_VIEW_EBOOK |
        Permission.REQUEST_VIEW_AUDIOBOOK |
        Permission.REQUEST_VIEW_MUSIC |
        Permission.CREATE_ISSUES |
        Permission.MANAGE_ISSUES |
        Permission.VIEW_ISSUES,
      isDefault: false,
    },
    {
      id: 2,
      name: 'User',
      permissions:
        Permission.REQUEST_EBOOK |
        Permission.REQUEST_AUDIOBOOK |
        Permission.REQUEST_MUSIC |
        Permission.CREATE_ISSUES |
        Permission.VIEW_ISSUES,
      isDefault: true,
    },
  ],
  oidcProviders: [],
  plexAuth: {
    autoCreateUsers: false,
    defaultPermissions:
      Permission.REQUEST_EBOOK |
      Permission.REQUEST_AUDIOBOOK |
      Permission.REQUEST_MUSIC |
      Permission.CREATE_ISSUES |
      Permission.VIEW_ISSUES,
  },
};

class Settings {
  private static instance: Settings;
  private data: AllSettings;
  private writeQueue: Promise<void> = Promise.resolve();

  private constructor() {
    this.data = this.load();
  }

  static getInstance(): Settings {
    if (!Settings.instance) {
      Settings.instance = new Settings();
    }
    return Settings.instance;
  }

  private load(): AllSettings {
    try {
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
      }
      if (!fs.existsSync(path.join(CONFIG_DIR, 'db'))) {
        fs.mkdirSync(path.join(CONFIG_DIR, 'db'), { recursive: true });
      }

      if (fs.existsSync(SETTINGS_PATH)) {
        const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
        const loaded = JSON.parse(raw);
        return {
          ...defaultSettings,
          ...loaded,
          main: { ...defaultSettings.main, ...loaded.main },
          jellyfin: { ...defaultSettings.jellyfin, ...loaded.jellyfin },
          plex: { ...defaultSettings.plex, ...loaded.plex },
          audiobookshelf: { ...defaultSettings.audiobookshelf, ...loaded.audiobookshelf },
          metadataProviders: {
            ...defaultSettings.metadataProviders,
            ...loaded.metadataProviders,
            priority: {
              ...defaultSettings.metadataProviders.priority,
              ...(loaded.metadataProviders?.priority ?? {}),
            },
          },
          plexAuth: { ...defaultSettings.plexAuth, ...loaded.plexAuth },
          oidcProviders: loaded.oidcProviders ?? defaultSettings.oidcProviders,
        };
      }
    } catch (e) {
      logger.error('Failed to load settings file', { error: e });
    }
    return { ...defaultSettings };
  }

  save(): void {
    try {
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
      }
      // Serialize writes through a promise chain to prevent concurrent
      // writeFile calls from corrupting the settings file.
      const content = JSON.stringify(this.data, null, 2);
      this.writeQueue = this.writeQueue
        .then(() => writeFile(SETTINGS_PATH, content, { mode: 0o600 }))
        .catch((e) => { logger.error('Failed to save settings file', { error: e }); });
    } catch (e) {
      logger.error('Failed to create config directory', { error: e });
    }
  }

  get fullSettings(): AllSettings {
    return this.data;
  }

  get main(): MainSettings {
    return this.data.main;
  }

  set main(value: MainSettings) {
    this.data.main = value;
  }

  get jellyfin(): JellyfinSettings {
    return this.data.jellyfin;
  }

  set jellyfin(value: JellyfinSettings) {
    this.data.jellyfin = value;
  }

  get plex(): PlexSettings {
    return this.data.plex;
  }

  set plex(value: PlexSettings) {
    this.data.plex = value;
  }

  get readarr(): ReadarrSettings[] {
    return this.data.readarr;
  }

  set readarr(value: ReadarrSettings[]) {
    this.data.readarr = value;
  }

  get lidarr(): LidarrSettings[] {
    return this.data.lidarr;
  }

  set lidarr(value: LidarrSettings[]) {
    this.data.lidarr = value;
  }

  get audiobookshelf(): AudiobookshelfSettings {
    return this.data.audiobookshelf;
  }

  set audiobookshelf(value: AudiobookshelfSettings) {
    this.data.audiobookshelf = value;
  }

  get notifications() {
    return this.data.notifications;
  }

  set notifications(value: AllSettings['notifications']) {
    this.data.notifications = value;
  }

  get roles(): PermissionRole[] {
    return this.data.roles;
  }

  set roles(value: PermissionRole[]) {
    this.data.roles = value;
  }

  get metadataProviders(): MetadataProviderSettings {
    return this.data.metadataProviders;
  }

  set metadataProviders(value: MetadataProviderSettings) {
    this.data.metadataProviders = value;
  }

  get webhookSecret(): string | undefined {
    return this.data.webhookSecret;
  }

  set webhookSecret(value: string | undefined) {
    this.data.webhookSecret = value;
  }

  get oidcProviders(): OidcProviderSettings[] {
    return this.data.oidcProviders;
  }

  set oidcProviders(value: OidcProviderSettings[]) {
    this.data.oidcProviders = value;
  }

  get plexAuth(): PlexAuthSettings {
    return this.data.plexAuth;
  }

  set plexAuth(value: PlexAuthSettings) {
    this.data.plexAuth = value;
  }

  get public(): Pick<MainSettings, 'appTitle' | 'initialized' | 'localLogin' | 'plexLogin' | 'oidcLogin'> & {
    oidcProviders: { id: string; name: string }[];
    bookEnabled: boolean;
    hideAvailable: boolean;
    enableEbookRequests: boolean;
    enableAudiobookRequests: boolean;
    enableMusicRequests: boolean;
    smtpConfigured: boolean;
  } {
    const smtp = this.data.notifications.smtp;
    return {
      appTitle: this.data.main.appTitle,
      initialized: this.data.main.initialized,
      localLogin: this.data.main.localLogin,
      plexLogin: this.data.main.plexLogin,
      oidcLogin: this.data.main.oidcLogin,
      oidcProviders: this.data.main.oidcLogin
        ? this.data.oidcProviders.map((p) => ({ id: p.id, name: p.name }))
        : [],
      bookEnabled: !!this.data.main.hardcoverToken,
      hideAvailable: this.data.main.hideAvailable ?? false,
      enableEbookRequests: this.data.main.enableEbookRequests ?? true,
      enableAudiobookRequests: this.data.main.enableAudiobookRequests ?? true,
      enableMusicRequests: this.data.main.enableMusicRequests ?? false,
      smtpConfigured: !!(smtp?.host && smtp?.senderAddress),
    };
  }
}

export default Settings;
