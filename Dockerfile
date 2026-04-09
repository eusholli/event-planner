# ── Stage 1: Install all dependencies ──────────────────────────────────────
FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts

# ── Stage 2: Build Next.js ──────────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate Prisma Client
RUN npx prisma generate
# Build Next.js standalone output (call next directly — skips the db-check in npm run build)
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
ARG NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}
ARG NEXT_PUBLIC_LI_ARTICLE_API_URL
ENV NEXT_PUBLIC_LI_ARTICLE_API_URL=${NEXT_PUBLIC_LI_ARTICLE_API_URL}
ARG SENTRY_AUTH_TOKEN
ENV SENTRY_AUTH_TOKEN=${SENTRY_AUTH_TOKEN}
ENV NEXT_TELEMETRY_DISABLED=1
# Placeholder values so Prisma/Clerk modules don't crash during build.
# POSTGRES_PRISMA_URL: used by lib/prisma.ts at module-eval time (new URL() call)
# POSTGRES_URL_NON_POOLING: used by prisma.config.ts during npx prisma generate
# CLERK_SECRET_KEY: used by @clerk/nextjs/server at module-eval time
# None of these are used at runtime — real values come from the container environment.
ENV POSTGRES_PRISMA_URL=postgresql://build:build@localhost:5432/build
ENV POSTGRES_URL_NON_POOLING=postgresql://build:build@localhost:5432/build
ENV CLERK_SECRET_KEY=sk_test_placeholder_build_only
RUN npx next build

# ── Stage 3: Lightweight production runner (standalone output) ──────────────
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache libreoffice ttf-liberation
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# liteparse references pdf.worker.mjs via a dynamic path string — the Next.js
# file tracer never discovers it, so we copy the package explicitly.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@llamaindex/liteparse ./node_modules/@llamaindex/liteparse
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]

# ── Stage 4: Migration runner (needs full node_modules for prisma CLI) ───────
FROM node:24-alpine AS migrate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY package*.json ./
# prisma.config.ts uses ts-node via tsx; copy tsconfig too
COPY tsconfig.json ./
CMD ["npx", "prisma", "migrate", "deploy"]
