# Lidarr

> **Coming Soon** — Lidarr integration for music downloads is planned for a future release. Server configuration is available in the setup wizard and settings, but music request processing is not yet functional.

Lidarr will serve as the download manager for music albums, similar to how Readarr handles books.

## Configuration

Access from **Settings > Lidarr**. Requires the **Manage Lidarr Settings** permission.

### Server Settings

| Field | Description |
|-------|-------------|
| **Name** | Display name for this server |
| **Hostname** | Lidarr server hostname or IP |
| **Port** | Default: 8686 |
| **API Key** | Found in Lidarr: Settings > General > API Key |
| **Use SSL** | Enable if Lidarr is served over HTTPS |
| **Base URL** | URL prefix if Lidarr is behind a reverse proxy (e.g., `/lidarr`) |
| **Default** | Mark as the default server |

### Profile Settings

After saving, Librarr fetches profiles from Lidarr:

- **Quality Profile**
- **Metadata Profile**
- **Root Folder**
- **Tags**

## Webhooks

> Lidarr webhook support will be available alongside music request processing.

## Test Connection

Use the **Test Connection** button to verify connectivity. Available during setup and in settings.
