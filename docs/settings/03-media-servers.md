# Media Servers

Media servers are the source of library availability in Librarr. Audiobookshelf handles ebook and audiobook availability, while Jellyfin and Plex are planned for music library scanning. Librarr supports three media server types.

## Audiobookshelf

[Audiobookshelf](https://www.audiobookshelf.org/) is the primary and recommended media server for books. It provides both ebook and audiobook detection.

### Configuration

| Field        | Description                                                       |
|--------------|-------------------------------------------------------------------|
| **Hostname** | Audiobookshelf server hostname or IP                              |
| **Port**     | Default: 13378                                                    |
| **API Key**  | Found in Audiobookshelf: Settings > Users > your user > API Token |
| **Use SSL**  | Enable if served over HTTPS                                       |
| **Base URL** | URL prefix if behind a reverse proxy                              |

### Format Detection

Audiobookshelf items are scanned and classified by format:

- **Audiobook** — item contains audio files
- **Ebook** — item contains an ebook file (epub, pdf, etc.)
- **Both** — item contains both audio and ebook files

### Matching Strategy

When scanning Audiobookshelf, Librarr attempts to match each item to a known book (Work) using the following strategy, in order:

1. **ISBN exact match** — looks up the ISBN in the local Edition table
2. **ASIN exact match** — looks up the ASIN in the local Edition table
3. **ISBN search** — searches Hardcover by ISBN (trusted match, no validation needed)
4. **Title + author search** — searches Hardcover by title and author, then validates with title similarity check

Items that cannot be matched are tracked in [Unmatched Items](10-unmatched.md).

### Library Scanning

Only book-type libraries are processed. Audiobookshelf libraries containing podcasts or other media types are ignored.

## Jellyfin

[Jellyfin](https://jellyfin.org/) can be used as a media server for library scanning.

### Configuration

| Field        | Description                             |
|--------------|-----------------------------------------|
| **Hostname** | Jellyfin server hostname or IP          |
| **Port**     | Default: 8096                           |
| **Use SSL**  | Enable if served over HTTPS             |
| **Base URL** | URL prefix if behind a reverse proxy    |
| **API Key**  | Found in Jellyfin: Dashboard > API Keys |

> Jellyfin integration is planned for music library scanning in a future release. No functionality is available yet.

## Plex

[Plex](https://www.plex.tv/) can be used as both a media server and an authentication provider.

### Configuration

| Field          | Description                    |
|----------------|--------------------------------|
| **Hostname**   | Plex server hostname or IP     |
| **Port**       | Default: 32400                 |
| **Use SSL**    | Enable if served over HTTPS    |
| **Plex Token** | Your Plex authentication token |

### Authentication

Plex users can be imported into Librarr and will authenticate against Plex. Imported users share the same permission system as local users.

### Library Scanning

> Music library scanning from Plex is planned for a future release.

## Sync Schedule

| Job                    | Schedule         | Description                                                      |
|------------------------|------------------|------------------------------------------------------------------|
| Availability Sync      | Every 15 minutes | Scans Audiobookshelf for new/removed items, updates availability |
| Media Server Full Sync | 4:00 AM daily    | Complete rescan of all media servers                             |
