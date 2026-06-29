# Cash Sale & Cash Purchase — Complete Feature (with all fixes)

This single package contains the **entire Cash Transaction feature** and every
follow-up fix, at its final working state. Drop the files in, apply four SQL
migrations, rebuild, and you have: Cash Sale, Cash Purchase, their returns, clean
ledgers, the serial-integrity fixes uncovered along the way, and full record
visibility for the cash accounts — with no regression to any existing workflow.

---

## 1. What the feature does

A **Sale Type** (Credit / Cash) toggle on the Sale screen and a **Purchase Type**
toggle on the Purchase screen (plus a Return Type toggle on both return screens).
Choosing **Cash**:

- Posts straight to the existing **Cash** account — Cash Sale debits Cash, Cash
  Purchase credits Cash — with **no party balance**, so no receivable/payable is
  created and no Receive-Payment / Pay-Supplier step is needed.
- Auto-selects and locks the counterparty, shows a "Paid (Cash)" badge.
- Returns mirror automatically (cash sale return refunds cash, etc.).

Credit Sale, Credit Purchase, Receive Payment, Pay Supplier, ledgers, balances,
AR/AP, reports, stock, journals, P/L and balance sheet are **unchanged**.

### Design (minimal, reuses everything)

The only accounting difference between credit and cash is one journal line — the
counterparty. Two sentinel parties, **"Cash Sale"** and **"Cash Purchase"**,
carry a `Parties.is_cash` flag; the four journal builders post to **Cash with no
party** when the counterparty `is_cash`. Existing parties default `is_cash=false`,
so the credit path is byte-for-byte identical. No new cash account is created —
the existing Chart-of-Accounts **Cash** account is used.

---

## 2. Bugs found & fixed during the build

The package folds in every issue raised after the first cut:

1. **Serial-return integrity (sale side).** A serial re-sold after a return could
   be returned to the *wrong* (original) party at the *old* price, because the
   return lookup didn't filter to the currently-active sale. Fixed so returns
   target only the `status='Sold'` unit and the customer must match.
2. **Serial-return integrity (purchase side).** Purchase return lacked an
   `in_stock=TRUE` guard (could return a serial a customer holds, or
   double-return). Fixed.
3. **Update / delete returns.** The update and delete paths had the same
   stale-row flaw and a "flip every history row" bug. Fixed with a precise
   reverse and a re-sold guard; rejection messages now state the specific reason.
4. **`get_serial_number_details` returned multiple rows** for a serial with
   history, so the sale-return screen reported the wrong current holder
   ("was sold to (…), not to Cash Sale"). Now returns one row (the active sale).
5. **Cash sentinel parties leaked into entry autocomplete** and, worse, picking
   the *wrong* cash party on a credit entry behaved like cash. Fixed: cash
   parties are hidden from the entry/ledger pickers and rejected on the credit
   path.
6. **Cash accounts had empty ledgers.** Detailed Ledger and Party Ledger now show
   cash sales/purchases as a record (correct date, description, debit, credit,
   running balance, invoice details), reading the Cash-account lines of the cash
   party's own invoices. Cash parties are selectable in the report pickers only.

---

## 3. Files in this package

**Python views** (drop-in, full current state):
`sale/views.py`, `purchase/views.py`, `saleReturn/views.py`,
`purchaseReturn/views.py`, `parties/views.py`

**JavaScript:**
`static/js/sales_script.js`, `static/js/purchasing_script.js`,
`static/js/sale_return_script.js`, `static/js/purchase_return_script.js`,
`static/js/accounts_reports.js`, `static/js/detailed_ledger2.js`

**Templates:**
`templates/sale_templates/sale_template.html`,
`templates/purchase_templates/purchasing_template.html`,
`templates/sale_return_templates/sale_return_template.html`,
`templates/purchase_return_templates/purchase_return_template.html`

**SQL migrations** (`tenancy/sql/`, apply in this order):
1. `add_cash_transactions.sql` — `is_cash` flag, `get_cash_party_id()`, the four
   cash-aware journal builders.
2. `fix_return_serial_integrity.sql` — create/update sale & purchase return
   functions hardened.
3. `fix_return_serial_integrity_part2.sql` — `get_serial_number_details` (single
   active row) and `delete_sale_return` (precise reverse + re-sold guard).
