"""
test_description.py — verifies the optional invoice "description" feature end to
end for Sale, Purchase, Sale-Return and Purchase-Return: it CREATEs each entry
with a description through the real HTTP views, confirms the value is stored, and
confirms it round-trips back through the navigation (get_current_*) endpoint.

Run inside the web container:
    docker compose -f deploy/docker-compose.yml exec -e PYTHONPATH=/app web \
        python tests/test_description.py
"""
import os, sys, json, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "financee.settings")
import django; django.setup()
from django.test import Client
from django.contrib.auth import get_user_model
from django.db import connection
from django.conf import settings
from tenancy.models import Company, Membership

TAG = time.strftime("%H%M%S")
U = get_user_model()
user = U.objects.filter(username="user1").first() or U.objects.filter(is_superuser=True).first()
if user is None:
    raise SystemExit("No superuser found.")
co = Company.objects.first()
Membership.objects.get_or_create(user=user, company=co)
allowed = [h for h in (settings.ALLOWED_HOSTS or []) if h not in ("*", "")]
SERVER = (allowed[0].lstrip(".") if allowed else "localhost")
c = Client(SERVER_NAME=SERVER); c.force_login(user)
sch = co.schema_name

def q(sql, params=None):
    with connection.cursor() as cur:
        cur.execute(f'SET search_path TO "{sch}", public'); cur.execute(sql, params or [])
        return cur.fetchone()
def post(url, payload): return c.post(url, data=json.dumps(payload), content_type="application/json")
def getj(url):
    d = c.get(url, HTTP_X_REQUESTED_WITH="XMLHttpRequest").json()
    return json.loads(d) if isinstance(d, str) else d

results = []
def check(name, ok, extra=""): results.append((name, ok, extra))

cust, vend, item = f"DA CUST {TAG}", f"DA VEND {TAG}", f"DA ITEM {TAG}"
q("SELECT add_party_from_json(%s::jsonb)", [json.dumps({"party_name": cust, "party_type": "Customer", "created_by_id": str(user.id)})])
q("SELECT add_party_from_json(%s::jsonb)", [json.dumps({"party_name": vend, "party_type": "Vendor", "created_by_id": str(user.id)})])
q("SELECT add_item_from_json(%s::jsonb)", [json.dumps({"item_name": item, "sale_price": 100, "created_by_id": str(user.id)})])

DESC_P = f"PO note {TAG}"; pser = [f"DA-P-{TAG}-{i}" for i in range(4)]
pitems = [{"item_name": item, "qty": 4, "unit_price": 80, "serials": [{"serial": s, "comment": ""} for s in pser]}]
post("/purchase/purchasing/", {"party_name": vend, "purchase_date": "2025-06-01", "items": pitems, "action": "submit", "description": DESC_P})
pi = q("SELECT purchase_invoice_id FROM purchaseinvoices WHERE description=%s ORDER BY 1 DESC LIMIT 1", [DESC_P])
check("purchase create+store", bool(pi))
if pi: check("purchase read-back", getj(f"/purchase/get-purchase/?action=current&current_id={pi[0]}").get("description") == DESC_P)

DESC_S = f"SO note {TAG}"; sser = pser[:2]
post("/sale/sales/", {"sale_id": None, "party_name": cust, "sale_date": "2025-06-02",
     "items": [{"item_name": item, "qty": 2, "unit_price": 100, "serials": sser}], "action": "submit", "description": DESC_S})
si = q("SELECT sales_invoice_id FROM salesinvoices WHERE description=%s ORDER BY 1 DESC LIMIT 1", [DESC_S])
check("sale create+store", bool(si))
if si: check("sale read-back", getj(f"/sale/get-sale/?action=current&current_id={si[0]}").get("description") == DESC_S)

DESC_SR = f"SR note {TAG}"
post("/saleReturn/create-sale-return/", {"return_id": "", "party_name": cust, "return_date": "2025-06-03",
     "serials": [sser[0]], "action": "submit", "description": DESC_SR})
sr = q("SELECT sales_return_id FROM salesreturns WHERE description=%s ORDER BY 1 DESC LIMIT 1", [DESC_SR])
check("sale-return create+store", bool(sr))
if sr: check("sale-return read-back", getj(f"/saleReturn/get-sale-return/?action=current&current_id={sr[0]}").get("description") == DESC_SR)

DESC_PR = f"PR note {TAG}"
post("/purchaseReturn/create-purchase-return/", {"return_id": "", "party_name": vend, "return_date": "2025-06-03",
     "serials": [pser[2]], "action": "submit", "description": DESC_PR})
pr = q("SELECT purchase_return_id FROM purchasereturns WHERE description=%s ORDER BY 1 DESC LIMIT 1", [DESC_PR])
check("purchase-return create+store", bool(pr))
if pr: check("purchase-return read-back", getj(f"/purchaseReturn/get-purchase-return/?action=current&current_id={pr[0]}").get("description") == DESC_PR)

print("\n==== INVOICE DESCRIPTION FEATURE TEST ====")
passed = sum(1 for _, ok, _ in results if ok)
for name, ok, extra in results:
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}")
print(f"\n{passed}/{len(results)} checks passed")
sys.exit(0 if passed == len(results) else 1)
