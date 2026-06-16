# Sales Reports

Replaces the old **Profit Reports** section (Company Valuation is removed). A single page with a
left-panel report picker; each report supports a date range (defaults to the **current month**),
exports to **PDF/CSV**, and shows **live Chart.js graphs** where useful.

## The 8 reports

| Report | What it shows | Chart |
|---|---|---|
| **Sales Summary** | Net sales, cost, gross profit, margin, invoices, units, avg invoice, returns-in-period | Revenue composition doughnut |
| **Product Profitability** | Per product: units, revenue, cost, profit, margin % | Top-10 profit bar |
| **Customer Profitability** | Per customer: invoices, units, revenue, cost, profit, margin % | Top-10 profit bar |
| **Sales by Product** | Per product: units, revenue, % of sales | Top-10 revenue bar |
| **Sales by Customer** | Per customer: invoices, units, revenue, % of sales | Top-10 revenue bar |
| **Sale-wise Profit** | Per serial: date, product, serial, customer, sale, cost, profit, P %, vendor | — |
| **Sales Trend Dashboard** | Revenue / profit / units / invoices over time (day · week · month) | Revenue & profit line chart |
| **Invoice Register** | Invoices issued in range: #, date, customer, items, units, amount | — |

Columns are sortable (click a header). Each table has a totals row.

## Calculation rules

- **Revenue / cost / profit are computed at the serial level** — revenue is each unit's `sold_price`
  (which reconciles exactly to invoice totals), cost is that serial's actual purchase price, profit =
  revenue − cost.
- **Returned serials (`status='Returned'`) are excluded everywhere** — sales/profit reflect kept sales
  only. Sales Summary additionally shows a *Returns (in period)* figure (by return date) for visibility.
- **Invoice Register is gross/as-issued** — it lists invoices the way they were raised, so its totals can
  be slightly higher than the net sales figure (it still includes fully/partly returned invoices). That
  difference is expected: the register is a document list, the other reports are net-of-returns.

## Files

```
db/sales_reports.sql                                       -- view vw_sold_serial_profit + 8 functions
app/sales_reports/                                         -- the Django app
app/authentication/migrations/0019_add_sales_reports_permissions.py
app/templates/sales_reports_templates/sales_reports_template.html
app/static/css/sales_reports.css
app/static/js/sales_reports.js
```

## Install

**1. Database:**
```
psql -v ON_ERROR_STOP=1 -d <yourdb> -f db/sales_reports.sql
```
Creates `vw_sold_serial_profit` and eight `*_json(from, to)` functions (trend also takes a granularity).

**2. Django app** — copy `app/sales_reports/`, then:

`financee/settings.py` → add `'sales_reports'` to `INSTALLED_APPS`.

`financee/urls.py`:
```python
from sales_reports import urls as sales_reports_urls
...
    path('sales-reports/', include(sales_reports_urls, namespace='sales_reports')),
```

`templates/base/base.html` — the old "Profit Reports" link is replaced by a gated "Sales Reports" link
that appears when the user has any sales-report permission (already done in the working copy):
```html
{% if perms.auth.can_view_sales_summary or perms.auth.can_view_product_profitability or ... %}
<a href="{% url 'sales_reports:sales_reports' %}" ...><i class="fa-solid fa-chart-line"></i> Sales Reports</a>
{% endif %}
```

**3. Permissions:** copy `0019_add_sales_reports_permissions.py` into `authentication/migrations/`, then
`python manage.py migrate`. This creates 8 permissions (one per report):
`can_view_sales_summary`, `can_view_product_profitability`, `can_view_customer_profitability`,
`can_view_sales_by_product`, `can_view_sales_by_customer`, `can_view_sale_wise_profit`,
`can_view_sales_trend`, `can_view_invoice_register`. Grant whichever each user should see — the left
panel shows only their permitted reports, and each data endpoint enforces its own permission.

## Note on the old section

The Profit Reports sidebar link is removed. The old `accountsReports` `company_valuation` view/route
and `sale_wise_report` view are left in place but unlinked (no code deleted), so nothing else breaks.
They can be removed later if you want.

## Verified

Installed on a clone of production (real sales data) and tested through Django: the page renders (200)
when the user has any report permission and redirects otherwise; each endpoint enforces its own
permission (200 / 403); bad dates return 400. **Every report reconciles** — Summary, both Profitability
reports, both Sales-by reports and Sale-wise all return the same net sales and profit for the same range
(e.g. March 2026: net sales 1,938,753.21, gross profit 211,875.76, 921 units). The consolidated
single-file build (`build_current_db.sql`) including these objects builds clean on an empty database;
`manage.py check` and `makemigrations --check` are clean.
