# syntax=docker/dockerfile:1

ARG NODE_VERSION=24
ARG PNPM_VERSION=12.3.4

# ── 1. сборка фронта и бандла API ───────────────────────────────
FROM node:${NODE_VERSION}-slim AS build
ARG PNPM_VERSION
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm@${PNPM_VERSION}
WORKDIR /app

# сначала только манифесты — слой с зависимостями кешируется
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages packages
COPY apps apps
RUN pnpm --filter @taskterm/web build && pnpm --filter @taskterm/api build

# ── 2. нативный модуль better-sqlite3 (единственная внешняя зависимость бандла) ──
FROM node:${NODE_VERSION}-slim AS native
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /native
COPY --from=build /app/apps/api/package.json /tmp/api-package.json
RUN SQLITE_VERSION=$(node -p "require('/tmp/api-package.json').dependencies['better-sqlite3'].replace(/^[^0-9]*/, '')") \
    && npm install --no-audit --no-fund --omit=dev better-sqlite3@${SQLITE_VERSION}

# ── 3. рантайм ──────────────────────────────────────────────────
FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production \
    PORT=3100 \
    DATABASE_URL=/data/app.db \
    STATIC_DIR=/app/web \
    MIGRATIONS_DIR=/app/drizzle
WORKDIR /app
COPY --from=native /native/node_modules ./node_modules
COPY --from=build /app/apps/api/dist/server.mjs ./server.mjs
COPY --from=build /app/apps/api/drizzle ./drizzle
COPY --from=build /app/apps/web/dist ./web

RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
