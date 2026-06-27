# Fix: Cash sentinel parties leaking into Sale/Purchase entry

Three related issues with the **Cash Sale** / **Cash Purchase** sentinel parties:

1. They appeared in the party autocomplete on the Sale/Purchase (and ledger)
   screens, so a user could pick them manually.
2. **The real bug:** on a *Credit Sale*, picking the **Cash Purchase** account
   saved successfully and behaved like a cash sale (and vice-versa on purchases).
3. Their Detailed/Party Ledgers were empty.

## Why it happened

The cash flow keys off a single `Parties.is_cash` flag, so **any** cash party
selected as the counterparty triggered the cash journal branch — including the
*wrong-side* one (Cash Purchase on a sale). And the party autocomplete that
feeds both the entry screens and the ledger party picker wasn't excluding cash
parties, so they showed up and could be selected. The ledgers are empty by
design — cash transactions post to the **Cash account with no party**, so the
sentinel parties never carry a balance; the cash activity is in the **Cash
Ledger**, not a party ledger.

## The fix (code only — no DB change)

- **Party autocomplete** (`parties/views.py`) excludes `is_cash` parties, so they
  no longer appear on Sale, Purchase, Return, or ledger screens. (Cash is chosen
  with the Sale Type / Purchase Type toggle, not by picking a party.) This also
  removes them from the ledger party picker, so the empty-ledger case can't be
  reached.
- **Sale & Purchase views** reject a cash sentinel party on a *credit* create or
  update with a clear message — "That is a cash account. Choose 'Cash Sale' as
  the Sale Type…". The Cash toggle path and editing an existing cash entry are
  unaffected.

## Files to replace (drop-in) — no migration, no template/JS change

| Area | Files |
|---|---|
| Views | `parties/views.py`, `sale/views.py`, `purchase/views.py` |

```bash
unzip -o cash_party_guard_fix.zip
docker compose -f deploy/docker-compose.yml up -d --build
```

A rebuild (or any restart that reloads the app code) is all that's needed — there
is no SQL migration and nothing to run with `apply_sql_all_tenants`.

## Verify

```bash
docker compose -f deploy/docker-compose.yml exec -e PYTHONPATH=/app web \
  python tests/test_cashparty_guard.py
```

Expected `10/10 checks passed`. By hand: the Cash Sale / Cash Purchase accounts
no longer appear when typing in the party box; a Credit Sale that somehow names
"Cash Purchase" is rejected; and the Cash Sale / Cash Purchase toggle still works
exactly as before.

Regression: DB 111/111, HTTP 67/67, cash 20/20, returns 21/21 — no regression.

> Note: the sentinel parties still appear on the **Parties management list** (so
> you can see they exist); they're only hidden from the transaction/ledger
> pickers. Say the word if you'd like them hidden there too.
