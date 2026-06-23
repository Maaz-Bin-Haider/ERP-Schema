# Financee — Admin Panel Upgrade

This package replaces the stock Django admin with a **light, professional** admin
panel that matches the dashboard look, adds a **User Activity** section, restricts
the whole panel to **superusers only**, and brands everything as **Financee —
Accounting Plus Inventory Management System, developed by Maaz Rehan**.

Everything here is **additive and admin‑only**. No business logic, no other
section, and no existing template/view was changed.

---

## 1. Files to add / replace

Copy these into your project, keeping the same folder structure. Paths are
relative to the Django project root (the folder that contains `manage.py`).

| File in this package | Where it goes | New or Replace |
|---|---|---|
| `financee/admin_site.py` | `financee/admin_site.py` | **NEW** |
| `financee/urls.py` | `financee/urls.py` | **REPLACE** |
| `templates/admin/base_site.html` | `templates/admin/base_site.html` | **NEW** |
| `templates/admin/index.html` | `templates/admin/index.html` | **NEW** |
| `templates/admin/user_activity.html` | `templates/admin/user_activity.html` | **NEW** |
| `templates/admin/user_activity_detail.html` | `templates/admin/user_activity_detail.html` | **NEW** |
| `static/css/financee_admin.css` | `static/css/financee_admin.css` | **NEW** |

> The `templates/admin/` folder is new — create it if it doesn't exist. Because
> your `TEMPLATES['DIRS']` already includes the project `templates/` folder,
> these files automatically override the default Django admin templates.

### What changed in `financee/urls.py`
Only the admin wiring changed (two lines). If you prefer to edit your existing
file by hand instead of replacing it:

```python
# add this import near the top
from financee.admin_site import financee_admin_site

# change this line …
path('admin/', admin.site.urls),
# … to this:
path('admin/', financee_admin_site.urls),
```

Everything else in `urls.py` is identical to your current file.

---

## 2. Database

Use **`build_current_db_version10.sql`** to build the database in one go. It is
your `build_current_db_version08.sql` plus the previously‑agreed
`add_party_from_json` change (records `created_by` on insert). **No admin‑specific
tables were added** — the User Activity section reads from data that already
exists (each table's `created_by` column, plus Django's `django_admin_log`).

```bash
createdb financee_db
psql -d financee_db -f build_current_db_version10.sql
# then, as usual, apply the permission migrations:
python manage.py migrate authentication
```

---

## 3. What you get

**Access control**
- The entire `/admin/` panel is now **superuser‑only**. A staff user who is not a
  superuser is redirected to the admin login (`/admin/login/?next=/admin/`).
  Anonymous users are redirected to login as before.

**Branding**
- Header shows the **Financee** mark + name + tagline “Accounting Plus Inventory
  Management System”.
- Every admin page footer reads “Developed by **Maaz Rehan**”.

**Light professional UI**
- Blue (`#2563eb`) accent, white surfaces, soft shadows, rounded cards and DM Sans
  — the same visual language as the dashboard. Implemented by overriding the
  admin CSS variables in `financee_admin.css`.

**Admin home (`/admin/`)**
- KPI cards (Total Users, Superusers, Active Users, Groups, Recorded Actions),
  quick links, the database‑schema note, plus the usual Users/Groups list and
  recent actions.

**User Activity (`/admin/user-activity/`)**
- A table of every user with: role, status, groups, **schema**, total recorded
  actions, admin actions, last login, last activity and join date.
- “Details” opens **`/admin/user-activity/<id>/`** — a per‑user page with a profile
  card, an activity breakdown (items, parties, payments, receipts, sales &
  purchase invoices, returns, contra, opening cash, owner equity) and the user's
  recent admin‑panel actions.

### About the “schema” column
This system is a **single‑schema** PostgreSQL application — all business tables
live in the `public` schema, so every user belongs to **`public`**. The value is
read live from the database (`information_schema`), not hard‑coded, so it stays
correct if you ever introduce additional schemas.

---

## 4. Testing performed

Tested against a fresh database built from `build_current_db_version10.sql`:

- Admin index, User Activity list and User Activity detail all return 200 for a
  superuser and show the correct branding and KPIs.
- Activity aggregation verified exactly (e.g. a user who created 3 items + 1 party
  shows a total of 4, broken down correctly).
- Superuser‑only gate verified: a staff‑but‑not‑superuser user and an anonymous
  user are both redirected to the admin login and never see the dashboard.
- Users & Groups admin still works; the model list is intact.
- Edge cases: a user with no activity renders cleanly; an invalid user id returns 404.
- No regression: the dashboard, Items hub, Parties hub and Accounts Reports pages
  all still load.
