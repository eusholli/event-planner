#!/usr/bin/env python3
"""
bulk_company_update.py — Bulk update Company.pipelineValue and Company.region
from a CSV file. Uses fuzzy matching to handle name variations.

Usage:
  python scripts/bulk_company_update.py <csv_file> [OPTIONS]

Options:
  --threshold N       Fuzzy match score (0-100, default 75). Scores above this
                      are FUZZY_MATCH (will update). Below 50 = NEW_COMPANY.
  --apply             Execute DB changes. Without this flag: dry-run only.
  --include-new       INSERT new companies when --apply is set.
  --exclude-zero      Skip CSV rows where TCO Amount == 0.0.
  --force-match NAMES Comma-separated CSV company names to promote from
                      LOW_CONFIDENCE to FUZZY_MATCH for --apply.
  --force-new NAMES   Comma-separated CSV company names to treat as NEW_COMPANY
                      regardless of fuzzy score, for insert with --apply --include-new.
  --output-dir DIR    Directory for preview files (default: current dir).
  --env-file PATH     Path to .env file (default: auto-detected from script dir).

Examples:
  # Dry-run — generate preview reports only
  python scripts/bulk_company_update.py forecast.csv --exclude-zero

  # Apply updates for matched companies
  python scripts/bulk_company_update.py forecast.csv --apply --exclude-zero

  # Apply updates AND insert new companies
  python scripts/bulk_company_update.py forecast.csv --apply --include-new --exclude-zero

  # Promote low-confidence matches for specific names
  python scripts/bulk_company_update.py forecast.csv --apply --force-match "Zain,STC"
"""

import argparse
import csv
import json
import os
import sys
from datetime import datetime
from pathlib import Path

try:
    import psycopg2
    from dotenv import load_dotenv
    from rapidfuzz import fuzz, process
    from tabulate import tabulate
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("Run: pip install psycopg2-binary rapidfuzz python-dotenv tabulate")
    sys.exit(1)


# ── Constants ─────────────────────────────────────────────────────────────────

LOW_CONFIDENCE_MIN = 50  # below this: NEW_COMPANY

MATCH_EXACT = "EXACT_MATCH"
MATCH_FUZZY = "FUZZY_MATCH"
MATCH_LOW   = "LOW_CONFIDENCE"
MATCH_NEW   = "NEW_COMPANY"

MATCH_ORDER = {MATCH_EXACT: 0, MATCH_FUZZY: 1, MATCH_LOW: 2, MATCH_NEW: 3}


