# Authentication Settings

The Authentication Settings page configures which login methods are available. Access it from **Settings > Authentication**. Requires the **Manage General Settings** permission.

## Local Authentication

### Enable Local Login

Controls whether users can log in with a local email/password. Enabled by default.

**Admin bypass:** When local login is disabled, administrators can still access the local login form by navigating to `/login?localAuth=true`. This prevents lockout scenarios.

**Warning:** Disabling local login while no other authentication method is configured may make the application inaccessible to non-admin users.

## Plex Authentication

### Enable Plex Login

Enables the "Sign in with Plex" button on the login page. Users authenticate via the Plex PIN flow — a popup opens to plex.tv where they approve access, and Librarr polls for completion.

Plex authentication does **not** require a Plex media server to be configured in Librarr. It uses plex.tv directly as an identity provider.

### Auto-Create Users

When enabled, users who sign in via Plex for the first time will automatically have an account created with the default role permissions. When disabled, a Plex user must already have a matching account in Librarr (matched by Plex ID or email).

## OIDC Authentication

### Enable OIDC Login

Master toggle for OpenID Connect authentication. When enabled, configured OIDC providers appear as login buttons on the login page.

### OIDC Providers

You can configure multiple OIDC providers. Each provider requires:

| Field                 | Description                                                                                                         |
|-----------------------|---------------------------------------------------------------------------------------------------------------------|
| **Name**              | Display name shown on the login button (e.g., "Authelia", "Google")                                                 |
| **Issuer URL**        | The OIDC discovery URL (e.g., `https://auth.example.com`). Must be a valid HTTPS URL (HTTP allowed for development) |
| **Client ID**         | OAuth2 client identifier                                                                                            |
| **Client Secret**     | OAuth2 client secret (stored encrypted, shown as masked after save)                                                 |
| **Scopes**            | OIDC scopes to request (default: `openid email profile`)                                                            |
| **Auto-Create Users** | Whether to create new accounts for unknown users                                                                    |

### OIDC Flow

Librarr uses the **Authorization Code flow with PKCE (S256)** for OIDC:

1. User clicks a provider button on the login page
2. Browser redirects to the provider's authorization endpoint
3. User authenticates with the provider
4. Provider redirects back to Librarr's callback URL
5. Librarr exchanges the authorization code for tokens
6. User is matched or created based on the ID token claims

### Callback URL

When configuring your OIDC provider, set the redirect/callback URL to:

```
https://your-librarr-url/api/v1/auth/oidc/{provider-id}/callback
```

The provider ID is generated automatically when you add a provider. The full callback URL is displayed directly under each provider in the Authentication Settings page, with a copy button for convenience.

### Security Notes

- **PKCE S256** is enforced on all OIDC flows to prevent authorization code interception
- **State parameter** is validated to prevent CSRF attacks
- Only **verified emails** (`email_verified: true` claim) are used for account matching, preventing account takeover via unverified email claims
- Return URLs are validated to be relative paths, preventing open redirect attacks
