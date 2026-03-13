# Discovery & Search

Librarr provides multiple ways to find and explore content: curated discovery feeds on the home page and a powerful multi-source search.

## Discovery Feeds

The home page displays discovery feeds to help users find new content. Feeds are personalized based on your display language — titles and covers are localized when available.

### Trending Books

Shows popular and trending books from Hardcover. This feed is only available when a Hardcover API token is configured and at least one book request type (ebook or audiobook) is enabled.

Results are paginated (20 per page) and scrollable as a horizontal carousel.

### Recent Requests

Displays up to 50 recently requested books, grouped by work. This gives users visibility into what others are requesting.

For privacy, the requester's identity is only shown to users with the **View Requests** permission.

### Recently Added

Shows books that have recently become available in your connected media servers (Audiobookshelf).

### Trending Music

> **Coming Soon** — Music discovery feeds will be available in a future release.

## Search

Access search from the search bar in the navigation header. Search supports queries between 1 and 500 characters.

### Search Types

Use the type filter to narrow your search:

- **All** — searches both books and music
- **Books** — searches book metadata providers only
- **Music** — searches music metadata only *(coming soon, tab hidden until enabled)*

### ISBN Detection

If your search query consists entirely of 10 or 13 digits (hyphens and spaces are ignored), Librarr automatically treats it as an ISBN search. A visual hint confirms that an ISBN was detected. ISBN searches are routed directly to metadata providers for exact matching.

### Search Results

Book results come from your configured metadata providers (Hardcover, OpenLibrary, Google Books) in priority order. Each result is enriched with local data — you can immediately see if a book is already available, pending, or has been requested.

Results are paginated and show the total number of matches.

### Music Search

> **Coming Soon** — Music search via MusicBrainz will be available in a future release.

## Hide Available

Administrators can enable the **Hide available media from discover** setting in General Settings. When active, books that are already available in your library are hidden from search results. This keeps the focus on content that can still be requested.

> **Note:** Despite the setting label mentioning "discover", this filter currently only applies to search results. Discovery feeds are not filtered.
