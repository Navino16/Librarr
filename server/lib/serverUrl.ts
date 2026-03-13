interface ServerConfig {
  hostname: string;
  port: number;
  useSsl: boolean;
  baseUrl?: string;
}

export function buildServerUrl(server: ServerConfig): string;
export function buildServerUrl(hostname: string, port: number, useSsl: boolean, baseUrl?: string): string;
export function buildServerUrl(
  hostnameOrServer: string | ServerConfig,
  port?: number,
  useSsl?: boolean,
  baseUrl?: string
): string {
  let h: string, p: number, ssl: boolean, base: string | undefined;
  if (typeof hostnameOrServer === 'object') {
    h = hostnameOrServer.hostname;
    p = hostnameOrServer.port;
    ssl = hostnameOrServer.useSsl;
    base = hostnameOrServer.baseUrl;
  } else {
    h = hostnameOrServer;
    p = port!;
    ssl = useSsl!;
    base = baseUrl;
  }
  const protocol = ssl ? 'https' : 'http';
  const normalizedBase = base ? `/${base.replace(/^\/|\/$/g, '')}` : '';
  return `${protocol}://${h}:${p}${normalizedBase}`;
}
