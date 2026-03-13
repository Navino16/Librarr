import type { MetadataSource } from '../api/metadata/types';

export interface ReadarrSettings {
  id?: number;
  name: string;
  hostname: string;
  port: number;
  apiKey: string;
  useSsl: boolean;
  baseUrl?: string;
  activeProfileId: number;
  activeDirectory: string;
  metadataProfileId?: number;
  tags?: number[];
  contentType: 'ebook' | 'audiobook';
}

export interface LidarrSettings {
  id?: number;
  name: string;
  hostname: string;
  port: number;
  apiKey: string;
  useSsl: boolean;
  baseUrl?: string;
  activeProfileId: number;
  activeDirectory: string;
  metadataProfileId?: number;
  tags?: number[];
  isDefault: boolean;
}

export interface AudiobookshelfSettings {
  hostname: string;
  port: number;
  apiKey: string;
  useSsl: boolean;
  baseUrl?: string;
}

export interface JellyfinSettings {
  hostname: string;
  port?: number;
  useSsl: boolean;
  baseUrl?: string;
  serverId?: string;
  apiKey?: string;
}

export interface PlexSettings {
  hostname: string;
  port: number;
  useSsl: boolean;
  token?: string;
  machineId?: string;
}

export interface NotificationAgentConfig {
  enabled: boolean;
  types: number;
  options: Record<string, string>;
}

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  authUser: string;
  authPass: string;
  senderAddress: string;
  senderName: string;
  requireTls: boolean;
  allowSelfSigned: boolean;
}

export interface OidcProviderSettings {
  id: string;
  name: string;
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  autoCreateUsers: boolean;
  defaultPermissions: number;
}

export interface PlexAuthSettings {
  autoCreateUsers: boolean;
  defaultPermissions: number;
}

export interface MainSettings {
  appTitle: string;
  applicationUrl?: string;
  hideAvailable: boolean;
  localLogin: boolean;
  plexLogin: boolean;
  oidcLogin: boolean;
  plexClientId?: string;
  defaultPermissions: number;
  hardcoverToken?: string;
  initialized: boolean;
  enableEbookRequests: boolean;
  enableAudiobookRequests: boolean;
  enableMusicRequests: boolean;
}

export interface PermissionRole {
  id: number;
  name: string;
  permissions: number;
  isDefault: boolean;
  ebookQuotaLimit?: number;
  audiobookQuotaLimit?: number;
  musicQuotaLimit?: number;
}

export interface MetadataProviderSettings {
  hardcover: { enabled: boolean };
  openlibrary: { enabled: boolean };
  googlebooks: { enabled: boolean };

  priority: {
    search: MetadataSource[];
    description: MetadataSource[];
    cover: MetadataSource[];
    editions: MetadataSource[];
    ratings: MetadataSource[];
  };
}

export interface AllSettings {
  main: MainSettings;
  jellyfin: JellyfinSettings;
  plex: PlexSettings;
  readarr: ReadarrSettings[];
  lidarr: LidarrSettings[];
  audiobookshelf: AudiobookshelfSettings;
  notifications: {
    agents: Record<string, NotificationAgentConfig>;
    smtp?: SmtpSettings;
  };
  roles: PermissionRole[];
  metadataProviders: MetadataProviderSettings;
  webhookSecret?: string;
  oidcProviders: OidcProviderSettings[];
  plexAuth: PlexAuthSettings;
}
