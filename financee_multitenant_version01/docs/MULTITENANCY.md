# Financee — Single‑Schema → Schema‑per‑Tenant Multi‑Tenancy

**Document type:** Implementation & migration guide
**System:** Financee — Accounting + Inventory Management (Django 5.2 + PostgreSQL 16)
**Change:** Convert the single (`public`) schema application into a PostgreSQL **schema‑per‑company** multi‑tenant system, one Django backend, one database.

---

## 1. Executive summary

Financee is a **"fat‑database" application**: every Django `models.py` is empty and *all* business logic lives in PostgreSQL — 22 tables, 171 stored functions, 14 views, 11 triggers, 21 sequences. The Python layer issues **341 raw `cursor.execute()` calls**, and **none of them schema‑qualify** their table or function names. They all resolve through the connection's `search_path`.

That single fact determines the entire design:

> If every business query already resolves through `search_path`, then we can isolate tenants **purely by setting `search_path` per request** — without touching a single view, template, SQL function, or query string.

So the conversion is **additive**, not invasive:

* A small `tenancy` Django app holds the tenant **registry** (`Company`, `Membership`) in the shared `public` schema.
* A **request‑scoped middleware** sets `search_path TO "tenant_company_<id>", public` at the start of each request and resets it at the end.
* Each company gets its **own schema** containing a full copy of the 22 tables / 171 functions / 14 views / 11 triggers / 21 sequences, created from a generated **tenant template** SQL file.
* User **identity stays shared** in `public.auth_user`; business rows still carry `created_by → public.auth_user(id)` as a cross‑schema foreign key.

No business view, template, JS, report, or SQL function body was rewritten.

---

## 2. Why **not** `django-tenants` (requirement #5 — "prefer if appropriate")

`django-tenants` is excellent, but it is **not appropriate here**, for three concrete reasons:

1. **Routing model mismatch.** `django-tenants` resolves the tenant from the **domain / subdomain** of the request, before authentication. Financee's requirement is the opposite: the tenant is whatever **company the authenticated user belongs to** (rule #1). All users hit the same host and log in normally.
2. **Its core value‑add is unusable here.** `django-tenants` provisions and migrates tenant schemas by running **Django ORM migrations** per schema (`migrate_schemas`). Financee has **no ORM business models** — all objects are raw SQL — so there is nothing for `migrate_schemas` to build. We would still have to load our own SQL template by hand.
3. **It imposes cost for no benefit.** It requires a custom DB backend, a `SHARED_APPS` / `TENANT_APPS` split, and a domain model, all to wrap a `SET search_path` we can issue ourselves in ~15 lines.

The chosen **custom middleware** approach gives exactly the required behaviour (authenticated user → company → schema → request‑scoped `search_path`) with the smallest possible, fully request‑safe footprint.

---

## 3. Shared vs. tenant: what lives where

### 3.1 Shared — stays in `public`

| Object | Why shared |
|---|---|
| `auth_user`, `auth_group`, `auth_permission`, `auth_*` (10 Django/auth tables) | One global identity & permission space; users are mapped to a company via the registry. |
| `django_migrations`, `django_content_type`, `django_session`, `django_admin_log` | Framework infrastructure. |
| **`tenancy_company`**, **`tenancy_membership`** (new) | The tenant registry itself. |
| Sequences owned by the above tables | Follow their tables. |

### 3.2 Tenant — copied into every `tenant_company_<id>`

| Object type | Count |
|---|---|
| Business tables | 22 |
| Stored functions | 171 |
| Views | 14 |
| Triggers | 11 |
| Sequences | 21 |
| Chart‑of‑Accounts structural seed | 2 inserts |

The 22 business tables: `chartofaccounts, journalentries, journallines, items, parties, purchaseinvoices, purchaseitems, purchaseunits, salesinvoices, salesitems, soldunits, payments, purchasereturnitems, purchasereturns, receipts, salesreturnitems, salesreturns, stockmovements, opening_cash, owner_equity_transactions, period_closes, contra_entries`.

> **Cross‑schema FK (intentional):** business tables keep `created_by integer REFERENCES public.auth_user(id)`. PostgreSQL fully supports a foreign key from a tenant schema to a `public` table. Identity stays shared; data isolates per schema.

> **Standalone sequences:** three reference‑number generators (`payments_ref_seq`, `receipts_ref_seq`, `contra_ref_seq`) are **not owned by a column**, so the production migration moves them explicitly (a plain `ALTER TABLE` would not carry them).

---

## 4. Request lifecycle (the isolation guarantee)

```
HTTP request
   ↓
SecurityMiddleware → SessionMiddleware → CommonMiddleware → CsrfViewMiddleware
   ↓
AuthenticationMiddleware            (populates request.user)
   ↓
TenantSchemaMiddleware  ← NEW
   • resolve schema from request.user.membership.company.schema_name
   • SET search_path TO "tenant_company_<id>", public   (this connection only)
   ↓
view runs → raw cursor.execute("SELECT … FROM SalesInvoices …")
            → unqualified names resolve into the tenant schema
   ↓
TenantSchemaMiddleware (response/finally)
   • SET search_path TO public        (always reset)
   ↓
HTTP response
```