# ── Args ──────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(
        description=(
            "Bulk update Company.pipelineValue and Company.region from a CSV file.\n"
            "CSV must have columns: region, Account Name, TCO Amount (Pipeline)\n\n"
            "Always runs a dry-run preview first. Pass --apply to write to the DB.\n"
            "Match categories:\n"
            "  EXACT_MATCH    — case-insensitive exact name match       → always UPDATE\n"
            "  FUZZY_MATCH    — score >= threshold                      → UPDATE with --apply\n"
            "  LOW_CONFIDENCE — score 50–(threshold-1), bad/unsure      → skipped; use --force-match\n"
            "  NEW_COMPANY    — no match found                          → INSERT with --apply --include-new"
        ),
        epilog=(
            "TYPICAL WORKFLOW\n"
            "----------------\n"
            "1. Dry-run to review matches:\n"
            "     python scripts/bulk_company_update.py forecast.csv --exclude-zero\n\n"
            "2. Read the preview report. Check FUZZY_MATCH for wrong matches.\n"
            "   Raise --threshold (e.g. 80) to reduce false positives.\n"
            "   Use --force-match for LOW_CONFIDENCE entries you know are correct.\n\n"
            "3. Apply updates for matched companies:\n"
            "     python scripts/bulk_company_update.py forecast.csv --exclude-zero \\\n"
            "       --threshold 80 --apply\n\n"
            "4. Also insert net-new companies:\n"
            "     python scripts/bulk_company_update.py forecast.csv --exclude-zero \\\n"
            "       --threshold 80 --apply --include-new\n\n"
            "5. Promote specific LOW_CONFIDENCE matches by name:\n"
            "     python scripts/bulk_company_update.py forecast.csv --exclude-zero \\\n"
            "       --apply --force-match \"DISH dba Boost Mobile,Nubicom\"\n\n"
            "6. Insert LOW_CONFIDENCE entries as new companies (bad DB match, known new):\n"
            "     python scripts/bulk_company_update.py forecast.csv --exclude-zero \\\n"
            "       --apply --include-new --force-new \"Bell,Viaero Wireless\"\n\n"
            "NOTES\n"
            "-----\n"
            "- Duplicate CSV rows (same region+name+amount) are deduplicated before summing.\n"
            "- Multiple rows per company are summed into one total pipeline value.\n"
            "- If a company appears in multiple regions, the region from the highest-TCO\n"
            "  row is used and the conflict is flagged in the report.\n"
            "- Only pipelineValue and region are ever written. IDs and relations are never touched.\n"
            "- All DB writes happen in a single transaction — any error rolls back everything.\n"
            "- Preview reports (.txt and .json) are always written before any DB changes.\n"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("csv_file",
                   help="Path to the CSV file")
    p.add_argument("--threshold", type=int, default=75, metavar="N",
                   help="Fuzzy match score threshold 0–100 (default: 75). "
                        "Scores at or above this are FUZZY_MATCH and will update. "
                        "Scores 50–(N-1) are LOW_CONFIDENCE and are skipped. "
                        "Raise to 80–85 to reduce false positives.")
    p.add_argument("--apply", action="store_true",
                   help="Execute DB changes. Without this flag the script is a dry-run only "
                        "and no data is written.")
    p.add_argument("--include-new", action="store_true",
                   help="INSERT NEW_COMPANY entries into the DB when --apply is set. "
                        "Without this flag, new companies are reported but never inserted.")
    p.add_argument("--exclude-zero", action="store_true",
                   help="Skip CSV rows where TCO Amount (Pipeline) == 0.0. "
                        "Recommended: zero-value rows are usually pipeline placeholders.")
    p.add_argument("--force-match", default="", metavar="NAMES",
                   help="Comma-separated list of CSV company names to promote from "
                        "LOW_CONFIDENCE to FUZZY_MATCH so they are included in --apply. "
                        'Example: --force-match "DISH dba Boost Mobile,Nubicom"')
    p.add_argument("--force-new", default="", metavar="NAMES",
                   help="Comma-separated list of CSV company names to treat as NEW_COMPANY "
                        "regardless of fuzzy match score, so they are inserted with --apply --include-new. "
                        'Example: --force-new "Bell,Viaero Wireless"')
    p.add_argument("--output-dir", default=".", metavar="DIR",
                   help="Directory where preview .txt and .json files are written "
                        "(default: current directory). Created if it does not exist.")
    p.add_argument("--env-file", default=None, metavar="PATH",
                   help="Path to the .env file containing POSTGRES_PRISMA_URL or DATABASE_URL. "
                        "Defaults to auto-detecting .env in the script or project root directory.")
    return p.parse_args()


# ── DB connection ─────────────────────────────────────────────────────────────

def load_db_url(env_file_path):
    if env_file_path:
        load_dotenv(env_file_path)
    else:
        script_dir = Path(__file__).resolve().parent
        for candidate in [script_dir, script_dir.parent]:
            env_path = candidate / ".env"
            if env_path.exists():
                load_dotenv(env_path)
                break

    url = os.getenv("POSTGRES_PRISMA_URL") or os.getenv("DATABASE_URL")
    if not url:
        print("ERROR: No database URL found in .env")
        print("Set POSTGRES_PRISMA_URL or DATABASE_URL")
        sys.exit(1)
    return url


def connect_db(db_url):
    # Strip pgbouncer-specific params that psycopg2 doesn't understand
    # (e.g. pgbouncer=true) but keep standard ssl params
    clean_url = db_url
    if "pgbouncer=true" in db_url:
        parts = db_url.split("?", 1)
        if len(parts) == 2:
            params = [p for p in parts[1].split("&") if "pgbouncer" not in p]
            clean_url = parts[0] + ("?" + "&".join(params) if params else "")
    try:
        return psycopg2.connect(clean_url)
    except psycopg2.OperationalError as e:
        print(f"DB connection failed: {e}")
        sys.exit(1)


def fetch_companies(conn):
    with conn.cursor() as cur:
        cur.execute(
            'SELECT id, name, "pipelineValue", region FROM "Company" ORDER BY name'
        )
        return [
            {"id": r[0], "name": r[1], "pipelineValue": r[2], "region": r[3]}
            for r in cur.fetchall()
        ]


# ── CSV loading ───────────────────────────────────────────────────────────────

def load_csv(csv_path, exclude_zero):
    """
    Returns dict[company_name -> {pipeline, region, conflict, conflict_regions}].

    Deduplication: rows with identical (region, name, tco) are dropped — this
    handles Zain Kuwait's 3 identical rows so the sum stays 29.2M, not 87.7M.

    Region conflict: if a company spans multiple regions, dominant_region is
    taken from the highest-TCO row. Conflict is flagged for the report.
    """
    rows = []
    seen = set()  # (region, name, tco) tuples for dedup

    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            region = row.get("region", "").strip()
            name   = row.get("Account Name", "").strip()
            try:
                tco = float(row.get("TCO Amount (Pipeline)", 0) or 0)
            except ValueError:
                tco = 0.0

            if not name:
                continue
            if exclude_zero and tco == 0.0:
                continue

            key = (region, name, tco)
            if key in seen:
                continue
            seen.add(key)
            rows.append({"region": region, "name": name, "tco": tco})

    grouped = {}
    for row in rows:
        grouped.setdefault(row["name"], []).append(row)

    aggregated = {}
    for company_name, entries in grouped.items():
        total_pipeline = sum(e["tco"] for e in entries)
        best = max(entries, key=lambda e: e["tco"])
        dominant_region = best["region"]
        all_regions = sorted({e["region"] for e in entries})
        aggregated[company_name] = {
            "pipeline": total_pipeline,
            "region": dominant_region,
            "conflict": len(all_regions) > 1,
            "conflict_regions": all_regions,
        }

    return aggregated


# ── Fuzzy matching ────────────────────────────────────────────────────────────

def classify(score, csv_name, db_name, threshold, force_set, force_new_set):
    if csv_name in force_new_set:
        return MATCH_NEW
    if db_name is None or score < LOW_CONFIDENCE_MIN:
        return MATCH_NEW
    if csv_name.strip().lower() == db_name.strip().lower():
        return MATCH_EXACT
    if score >= threshold or csv_name in force_set:
        return MATCH_FUZZY
    return MATCH_LOW


def build_report(csv_data, db_companies, threshold, force_set, force_new_set):
    db_names  = [c["name"] for c in db_companies]
    db_by_name = {c["name"]: c for c in db_companies}
    results = []

    for csv_name, csv_entry in csv_data.items():
        match = process.extractOne(
            csv_name,
            db_names,
            scorer=fuzz.token_sort_ratio,
            score_cutoff=LOW_CONFIDENCE_MIN,
        )

        if match is None:
            db_name, score, db_rec = None, 0, None
        else:
            db_name, score, _ = match
            db_rec = db_by_name[db_name]

        match_type = classify(score, csv_name, db_name, threshold, force_set, force_new_set)

        results.append({
            "csv_name":         csv_name,
            "match_type":       match_type,
            "score":            score,
            "db_id":            db_rec["id"]            if db_rec else None,
            "db_name":          db_name,
            "current_pipeline": db_rec["pipelineValue"] if db_rec else None,
            "proposed_pipeline":csv_entry["pipeline"],
            "current_region":   db_rec["region"]        if db_rec else None,
            "proposed_region":  csv_entry["region"],
            "region_conflict":  csv_entry["conflict"],
            "conflict_regions": csv_entry["conflict_regions"],
            "will_apply":       False,
        })

    results.sort(key=lambda r: (MATCH_ORDER[r["match_type"]], r["csv_name"].lower()))
    return results


# ── Reporting ─────────────────────────────────────────────────────────────────

def fmt_money(v):
    return f"${v:,.2f}" if v is not None else "null"


def write_reports(results, output_dir, apply_mode, include_new, threshold):
    # Annotate will_apply
    for r in results:
        if r["match_type"] in (MATCH_EXACT, MATCH_FUZZY) and apply_mode:
            r["will_apply"] = True
        elif r["match_type"] == MATCH_NEW and apply_mode and include_new:
            r["will_apply"] = True

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    json_path = out / f"company_update_preview_{ts}.json"
    txt_path  = out / f"company_update_preview_{ts}.txt"

    with open(json_path, "w") as f:
        json.dump(results, f, indent=2, default=str)

    sections = {t: [] for t in (MATCH_EXACT, MATCH_FUZZY, MATCH_LOW, MATCH_NEW)}
    for r in results:
        sections[r["match_type"]].append(r)
    conflicts = [r for r in results if r["region_conflict"]]

    lines = []
    lines.append("=" * 80)
    lines.append("COMPANY BULK UPDATE PREVIEW")
    lines.append(f"Generated : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"Mode      : {'APPLY' if apply_mode else 'DRY-RUN'}")
    lines.append(f"Threshold : {threshold}")
    lines.append("=" * 80)

    section_defs = [
        (MATCH_EXACT, "EXACT MATCHES — will UPDATE",               ""),
        (MATCH_FUZZY, "FUZZY MATCHES — will UPDATE if --apply",    "review recommended"),
        (MATCH_LOW,   "LOW CONFIDENCE — skipped (use --force-match to promote)", ""),
        (MATCH_NEW,   "NEW COMPANIES — will INSERT if --apply --include-new", ""),
    ]

    for mtype, label, note in section_defs:
        entries = sections[mtype]
        if not entries:
            continue

        lines.append(f"\n{'─'*80}")
        header = f"{label}  [{len(entries)}]"
        if note:
            header += f"  ← {note}"
        lines.append(header)
        lines.append("─" * 80)

        if mtype == MATCH_NEW:
            rows = [
                [
                    r["csv_name"],
                    fmt_money(r["proposed_pipeline"]),
                    r["proposed_region"] or "—",
                    "⚠ REGION CONFLICT" if r["region_conflict"] else "",
                ]
                for r in entries
            ]
            lines.append(tabulate(rows,
                headers=["CSV Name", "Proposed Pipeline", "Region", "Flags"],
                tablefmt="simple"))
        else:
            rows = [
                [
                    r["csv_name"],
                    r["db_name"],
                    f"{r['score']:.0f}",
                    f"{fmt_money(r['current_pipeline'])} → {fmt_money(r['proposed_pipeline'])}",
                    f"{r['current_region'] or 'null'} → {r['proposed_region'] or 'null'}",
                    "⚠ REGION CONFLICT" if r["region_conflict"] else "",
                ]
                for r in entries
            ]
            lines.append(tabulate(rows,
                headers=["CSV Name", "DB Name", "Score",
                         "Pipeline Change", "Region Change", "Flags"],
                tablefmt="simple"))

    if conflicts:
        lines.append(f"\n{'─'*80}")
        lines.append(f"REGION CONFLICTS  [{len(conflicts)}]")
        lines.append("─" * 80)
        for r in conflicts:
            lines.append(
                f"  {r['csv_name']}: regions {r['conflict_regions']}"
                f" → using '{r['proposed_region']}' (highest-TCO row)"
            )

    lines.append(f"\n{'─'*80}")
    lines.append("SUMMARY")
    lines.append("─" * 80)
    for mtype, label in [
        (MATCH_EXACT, "Exact matches (will UPDATE)   "),
        (MATCH_FUZZY, "Fuzzy matches (will UPDATE)   "),
        (MATCH_LOW,   "Low confidence (skipped)      "),
        (MATCH_NEW,   "New companies (INSERT w/ --include-new)"),
    ]:
        lines.append(f"  {label}: {len(sections[mtype])}")
    lines.append(f"  Region conflicts flagged       : {len(conflicts)}")
    lines.append(f"\n  JSON : {json_path}")
    lines.append(f"  TXT  : {txt_path}")

    if not apply_mode:
        lines.append("\nDry-run complete. Pass --apply to execute changes.")

    txt = "\n".join(lines)
    with open(txt_path, "w") as f:
        f.write(txt)
    print(txt)

    return json_path, txt_path


# ── Apply ─────────────────────────────────────────────────────────────────────

def apply_changes(conn, results, include_new):
    updates = [r for r in results if r["match_type"] in (MATCH_EXACT, MATCH_FUZZY)]
    inserts = [r for r in results if r["match_type"] == MATCH_NEW] if include_new else []

    updated = inserted = 0
    errors = []

    with conn.cursor() as cur:
        for r in updates:
            try:
                cur.execute(
                    'UPDATE "Company" SET "pipelineValue" = %s, region = %s WHERE id = %s',
                    (r["proposed_pipeline"], r["proposed_region"], r["db_id"])
                )
                updated += cur.rowcount
            except Exception as e:
                errors.append(f"UPDATE '{r['db_name']}': {e}")

        for r in inserts:
            try:
                # gen_random_uuid()::text avoids a Python CUID dependency.
                # Prisma accepts any non-null unique string as an id.
                cur.execute(
                    'INSERT INTO "Company" '
                    '(id, name, "pipelineValue", region, subscribed, "subscriptionCount") '
                    "VALUES (gen_random_uuid()::text, %s, %s, %s, false, 0)",
                    (r["csv_name"], r["proposed_pipeline"], r["proposed_region"])
                )
                inserted += cur.rowcount
            except Exception as e:
                errors.append(f"INSERT '{r['csv_name']}': {e}")

    if errors:
        conn.rollback()
        print("\nERRORS — rolled back all changes:")
        for err in errors:
            print(f"  {err}")
        sys.exit(1)

    conn.commit()
    print(f"\nApplied: {updated} updated, {inserted} inserted.")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    args = parse_args()

    if not (0 <= args.threshold <= 100):
        print("ERROR: --threshold must be between 0 and 100")
        sys.exit(1)

    force_set     = {n.strip() for n in args.force_match.split(",") if n.strip()}
    force_new_set = {n.strip() for n in args.force_new.split(",")   if n.strip()}

    print("Connecting to database...")
    db_url = load_db_url(args.env_file)
    conn   = connect_db(db_url)

    print(f"Loading CSV: {args.csv_file}")
    csv_data = load_csv(args.csv_file, exclude_zero=args.exclude_zero)
    print(f"  {len(csv_data)} unique companies after aggregation/dedup")

    db_companies = fetch_companies(conn)
    print(f"  {len(db_companies)} companies in DB")

    print(f"Fuzzy matching (threshold={args.threshold}, scorer=token_sort_ratio)...")
    results = build_report(csv_data, db_companies, args.threshold, force_set, force_new_set)

    write_reports(results, args.output_dir, args.apply, args.include_new, args.threshold)

    if args.apply:
        print("\nApplying changes to database...")
        apply_changes(conn, results, args.include_new)

    conn.close()


if __name__ == "__main__":
    main()
