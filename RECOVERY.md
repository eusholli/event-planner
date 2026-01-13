# Database Disaster Recovery Manual

> [!WARNING]
> **DANGER ZONE**: Restoring a database usually means **overwriting** existing data.
> Always **TEST** your restore process on a safe, local database before touching your production Supabase database.

## 1. Prerequisites
You need the `psql` command line tool installed (which came with the `postgresql-client` you installed earlier).
- **Test it**: Run `psql --version` in your terminal.

## 2. Get the Backup
1.  Go to your **Cloudflare R2 Dashboard**.
2.  Open the `db-backups` bucket.
3.  Dowload the specific file you want (e.g., `backup-202X-XX-XX_XX-XX.sql.gz`).
4.  **Unzip it**:
    ```bash
    # Open terminal in your downloads folder
    gzip -d backup-202X-XX-XX_XX-XX.sql.gz
    # You now have a .sql file
    ```

## 3. The Safety Check (HIGHLY RECOMMENDED)
Before wiping your live server, verify the backup contains what you expect by restoring it to a **local** Docker container.

1.  **Start a clean empty database**:
    ```bash
    # Run a temporary postgres 17 container
    docker run --name restore-test -e POSTGRES_PASSWORD=password -p 5433:5432 -d postgres:17-alpine
    ```
    *(Note: We use port 5433 to avoid unrelated conflicts)*

2.  **Restore the backup to it**:
    ```bash
    psql "postgres://postgres:password@localhost:5433/postgres" -f backup-202X-XX-XX_XX-XX.sql
    ```

3.  **Check the data**:
    ```bash
    psql "postgres://postgres:password@localhost:5433/postgres"
    # Inside sql prompt:
    \dt  -- List tables
    SELECT count(*) FROM "Meeting"; -- Check data counts
    \q   -- Quit
    ```

4.  **Cleanup**:
    ```bash
    docker stop restore-test && docker rm restore-test
    ```
    If this worked, your backup file is good!

## 4. Restoring to Production (Supabase)

> [!CAUTION]
> The backup files contain `CREATE TABLE` commands. They do **NOT** automatically delete old data.
> If you run this against a populated database, it will fail with "Relation already exists" errors.
> **You must restore into an EMPTY database.**

### Step A: Reset your Database
You have two options:
1.  **Supabase Dashboard (Easiest)**: Go to Settings -> Database -> **Reset Database**. This wipes everything clean.
2.  **SQL Command**: Connect and drop schemas (Advanced). *Stick to option 1 for safety.*

### Step B: Run the Restore
Once the database is empty:

1.  Get your **Direct Connection String** (Port 5432) from Supabase Settings.
2.  Run the restore command:

```bash
# Replace with your actual connection string
# Replace with your actual filename
psql "postgres://postgres:password@db.supabase.co:5432/postgres" -f backup-202X-XX-XX_XX-XX.sql
```

## Troubleshooting
- **"Relation already exists"**: You didn't wipe the database first.
- **"Role does not exist"**: Supabase backups often include ownership setting (e.g., `ALTER OWNER TO supabase_admin`). This is normal and good for Supabase-to-Supabase restoration. If restoring locally, you might see some warnings about these roles missing. You can generally ignore permissions warnings when testing locally just for data inspection.
