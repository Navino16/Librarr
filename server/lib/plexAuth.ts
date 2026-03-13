import axios from 'axios';
import { v4 as uuid } from 'uuid';
import Settings from './settings';
import logger from '../logger';

const PLEX_API = 'https://plex.tv/api/v2';

interface PlexPinResponse {
  id: number;
  code: string;
  authToken: string | null;
}

interface PlexUser {
  id: number;
  uuid: string;
  username: string;
  email: string;
  thumb: string;
  authToken: string;
}

function getPlexClientId(): string {
  const settings = Settings.getInstance();
  if (settings.main.plexClientId) {
    return settings.main.plexClientId;
  }
  const clientId = uuid();
  settings.main.plexClientId = clientId;
  settings.save();
  return clientId;
}

function plexHeaders(clientId: string, authToken?: string) {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Plex-Client-Identifier': clientId,
    'X-Plex-Product': 'Librarr',
    'X-Plex-Version': '1.0.0',
  };
  if (authToken) {
    headers['X-Plex-Token'] = authToken;
  }
  return headers;
}

export async function createPlexPin(): Promise<{
  id: number;
  code: string;
  clientId: string;
  authUrl: string;
}> {
  const clientId = getPlexClientId();
  const response = await axios.post<PlexPinResponse>(
    `${PLEX_API}/pins`,
    { strong: true },
    { headers: plexHeaders(clientId) }
  );
  const { id, code } = response.data;
  const authUrl = `https://app.plex.tv/auth#?clientID=${encodeURIComponent(clientId)}&code=${encodeURIComponent(code)}&context%5Bdevice%5D%5Bproduct%5D=Librarr`;
  logger.debug('Plex PIN created', { pinId: id });
  return { id, code, clientId, authUrl };
}

export async function checkPlexPin(
  pinId: number,
  clientId: string
): Promise<string | null> {
  const response = await axios.get<PlexPinResponse>(
    `${PLEX_API}/pins/${pinId}`,
    { headers: plexHeaders(clientId) }
  );
  return response.data.authToken || null;
}

export async function getPlexUser(authToken: string): Promise<PlexUser> {
  const clientId = getPlexClientId();
  const response = await axios.get<PlexUser>(`${PLEX_API}/user`, {
    headers: plexHeaders(clientId, authToken),
  });
  return response.data;
}
