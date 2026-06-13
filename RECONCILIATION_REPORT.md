# PostgreSQL Schema Validation & Production Reconciliation Report

**Production dump (source of truth):** `db_backup_20260610_0000.sql`
(plain‑format `pg_dump`, PostgreSQL server **16.14**)
**Source tree audited:** `Database_schema/` (184 `.sql` files + 14 `.md`, plus a `.git` history)
**Method:** Both sources were materialised into a real PostgreSQL 16.14 instance and compared
through the system catalogs, so every object is compared by its *canonical* definition
(`pg_get_functiondef` / `pg_get_viewdef` / `pg_get_triggerdef` / `pg_get_constraintdef` /
`pg_get_indexdef` / column catalog), which neutralises cosmetic formatting differences and
surfaces only real drift.

---

## 1. Executive summary

The production dump restored with **0 errors**. The source tree was an almost‑exact mirror of
production: of the ~290 schema objects, **10 genuine discrepancies** were found (4 objects
entirely missing, 1 table default not represented through a usable statement, 2 missing
functions/triggers, 3 missing `COMMENT`s) plus **2 file‑hygiene defects**. All were corrected.

After reconciliation the source tree is **functionally identical to production**: a normalized
`pg_dump --schema-only` of the rebuilt tree is **byte‑for‑byte equal** to a `pg_dump --schema-only`
of the production database (6,735 lines each, zero diff).

### Object inventory (production = source of truth)

| Category | Production | Source (before) | Source (after) |
|---|---|---|---|
| Schemas | 1 (`public`) | 1 | 1 |
| Extensions | 1 (`plpgsql`) | 1 | 1 |
| Custom types (enum/composite/domain) | 0 | 0 | 0 |
| Tables | 28 | 28 | 28 |
| Columns / constraints | 103 (28 PK, 49 FK, 12 UNIQUE, 14 CHECK) | 103 | 103 |
| Indexes (incl. constraint indexes) | 53 | 53 | 53 |
| Sequences | 29 | 29 | 29 |
| Views | 13 | **10** | 13 |
| Materialized views | 0 | 0 | 0 |
| Functions | 124 | **122** | 124 |
| Procedures | 0 | 0 | 0 |
| Triggers | 8 | **7** | 8 |
| Comments | 3 | **0** | 3 |
| Row‑level security policies | 0 | 0 | 0 |

---

## 2. Discrepancies found and resolved

### 2.1 Objects missing from the source tree (present in production)

These objects existed in production but had **no representation anywhere** in the tree. New
canonical source files were created from the production definitions.

| # | Object | Type | New file created |
|---|---|---|---|
| 1 | `public.generalledger` | VIEW | `accountsReports/views/generalledger.sql` |
| 2 | `public.sale_wise_profit_view` | VIEW | `accountsReports/views/sale_wise_profit_view.sql` |
| 3 | `public.item_history_view` | VIEW | `stockReports/views/item_history_view.sql` |
| 4 | `public.get_trial_balance_json()` | FUNCTION | `accountsReports/functions/get_trial_balance_json.sql` |

> **Note on `item_history_view` and `sale_wise_profit_view`:** in production both carry hard‑coded
> literal filters (an `item_name ILIKE '%iPhone 15 Pro%'` filter, and an `invoice_date` range of
> `2025‑10‑17 … 2025‑10‑31`). These look like ad‑hoc views that were saved into the live database.
> Because production is the source of truth, the new files reproduce them **exactly as they exist in
> production**. If these were meant to be parameterised reports rather than persistent views, that is
> a product decision to make separately — they were *not* altered here.

### 2.2 Object created by a maintenance script but live in production

| # | Object | Type | Action |
|---|---|---|---|
| 5 | `public.trg_fn_soldunits_fix_ghost_stock()` | TRIGGER FUNCTION | New file `sale/trigger_functions/trg_fn_soldunits_fix_ghost_stock.sql` |
| 6 | `trg_soldunits_fix_ghost_stock` on `public.soldunits` | TRIGGER | New file `sale/triggers/trg_soldunits_fix_ghost_stock.sql` |

These two objects existed in the tree **only inside `maintenence/fix_script.sql`** — a one‑time
deploy/cleanup helper. That script (which also performs a one‑time data cleanup and verification
queries) was **left untouched** per the maintenance‑script preservation rule. However, the trigger
function and trigger it installed are now permanent production objects, so they were given proper
canonical source files (in the `sale` module, since they act on `soldunits`). The two associated
`COMMENT`s were included in those files to match production.

### 2.3 Missing comments

