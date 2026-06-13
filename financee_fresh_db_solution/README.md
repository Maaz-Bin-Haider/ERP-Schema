# Fresh database — single SQL file, then `migrate`, and it all works

This solution was built and **tested end-to-end** against your actual Django 6.0 project on
PostgreSQL 16: a fresh empty database, the SQL file below, then `python manage.py migrate`. Result:
all 33 migrations applied, `manage.py check` clean, permissions created, and the resulting schema is
**byte-for-byte identical to production**.

---

## Two problems had to be fixed

1. **A bug in your own migrations (the real blocker).** Every
   `authentication/migrations/00xx_*.py` does
   `ContentType.objects.get(app_label='auth', model='user')`, and `0001` has **empty
   `dependencies`**. The `auth.user` content-type *row* is only created by Django's `post_migrate`
   signal at the very **end** of a `migrate` run, so a fresh single-pass `migrate` crashes with
   `ContentType.DoesNotExist`. (Production survived only because these migrations were applied
   incrementally over time, after earlier `migrate` runs had already populated the content types.)

2. **Django vs raw-SQL ownership.** `migrate` must own the 10 framework tables (`auth_*`,
   `django_*`); your 11 business apps have **empty models**, so their tables/sequences/functions/
   views/triggers come entirely from SQL.

### The fix for #1 (already applied in the files in `authentication/migrations/`)

Each migration now uses a self-sufficient lookup, and `0001` declares real dependencies:

```python
content_type, _ = ContentType.objects.get_or_create(app_label='auth', model='user')
```
```python
# 0001 only
dependencies = [
    ('contenttypes', '__latest__'),
    ('auth', '__latest__'),
]
```

`get_or_create` makes the migrations replay on any empty database in one pass without relying on
`post_migrate` timing. **Copy the 15 files in `authentication/migrations/` over the ones in your
project** (drop-in replacements; behaviour is otherwise unchanged).

---

## Recommended: one SQL file, then migrate  (matches your request exactly)

```bash
# 1. create an empty database and point .env at it
createdb financee                       # set DB_NAME=financee (and DB_USER/PASSWORD/HOST/PORT) in .env

# 2. run the single SQL file
psql -v ON_ERROR_STOP=1 -d financee -f build_full_schema_then_migrate.sql

# 3. migrate
python manage.py migrate
```

What happens:

* The SQL file creates the **complete schema** — all 28 tables (framework + business), 29 sequences,
  53 indexes, 103 constraints, 13 views, 124 functions, 8 triggers, 3 comments — and then marks the
  **18 framework migrations** (contenttypes, auth, admin, sessions) as already applied.
* `migrate` therefore runs only the **15 `authentication`** permission migrations, creating the
  permission rows. `migrate` finishes clean; `python manage.py migrate` again says
  *"No migrations to apply."*

**Verified:** `manage.py check` → 0 issues; 81 permissions present; schema identical to production.

---

## Alternative: migrate first, then one SQL file

If you'd rather let Django create its own tables the normal way:

```bash
createdb financee                       # set .env
python manage.py migrate                # builds the 10 framework tables + runs all 33 migrations
psql -v ON_ERROR_STOP=1 -d financee -f build_business_schema.sql   # business objects only
```

`build_business_schema.sql` contains **none** of the 10 Django tables, so it never collides with
`migrate`; its 8 foreign keys to `auth_user` resolve because `migrate` ran first. Also verified
identical to production.

> Use **one** of the two SQL files, not both. The patched `authentication` migrations are required
> for either path.

---

## Files

| File | Purpose |
|---|---|
| `authentication/migrations/*.py` | 15 patched migrations — copy over your project's copies (required) |
| `build_full_schema_then_migrate.sql` | Single-file build; run it, then `migrate` (recommended path) |
| `build_business_schema.sql` | Business objects only; run it *after* `migrate` (alternative path) |

All SQL targets an empty PostgreSQL 16 database and contains **no business data**.
