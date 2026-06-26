# Feature: Cash Sale & Cash Purchase (and their Returns)

Adds **Cash Sale** and **Cash Purchase** (plus cash sale-return and cash
purchase-return) using the **existing Cash account**. No second cash account is
created. Credit Sale, Credit Purchase, Receive Payment, Pay Supplier, ledgers,
balances, and every report continue to work **exactly as before**.

Fully tested before delivery:
**Cash test 20/20, DB regression 111/111 (both tenants), HTTP regression 67/67.**

---

## How it works (design)

The accounting difference between a credit and a cash transaction is a **single
journal line** — who the money is owed to/by. So the change is deliberately tiny
and reuses all existing posting logic (serials, journals, stock, COGS):

| | Credit (unchanged) | Cash (new) |
|---|---|---|
| Sale | Debit **Accounts Receivable** (party) | Debit **Cash** (no party) |
| Purchase | Credit **Accounts Payable** (party) | Credit **Cash** (no party) |
| Sale return | Credit **A/R** (party) | Credit **Cash** (no party) |
| Purchase return | Debit **A/P** (party) | Debit **Cash** (no party) |

The signal is the **counterparty**. Two sentinel parties — **"Cash Sale"** and
**"Cash Purchase"** — carry a new `Parties.is_cash` flag. When a journal's
counterparty `is_cash`, the builder posts to the existing **Cash** account with
**no `party_id`**, so:

- Cash moves immediately (no Receive Payment / Pay Supplier step).
- No receivable/payable is created.
- The cash parties never accrue a balance (no `party_id` on the cash line).

Existing parties default `is_cash = false`, so the credit path is byte-for-byte
unchanged. Returns work automatically because a cash invoice's counterparty is
the cash party.

### What changed

- **SQL** (`add_cash_transactions.sql`): adds `Parties.is_cash`, a
  `get_cash_party_id('sale'|'purchase')` helper that lazily creates the two
  sentinel parties, and re-defines the four journal builders
  (`rebuild_sales_journal`, `rebuild_purchase_journal`,
  `rebuild_sales_return_journal`, `rebuild_purchase_return_journal`) with the
  cash branch. The create/update functions, serial logic and signatures are
  untouched.
- **Views** (`sale/views.py`, `purchase/views.py`): when the request carries
  `sale_type`/`purchase_type == "cash"`, the party is resolved to the sentinel
  cash party (and the credit-only "party required / party exists" validations are
  skipped). Everything else is unchanged.
- **Templates + JS**: a **Sale Type / Purchase Type** toggle (Credit default vs
  Cash) on the Sale and Purchase screens, and a **Return Type** toggle on both
  return screens. Choosing Cash auto-fills and locks the party to the cash
  sentinel, shows a "Paid (Cash)" badge, and sends the type with the request.

---

## Files to replace (drop-in)

| Area | Files |
|---|---|
| Views | `sale/views.py`, `purchase/views.py` |
| Templates | `templates/sale_templates/sale_template.html`, `templates/purchase_templates/purchasing_template.html`, `templates/sale_return_templates/sale_return_template.html`, `templates/purchase_return_templates/purchase_return_template.html` |
| JavaScript | `static/js/sales_script.js`, `static/js/purchasing_script.js`, `static/js/sale_return_script.js`, `static/js/purchase_return_script.js` |
| New SQL | `tenancy/sql/add_cash_transactions.sql` |

Unzip at your repo root:

```bash
unzip -o cash_transactions_feature.zip
```

---

## Apply

> Rebuild **before** migrate (the migrate step runs inside the container and
> needs the new SQL file in the image).

```bash
# 1. New tenants — bake into the template (host side, append)
cat tenancy/sql/add_cash_transactions.sql >> tenancy/sql/tenant_template.sql

# 2. Rebuild (also runs collectstatic for the changed JS)
docker compose -f deploy/docker-compose.yml up -d --build

# 3. Existing tenants — apply across all schemas
docker compose -f deploy/docker-compose.yml exec web \
  python manage.py apply_sql_all_tenants tenancy/sql/add_cash_transactions.sql
```

The migration is idempotent and creates the two sentinel parties on first use.

---

## Verify

```bash
docker compose -f deploy/docker-compose.yml exec -e PYTHONPATH=/app web \
  python tests/test_cash.py
```

Expected `20/20 checks passed`. By hand: on the Sale screen pick **Cash Sale**,
save — cash goes up immediately, nothing pending; the Cash Ledger shows it and no
receivable appears. Same for **Cash Purchase** (cash down), and the cash returns
refund cash automatically.

---

## Notes / safety

- **No regression.** Credit Sale/Purchase, Receive Payment, Pay Supplier,
  customer/supplier ledgers, AR/AP, reports, stock, journals, P/L and balance
  sheet are unchanged (defaults keep `is_cash = false`).
- **Existing records** keep working; no data migration of old invoices is needed.
- The two sentinel parties ("Cash Sale", "Cash Purchase") appear in the party
  list as the cash counterparties but always carry a zero balance.
- Selecting the cash party on a *credit* screen would also post as cash (the
  party is the source of truth) — the toggle is the normal way users choose it.
