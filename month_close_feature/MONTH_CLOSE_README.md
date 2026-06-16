# Month-End Close

Records each month's **earned profit (Sales − COGS − Expenses)** into **Retained Earnings**
and keeps a month-by-month log, so you can see which month produced how much profit and
withdraw the accumulated total later (year-end or any time) from the **Owner Equity** page.

No cash is moved by a close, and your **Net Position is unchanged** — closing only shifts value
from the temporary income/expense accounts into the permanent Retained Earnings equity account.

---

## What a close does (your worked example)

A month with Sales 60,000 and COGS 50,000, no other expenses, posts one balanced journal
entry dated the last day of the month, tagged `Month-End Close YYYY-MM`:

| Account            | Debit  | Credit |
|--------------------|-------:|-------:|
| Sales Revenue      | 60,000 |        |
| Cost of Goods Sold |        | 50,000 |
| Retained Earnings  |        | 10,000 |

Afterwards Sales Revenue and COGS are back to zero for the next month, and Retained Earnings
holds 10,000. Over the year, Retained Earnings accumulates and the log shows the monthly split.

**Withdrawing:** use the existing **Owner Equity** page, choose *Retained Earnings*, and record a
withdrawal (Debit Retained Earnings / Credit Cash). Nothing new is needed for that.

---

## Files

```
db/month_end_close.sql                                  -- table + 4 functions
app/month_close/                                        -- the Django app
app/authentication/migrations/0018_add_month_close_permission.py
app/templates/month_close_templates/month_close_template.html
app/static/css/month_close.css
app/static/js/month_close.js
```

---

## Install

**1. Database** — run once against your database:

```
psql -v ON_ERROR_STOP=1 -d <yourdb> -f db/month_end_close.sql
```

This creates the `period_closes` table and four functions:

- `preview_period_close(year, month)` → the month's sales / cogs / expenses / profit + `already_closed`
- `close_period_from_json('{"year":..,"month":..,"created_by_id":..}')` → posts the closing entry, logs it
- `get_period_closes_json()` → `{ closed[], open[], total_closed_profit, retained_earnings_balance }`
- `reverse_period_close(year, month)` → removes the close + its journal entry, re-opens the month

**2. Django app** — copy `app/month_close/` into the project, then make three edits:

`financee/settings.py` — add to `INSTALLED_APPS`:
```python
    'month_close',
```

`financee/urls.py` — add the import and the route:
```python
from month_close import urls as month_close_urls
...
    path('month-close/', include(month_close_urls, namespace='month_close')),
```

`templates/base/base.html` — add a gated sidebar link (after the Owner Equity link):
```html
{% if perms.auth.can_close_period %}
<a href="{% url 'month_close:month_close' %}" class="{% if request.resolver_match.url_name == 'month_close' %}active{% endif %}">
    <i class="fa-solid fa-calendar-check"></i> Month-End Close
</a>
{% endif %}
```

**3. Permission** — copy `0018_add_month_close_permission.py` into `authentication/migrations/`, then:
```
python manage.py migrate
```
This creates the `auth.can_close_period` permission. Grant it to the users who may close periods.

---

## How the page works

- **Two stat cards:** total profit recognised, and the current Retained Earnings balance.
- **Open months:** every month that has sales/expense activity and isn't closed yet, with a preview
  of its earned profit and a **Close** button.
- **Closed months log:** month, sales, COGS, expenses, profit, closed-on date, with a **reverse**
  button — plus **PDF** and **CSV** export.

Closing is **manual / on-demand**: you decide when to close a month. The list shows what's still open.

---

## Behaviour & rules

- **Period-scoped, order-independent.** Each close reads only that month's dated transactions (and
  ignores other closing entries), so closing out of order or skipping a month still computes correctly.
- **One close per month.** Enforced by a uniqueness constraint — profit can't be double-counted.
- **Reversible.** A wrong close can be reversed; the entry and log row are removed and the month re-opens.
- **Back-dating caveat.** Close a month only after all its transactions are entered. If you back-date a
  transaction into an already-closed month, reverse and re-close that month to pick it up.

## Notes

- **Profit basis** is true earned profit, **Sales − COGS − Expenses**. This can differ from the
  Income Statement's *Sales − Purchases − Expenses* view in months where you buy stock you haven't
  sold yet — the close log is your earned-profit record; the Income Statement is the cash-style view.
- **Net Position** (Assets − Liabilities) is unaffected by a close. Trial balance stays balanced.
- **Brothers' split (future):** the accumulated Retained Earnings is what gets divided. A distribution
  step (Debit Retained Earnings, Credit each brother's capital account by share) sits on top of this,
  and each brother withdraws his slice through the Owner Equity page.

---

## Verified

Built on an empty database (consolidated build + `month_end_close.sql`) and tested end-to-end through
Django: page renders (200) for a permitted user and redirects (302) without the permission; the API
gates with 403; preview shows the correct profit; closing moves the profit into Retained Earnings;
double-close is blocked; reverse restores everything; Net Position is unchanged; the trial balance
stays balanced; `manage.py check` and `makemigrations --check` are clean (no model drift).
