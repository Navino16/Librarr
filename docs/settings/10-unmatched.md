# Unmatched Items

Shows media items from your library servers (Audiobookshelf, Jellyfin, Plex) that could not be matched to a known work in Librarr's metadata providers.

Requires the **Manage Media Server Settings** permission.

## Why Items Appear Here

During library sync, Librarr attempts to match each item from your media servers to a work using ISBN, ASIN, or title+author search. Items that fail to match are logged here for review.

### Reasons

| Reason         | Description                                                    |
|----------------|----------------------------------------------------------------|
| **Unmatched**  | No matching work found in metadata providers                   |
| **Duplicate**  | Item matched to a work that already has availability from another source |

## Item Details

Each entry shows:

- **Title** and **authors**
- **Format** — ebook, audiobook, or both
- **Identifiers** — ISBN, ASIN (if available)
- **Library name** — which media server library the item belongs to
- **First seen** and **last attempted** dates

## Actions

- **Open in source** — link to the item in the original media server (if available)
- **Dismiss** — remove the item from the unmatched list. It will reappear if still unmatched on the next library sync

Stale items (no longer present in the media server) are automatically removed during the next availability sync.

## Pagination

Items are displayed 25 per page, sorted by most recently seen.
