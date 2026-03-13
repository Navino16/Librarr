# E2E Test Gaps & Skipped Areas

## Areas NOT covered

### Real External Service Integration
- **Real Readarr/Lidarr API calls** on approval — Settings pages are tested with mocked APIs, but actual download triggering is not tested.
- **Real media server scanning** — Jellyfin/Plex/Audiobookshelf connection forms are tested with mocked test-connection endpoints, but actual library scanning is not.
- **Real notifications** — Notification agent configuration pages beyond the hub are not tested (per-agent config forms like Discord webhook URL, Telegram bot token, etc.).
- **Real download tracking** — Partially tested via progress bars in requests-management (45%) and music-detail (67%), but actual Readarr/Lidarr queue polling is not simulated.

### Webhook Endpoints
- `/api/v1/webhook/*` — Server-to-server webhooks from Readarr/Lidarr/Jellyfin/Plex/Audiobookshelf are backend-only and not E2E testable via browser.

### Pagination
- Pagination UI exists on requests, users, issues, and unmatched items pages.
- Not deeply tested because creating 20+ items in test setup is heavy. The pagination rendering logic is covered by the mock data structures.

### i18n / Locale Switching
- All tests run in English locale.
- Switching to French locale and verifying translations is not tested.

### Mobile / Responsive Layout
- Sidebar collapse, mobile-specific layouts, and responsive breakpoints are not tested.
- All tests run in default Desktop Chrome viewport.

### Error Handling
- Network error scenarios (API failures, timeouts) are not systematically tested.
- Rate limiting behavior on login is not tested.

### Notification Agent Configuration
- The notification hub page is tested (all agents visible, configure buttons).
- Per-agent configuration forms (Discord webhook URL, email SMTP settings, etc.) are not tested.

## Notes

- Tests use `page.route()` to mock API responses for isolation from external services.
- Tests that interact with the real backend (user creation, settings changes) may leave side effects. The `users-management.spec.ts` test creates and deletes users against the real test DB.
- The `settings.spec.ts` general settings test modifies the app title against the real backend.
- Settings pages for Readarr, Lidarr, Media Server, Jobs, Metadata, Unmatched Items, and Roles are fully tested with mocked API responses.
