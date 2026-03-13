# Getting Started

After installing Librarr (see [Installation](01-installation.md)), open it in your browser at `http://localhost:5055`. On first launch, you will be guided through a setup wizard.

## Setup Wizard

The wizard walks you through the initial configuration in 7 steps. Every step except the first is optional and can be configured later in Settings.

### Step 1 — Admin Account

Create the initial administrator account:

- **Username** — your display name
- **Email** — used for login and email notifications
- **Password** — minimum 8 characters

This account has full admin permissions and cannot be deleted.

### Step 2 — Request Types

Choose which media types to enable:

- **Ebook Requests** — enabled by default
- **Audiobook Requests** — enabled by default
- **Music Requests** — *(coming soon)*

This controls which setup steps appear next and which request options are available to users. Can be changed later in General Settings.

### Step 3 — Hardcover

Enter your [Hardcover](https://hardcover.app) API token. Hardcover is the primary book metadata source — it provides search, book details, author info, series, and trending feeds.

Get your token at [hardcover.app/account/api](https://hardcover.app/account/api).

This step is optional but strongly recommended. Without it, book metadata will be limited to OpenLibrary and Google Books.

### Step 4 — Media Servers

Configure your media server(s). Supported types:

- **Audiobookshelf** — recommended for ebook and audiobook libraries
- **Jellyfin** — media server and authentication provider
- **Plex** — media server and authentication provider

You can add one server of each type. Each has a **Test Connection** button to verify the configuration before proceeding.

### Step 5 — Readarr

*Only shown if ebook or audiobook requests are enabled.*

Configure one or more Readarr servers for book downloads. Each server needs:

- Server connection details (hostname, port, API key)
- **Content type** — ebook or audiobook (determines which requests are routed here)
- **Default** flag — one default per content type

### Step 6 — Lidarr

*Only shown if music requests are enabled.*

Configure Lidarr server(s) for music downloads. *(Coming soon — configuration is available but processing is not yet functional.)*

### Step 7 — Confirm

Review your configuration summary and click **Finalize** to complete the setup. Librarr will save all settings and redirect you to the home page.

## After Setup

Once setup is complete:

1. **Explore** — the home page shows discovery feeds with trending books
2. **Search** — use the search bar to find specific books by title, author, or ISBN
3. **Request** — click on a book and use the Request button to submit a request
4. **Invite users** — create additional user accounts in Settings > Users, or enable external login (Plex, OIDC) in Settings > Authentication

Background jobs will start running automatically:
- Availability sync scans your media servers every 15 minutes
- Readarr library scan runs daily at 3:00 AM
- Download progress is tracked every minute for active requests