4. `add_cash_party_ledger.sql` — `detailed_ledger` / `detailed_ledger2` show cash
   accounts as a record.

**Tests** (`tests/`): `test_cash.py`, `test_return_fix.py`, `test_returns_full.py`,
`test_cashparty_guard.py`, `test_cash_ledger.py`.

> Note: these view/JS/template files are full current versions and therefore also
> include the earlier **invoice-description** feature you already applied. That
> feature added a `description` column to the invoice tables; if for any reason it
> isn't present, apply `add_invoice_description.sql` first. On your current system
> it is already present.

---

## 4. Apply

> **Order matters:** rebuild *before* the migrate step — `apply_sql_all_tenants`
> runs inside the web container and needs the SQL files in the image.

```bash
# 1. Drop in the files
unzip -o cash_feature_complete.zip

# 2. Bake the migrations into the template for NEW tenants (append, in order)
cat tenancy/sql/add_cash_transactions.sql               >> tenancy/sql/tenant_template.sql
cat tenancy/sql/fix_return_serial_integrity.sql         >> tenancy/sql/tenant_template.sql
cat tenancy/sql/fix_return_serial_integrity_part2.sql   >> tenancy/sql/tenant_template.sql
cat tenancy/sql/add_cash_party_ledger.sql               >> tenancy/sql/tenant_template.sql

# 3. Rebuild (new code + JS + SQL files + updated template; runs collectstatic)
docker compose -f deploy/docker-compose.yml up -d --build

# 4. Apply the migrations to EXISTING tenants, in order
docker compose -f deploy/docker-compose.yml exec web python manage.py apply_sql_all_tenants tenancy/sql/add_cash_transactions.sql
docker compose -f deploy/docker-compose.yml exec web python manage.py apply_sql_all_tenants tenancy/sql/fix_return_serial_integrity.sql
docker compose -f deploy/docker-compose.yml exec web python manage.py apply_sql_all_tenants tenancy/sql/fix_return_serial_integrity_part2.sql
docker compose -f deploy/docker-compose.yml exec web python manage.py apply_sql_all_tenants tenancy/sql/add_cash_party_ledger.sql
```

All four migrations are idempotent and repair existing tenants in place; re-running
is safe.

---

## 5. Verify

```bash
docker compose -f deploy/docker-compose.yml exec -e PYTHONPATH=/app web python tests/test_cash.py
docker compose -f deploy/docker-compose.yml exec -e PYTHONPATH=/app web python tests/test_returns_full.py
docker compose -f deploy/docker-compose.yml exec -e PYTHONPATH=/app web python tests/test_cashparty_guard.py
docker compose -f deploy/docker-compose.yml exec -e PYTHONPATH=/app web python tests/test_cash_ledger.py
docker compose -f deploy/docker-compose.yml exec -e PYTHONPATH=/app web python tests/test_return_fix.py
```

Expected: `20/20`, `21/21`, `10/10`, `11/11`, `9/9`.

### Test results at delivery (this exact code)

| Suite | Result |
|---|---|
| Existing DB regression (per tenant) | **111 / 111** |
| Existing HTTP regression | **67 / 67** |
| Cash sale/purchase + returns accounting | **20 / 20** |
| Serial-return integrity | **9 / 9** |
| Returns create / update / delete (both sides) | **21 / 21** |
| Cash-party guard & autocomplete | **10 / 10** |
| Cash-account ledgers | **11 / 11** |

### By hand
- Sale screen → pick **Cash Sale**: cash rises immediately, nothing pending, no
  receivable; the Cash Ledger shows it.
- Purchase screen → **Cash Purchase**: cash falls immediately, no payable.
- Cash returns refund cash automatically.
- Accounts Reports → type "Cash": **Cash Sale** / **Cash Purchase** appear; open
  Detailed Ledger or Party Ledger to see the cash records with correct amounts.
- The Sale/Purchase entry screens never list the cash accounts; choosing one on a
  credit entry is rejected.

---

## 6. Notes

- **No new cash account** — the existing Cash account is reused.
- **Backward compatible** — old records and reports are unaffected; cash parties
  always carry a zero balance (they hold no party-id journal lines).
- The cash accounts still appear on the **Parties management list** (so you can
  see them); they're only hidden from the transaction and ledger pickers.
- Ledger convention: a cash sale shows as a **debit**, a cash purchase as a
  **credit** (the Cash account's own movement), with a running total.
