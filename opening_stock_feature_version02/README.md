# Opening Stock & Opening Balance Equity (onboarding)

Lets a business going live on the system load the **stock it already holds** —
fully serial-tracked and costed for COGS — **without** creating a fake vendor
payable, and cleanly separates that from the **party balances** it owes / is owed.

## The problem this solves

At go-live a business has existing stock *and* existing party balances. Until now
the only way to load stock was a purchase invoice, which always posts
`Debit Inventory / Credit Accounts Payable (vendor)`. That manufactures a payable —
which double-counts against the opening balance you set on that same vendor when
adding the party. The amount you *owe a vendor* and the *cost of stock you hold*
are two unrelated numbers.

## The approach (Opening Balance Equity)

Every opening figure is recorded independently and balanced against the dedicated
equity account **"Opening Balance" (3001)** — the Opening Balance Equity (OBE):

| Opening figure        | Journal posted                                  |
|-----------------------|-------------------------------------------------|
| Opening **stock**     | Debit Inventory / Credit Opening Balance        |
| Opening **receivable**| Debit A/R (party) / Credit Opening Balance      |
| Opening **payable**   | Debit Opening Balance / Credit A/P (party)      |
| Opening **cash**      | Debit Cash / Credit Opening Balance             |

Because opening stock balances against equity (not a vendor's A/P), it never
creates a payable. You set what you actually owe a vendor separately as that
party's opening balance. Once everything is entered, OBE equals the business's net
worth at conversion; a single **"Reclassify to Capital"** action sweeps it into
**Owner's Capital**, leaving OBE at zero and the books balanced.

## What's in this bundle

```
db/opening_stock.sql                                  -- all DB objects (idempotent)
app/opening_stock/                                    -- Django app (views, urls, app config)
app/authentication/migrations/0021_add_opening_stock_permissions.py
app/templates/opening_stock_templates/opening_stock_template.html
app/static/js/opening_stock_page.js
app/static/css/opening_stock.css
```

### Database (`db/opening_stock.sql`)
- Adds `purchaseinvoices.is_opening` (marks opening loads so the operational
  Purchases section never shows or counts them).
- `create_opening_stock(jsonb)` — validates serials (non-empty, unique in the
  payload and system-wide), loads serial units at cost, posts Debit Inventory /
  Credit Opening Balance, **no payable**. Accepts an optional reference vendor.
- `get_opening_stock_loads_json()`, `get_opening_stock_load_details(id)`,
  `delete_opening_stock(id)` (delete is blocked if any unit was already sold).
- `get_opening_balance_status_json()` and
  `reclassify_opening_balance_to_capital(jsonb)`.
- Re-anchors the three existing opening functions (`trg_party_opening_balance`,
  `update_party_from_json`, `set_opening_cash_from_json`) from *Owner's Capital* to
  *Opening Balance*, so **all** opening entries collect in OBE.
- Re-creates the six purchase navigation/summary functions with an `is_opening`
  filter so opening loads stay out of the Purchases screen.

> **Behaviour change to note:** after this, party opening balances and opening cash
> post to **Opening Balance (3001)** instead of Owner's Capital (3000). They are
> moved to Capital together via the one-click reclassification. This is the
> intended onboarding flow.

### Permissions (migration 0021)
`view_opening_stock`, `create_opening_stock`, `delete_opening_stock`,
`reclassify_opening_balance`.

### Report / dashboard isolation (Section 8 of the SQL)
A full audit was done of every function that reads `purchaseinvoices`. Opening
loads are now excluded from the three that would otherwise mis-count them:

- **monthly_income_statement** (Monthly Reports) — opening stock is no longer
  added to "Purchases", so loading stock no longer shows a false loss. Its cost
  lives in Opening Balance Equity / Capital, consistent with the cash-basis
  `Sales - Purchases - Expenses` model. (Per-serial margins for opening stock
  that later sells are available in the serial-level Sales Reports.)
- **fn_dash_top_vendors** — a referenced vendor's purchase total no longer
  includes opening loads.
- **fn_dash_recent_transactions** — opening loads don't appear in the feed.

Deliberately left unchanged (verified correct): **monthly_company_position**
still counts opening stock as inventory on hand (it is a real asset), and
**sale_wise_profit / Sales Reports** still cost opening-origin units correctly.
The six purchase navigation/summary functions already exclude opening loads.

### Entry UI (matches the Purchase section)
The Add-Opening-Stock form mirrors the Purchase invoice screen: item rows with a
keyboard-navigable item autocomplete, unit cost, auto-counted quantity, and
serial + comment pairs (one comment per serial, default "All Ok"). It supports
Bulk Paste (Excel), live duplicate/stock highlighting via `api/check-serials/`,
and keyboard navigation (Up/Down/Enter/Esc) on both the vendor and item
autocompletes. Per-serial comments are stored on each unit and shown in the
load's detail view.

## Install

1. Apply the SQL to your database:
   ```
   psql -d <your_db> -f db/opening_stock.sql
   ```
   (Already included at the end of the consolidated `build_current_db.sql`, so a
   fresh build needs nothing extra.)

2. Copy the app folders into your project (`opening_stock/`, the new template,
   JS, CSS, and the `authentication/migrations/0021_...` file).

3. Wire it in (three one-line edits):

   **`financee/settings.py`** — add to `INSTALLED_APPS` (after `'contra'`):
   ```python
   'opening_stock',
   ```

   **`financee/urls.py`** — import and include:
   ```python
   from opening_stock import urls as opening_stock_urls
   ...
   path('opening-stock/', include(opening_stock_urls, namespace='opening_stock')),
   ```

   **`templates/base/base.html`** — sidebar link (placed after "Set Opening"):
   ```html
   {% if perms.auth.view_opening_stock %}
   <a href="{% url 'opening_stock:opening_stock' %}" class="{% if request.resolver_match.url_name == 'opening_stock' %}active{% endif %}">
       <i class="fa-solid fa-boxes-stacked"></i> Opening Stock
   </a>
   {% endif %}
   ```

4. Create the permissions:
   ```
   python manage.py migrate
   ```
   Then grant the four `*_opening_stock` / `reclassify_opening_balance` permissions
   to the appropriate users/groups.

## Onboarding workflow for a new business

1. Set **Opening Cash** (existing Set Opening screen).
2. Add parties with their **opening balances** (what you owe / are owed).
3. Open **Opening Stock** and load each item with its unit cost and real serial
   numbers (optionally tag a reference vendor). Repeat per item.
4. When everything is in, the OBE banner shows the net opening equity — click
   **Reclassify to Capital** to move it into Owner's Capital.

Opening stock units are immediately sellable; when sold, COGS uses the cost you
entered, and the load can no longer be deleted (the delete guard blocks it).
