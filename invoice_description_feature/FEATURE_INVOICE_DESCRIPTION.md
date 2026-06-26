# Feature: Optional Invoice Description (Sale / Purchase / Sale-Return / Purchase-Return)

Adds an **optional free-text description** that the user can type on each Sale,
Purchase, Sale-Return and Purchase-Return invoice. The automatic invoice
sequencing is **kept exactly as-is** — the description is an extra, optional
field that is saved with the invoice and shown again when you navigate back to it.

This was tested in isolation (all four entry types create + read-back) and
against the full existing suite with no regressions:
**DB suite 111/111, HTTP suite 67/67, feature test 8/8.**

---

## How it works (design)

The four invoice tables didn't have a `description` column (only payments/receipts
did). The change:

1. **Adds a `description text` column** to `salesinvoices`, `purchaseinvoices`,
   `salesreturns`, `purchasereturns`.
2. **Does not touch the create/update stored functions** (so serial allocation,
   journals and auto-numbering are untouched). The view saves the description with
   a tiny `UPDATE … SET description=…` right after the existing function call
   returns the invoice id.
3. **Repoints the `get_current_*` read functions** to return the invoice's own
   description (they previously returned the auto-generated journal-entry text,
   which the UI never displayed), so a saved note reloads into the form.
4. **Adds a Description textarea** to each of the four entry templates, and wires
   the JS to send it on submit and refill it on navigation.

Empty descriptions are stored as `NULL` — the field is entirely optional and
existing flows are unaffected.

---

## Files to replace (drop-in)

All under your repo root, same paths:

| Area | Files |
|---|---|
| Views | `sale/views.py`, `purchase/views.py`, `saleReturn/views.py`, `purchaseReturn/views.py` |
| Templates | `templates/sale_templates/sale_template.html`, `templates/purchase_templates/purchasing_template.html`, `templates/sale_return_templates/sale_return_template.html`, `templates/purchase_return_templates/purchase_return_template.html` |
| JavaScript | `static/js/sales_script.js`, `static/js/purchasing_script.js`, `static/js/sale_return_script.js`, `static/js/purchase_return_script.js` |
| New SQL | `tenancy/sql/add_invoice_description.sql` |

Unzip `invoice_description_feature.zip` at your repo root to place them all:

```bash
unzip -o invoice_description_feature.zip
```

---

## Apply steps

> **Order matters.** `apply_sql_all_tenants` runs *inside* the web container, so
> the SQL file must already be in the image — which means **rebuild before you
> migrate**. (If you run the migrate step first you'll get
> `SQL file not found`, because the container is still the old image.)

### 1. New tenants — bake the feature into the template (host side, append)

```bash
cat tenancy/sql/add_invoice_description.sql >> tenancy/sql/tenant_template.sql
```

(Appending is safe and idempotent; newly provisioned tenants then include the
column and the updated read functions automatically.)

### 2. Rebuild so the new code + JS + SQL file + template are in the image

Because the JS files changed and the app uses hashed static files, the rebuild
also runs `collectstatic`:

```bash
docker compose -f deploy/docker-compose.yml up -d --build
```

### 3. Existing tenants — add the column + repoint the read functions

Now that the file is inside the container, migrate every existing tenant:

```bash
docker compose -f deploy/docker-compose.yml exec web \
  python manage.py apply_sql_all_tenants tenancy/sql/add_invoice_description.sql
```

---

## Verify

Run the included feature test inside the container:

```bash
docker compose -f deploy/docker-compose.yml exec -e PYTHONPATH=/app web \
  python tests/test_description.py
```

Expected: `8/8 checks passed` (create-and-store + read-back for all four types).

Or check by hand: open a Sale, type a description, save; navigate away and back —
the description reloads. Saving **without** a description still works exactly as
before.

---

## Notes / safety

- **Auto-sequencing unchanged.** The create functions are not modified; invoices
  are still numbered automatically.
- **Backwards compatible.** The column is nullable and optional; old invoices
  simply show an empty description until edited.
- **Length cap.** The textarea is capped at 1000 characters in the UI; the DB
  column is unbounded `text`, so the cap is purely a UI nicety you can change.
- **What's *not* changed.** The journal-entry description used by the ledger
  reports is untouched; this feature only affects the invoice-level note shown in
  the entry forms.
