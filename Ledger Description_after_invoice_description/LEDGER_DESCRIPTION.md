# Show Invoice Description in Detailed Ledger & Party Ledger

The two reports in **Accounts Reports → Detailed Ledger** and **Party Ledger**
previously showed only the auto-generated sequence text for each row
(e.g. `Sale Invoice 1`). They now also show the user-entered invoice description
when one exists:

```
Sale Invoice 1 — WARRANTY CLAIM #99
Sale Invoice 2                       (no description -> unchanged)
```

This works for **all four** invoice types (Sale, Purchase, Sale-Return,
Purchase-Return).

## What changed

This is a **database-only** change — no Python, template, or JS edits. It
re-defines the two functions behind those reports, `detailed_ledger(...)` and
`detailed_ledger2(...)`, to append the invoice's description to the existing
`description` column. Everything else (running balances, the expandable
invoice_details panel, "Entry By", signatures) is untouched, and rows without a
description render exactly as before (no trailing dash).

Requires the invoice-description feature (the `description` columns) to be in
place already.

## Files

- `add_ledger_description.sql` — idempotent migration (two `CREATE OR REPLACE`
  functions). Place it at `tenancy/sql/add_ledger_description.sql`.

## Apply

> Same order rule as before: rebuild **before** the migrate step, because
> `apply_sql_all_tenants` runs inside the container and needs the file in the
> image.

```bash
# 1. New tenants — bake into the template (host side, append)
cat tenancy/sql/add_ledger_description.sql >> tenancy/sql/tenant_template.sql

# 2. Rebuild so the file + updated template are in the image
docker compose -f deploy/docker-compose.yml up -d --build

# 3. Existing tenants — apply across all schemas
docker compose -f deploy/docker-compose.yml exec web \
  python manage.py apply_sql_all_tenants tenancy/sql/add_ledger_description.sql
```

## Verify

Open Accounts Reports → Detailed Ledger (and Party Ledger) for a party that has
an invoice with a description — the row shows `… — <description>`. Invoices
without a description are unchanged.
