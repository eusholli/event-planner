# Hetzner VPS Deployment Guide

Deploy event-planner to the Hetzner VPS behind the existing global Traefik instance at `events.maximh.us`.

## Architecture

```
VPS (Hetzner)
├── global-traefik (already running, external webproxy network)
│   └── events.maximh.us → event-planner-app:3000
└── event-planner stack
    ├── event-planner-db  (PostgreSQL 15, internal only)
    ├── event-planner-migrate  (one-shot migration runner)
    └── event-planner-app  (Next.js 16 standalone)
```

## Prerequisites

- Hetzner VPS running Docker with global Traefik deployed
- `webproxy` Docker network exists on the VPS
- DNS A record: `events.maximh.us` → VPS IP

## One-Time DNS Setup

Add an A record at your domain registrar:
```
events    A    <your-vps-ip>
```

## First Deploy

**Step 1: SSH into VPS and clone the repo**
```bash
ssh root@<your-vps-ip>
git clone https://github.com/<your-repo>/event-planner.git /opt/event-planner
cd /opt/event-planner
git checkout multi-event
```

**Step 2: Create the `.env` file**
```bash
cp .env.docker.example .env
nano .env   # Fill in all values
```

**Step 3: Deploy**
```bash
chmod +x deploy-prod.sh
./deploy-prod.sh
```

**Step 4: Verify**
```bash
# Check all containers
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

# App logs
docker logs event-planner-app -f

# Confirm DB tables were created
docker exec event-planner-db psql -U postgres -d eventplanner -c "\dt"

# Visit in browser
open https://events.maximh.us
```

## Subsequent Deploys

```bash
cd /opt/event-planner
git pull origin multi-event
./deploy-prod.sh
```

## Useful Maintenance Commands

```bash
# View app logs
docker logs event-planner-app -f

# View DB logs
docker logs event-planner-db -f

# Shell into app container
docker exec -it event-planner-app sh

# Shell into DB
docker exec -it event-planner-db psql -U postgres -d eventplanner

# Force re-run migrations only
docker compose run --rm event-planner-migrate

# Stop everything
docker compose -f docker-compose.yml -f docker-compose.prod.yml down

# Stop and wipe DB data (DESTRUCTIVE)
docker compose -f docker-compose.yml -f docker-compose.prod.yml down -v
```

## Verification Checklist

1. `docker compose ps` → `event-planner-db` healthy, `event-planner-migrate` exited (0), `event-planner-app` running
2. `https://events.maximh.us` loads with valid SSL cert
3. Clerk sign-in works (production keys)
4. Create a test event → confirms DB writes work
5. `docker exec event-planner-db psql -U postgres -d eventplanner -c "\dt"` → lists all Prisma-managed tables

## Local Dev with Docker

Create a `docker-compose.override.yml` (gitignored) to expose ports locally:

```yaml
services:
  event-planner-db:
    ports:
      - "5433:5432"   # 5433 to avoid conflict with any local postgres

  event-planner-app:
    ports:
      - "3000:3000"
```

Then run:
```bash
docker compose up -d --build
```

## Notes

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is baked into the Next.js bundle at build time — it must be set in `.env` before running `deploy-prod.sh`.
- Both `POSTGRES_PRISMA_URL` and `POSTGRES_URL_NON_POOLING` point to the same internal Docker URL (no pooler needed unlike Supabase).
- The migrate container is idempotent — `prisma migrate deploy` is safe to re-run on every deploy.
- Do NOT copy `docker-compose.override.yml` to the VPS — it is for local dev only.
