# Metadata

Librarr uses multiple metadata providers to source book information. You can configure which providers are active and their priority order for different types of data.

Access from **Settings > Metadata**. Requires the **Manage Metadata Settings** permission.

## Providers

### Hardcover

The primary metadata source. Provides the richest data including work search, detailed book info, author profiles, series, trending books, and localized titles/covers.

Requires an API token configured in [General Settings](01-general.md).

- Cache TTL: 1 hour
- Cache capacity: 5,000 entries

### OpenLibrary

An open-data source useful for editions (especially ISBN data), descriptions, and search. No API key required.

- Cache TTL: 1 hour
- Cache capacity: 1,000 entries

### Google Books

Used primarily for ISBN lookups, descriptions, and cover images. No API key required.

- Cache TTL: 24 hours
- Cache capacity: 500 entries

## Priority Configuration

You can set the order in which providers are queried for each type of data. The resolver tries providers in order and stops at the first successful result, then enriches missing fields from lower-priority providers.

| Priority | Description |
|----------|-------------|
| **Search** | Order for book search queries |
| **Description** | Order for fetching book descriptions |
| **Cover** | Order for fetching cover images |
| **Editions** | Order for fetching edition data (ISBNs, formats, languages) |
| **Ratings** | Order for fetching ratings and review counts |

Use the up/down arrows to reorder providers within each priority list. Only enabled providers appear in the priority lists.

At least one provider must remain enabled at all times.

## Cache Management

The cache management section shows all active caches with statistics:

| Column | Description |
|--------|-------------|
| **Name** | Cache identifier |
| **Items** | Current number of cached entries |
| **Max** | Maximum capacity |
| **Hit Rate** | Percentage of cache hits vs misses |
| **TTL** | Time-to-live for entries |

Actions:
- **Flush** — clear an individual cache
- **Flush All** — clear all caches at once

Caches are also automatically flushed when metadata provider settings are changed. The image cache is cleaned daily at 6:00 AM.

## Reset to Defaults

Click **Reset to Defaults** to restore the default provider configuration and priority order. This also flushes all caches.
