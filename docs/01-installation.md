# Installation

## Docker (recommended)

### Requirements

- Docker and Docker Compose

### 1. Create a `docker-compose.yml`

```yaml
services:
  librarr:
    image: ghcr.io/your-org/librarr:latest  # or build from source
    container_name: librarr
    restart: unless-stopped
    ports:
      - '5055:5055'
    volumes:
      - ./config:/app/config
    environment:
      - SESSION_SECRET=your-strong-random-secret
      - LOG_LEVEL=info
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:5055/api/v1/ping']
      interval: 30s
      timeout: 10s
      retries: 3
```

### 2. Generate a session secret

```bash
openssl rand -hex 32
```

Replace `your-strong-random-secret` with the generated value.

### 3. Start the container

```bash
docker compose up -d
```

### 4. Open the setup wizard

Navigate to [http://localhost:5055](http://localhost:5055). On first launch, you will be guided through a 7-step setup wizard:

1. **Admin account** — create the initial admin user
2. **Request types** — enable/disable ebooks, audiobooks, music
3. **Hardcover API** — configure the primary book metadata source
4. **Media servers** — add Audiobookshelf, Jellyfin, or Plex
5. **Readarr** — add book download servers
6. **Lidarr** — add music download servers *(coming soon)*
7. **Confirm** — review and complete

Every step except the admin account is optional and can be configured later in Settings.

### Data persistence

All persistent data is stored in the `/app/config` volume:

```
config/
  db/librarr.db      # SQLite database
  settings.json       # Application settings
  logs/               # Log files (daily rotation)
```

---

## Build from source

### Requirements

- Docker and Docker Compose

### 1. Clone the repository

```bash
git clone https://github.com/your-org/librarr.git
cd librarr
```

### 2. Build and run

```bash
docker compose up -d --build
```

The Dockerfile uses a multi-stage build (Node 24 Alpine) that produces a minimal production image.

---

## Manual installation (without Docker)

### Requirements

- Node.js 24+
- npm

### 1. Clone and install

```bash
git clone https://github.com/your-org/librarr.git
cd librarr
npm install
```

### 2. Build

```bash
npm run build
```

This compiles the TypeScript backend and builds the Next.js frontend.

### 3. Configure environment

```bash
export SESSION_SECRET=$(openssl rand -hex 32)
export NODE_ENV=production
export PORT=5055
export LOG_LEVEL=info
```

### 4. Start

```bash
npm start
```

The application will create `config/db/librarr.db` and `config/settings.json` on first run.

---

## Environment variables

| Variable         | Required | Default      | Description                                                         |
|------------------|----------|--------------|---------------------------------------------------------------------|
| `SESSION_SECRET` | Yes      | —            | Secret for session encryption. Generate with `openssl rand -hex 32` |
| `NODE_ENV`       | No       | `production` | `production` or `development`                                       |
| `PORT`           | No       | `5055`       | HTTP port                                                           |
| `LOG_LEVEL`      | No       | `info`       | `error`, `warn`, `info`, or `debug`                                 |
| `DB_SYNCHRONIZE` | No       | `false`      | Auto-sync database schema. **Only use in development**              |
| `FORCE_HTTPS`    | No       | `false`      | Mark session cookie as secure. **Recommended in production behind HTTPS** |

---

## Reverse proxy

Librarr runs on port 5055 by default. Example nginx configuration:

```nginx
server {
    listen 443 ssl;
    server_name librarr.example.com;

    location / {
        proxy_pass http://127.0.0.1:5055;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

When using a reverse proxy with HTTPS, set the `FORCE_HTTPS=true` environment variable to ensure cookies are marked as secure.

---

For development setup, see [Development](03-development.md).
