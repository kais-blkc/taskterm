# syntax=docker/dockerfile:1

ARG NODE_VERSION=24
ARG PNPM_VERSION=12.3.4

# ── 1. сборка фронта и бандла API ───────────────────────────────
FROM node:${NODE_VERSION}-slim AS build
ARG PNPM_VERSION
RUN npm install -g pnpm@${PNPM_VERSION}
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

# ── 2. рантайм ──────────────────────────────────────────────────
FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production \
    PORT=3100 \
    STATIC_DIR=/app/web \
    MIGRATIONS_DIR=/app/drizzle-pg
WORKDIR /app
COPY --from=build /app/apps/api/dist/server.mjs ./server.mjs
COPY --from=build /app/apps/api/drizzle-pg ./drizzle-pg
COPY --from=build /app/apps/web/dist ./web

USER node
EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
