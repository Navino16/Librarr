# Users & Permissions

Librarr uses a role-based permission system that controls what each user can see and do. Administrators can create custom roles or assign permissions individually.

## User Types

Librarr supports three authentication methods:

| Type | Description |
|------|-------------|
| **Local** | Username, email, and password managed directly in Librarr |
| **Plex** | Authenticates via Plex PIN flow against plex.tv |
| **OIDC** | Authenticates via an external OpenID Connect provider (e.g., Authelia, Authentik, Keycloak) |

All user types share the same permission system once authenticated.

## Authentication

Each authentication method can be independently enabled or disabled in **Settings > Authentication**. See [Authentication Settings](../settings/02-authentication.md) for configuration details.

### Local Login

Local users sign in with their email and password. Login is rate-limited to **10 attempts per 15 minutes** per IP address and per email to prevent brute force attacks.

Local login can be disabled in Authentication Settings. When disabled, admins can still access the local login form by appending `?localAuth=true` to the login URL.

### Plex Login

Users sign in via the Plex PIN flow: Librarr creates a PIN on plex.tv, opens the Plex auth page in a popup, and polls for completion. Once authenticated, the user is matched by Plex ID or email.

Plex login is rate-limited to **20 attempts per 15 minutes**.

### OIDC Login

Users sign in via an external OpenID Connect provider using the Authorization Code flow with PKCE (S256). Multiple OIDC providers can be configured simultaneously. After authentication, the user is matched by OIDC subject+issuer or email.

For security, only emails marked as `email_verified` by the OIDC provider are used for account matching. OIDC endpoints are rate-limited to **20 attempts per 15 minutes**.

### Account Matching

When a user logs in via Plex or OIDC for the first time, Librarr tries to match them to an existing account:

1. **External ID match** — Plex ID or OIDC subject+issuer
2. **Email match** — case-insensitive email lookup. If found, the external identity is linked to the existing account
3. **Auto-create** — if no match is found and auto-create is enabled for that provider, a new account is created with the configured default permissions

### Password Reset

Users can request a password reset from the login page. A reset token is generated with a **1-hour expiry**. Password reset requests are rate-limited to **5 attempts per hour**. The "Forgot password" link only appears when SMTP email is configured.

For security, the reset endpoint always returns success regardless of whether the email exists, to prevent email enumeration.

### Sessions

Sessions last **30 days** and are stored in the database. Sessions are regenerated on login to prevent session fixation attacks.

## Permissions

Librarr uses a bit-flag permission system with 26 granular permissions grouped into categories.

### Request Permissions

| Permission                  | Description                                      |
|-----------------------------|--------------------------------------------------|
| Request Ebook               | Submit ebook requests                            |
| Request Audiobook           | Submit audiobook requests                        |
| Auto-Approve Ebook          | Ebook requests are automatically approved        |
| Auto-Approve Audiobook      | Audiobook requests are automatically approved    |
| Manage Ebook Requests       | Approve, decline, and manage ebook requests      |
| Manage Audiobook Requests   | Approve, decline, and manage audiobook requests  |
| View All Ebook Requests     | See all users' ebook requests, not just your own |
| View All Audiobook Requests | See all users' audiobook requests                |

### Music Permissions *(coming soon)*

| Permission              | Description                                 |
|-------------------------|---------------------------------------------|
| Request Music           | Submit music requests                       |
| Auto-Approve Music      | Music requests are automatically approved   |
| Manage Music Requests   | Approve, decline, and manage music requests |
| View All Music Requests | See all users' music requests               |

### Quota Permissions

| Permission            | Description                                          |
|-----------------------|------------------------------------------------------|
| Bypass Request Quota  | Ignores all quota limits — always unlimited requests |

### Issue Permissions

| Permission    | Description                        |
|---------------|------------------------------------|
| Create Issues | Report issues on media items       |
| View Issues   | See all issues, not just your own  |
| Manage Issues | Resolve, reopen, and delete issues |

### Settings Permissions

| Permission                   | Description                                           |
|------------------------------|-------------------------------------------------------|
| Manage Users                 | Create, edit, and delete user accounts                |
| Manage General Settings      | Edit application title, URL, and request type toggles |
| Manage Permissions Settings  | Create and edit roles                                 |
| Manage Readarr Settings      | Add and configure Readarr servers                     |
| Manage Lidarr Settings       | Add and configure Lidarr servers                      |
| Manage Media Server Settings | Add and configure Audiobookshelf, Jellyfin, and Plex  |
| Manage Notification Settings | Configure notification agents                         |
| Manage Jobs                  | View and manually run background jobs                 |
| Manage Metadata Settings     | Configure metadata providers and cache                |

### Admin Permission

The **Admin** permission grants full access to everything. It bypasses all other permission checks.

## Roles

Roles are preset permission combinations that can be applied to users.

### Built-in Roles

| Role        | Included Permissions                                                                                   |
|-------------|--------------------------------------------------------------------------------------------------------|
| **Admin**   | All permissions (full access)                                                                          |
| **Manager** | Manage Users, all Request/View/Manage Request permissions, all Issue permissions, Bypass Request Quota |
| **User**    | Request Ebook, Request Audiobook, Request Music, Create Issues, View Issues                            |

### Custom Roles

Administrators can create custom roles with any combination of permissions. One role can be set as the **default** — it will be automatically applied to newly created users.

Each role can also define **request quotas** — maximum number of ebook and audiobook requests allowed per 7-day sliding window. Leave empty for unlimited. See [Requesting > Request Quotas](04-requesting.md#request-quotas) for details.

### Permission Escalation Protection

- Managers cannot grant permissions they do not possess themselves
- Non-admin users cannot modify admin users
- The Admin bit is automatically stripped from default permissions to prevent accidental admin creation
- Users cannot delete their own account

## User Settings

Each user can configure personal settings from their profile page:

### General

- **Username** and **email**
- **Display language** — choose between English and French. This affects the UI language and localization of book metadata

### Password

Users can change their password (requires current password for verification).

### Notification Preferences

All notification types are enabled by default. Users can opt out of specific notification types for each available notification agent. The available notification types are filtered by the user's permissions — you won't see notification options for events you don't have permission to receive.

See [Notifications](07-notifications.md) for details.

