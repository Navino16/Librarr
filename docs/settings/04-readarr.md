# Readarr

Readarr is the download manager for books. Librarr uses Readarr to search for and download ebook and audiobook files. You can configure multiple Readarr servers — for example, one for ebooks and one for audiobooks.

Readarr is **not** a source of library availability. It only handles downloads. Once a book is downloaded, your media server (Audiobookshelf) detects the new file, and Librarr's availability sync marks it as available.

## Configuration

Access from **Settings > Readarr**. Requires the **Manage Readarr Settings** permission.

### Server Settings

| Field            | Description                                                                      |
|------------------|----------------------------------------------------------------------------------|
| **Name**         | Display name for this server                                                     |
| **Hostname**     | Readarr server hostname or IP                                                    |
| **Port**         | Default: 8787                                                                    |
| **API Key**      | Found in Readarr: Settings > General > API Key                                   |
| **Use SSL**      | Enable if Readarr is served over HTTPS                                           |
| **Base URL**     | URL prefix if Readarr is behind a reverse proxy (e.g., `/readarr`)               |
| **Content Type** | **Ebook** or **Audiobook** — determines which requests are routed to this server. Only one server per content type is allowed |

## Test Connection

Use the **Test Connection** button to verify that Librarr can reach Readarr with the provided credentials. This is also available during the initial setup wizard.
