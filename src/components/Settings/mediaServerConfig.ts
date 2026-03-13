type ServerType = 'jellyfin' | 'plex' | 'audiobookshelf';

export const defaultJellyfinForm = {
  hostname: '',
  port: 8096,
  useSsl: false,
  baseUrl: '',
  apiKey: '',
};

export const defaultPlexForm = {
  hostname: '',
  port: 32400,
  useSsl: false,
  token: '',
};

export const defaultAudiobookshelfForm = {
  hostname: '',
  port: 13378,
  useSsl: false,
  apiKey: '',
  baseUrl: '',
};

export const typeConfig: Record<ServerType, { color: string; badgeBg: string }> = {
  jellyfin: {
    color: 'bg-purple-500/15 text-purple-400',
    badgeBg: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  },
  plex: {
    color: 'bg-amber-500/15 text-amber-400',
    badgeBg: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  },
  audiobookshelf: {
    color: 'bg-teal-500/15 text-teal-400',
    badgeBg: 'bg-teal-500/15 text-teal-400 border-teal-500/20',
  },
};

export function getUseSsl(serverType: ServerType, jellyfinForm: typeof defaultJellyfinForm, plexForm: typeof defaultPlexForm, absForm: typeof defaultAudiobookshelfForm) {
  if (serverType === 'jellyfin') return jellyfinForm.useSsl;
  if (serverType === 'plex') return plexForm.useSsl;
  return absForm.useSsl;
}

export function getHostname(serverType: ServerType, jellyfinForm: typeof defaultJellyfinForm, plexForm: typeof defaultPlexForm, absForm: typeof defaultAudiobookshelfForm) {
  if (serverType === 'jellyfin') return jellyfinForm.hostname;
  if (serverType === 'plex') return plexForm.hostname;
  return absForm.hostname;
}

export function getPort(serverType: ServerType, jellyfinForm: typeof defaultJellyfinForm, plexForm: typeof defaultPlexForm, absForm: typeof defaultAudiobookshelfForm) {
  if (serverType === 'jellyfin') return jellyfinForm.port;
  if (serverType === 'plex') return plexForm.port;
  return absForm.port;
}

export function formatUrl(protocol: string, hostname: string, port?: number, baseUrl?: string) {
  const portStr = port ? `:${port}` : '';
  return `${protocol}://${hostname}${portStr}${baseUrl || ''}`;
}
