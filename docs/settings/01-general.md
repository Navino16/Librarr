# General Settings

The General Settings page configures core application behavior. Access it from **Settings > General**. Requires the **Manage General Settings** permission.

## Application

### Application Title

Customize the name displayed in the navigation header and browser tab. Defaults to "Librarr". Must be between 1 and 255 characters.

### Application URL

The external URL where Librarr is accessible (e.g., `https://librarr.example.com`). Used for:

- Generating links in notification emails
- Auto-registering webhooks on Readarr servers

Leave empty if not using a reverse proxy or external access.

## Book Metadata Server

### Hardcover API Token

The API token for [Hardcover](https://hardcover.app), Librarr's primary book metadata source. Get your token from [hardcover.app/account/api](https://hardcover.app/account/api).

The token is write-only — the settings page shows whether a token is configured but never displays the actual value.

Without a Hardcover token, book search and discovery features will fall back to OpenLibrary and Google Books only.

## Request Types

Toggle which media types users can request:

- **Enable Ebook Requests** — allow users to request ebooks (default: enabled)
- **Enable Audiobook Requests** — allow users to request audiobooks (default: enabled)
- **Enable Music Requests** — *(coming soon)*

Disabling a request type hides it from the request modal, discovery feeds, and removes related permissions from the UI. Existing requests are not affected.

## Options

### Hide available media from discover

When enabled, books that are already available in your library are hidden from search results. Useful to keep the focus on content that can still be requested.

> **Note:** Despite the setting label mentioning "discover", this filter currently only applies to search results. Discovery feeds are not filtered.

> **Note:** Authentication methods (Local, Plex, OIDC) are configured in [Authentication Settings](02-authentication.md).
