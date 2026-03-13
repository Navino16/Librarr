# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Dev server with hot-reload (nodemon + ts-node)
npm run build            # Build server (tsc) + Next.js
npm run build:server     # TypeScript compilation only
npm run build:next       # Next.js build only
npm start                # Production: node dist/server/index.js
npm run lint             # ESLint
npm run typecheck        # TypeScript type-check (no emit)
npm run migration:generate  # TypeORM migration generation
npm run migration:run       # Run pending migrations
npm test                    # Vitest run (unit/integration)
npm run test:watch          # Vitest watch mode
npm run test:coverage       # Vitest with coverage
npm run test:e2e            # Playwright E2E tests
npm run test:e2e:ui         # Playwright UI mode

# Docker
docker-compose -f docker-compose.dev.yml up   # Dev (hot-reload, DB_SYNCHRONIZE=true)
docker-compose up -d                           # Production
```

## Architecture

Full-stack TypeScript app: **Express 5 backend** (port 5055) + **Next.js 16 / React 19 frontend**.

### Backend (`server/`)

- **Entry**: `server/index.ts` — Express setup, TypeORM init, Next.js prepare, job scheduler start
- **Database**: SQLite (`config/db/librarr.db`) via TypeORM with `better-sqlite3`. WAL mode enabled. `synchronize: true` in dev only
- **Settings**: Singleton loaded from `config/settings.json` — contains all service configurations (Readarr, Lidarr, Jellyfin, Plex, Audiobookshelf, notifications, auth providers)
- **Auth**: Session-based (`express-session` + `connect-typeorm`), bcrypt hashing, 30-day TTL. Rate-limited login/reset endpoints. Supports local (email/password), Plex (PIN-based), and OIDC (authorization code + PKCE) authentication
- **Permissions**: Bit-flag system in `server/lib/permissions.ts`. Roles: Admin (full), Manager, User. Per-route middleware checks. Includes BYPASS_QUOTA permission
- **Quotas**: Per-format request quotas in `server/lib/quota.ts`. Separate limits for ebook, audiobook, and music. 7-day sliding window. Resolution: user override > role default > unlimited. Admin/BYPASS_QUOTA = always unlimited
- **Logging**: Winston with daily rotating files in `config/logs/`

### Entities (`server/entity/`)

| Entity | Key fields |
|--------|-----------|
| `User` | email, username, password (bcrypt), permissions (bit-flags), userType (LOCAL/PLEX/OIDC), plexId, plexToken, jellyfinUserId, jellyfinToken, oidcSub, oidcIssuer, avatar, resetPasswordGuid, resetPasswordExpiry, ebookQuotaLimit, audiobookQuotaLimit, musicQuotaLimit |
| `UserSettings` | User preferences, notification tokens (pushbullet, pushover, discordId, telegramChatId) |
| `Session` | express-session storage via connect-typeorm |
| `Work` | hardcoverId (unique), title, description, coverUrl, publishedDate, pageCount, averageRating, genresJson, status, ebookAvailable/audiobookAvailable flags |
| `Edition` | isbn13, isbn10, asin, title, format (ebook/audiobook), source (hardcover/openlibrary/googlebooks), linked to Work |
| `WorkAvailability` | Links Work to media server source (audiobookshelf), format, sourceItemId |
| `WorkAuthor` | Join table Work ↔ Author |
| `Author` | hardcoverId, name, bio, photoUrl, sourceUrl |
| `Series` | Work series grouping |
| `BookRequest` | Links User → Work. Format (ebook/audiobook), status, readarrServerId, download progress tracking |
| `MusicAlbum` | musicBrainzId, spotifyId, title, artistName, coverUrl, albumType, status, available flag |
| `MusicRequest` | Links User → MusicAlbum. Status, lidarrServerId, download progress tracking |
| `UnmatchedMediaItem` | Media items from servers that couldn't be matched to a Work |
| `Issue` / `IssueComment` | Bug reporting on media |

### API Routes (`server/routes/` → `/api/v1/*`)

| Route prefix | File | Description |
|-------------|------|-------------|
| `/auth` | `auth.ts` | Login (local/Plex/OIDC), logout, session (`/me`), password reset |
| `/settings` | `settings/index.ts` | App initialization, public/admin settings, job management, auth provider config (Plex auth, OIDC providers CRUD) |
| `/user` | `user/index.ts` | CRUD users, user settings, password change, quota usage |
| `/request` | `request.ts` | CRUD requests, approve/decline actions, quota enforcement (429) |
| `/search` | `search.ts` | Unified search |
| `/book` | `book.ts` | Book detail, editions, similar, series |
| `/music` | `music.ts` | Album detail, tracks |
| `/author` | `author.ts` | Author detail, author's books |
| `/artist` | `artist.ts` | Artist detail, artist's albums |
| `/discover` | `discover.ts` | Discovery feeds (books, music, recent) |
| `/ping` | `index.ts` | Lightweight healthcheck (no auth) |
| `/service` | `service.ts` | Metadata provider health, Readarr/Lidarr profiles |
| `/issue` | `issue.ts` | Issue CRUD |
| `/issue-comment` | `issueComment.ts` | Issue comment CRUD |
| `/cache` | `cache.ts` | Cache inspection and clearing |
| `/webhook` | `webhook.ts` | Webhooks for Readarr, Lidarr, Jellyfin, Plex, Audiobookshelf |
| `/imageproxy` | `server/lib/imageproxy.ts` | Image proxy for media covers |

### Background Jobs (`server/job/schedule.ts`)

| Schedule | Job |
|----------|-----|
| Every 1 min | `downloadSync` — track Readarr/Lidarr download progress |
| Every 15 min | `availabilitySync` — check Audiobookshelf for new ebook/audiobook content |
| 1:00 AM | `downloadSyncReset` — reset stale tracking |
| 3:00 AM | `arrLibraryScan` — sync Readarr library |
| 3:30 AM | Lidarr library scan |
| 4:00 AM | `mediaServerSync` — full rescan of Audiobookshelf (Jellyfin/Plex planned for music) |
| 6:00 AM | `imageCacheCleanup` — clean up cached images |

### External APIs (`server/api/`)

- `ExternalApi` base class with axios retry logic (2 retries, handles 5xx/429/timeouts)
- **Servarr** (`servarr/`): `base.ts`, `readarr.ts`, `lidarr.ts` — download management (add books/albums, get queue/profiles)
- **Audiobookshelf** (`audiobookshelf.ts` + `audiobookshelf/`): library scanning, audiobook/ebook detection (sole source of book availability)
- **Jellyfin** (`jellyfin/`): music library scanning (planned)
- **Plex** (`plexapi.ts`): music library scanning (planned), authentication provider
- **Metadata** (`metadata/`): Provider-based architecture — `MetadataResolver` orchestrates `HardcoverProvider` (primary), `GoogleBooksProvider`, `OpenLibraryProvider`. Includes `formatClassifier.ts` and per-provider caches
- **BookInfo** (`bookinfo/`): Hardcover API (primary metadata source), Google Books (ISBN lookup)
- **MusicBrainz** (`musicbrainz/`): album metadata

### Frontend (`src/`)

- **Pages**: `src/pages/` — Next.js pages router. Key pages: index (home), book/[bookId], music/[albumId], author/[authorId], artist/[artistId], requests, issues/[issueId], search, settings/* (general, auth, readarr, lidarr, media-server, metadata, notifications, jobs, users, unmatched), users/[userId], setup, login (forgot-password, reset-password/[guid]), 404
- **Components**: `src/components/` — Layout (Header/Sidebar/SearchInput/UserDropdown/ServiceStatusBanner), MediaCard, MediaSlider, RequestButton, RequestModal, IssueModal, StatusBadge, DownloadProgress, ErrorBoundary, Modal, CoverImage, LoadingSpinner, Setup wizard (7 steps), Settings
- **Contexts**: UserContext, SettingsContext, LocaleContext, ToastContext
- **Hooks**: `useApi` (SWR-based), `useDiscover`, `usePermission`
- **i18n**: `next-intl` with messages in `src/messages/{locale}.json` (en, fr)
- **Styling**: Tailwind CSS 4
- **API proxy**: Next.js rewrites `/api/v1/*` → `http://localhost:5055/api/v1/*`

## Key Architectural Principles

- **Audiobookshelf = sole library source** for ebooks/audiobooks. Jellyfin/Plex are for music only (planned)
- **Readarr = download manager ONLY** — triggers downloads, never a source of availability. Flow: Readarr downloads → file on disk → Audiobookshelf detects → availabilitySync updates status
- **Hardcover = primary metadata source** for books. Google Books and OpenLibrary used as fallbacks
- **Metadata provider architecture** — `MetadataResolver` tries providers in priority order, enriches missing fields (description, cover, rating) across providers

## TypeScript Config

- Target: ES2020, strict mode, decorators enabled (TypeORM)
- Path aliases: `@server/*` → `server/*`, `@/*` → `src/*`
- Server has its own tsconfig at `server/tsconfig.json`

## Code Style

- All code, comments, and commits in English
- ESLint: unused vars warning (allow `_` prefix), `@typescript-eslint/no-explicit-any` warning
- Next.js image domains whitelisted in `next.config.js` (openlibrary, google books, hardcover, spotify, etc.)

## Environment Variables

```
SESSION_SECRET=      # Required
NODE_ENV=production  # development | production
PORT=5055
LOG_LEVEL=info       # error | warn | info | debug
DB_SYNCHRONIZE=false # true only in dev
FORCE_HTTPS=false    # Mark session cookie as secure (requires HTTPS)
```
