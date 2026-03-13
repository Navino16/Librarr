# Jobs & Cache

Librarr runs several background jobs on a schedule to keep your library data in sync. Access the jobs page from **Settings > Jobs & Cache**. Requires the **Manage Jobs** permission.

## Job List

| Job | Schedule | Description |
|-----|----------|-------------|
| **Download Sync** | Every minute | Polls Readarr queues for all approved requests. Updates download progress, status, and estimated time remaining on each request |
| **Availability Sync** | Every 15 minutes | Scans Audiobookshelf libraries for new and removed items. Creates/updates works, editions, and availability records. Marks approved requests as completed when media appears. Removes stale availability. Tracks unmatched items |
| **Download Sync Reset** | 1:00 AM daily | Clears download progress data on approved requests that haven't been updated in over 6 hours. Prevents stale progress bars from appearing in the UI |
| **Readarr Library Scan** | 3:00 AM daily | Syncs all books from Readarr into Librarr's database. Creates auto-requests for monitored books that don't have existing requests |
| **Lidarr Library Scan** | 3:30 AM daily | Syncs all albums from Lidarr into Librarr's database *(coming soon)* |
| **Media Server Full Sync** | 4:00 AM daily | Full rescan of all connected media servers (Audiobookshelf, Jellyfin, Plex) |
| **Image Cache Cleanup** | 6:00 AM daily | Clears the image proxy cache |

## Job Details

Each job card displays:

- **Job name** with a running indicator (spinning icon when active)
- **Schedule** in cron format
- **Next run** — the next scheduled execution time

## Running Jobs Manually

Click the **Run Now** button (play icon) on any job to trigger it immediately. The button is disabled while a job is already running.

Jobs have built-in concurrency protection — if a job is already running when its next scheduled run arrives, the scheduled run is skipped.

## Auto-Requests

The Readarr Library Scan job creates **auto-requests** for books that are monitored in Readarr but don't have corresponding requests in Librarr. These are attributed to the first admin user and marked as `isAutoRequest`. This prevents duplicate download requests for books already being tracked by Readarr.