| # | Comment | Resolved in |
|---|---|---|
| 7 | `COMMENT ON COLUMN public.purchaseunits.serial_comment` | Appended to `purchase/tables/purchaseunits.sql` |
| 8 | `COMMENT ON FUNCTION public.trg_fn_soldunits_fix_ghost_stock()` | Included in new trigger‑function file |
| 9 | `COMMENT ON TRIGGER trg_soldunits_fix_ghost_stock ON public.soldunits` | Included in new trigger file |

### 2.4 Incorrect / defective definitions

| # | File | Problem | Fix |
|---|---|---|---|
| 10 | `items/tables/stockmovements.sql` | A stray `pg_dump` footer (`-- PostgreSQL database dump complete` + a `\unrestrict <token>` psql meta‑command) was pasted **into the middle of the file**, immediately above the `movement_id` `SET DEFAULT nextval(...)` statement. Because the `\unrestrict` line has no terminating `;`, any non‑`psql` loader glues it to the following `ALTER TABLE … SET DEFAULT` statement and the **sequence default is silently dropped** — i.e. `movement_id` loses its `nextval('stockmovements_movement_id_seq')` default. | Removed the stray footer block. The `SET DEFAULT` statement is now a clean, standalone statement and the default loads correctly. |

### 2.5 File hygiene (functionally equivalent, cleaned)

| # | File | Problem | Fix |
|---|---|---|---|
| 11 | `parties/functions/update_party_from_json.sql` | The file (≈12.9 KB, last modified 2026‑06‑13) contained an **entire previous version of the function commented out** with `-- ` prefixes (126 dead lines) above the active definition. The *active* definition already matched production exactly. | Regenerated cleanly from the canonical production definition (≈6.3 KB). Behaviour is byte‑identical to production; only the dead commented‑out block was removed. |

---

## 3. Items intentionally left unchanged

* **`maintenence/fix_script.sql`** — one‑time deploy + data‑cleanup + verification helper. Preserved
  verbatim (confirmed byte‑identical to the original).
* **`maintenence/maintenance_queries.sql`** — diagnostic/health‑check queries. Preserved verbatim.
* **`_master_schema.sql`** — a **tables‑and‑constraints‑only** convenience aggregate. It is *not* a
  standalone, dependency‑ordered build script (it has no sequences/defaults/functions/views and its
  FK statements are not topologically ordered), so loading it by itself yields ordering errors —
  this is **by original design**, not drift introduced here. Its `CREATE TABLE`/constraint
  definitions are consistent with production. It was left as‑is; the authoritative, organised,
  buildable source is the per‑module file tree.
* All other 180+ object files matched production exactly and were not modified.

---

## 4. Verification of functional equivalence

Three independent checks, all passing:

1. **Catalog comparison (after fix):** every category reports `missing=0, extra=0, different=0`
   against production — tables 28, constraints 103, indexes 53, sequences 29, views 13,
   functions 124, triggers 8, extensions 1, comments 3, types 0, policies 0.
2. **Clean rebuild:** the reconciled tree was loaded into a fresh database with **0 load failures**,
   in dependency order (sequences → tables → defaults → PK/UNIQUE/CHECK → FK → functions → views →
   indexes → triggers → comments).
3. **`pg_dump` equivalence (gold standard):** `pg_dump --schema-only --no-owner` of the rebuilt
   database, normalized (dropping the volatile dump‑version banner and the random
   `\restrict`/`\unrestrict` session token), is **identical** to the same dump of the production
   database — 6,735 lines each, **zero differences**.

---

## 5. Change manifest

**New files (6)**
```
accountsReports/views/generalledger.sql
accountsReports/views/sale_wise_profit_view.sql
stockReports/views/item_history_view.sql
accountsReports/functions/get_trial_balance_json.sql
sale/trigger_functions/trg_fn_soldunits_fix_ghost_stock.sql
sale/triggers/trg_soldunits_fix_ghost_stock.sql
```

**Edited files (3)**
```
items/tables/stockmovements.sql            (removed stray dump footer; restores movement_id default)
purchase/tables/purchaseunits.sql          (added COMMENT ON COLUMN serial_comment)
parties/functions/update_party_from_json.sql (removed dead commented-out old version; canonical def kept)
```

**Untouched maintenance/dev scripts (2)**
```
maintenence/fix_script.sql
maintenence/maintenance_queries.sql
```

> The reconciled tree is shipped without the original `.git` directory. Drop these 6 new files and
> 3 edits into your existing repository and commit them; nothing else in the tree changed.
