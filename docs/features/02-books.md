# Books

Librarr provides rich book metadata sourced from multiple providers. Each book has a detail page with comprehensive information, editions, series context, and related content.

## Book Detail Page

Navigate to a book's detail page by clicking on it from search results, discovery feeds, or the requests page. The detail page includes:

- **Title and original title**
- **Cover image** (localized when available)
- **Description / synopsis**
- **Authors** — linked to author profile pages, with role information (author, narrator, etc.)
- **Published date**
- **Page count**
- **Average rating** and ratings count
- **Genres**
- **Format Status** — per-format section showing availability, request status, and request buttons for ebook and audiobook
- **Report an Issue** button with open issue count
- **Hardcover link** — external link to the book on Hardcover

If a book's metadata is incomplete (missing description or cover), Librarr will automatically attempt to enrich it from other metadata providers in the background.

## Editions

Each book can have multiple editions across formats and languages. Editions are not displayed on the book detail page but are used internally:

- Fetched from metadata providers during request processing
- Stored locally with ISBN-13, ISBN-10, ASIN, format, language, and source provider
- Used to find the best match when sending a request to Readarr

## Books in this Series

If a book belongs to a series, the "Books in this Series" section shows all books in the series with their position number (e.g., #1, #2). Series positions support fractional values (e.g., 1.5 for novellas between main entries). Each book in the series is linked to its detail page and enriched with local availability data.

A **Request Series** button allows requesting all unrequested books in the series at once.

## More from this Author

The book detail page shows up to 10 other books by the same author, excluding the current book. This helps users discover an author's other works.

## Authors

Each author has a dedicated profile page accessible from book detail pages. The author page displays:

- **Name**
- **Photo**
- **Biography**
- **Source link** (e.g., to Hardcover)
- **Full book catalog** — paginated list of all books by this author, enriched with local status and availability data

Author metadata is sourced primarily from Hardcover, with fallback enrichment from other providers.

## Metadata Sources

Book metadata comes from multiple providers, configured in priority order in [Metadata Settings](../settings/06-metadata.md):

| Provider         | Role                                                                           |
|------------------|--------------------------------------------------------------------------------|
| **Hardcover**    | Primary source — work search, details, authors, series, trending, localization |
| **OpenLibrary**  | Fallback — search, editions (especially for open-access data), descriptions    |
| **Google Books** | Fallback — ISBN lookup, descriptions, covers                                   |

The metadata resolver tries providers in priority order and enriches missing fields across providers. For example, a work found via Hardcover may have its description supplemented from OpenLibrary if Hardcover's description is empty.

## Availability

Book availability is determined by your connected media servers:

| Source             | Detected formats                                                          |
|--------------------|---------------------------------------------------------------------------|
| **Audiobookshelf** | Ebook (if eBookFile present), Audiobook (if audio files present), or both |

Availability is checked every 15 minutes by the background availability sync job, and immediately via webhooks when Readarr reports a download completion.
