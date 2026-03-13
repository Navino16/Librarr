import logger from '../logger';
import type { OidcProviderSettings } from '../types/settings';

// openid-client v6 is ESM-only, use dynamic import
type OidcClientModule = typeof import('openid-client');
let oidcClient: OidcClientModule | null = null;

async function getClient(): Promise<OidcClientModule> {
  if (!oidcClient) {
    oidcClient = await import('openid-client');
  }
  return oidcClient;
}

// Cache discovered configurations by issuer URL
type Configuration = Awaited<ReturnType<OidcClientModule['discovery']>>;
const configCache = new Map<string, { config: Configuration; expiresAt: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function discoverOidcProvider(
  provider: OidcProviderSettings
): Promise<Configuration> {
  const cacheKey = `${provider.issuerUrl}:${provider.clientId}`;
  const cached = configCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.config;
  }

  const client = await getClient();
  const config = await client.discovery(
    new URL(provider.issuerUrl),
    provider.clientId,
    provider.clientSecret
  );

  configCache.set(cacheKey, { config, expiresAt: Date.now() + CACHE_TTL });
  logger.debug('OIDC provider discovered', { issuer: provider.issuerUrl });
  return config;
}

export async function generateAuthorizationUrl(
  provider: OidcProviderSettings,
  redirectUri: string
): Promise<{ url: string; state: string; codeVerifier: string }> {
  const client = await getClient();
  const config = await discoverOidcProvider(provider);

  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();

  const authUrl = client.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: provider.scopes || 'openid email profile',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });

  return { url: authUrl.href, state, codeVerifier };
}

export interface OidcUserClaims {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
}

export async function exchangeCode(
  provider: OidcProviderSettings,
  callbackUrl: URL,
  codeVerifier: string,
  expectedState: string
): Promise<OidcUserClaims> {
  const client = await getClient();
  const config = await discoverOidcProvider(provider);

  const tokens = await client.authorizationCodeGrant(config, callbackUrl, {
    pkceCodeVerifier: codeVerifier,
    expectedState,
  });

  const claims = tokens.claims();
  if (!claims) {
    throw new Error('No ID token claims returned');
  }

  // Only trust email if the provider confirms it is verified
  const email = claims.email_verified ? (claims.email as string | undefined) : undefined;
  if (claims.email && !claims.email_verified) {
    logger.warn('OIDC email not verified, ignoring email claim', { sub: claims.sub });
  }

  return {
    sub: claims.sub,
    email,
    name: claims.name as string | undefined,
    picture: claims.picture as string | undefined,
  };
}
