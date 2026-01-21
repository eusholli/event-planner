# Deployment Guide: Vercel & Supabase

This guide outlines the steps to deploy the Event Planner application to Vercel with a Supabase PostgreSQL database, including performing a "Clean Install" of the database.

## Prerequisites

1.  **Vercel Account**: [https://vercel.com/](https://vercel.com/)
2.  **Supabase Account**: [https://supabase.com/](https://supabase.com/)
3.  **GitHub Repository**: Ensure your code is pushed to a GitHub repository.

## 1. Supabase Setup (Database)

1.  **Create a New Project**:
    *   Go to Supabase Dashboard -> New Project.
    *   Give it a name and password.
    *   Region: Choose one close to your users (e.g., US East).
2.  **Get Connection Strings**:
    *   Go to **Project Settings** -> **Database**.
    *   Find **Connection String** -> **Node.js**.
    *   **IMPORTANT**: You will need both the **Transaction Mode** (Port 6543) and **Session Mode** (Port 5432) URLs if you are using connection pooling (recommended), or just the standard one if not.
    *   Reference strictly: Supabase suggests using the **Transaction** pooler string for the `POSTGRES_PRISMA_URL` and the **Session** string (or direct connection) for `POSTGRES_URL_NON_POOLING`.

## 2. Vercel Setup (App Deployment)

1.  **Import Project**:
    *   Go to Vercel Dashboard -> Add New -> Project.
    *   Import your GitHub repository.
2.  **Environment Variables**:
    *   Add the following variables in the Vercel project settings during import (or afterwards in Settings -> Environment Variables):

    | Variable Name | Value |
    | :--- | :--- |
    | `POSTGRES_PRISMA_URL` | Your Supabase **Transaction** (Pooler) connection string. |
    | `POSTGRES_URL_NON_POOLING` | Your Supabase **Session** (Direct) connection string. |
    | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Your Clerk Publishable Key (from Clerk Dashboard). |
    | `CLERK_SECRET_KEY` | Your Clerk Secret Key (from Clerk Dashboard). |
    | `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
    | `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
    | `GEMINI_API_KEY` | (Optional) If you are using AI features. |

3.  **Deploy**:
    *   Click **Deploy**.
    *   *Note*: The initial deployment might fail if the database migrations haven't run or if connection strings are wrong. That's okay.

## 3. Clean Install (Database Reset)

You requested a "Clean Install". This means wiping the database and recreating the schema from scratch.

**When to do this**: Before your final successful deployment, or anytime you want to reset.

1.  **Open your local terminal**.
2.  **Run the Reset Script**:
    ```bash
    chmod +x scripts/db-reset-prod.sh
    ./scripts/db-reset-prod.sh
    ```
3.  **Paste Connection String**:
    *   When prompted, paste your **Supabase Connection String**. check Supabase docs, but usually the `POSTGRES_URL_NON_POOLING` (Direct connection, port 5432) is safest for migration commands to avoid pooler timeout issues, though Prisma handles Supabase poolers well now.

    *   *Tip*: Use the "Session Mode" (Port 5432) string for this script to ensure direct access to the DB for administration.

4.  **Wait for completion**: The script will drop the public schema, recreate it, and apply all migrations found in `prisma/migrations`.

## 4. Final Verification

1.  **Redeploy on Vercel** (if the first one failed):
    *   Go to Vercel -> Deployments -> Redeploy.
2.  **Visit your App**:
    *   Go to the Vercel URL.
    *   Login.
    *   Verify the data is clean (empty).

## Troubleshooting

-   **Build Fails on Vercel**: Check the logs. If it says "P1001: Can't reach database", check your Environment Variables in Vercel.
-   **Connection Pooling**: Ensure `POSTGRES_PRISMA_URL` ends with `?pgbouncer=true` if using Supabase Transaction pooler 6543.
