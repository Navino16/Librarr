export type ServerType = 'jellyfin' | 'plex' | 'audiobookshelf';

export interface StepDef {
  id: number;
  labelKey: string;
}

export const ALL_STEPS: StepDef[] = [
  { id: 1, labelKey: 'stepAccount' },
  { id: 2, labelKey: 'stepRequestTypes' },
  { id: 3, labelKey: 'stepHardcover' },
  { id: 4, labelKey: 'stepMediaServer' },
  { id: 5, labelKey: 'stepReadarr' },
  { id: 6, labelKey: 'stepLidarr' },
  { id: 7, labelKey: 'stepConfirm' },
];

// Form defaults
export const jellyfinDefaults = { hostname: '', port: 8096, useSsl: false, baseUrl: '' };
export const plexDefaults = { hostname: '', port: 32400, useSsl: false, token: '' };
export const absDefaults = { hostname: '', port: 13378, useSsl: false, apiKey: '', baseUrl: '' };
export const readarrDefaults = { name: '', hostname: '', port: 8787, apiKey: '', useSsl: false, baseUrl: '', activeProfileId: 1, activeDirectory: '', contentType: 'ebook' as 'ebook' | 'audiobook' };
export const lidarrDefaults = { name: '', hostname: '', port: 8686, apiKey: '', useSsl: false, baseUrl: '', activeProfileId: 1, activeDirectory: '', isDefault: true };

// Types for saved servers
export interface SavedMediaServer {
  type: ServerType;
  label: string;
  form: Record<string, unknown>;
  hostname: string;
  port: number;
  useSsl: boolean;
}

export interface SavedReadarr {
  name: string;
  hostname: string;
  port: number;
  apiKey: string;
  useSsl: boolean;
  baseUrl: string;
  activeProfileId: number;
  activeDirectory: string;
  contentType: 'ebook' | 'audiobook';
}

export interface SavedLidarr {
  name: string;
  hostname: string;
  port: number;
  apiKey: string;
  useSsl: boolean;
  baseUrl: string;
  activeProfileId: number;
  activeDirectory: string;
  isDefault: boolean;
}
