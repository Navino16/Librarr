# Development

## Setup

For development with hot-reload:

```bash
npm install
npm run dev
```

Or using the dev Docker Compose (includes Audiobookshelf, Readarr, Mailpit, and Authelia for OIDC testing):

```bash
docker compose -f docker-compose.dev.yml up
```

## Useful commands

```bash
npm run lint             # ESLint
npm run typecheck        # TypeScript type-check
npm run test             # Unit tests (Vitest)
npm run test:e2e         # E2E tests (Playwright)
npm run test:coverage    # Unit tests with coverage
```

## Dev services

The dev Docker Compose stack includes:

| Service              | Purpose                          |
|----------------------|----------------------------------|
| **Audiobookshelf**   | Local library source             |
| **Readarr**          | Local download manager           |
| **Mailpit**          | Email testing (catches all SMTP) |
| **Authelia**         | Local OIDC provider              |

### Authelia (OIDC testing)

[Authelia](https://www.authelia.com/) is preconfigured as a local OIDC provider:

- **Test user**: `authelia` / `password` (email: authelia@example.com)
- **OIDC client**: ID `librarr`, secret `librarr-dev-secret`
- **Callback URL**: `http://localhost:5055/api/v1/auth/oidc/authelia/callback`

## Environment variables

| Variable         | Dev value     | Description                              |
|------------------|---------------|------------------------------------------|
| `DB_SYNCHRONIZE` | `true`        | Auto-sync database schema (dev only)     |
| `NODE_ENV`       | `development` | Enables dev features and verbose logging |
