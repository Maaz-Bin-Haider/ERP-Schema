# Contra Entry (Party-to-Party Transfer)

A new section that moves money between two parties in **one** balanced entry,
replacing the old manual workaround of recording a separate Receipt from one
party and a Payment to the other.

## What it does

Pick a **From** party and a **To** party, enter an amount, and the system posts
a single journal entry:

```
Debit   To-party   (AP control account, account_id = 1)   amount
Credit  From-party (AR control account, account_id = 6)    amount
```

No Cash account is touched. This is exactly what
`receipt-from-A  +  payment-to-B` nets out to (the Cash legs cancel).

### Direction (confirmed)
Transferring **From A → To B**:
- **From-party balance goes DOWN** (credited, like a receipt from A)
- **To-party balance goes UP** (debited, like a payment to B)

Example: A owes 10,000 and B owes 5,000. Transfer 3,000 from A to B →
A owes 7,000, B owes 8,000.

The entry is balanced, so the trial balance net is unchanged
(the system's pre-existing opening imbalance is untouched).

## Feature parity with Payments / Receipts
Live balance shown for **both** parties as you pick them · Previous/Next
navigation · Last-20 history list · Date-range filter · Edit · Delete ·
Keyboard shortcuts. Edits and deletes regenerate/remove the linked journal
entry automatically (via triggers), keeping the ledger consistent.

## Permissions (four, like Payments)
`view_contra_entry`, `create_contra_entry`, `update_contra_entry`,
`delete_contra_entry` — created by `authentication/migrations/0020`.
The sidebar link and page are gated by `view_contra_entry`; create/update/delete
each enforce their own permission (and the `view_only_users` group is blocked
from writes).

---

## Files in this bundle

```
db/contra_entry.sql                                  table + trigger + 10 functions
app/contra/                                           Django app (views, urls, apps, ...)
app/authentication/migrations/0020_add_contra_permissions.py
app/templates/contra_templates/contra.html           the page
app/static/js/contra_page.js                          page logic (jQuery)
app/static/css/contra.css                             page-specific styles (uses payment.css shell)
```

`db/contra_entry.sql` creates:
- table `public.contra_entries` (from_party_id credited, to_party_id debited,
  amount, contra_date, method default 'Transfer', reference_no, journal_id,
  description, notes, created_by, date_created; CHECK from<>to; CHECK amount>0)
- sequence `contra_ref_seq`
- trigger `trg_contra_journal` (AFTER INSERT/UPDATE/DELETE) that posts/rebuilds/
  removes the journal entry
- functions: `make_contra`, `update_contra`, `delete_contra`,
  `get_contra_details`, `get_previous_contra`, `get_next_contra`,
  `get_last_contra`, `get_last_20_contras_json`, `get_contras_by_date_json`
  (live balances reuse the existing `get_party_balance_by_name`)

## Install

1. **Database** — run the SQL against your database:
   ```
   psql -v ON_ERROR_STOP=1 -d <yourdb> -f db/contra_entry.sql
   ```
   (Already included in the consolidated `build_current_db.sql`.)

2. **App files** — copy `app/contra/` into your project, the migration into
   `authentication/migrations/`, and the template/js/css into their matching
   `templates/` and `static/` folders.

3. **Wire it in** (three small edits to existing files):

   - `financee/settings.py` — add `'contra'` to `INSTALLED_APPS`.

   - `financee/urls.py` — add the import and the include:
     ```python
     from contra import urls as contra_urls
     ...
     path('contra/', include(contra_urls, namespace='contra')),
     ```

   - `templates/base/base.html` — gated sidebar link (placed after Receipts):
     ```html
     {% if perms.auth.view_contra_entry %}
     <a href="{% url 'contra:contra' %}" class="{% if request.resolver_match.url_name == 'contra' %}active{% endif %}">
         <i class="fa-solid fa-right-left"></i> Contra Entry
     </a>
     {% endif %}
     ```

4. **Permissions** — run migrations to create the four permissions:
   ```
   python manage.py migrate
   ```
   Then grant them to the relevant users/groups in your admin.

### URL map
The app is included at prefix `contra/`, so endpoints resolve as:
`/contra/contra/` (page + create/update/delete POST),
`/contra/contra/get/` (prev/next/by-id),
`/contra/get-old-contras/`, `/contra/get-contras-date-wise/`,
`/contra/party-balance/`.

## Follow-up fixes (this revision)

**1. Party suggestion dropdown styling** — the autocomplete list on the Contra
page was missing row styling (the Payments styles are scoped to the `#suggestions`
ID and didn't apply here). `app/static/css/contra.css` now styles the
`.suggestions-box` rows directly (padding, hover, separators, keyboard-highlight)
using the app's theme tokens, including dark mode. No markup change needed.

**2. Ledger reports now recognise Contra entries** — added
`db/ledger_contra_support.sql`, which is a `CREATE OR REPLACE` for the two ledger
functions (`detailed_ledger` = Party Ledger, `detailed_ledger2` = Detailed
Ledger):
- **Detailed Ledger "Type" column** now shows **"Contra Entry"** instead of the
  generic "Entry" fallback (previously contra journals weren't mapped to a
  source type).
- **"Entry By" column** now resolves the user who made the contra entry, in
  **both** ledgers (previously blank because the author lookup didn't include
  `contra_entries`).
- The Detailed Ledger's expandable detail panel shows a Contra card
  (From → To, amount, reference, description).

Front-end touch-ups that pair with the SQL (already applied, included here):
`app/static/js/detailed_ledger2.js` adds a "Contra Entry" badge entry and detail
panel; `app/static/css/detailed_ledger2.css` adds the matching teal badge/row
styles. These two are **edits to existing shared files** — drop them over your
copies.

Run `db/ledger_contra_support.sql` against any existing database (it is safe to
re-run and is already appended to the consolidated `build_current_db.sql`):
```
psql -v ON_ERROR_STOP=1 -d <yourdb> -f db/ledger_contra_support.sql
```

## Verified
- DB layer on a production clone: create / update / flip parties / delete /
  same-party guard / navigation / last-20 / date-wise all correct; journal
  balanced; both party balances move as specified.
- Django end-to-end (test client): page 200 for permitted user and 302 for a
  user without `view_contra_entry`; create/update/delete post and reverse the
  journal and move both balances correctly; view-only user blocked from
  creating; navigation, last-20, date-wise and party-balance endpoints all 200
  with correct payloads; same-party transfer rejected; future date range
  rejected (matching Payments).
- `manage.py check` and `makemigrations --check` clean; `contra_page.js` passes
  `node --check`.
- Consolidated `build_current_db.sql` (with this feature appended) builds clean
  on an empty database, then `migrate` creates the four permissions.
