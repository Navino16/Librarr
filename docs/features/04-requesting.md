# Requesting

Librarr lets users discover and request books (ebooks and audiobooks) from a shared media library. Requests are reviewed by administrators or managers, or optionally auto-approved based on user permissions.

## Requesting a Book

To make a request, navigate to a book's detail page (via search or discovery feeds) and click the **Request** button. A modal will appear with the following options:

### Format

Choose which format you want:

- **Ebook**
- **Audiobook**
- **Both** — submits two separate requests, one per format

Only formats that are not already available or requested will be shown. If a format is already available in your library or has a pending/approved request, it will be indicated below the selector.

If no digital edition is found for the selected format in the metadata providers, a warning banner will appear. You can still submit the request, but it may fail during processing if no suitable edition can be located.

### Language

Select your preferred language from the dropdown. It defaults to your display language. Librarr will try to find an edition in your requested language. If none is available, it falls back to English, then to any available edition.

## Request Workflow

Every request goes through a defined lifecycle:

| Status        | Description                                                                   |
|---------------|-------------------------------------------------------------------------------|
| **Pending**   | Request submitted, awaiting approval from a manager or admin                  |
| **Approved**  | Request approved and sent to Readarr for processing                           |
| **Declined**  | Request rejected. A reason is provided (see below)                            |
| **Completed** | The media is now available in your library                                    |
| **Failed**    | Processing encountered an error (e.g., no edition found, Readarr unreachable) |

### Auto-Approve

Users with the **Auto-Approve** permission for a given format will have their requests immediately approved and sent to Readarr without requiring manual intervention. This is configured per-user or per-role by an administrator.

### Decline Reasons

When a manager declines a request, they must provide a reason:

- **Not Available** — the content cannot be sourced
- **Duplicate** — a similar request already exists
- **Already In Library** — the item is already available
- **Not Appropriate** — the content does not meet library guidelines
- **Quality Not Met** — available editions do not meet quality standards
- **Other** — custom reason

The decline reason is visible to the requester on the requests page.

## Download Progress

Once a request is approved and picked up by Readarr, Librarr tracks download progress in real time:

- A **progress bar** with percentage is displayed on the request card
- **Download status** (downloading, imported, failed) is shown
- **Estimated time remaining** is displayed when available

Progress is updated every minute by the background download sync job. If a download stalls for more than 6 hours, the progress indicator is automatically cleared.

## Viewing Requests

The **Requests** page lists all requests with filter tabs:

- **All** / **Pending** / **Approved** / **Completed** / **Declined** / **Failed**

Each tab shows a count badge. Request cards display the cover image, format badge, status badge, language (if specified), title, and requester information.

Regular users only see their own requests. Users with the **View Requests** permission can see all requests for the corresponding format.

## Managing Requests

Users with **Manage Requests** permissions can perform the following actions:

- **Approve** — sends the request to Readarr. If multiple Readarr servers are configured for the requested format, a server selection modal appears
- **Decline** — opens a modal to select a decline reason
- **Complete** — manually mark an approved or failed request as completed
- **Delete** — remove a request (only available for terminal statuses: completed, declined, failed)

## Request Quotas

Administrators can set per-format request quotas to limit how many requests a user can make within a **7-day sliding window**. Quotas are configured separately for each format:

- **Ebook quota** — limits ebook requests per week
- **Audiobook quota** — limits audiobook requests per week
- **Music quota** — *(coming soon)*

### Quota Resolution

When a user makes a request, the effective quota is resolved in this order:

1. **User-specific override** — set by an admin on the user's settings page
2. **Role default** — configured on the role assigned to the user
3. **Unlimited** — if neither is set, there is no quota

### Bypass

Users with the **Admin** permission or the **Bypass Request Quota** permission always have unlimited requests regardless of quota settings.

### Enforcement

When a quota is reached:

- The **Request** button is disabled with a "Quota Exceeded" label
- The request modal shows a warning indicating usage vs. limit per format
- The API returns **429 Too Many Requests** if a request is attempted

### Profile Display

Each user's profile page shows their current quota usage per format (ebook and audiobook) with a progress bar, as well as their total all-time request count.

## Music Requests

> **Coming Soon** — Music request support through Lidarr integration is planned for a future release.
