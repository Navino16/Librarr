FROM node:24-alpine AS base

# Install build dependencies for native modules (bcrypt, better-sqlite3)
FROM base AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json* ./
RUN npm ci

# Build the application
FROM base AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Install production dependencies only (with native build tools)
FROM base AS prod-deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Production image
FROM base AS runner
WORKDIR /app

LABEL org.opencontainers.image.source="https://github.com/Navino16/Librarr"
LABEL org.opencontainers.image.description="A media request management system for books and music"
LABEL org.opencontainers.image.licenses="GPL-3.0"

ENV NODE_ENV=production
ENV PORT=5055
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 librarr
RUN apk add --no-cache su-exec

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/.next/standalone ./.next/standalone
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js
COPY docker/entrypoint.sh /entrypoint.sh

EXPOSE 5055

VOLUME /app/config

ENTRYPOINT ["/entrypoint.sh"]