**Resolution rules**

| Situation | `search_path` |
|---|---|
| Not authenticated (login page, static) | `public` |
| Authenticated, active company | `"tenant_company_<id>", public` |
| Authenticated, **no** membership (e.g. fresh superuser) | `public` |
| Authenticated, company inactive / no schema | `public` |

`public` is **always** on the path, so the custom admin and all shared tables keep working even while a tenant is active.

---

## 5. Why this is thread‑safe & request‑safe (requirement #4)

* **No global / singleton / process‑wide state.** The schema name is written only onto the local `request` object and onto the **current request's DB connection**. Nothing tenant‑specific is stored at module, class, or process level.
* **Set at the *start* of every request, reset in a `finally`.** Even with persistent connections (`CONN_MAX_AGE > 0`) a reused connection is re‑pointed before the first query of the new request runs, and an exception path still resets via `process_exception`.
* **Gunicorn sync workers** each handle one request at a time on their own connection, so two tenants can never observe one another's `search_path`. The model is also correct under gthread workers because each request re‑issues the `SET` on its own checked‑out connection before querying.

**Leakage test (requirement #14).** With User A (Company A) and User B (Company B) issuing requests simultaneously, each worker sets its own `search_path` at request start; an unqualified `SELECT … FROM Items` returns only the rows in that worker's active schema. Neither request can read the other's schema because neither schema name is ever shared between requests.

---

## 6. New / modified files

### 6.1 New Django app — `tenancy/`

| File | Purpose |
|---|---|
| `tenancy/__init__.py` | App package. |
| `tenancy/apps.py` | `AppConfig.ready()` wires signals + admin. |
| `tenancy/models.py` | `Company`, `Membership` registry (in `public`). |
| `tenancy/utils.py` | Schema‑name validation, `set_search_path` / `reset_search_path`, schema introspection helpers. |
| `tenancy/provisioning.py` | `provision_schema()` — builds a tenant schema from the SQL template, idempotently, in one transaction. |
| `tenancy/signals.py` | `post_save(Company)` → auto‑provision schema. |
| `tenancy/middleware.py` | `TenantSchemaMiddleware` — request‑scoped `search_path`. |
| `tenancy/admin.py` | Registers `Company` + `Membership` on the **custom** `financee_admin_site`. |
| `tenancy/migrations/0001_initial.py` | Creates `tenancy_company`, `tenancy_membership` (byte‑compatible with the SQL DDL). |
| `tenancy/management/commands/provision_tenant.py` | CLI: create a company + schema (+ optional owner). |
| `tenancy/sql/tenant_template.sql` | The per‑tenant object template (replayed into each schema). |

### 6.2 Modified files

| File | Change | Lines |
|---|---|---|
| `financee/settings.py` | Add `'tenancy'` to `INSTALLED_APPS`; add `'tenancy.middleware.TenantSchemaMiddleware'` **immediately after** `AuthenticationMiddleware`. | 2 small edits only |

**Nothing else in the existing codebase was modified.** No views, templates, URLs, business SQL, or the custom admin site were rewritten (requirements #16, #17).

### 6.3 SQL deliverables (in `sql/`)

| File | Use |
|---|---|
| `build_multitenant_db.sql` | **Fresh install.** One script that builds the whole new DB: shared Django tables + framework migration seed + `tenancy` registry tables + `tenancy` migration row + an example `tenant_company_1` schema + its registry row. Mirrors the original single build script, now multi‑tenant. |
| `tenant_template.sql` | The schema‑relative definition of all per‑tenant objects. Also shipped inside the app at `tenancy/sql/`. Used to provision every new tenant. |
| `migrate_existing_to_tenant.sql` | **Production conversion** of an existing, populated single‑schema DB: moves the 22 tables + 21 sequences into `tenant_company_1` via `ALTER … SET SCHEMA` (data preserved, FKs follow), recreates functions/views/triggers schema‑relative, registers "Company One", and maps **all existing `auth_user` rows** to it. Wrapped in `BEGIN/COMMIT`. |

---

## 7. Data model (registry)

```
public.tenancy_company
  id          bigint PK
  name        varchar(150) UNIQUE NOT NULL
  schema_name varchar(63)  UNIQUE NOT NULL   -- auto: tenant_company_<id>
  is_active   boolean NOT NULL DEFAULT true
  created_at  timestamptz NOT NULL DEFAULT now()

public.tenancy_membership
  id         bigint PK
  user_id    integer UNIQUE NOT NULL → public.auth_user(id)   -- UNIQUE ⇒ one company per user
  company_id bigint  NOT NULL        → public.tenancy_company(id)
  created_at timestamptz NOT NULL DEFAULT now()
```

* **Rule #1 (one user → one company)** is enforced at the database level by the `UNIQUE` on `tenancy_membership.user_id` (the `OneToOneField`). The admin surfaces a clear validation error on a second assignment.
* `schema_name` is **machine‑generated** as `tenant_company_<pk>` and is read‑only in the admin, so a schema name is always a safe SQL identifier and can never drift from its physical schema.

---

## 8. Provisioning flow (admin‑driven — requirement #18)

```
Admin → add Company "Acme Traders"
   ↓ save()  (2‑step: insert, then fill schema_name = tenant_company_<pk>)
   ↓ post_save signal
provision_schema("tenant_company_7"):
   BEGIN
     CREATE SCHEMA IF NOT EXISTS "tenant_company_7"
     SET check_function_bodies = false
     SET search_path TO "tenant_company_7", public
     <run tenant_template.sql>          -- 22 tables, 171 funcs, 14 views, 11 triggers, 21 seqs, CoA seed
     SET search_path TO public
   COMMIT
```

* **Idempotent:** provisioning is skipped if the schema already has tables, so the two‑step save (two `post_save` signals) and any re‑save are safe.
* **Atomic:** `CREATE SCHEMA` and every object are in one transaction — a failure leaves no half‑built tenant.
* Then: admin adds **Memberships** linking users to the company. Done — entirely from the admin panel.

CLI equivalent:

```bash
python manage.py provision_tenant "Acme Traders" --owner alice
```

---

## 9. Deployment / migration steps

### 9.1 Fresh installation

```bash
# 1. Create database, then build everything:
psql -d financee -f sql/build_multitenant_db.sql

# 2. Apply the authentication app's permission migrations (framework + tenancy
#    rows are already marked applied by the build script):
python manage.py migrate

# 3. Create a superuser for the admin:
python manage.py createsuperuser

# 4. In the admin: add Companies (schemas auto‑provision) and Memberships.
```

### 9.2 Converting an existing populated database

```bash
# 0. BACK UP FIRST.
pg_dump -Fc financee > financee_pre_tenant.dump

# 1. Run the conversion (moves data into tenant_company_1, maps all users):
psql -d financee -f sql/migrate_existing_to_tenant.sql

# 2. Deploy the new code (tenancy app + settings.py changes).
python manage.py migrate          # tenancy 0001 already marked applied
```

After 9.2 every existing user is a member of "Company One" (`tenant_company_1`) and sees exactly the data they had before — now isolated in its own schema. Add more companies from the admin.

---

## 10. Settings changes (exact)

`financee/settings.py` — two additions only:

```python
INSTALLED_APPS = [
    ...
    'contra',
    'opening_stock',
    'tenancy',                       # ← added (last)
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'tenancy.middleware.TenantSchemaMiddleware',   # ← added (right after auth)
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]
```

The database connection settings are unchanged — still one database via the existing env vars.

---

## 11. Validation performed

| Check | Result |
|---|---|
| All `tenancy` Python modules compile | ✅ |
| `manage.py check` on the app (faithful harness) | ✅ no errors |
| `0001_initial` matches models (`makemigrations --check`) | ✅ no missing migrations |
| `schema_name` auto‑generation (`tenant_company_<pk>`) | ✅ |
| Tenant resolution: A→A, B→B; anon/no‑member/inactive→`public` | ✅ |
| One‑user‑one‑company (DB `IntegrityError` on 2nd membership) | ✅ |
| `tenant_template.sql`: 22 tables / 171 funcs / 14 views / 11 triggers / 21 seqs | ✅ |
| `tenant_template.sql`: 0 stray `public.` refs on tenant objects | ✅ |
| `public.auth_user` cross‑schema FK retained | ✅ |
| Dollar‑quote balance (133 × `$$` + 38 × `$function$` = 171) | ✅ |
| `build_multitenant_db.sql`: only `auth_/django_/tenancy_` keep `public.` | ✅ |

### What this means for the functional checklist (requirement #13)

* **Login** — unchanged; uses the shared `public.auth_user`. Login pages run under `public`.
* **Reports / accounting / inventory / templates** — unchanged; their raw SQL resolves into the active tenant schema via `search_path`.
* **APIs** — unchanged; same request lifecycle applies.
* **Concurrent users / simultaneous tenants** — each request sets its own `search_path`; no shared tenant state (Section 5).

---

## 12. Assumptions

1. **Single DB, one identity space.** All users live in `public.auth_user`; a user belongs to exactly one company. Cross‑company users are out of scope by design (rule #1).
2. **Superusers** default to `public` (so the admin always works). A superuser who also needs business‑UI data can be given a Membership; otherwise the admin's cross‑schema "User Activity" page degrades gracefully (its existing `try/except` returns empty for business tables under `public`). An optional patch to make that page iterate tenant schemas is available but **not applied**, to honour "don't rewrite unrelated code".
3. **Deployment** uses Gunicorn (sync or gthread) behind Nginx, as specified. The design is correct for both; it does not rely on one worker class.
4. **Schema naming** is always `tenant_company_<pk>` (machine‑generated, validated `^[a-z_][a-z0-9_]{0,62}$`). Administrators never type schema names.
5. **No demo business data** existed in the original build; only the structural Chart‑of‑Accounts seed is reproduced per tenant.
6. **Backups** are taken before the production conversion (Section 9.2); the conversion script is transactional but irreversible once committed.

---

*Financee multi‑tenancy — additive, request‑scoped, isolation by `search_path`. No business logic was rewritten.*
