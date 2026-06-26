# Fix: Serial-Return Data Integrity (sale & purchase returns)

## The bug you hit

A serial sold to customer **A**, then sale-returned, then **re-sold** (e.g. as a
Cash Sale at a different price) could be **sale-returned again against the
original customer A** — it saved with no error, and the serial ledger showed it
returned from **A at the old price**, not from the actual current sale.

### Root cause

`create_sale_return` looked up the serial with:

```sql
... WHERE pu.serial_number = v_serial;     -- no status filter, no ordering
```

A serial accumulates **many** `SoldUnits` rows over its sell → return → sell
history. With no filter, `SELECT ... INTO` grabbed an **arbitrary stale row** —
the old "Returned" row for customer A — so the customer check passed against the
wrong row and a bogus return was posted at the old price (and the unit was wrongly
flagged back in stock while the current sale still held it — an overselling risk).

## The fix

Every return now resolves a serial to its **currently-active** unit only:

- **Sale returns** → the `SoldUnits` row with `status = 'Sold'` (newest), and the
  return's customer **must match** that active sale's customer. Returning a
  re-sold serial to the wrong party is now correctly **rejected**, and a correct
  return always uses the **current** sale price.
- **Purchase returns** → the `PurchaseUnits` row **for that vendor** that is
  `in_stock = TRUE`. A serial currently sold to a customer (or already returned)
  **cannot** be purchase-returned, and a serial cannot be double-returned.

The `update_sale_return` / `update_purchase_return` variants get the same guards,
plus a precise "reverse" step that only flips the specific row a return created.

This is a **pure logic fix** — no schema change, signatures, journals and
accounting are untouched.

### Yes — the same class of bug existed on the purchase side

`create_purchase_return` lacked the `in_stock = TRUE` guard, so a serial a
customer currently holds could still be purchase-returned. That's fixed here too.

## Files

- `fix_return_serial_integrity.sql` — idempotent; redefines all four functions
  (`create_sale_return`, `update_sale_return`, `create_purchase_return`,
  `update_purchase_return`). Place at `tenancy/sql/`.

## Apply

> Rebuild before migrate (the migrate step runs inside the container and needs
> the file in the image).

```bash
cat tenancy/sql/fix_return_serial_integrity.sql >> tenancy/sql/tenant_template.sql
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml exec web \
  python manage.py apply_sql_all_tenants tenancy/sql/fix_return_serial_integrity.sql
```

The migration repairs existing tenants in place (verified: a tenant running the
buggy functions rejects the bad return immediately after applying).

## Verify

```bash
docker compose -f deploy/docker-compose.yml exec -e PYTHONPATH=/app web \
  python tests/test_return_fix.py
```

Expected `9/9 checks passed`. By hand: reproduce your scenario — selling the
serial on cash and then trying to sale-return it against the original customer is
now blocked with *"Serial … was not sold to this customer"*; returning it via
**Cash Sale Return** works and shows the correct cash price.

## A note on already-saved bad returns

This stops new bad returns. If a wrong return was already saved before the fix,
its serial/journal rows are still in the data; tell me the serial(s) and I can
provide a one-off cleanup script to correct those specific historical entries.
