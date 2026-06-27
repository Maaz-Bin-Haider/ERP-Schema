# Feature: View Cash Sale / Cash Purchase in Detailed Ledger & Party Ledger

You can now open the **Cash Sale** and **Cash Purchase** accounts in both the
**Detailed Ledger** and **Party Ledger** to see, purely as a record, what the
company sold and bought on cash — with correct values in every column (date,
description, debit, credit, running balance, and the expandable invoice details).

This is a *record view only*; it does not change any finance logic, balances or
reports.

## Why they were empty before

Cash transactions post to the **Cash account with no party**, so the cash
sentinel parties have no journal lines of their own — the normal party-ledger
lookup found nothing. (That's intentional, so cash never creates a
receivable/payable.) Also, after the previous fix the cash parties were hidden
from the report party picker too.

## What changed

- **Ledger functions** (`detailed_ledger`, `detailed_ledger2`): for a cash party
  they now read the **Cash-account lines of that party's own invoices/returns**
  instead of party-id lines. A cash sale shows as a debit, a cash sale return as
  a credit (and the mirror for purchases), with a correct running balance and the
  same expandable invoice details as any other ledger. **Non-cash parties are
  completely unchanged.**
- **Party autocomplete** (`parties/views.py`): now accepts `?include_cash=1`. The
  reports/ledger picker passes it (so Cash Sale / Cash Purchase are selectable
  there), while the Sale/Purchase/Return entry screens keep excluding them.
- **Reports JS** (`accounts_reports.js`): the ledger party box requests the
  autocomplete with `include_cash=1`.

## Files

| Area | Files |
|---|---|
| New SQL | `tenancy/sql/add_cash_party_ledger.sql` |
| Views | `parties/views.py` |
| JS | `static/js/accounts_reports.js` |

> `parties/views.py` here also contains the previous cash-party autocomplete
> filter, so this copy supersedes the one from the last fix.

## Apply

```bash
unzip -o cash_party_ledger.zip
cat tenancy/sql/add_cash_party_ledger.sql >> tenancy/sql/tenant_template.sql
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml exec web \
  python manage.py apply_sql_all_tenants tenancy/sql/add_cash_party_ledger.sql
```

The rebuild also reloads `parties/views.py` and re-runs `collectstatic` for the
changed JS. The migration is idempotent and repairs existing tenants in place.

## Verify

```bash
docker compose -f deploy/docker-compose.yml exec -e PYTHONPATH=/app web \
  python tests/test_cash_ledger.py
```

Expected `11/11 checks passed`. By hand: in Accounts Reports, type "Cash" in the
party box — **Cash Sale** and **Cash Purchase** now appear; pick one and run
Detailed Ledger or Party Ledger to see the cash sales/purchases with correct
amounts. The Sale/Purchase entry screens still don't list these accounts.

Regression: DB 111/111, HTTP 67/67, cash 20/20, returns 21/21, guard 10/10 — no
regression.
