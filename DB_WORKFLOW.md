# Database Workflow & Migration Strategy

This project uses **different databases** for the `main` branch (V1, Single Event) and the `multi-event` branch (V2, Multi Event) because their schemas are divergent.

## 1. Switching Environments (Local Development)

We have automated the process of switching database configurations.

### Switch to Main (Single Event / V1)
Use this when working on the `main` branch.
```bash
npm run db:main
```
*Effect:* Copies `.env.main` to `.env` and runs `prisma generate`.

### Switch to Multi-Event (Multi Event / V2)
Use this when working on the `multi-event` branch.
```bash
npm run db:multi
```
*Effect:* Copies `.env.multi` to `.env` and runs `prisma generate`.

---

## 2. Migration Strategy (Critical)

Because the schemas are different, **migrating changes between branches requires specific care.**

### Key Rule: One-Way Merging
> **CRITICAL:** You may merge `main` into `multi-event`. You must **NEVER** merge `multi-event` into `main` (until the day V2 launches).

### Workflow: Adding a feature to BOTH branches
Scenario: You added a new field (e.g., `phone`) to the `User` model in `main`, and you want it in V2.

1.  **Implement in Main First**
    *   Make changes in `main`.
    *   Run `prisma migrate dev`. This creates `migrations/migration_A`.
    *   Commit and push `main`. Vercel deploys `main` with `migration_A`.

2.  **Merge into Multi-Event**
    *   Checkout V2: `git checkout multi-event`
    *   Switch DB: `npm run db:multi`
    *   Merge Main: `git merge main`
    *   **STOP & RESOLVE CONFLICTS**:
        *   `schema.prisma`: Accept the new field, but ensure you keep other V2-specific fields.
        *   `migrations/`: **DELETE the folder** for `migration_A` that came from `main`.
            *   *Why?* That migration was calculated for V1. It is invalid for V2.

3.  **Generate V2 Migration**
    *   With the new field in `schema.prisma`, run:
        ```bash
        npx prisma migrate dev --name <same_feature_name>
        ```
    *   This creates `migrations/migration_B`. This is a valid migration for the V2 database.
    *   Commit and push `multi-event`. Vercel deploys V2 with `migration_B`.

### Summary
*   **Main Branch**: Has `migration_A`. Deploy uses `migration_A`.
*   **Multi-Event Branch**: Has `migration_B`. Deploy uses `migration_B`.
*   The code logic is shared, but the database schema history remains separate.
