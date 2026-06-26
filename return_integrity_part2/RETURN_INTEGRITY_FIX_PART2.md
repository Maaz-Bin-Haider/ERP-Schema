# Fix (part 2): Serial-Return Integrity — view validation, details lookup & delete

This completes the return-integrity work. Part 1 fixed `create_sale_return` /
`create_purchase_return` (and the update variants) so a re-sold serial can't be
returned to the wrong party. Part 2 fixes the two remaining places that still
resolved a serial against its **stale history**.

## The error you hit

```
The serial number 'DA-P-042144-3' was sold to ('ALPHA TRADERS 153306',), not to Cash Sale.
```

The serial was correctly sold-then-returned for ALPHA TRADERS and is now sold on
a **Cash Sale @150**. Returning it via *Cash Sale Return* is valid, but the
sale-return screen **rejected** it — and the message showed a Python tuple, a
tell that this came from a **view-level pre-check**, not the SQL function.

### Root cause

The view calls `get_serial_number_details(serial)` to find who currently holds
the serial. That function did:

```sql
LEFT JOIN SoldUnits su ON su.unit_id = pu.unit_id   -- joins EVERY historical row
```

A serial with sell → return → sell history therefore returned **multiple rows**.
The view's `fetchone()` grabbed an arbitrary (old) one — ALPHA TRADERS — so a
valid Cash Sale return was blocked.

A second, related flaw: `delete_sale_return` reversed a return with
`UPDATE SoldUnits SET status='Sold' WHERE unit_id = (...)`, flipping **every**
historical row for the unit, which could corrupt the serial's status history.

## The fix

- **`get_serial_number_details`** now returns exactly **one row**, preferring the
  currently-active (`status='Sold'`) unit. The sale-return view now sees the
  correct current holder (Cash Sale), so the valid return goes through.
- **`delete_sale_return`** now flips back only the **specific** row the return
  created, and **refuses** to delete a return whose serial has since been
  re-sold (which would oversell) — with a clear message.
- **Sale-return / purchase-return views** now null-guard the serial check (clean
  message instead of a tuple) and surface the **specific** reason when an update
  or delete is rejected (e.g. *"serial … has since been re-sold"*).

`delete_purchase_return` was already correct (one purchase unit per serial, with
a vendor safety check), so it's unchanged.

## What was tested (all create / update / delete, both sides)

`21/21` end-to-end through the real views:

- **Sale return** — create: your exact bug (wrong-party rejected, correct Cash
  Sale return succeeds at the **current** price 150); update: add a serial,
  wrong-party serial rejected (atomic — nothing changed); delete: restores the
  serial to sold, removes the header, and is **blocked** when the serial was
  re-sold.
- **Purchase return** — create: in-stock works, sold-serial rejected, wrong
  vendor rejected; update: add a serial; delete: restores stock.
- Trial balance stays balanced.

Regression: **DB 111/111**, **HTTP 67/67**, **cash 20/20**, **part-1 9/9** — no
regression.

## Files

| Area | Files |
|---|---|
| New SQL | `tenancy/sql/fix_return_serial_integrity_part2.sql` |
| Views | `saleReturn/views.py`, `purchaseReturn/views.py` |

> Requires part 1 (`fix_return_serial_integrity.sql`) already applied — which it
> is on your system (the wrong-party return is already correctly rejected).

## Apply

```bash
unzip -o return_integrity_part2.zip
cat tenancy/sql/fix_return_serial_integrity_part2.sql >> tenancy/sql/tenant_template.sql
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml exec web \
  python manage.py apply_sql_all_tenants tenancy/sql/fix_return_serial_integrity_part2.sql
```

The migration is idempotent and repairs existing tenants in place.

## Verify

```bash
docker compose -f deploy/docker-compose.yml exec -e PYTHONPATH=/app web \
  python tests/test_returns_full.py
```

Expected `21/21 checks passed`. By hand: reproduce your case — selling the serial
on cash, then returning it via **Cash Sale Return**, now succeeds at the cash
price; trying to return it to the original customer is still correctly blocked.

## Already-saved bad entries

This stops new bad data and corrects the lookup. If a wrong return was saved
*before* the part-1 fix, its rows still exist — send me the serial(s) and I'll
provide a targeted cleanup script.
