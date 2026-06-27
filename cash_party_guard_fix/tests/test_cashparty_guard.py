"""
test_cashparty_guard.py - verifies the cash sentinel parties are hidden from
the party autocomplete and cannot be used on credit sales/purchases, while the
Cash Sale/Cash Purchase TYPE toggle (and cash-sale updates) still work.
Run inside the web container:
    docker compose -f deploy/docker-compose.yml exec -e PYTHONPATH=/app web python tests/test_cashparty_guard.py
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import os, sys, json, time
os.environ.setdefault("DJANGO_SETTINGS_MODULE","financee.settings")
import django; django.setup()
from django.test import Client
from django.contrib.auth import get_user_model
from django.db import connection
from django.conf import settings
from tenancy.models import Company, Membership
TAG=time.strftime("%H%M%S")
user=get_user_model().objects.filter(is_superuser=True).first()
co=Company.objects.first(); Membership.objects.get_or_create(user=user, company=co)
allowed=[h for h in (settings.ALLOWED_HOSTS or []) if h not in ("*","")]
c=Client(SERVER_NAME=(allowed[0].lstrip(".") if allowed else "localhost")); c.force_login(user)
sch=co.schema_name
def q(s,p=None):
    with connection.cursor() as cur:
        cur.execute(f'SET search_path TO "{sch}", public'); cur.execute(s,p or [])
        try: return cur.fetchall()
        except: return None
def one(s,p=None):
    r=q(s,p); return r[0][0] if r else None
def post(u,p): return c.post(u,data=json.dumps(p),content_type="application/json")
def ok(r):
    try: return r.status_code==200 and r.json().get("success")
    except: return False
def msg(r):
    try: return r.json().get("message","")
    except: return ""
R=[]; chk=lambda n,c,e="": R.append((n,bool(c),e))

# ensure cash parties exist
one("SELECT get_cash_party_id('sale')"); one("SELECT get_cash_party_id('purchase')")
vend=f"GV {TAG}"; cust=f"GC {TAG}"; item=f"GI {TAG}"
q("SELECT add_party_from_json(%s::jsonb)",[json.dumps({"party_name":vend,"party_type":"Vendor","created_by_id":str(user.id)})])
q("SELECT add_party_from_json(%s::jsonb)",[json.dumps({"party_name":cust,"party_type":"Customer","created_by_id":str(user.id)})])
q("SELECT add_item_from_json(%s::jsonb)",[json.dumps({"item_name":item,"sale_price":100,"created_by_id":str(user.id)})])
vid=one("SELECT party_id FROM parties WHERE party_name=%s",[vend])

# 1) autocomplete excludes cash parties, includes normal
r=c.get("/parties/autocomplete-party?term=Cash")
body=r.content.decode()
chk("autocomplete hides 'Cash Sale'", "Cash Sale" not in body, body[:80])
chk("autocomplete hides 'Cash Purchase'", "Cash Purchase" not in body)
r=c.get(f"/parties/autocomplete-party?term=GC")
chk("autocomplete shows normal customer", cust in r.content.decode())

def stock(serials,price=50):
    post("/purchase/purchasing/",{"party_name":vend,"purchase_date":"2025-06-01","items":[{"item_name":item,"qty":len(serials),"unit_price":price,"serials":[{"serial":s,"comment":""} for s in serials]}],"action":"submit"})

# 2) THE BUG: credit sale selecting "Cash Purchase" -> REJECTED
s1=f"G1-{TAG}"; stock([s1])
r=post("/sale/sales/",{"sale_id":None,"sale_type":"credit","party_name":"Cash Purchase","sale_date":"2025-06-02","items":[{"item_name":item,"qty":1,"unit_price":100,"serials":[s1]}],"action":"submit"})
chk("credit sale + 'Cash Purchase' REJECTED", (not ok(r)) and "cash account" in msg(r).lower(), msg(r))
# 3) credit sale + "Cash Sale" also rejected (must use toggle)
r=post("/sale/sales/",{"sale_id":None,"sale_type":"credit","party_name":"Cash Sale","sale_date":"2025-06-02","items":[{"item_name":item,"qty":1,"unit_price":100,"serials":[s1]}],"action":"submit"})
chk("credit sale + 'Cash Sale' REJECTED", (not ok(r)) and "cash account" in msg(r).lower(), msg(r))
# 4) proper cash sale (toggle) still works
r=post("/sale/sales/",{"sale_id":None,"sale_type":"cash","party_name":"Cash Sale","sale_date":"2025-06-02","items":[{"item_name":item,"qty":1,"unit_price":100,"serials":[s1]}],"action":"submit"})
chk("cash sale via toggle still works", ok(r), msg(r))
# 5) normal credit sale works
s2=f"G2-{TAG}"; stock([s2])
r=post("/sale/sales/",{"sale_id":None,"sale_type":"credit","party_name":cust,"sale_date":"2025-06-02","items":[{"item_name":item,"qty":1,"unit_price":100,"serials":[s2]}],"action":"submit"})
chk("normal credit sale works", ok(r), msg(r))

# 6) PURCHASE: credit purchase + "Cash Sale" rejected
s3=f"G3-{TAG}"
r=post("/purchase/purchasing/",{"purchase_type":"credit","party_name":"Cash Sale","purchase_date":"2025-06-02","items":[{"item_name":item,"qty":1,"unit_price":40,"serials":[{"serial":s3,"comment":""}]}],"action":"submit"})
chk("credit purchase + 'Cash Sale' REJECTED", (not ok(r)) and "cash account" in msg(r).lower(), msg(r))
# 7) cash purchase via toggle works
r=post("/purchase/purchasing/",{"purchase_type":"cash","party_name":"Cash Purchase","purchase_date":"2025-06-02","items":[{"item_name":item,"qty":1,"unit_price":40,"serials":[{"serial":s3,"comment":""}]}],"action":"submit"})
chk("cash purchase via toggle works", ok(r), msg(r))

# 8) cash sale UPDATE still works (party stays Cash Sale, type cash)
sid=one("SELECT sales_invoice_id FROM salesinvoices WHERE customer_id=(SELECT party_id FROM parties WHERE party_name='Cash Sale') ORDER BY sales_invoice_id DESC LIMIT 1")
r=post("/sale/sales/",{"sale_id":sid,"sale_type":"cash","party_name":"Cash Sale","sale_date":"2025-06-02","items":[{"item_name":item,"qty":1,"unit_price":120,"serials":[s1]}],"action":"submit"})
chk("cash sale UPDATE still works", ok(r), msg(r))

print("\n==== CASH-PARTY GUARD TEST ====")
p=sum(1 for _,c2,_ in R if c2)
for n,c2,e in R: print(f"  [{'PASS' if c2 else 'FAIL'}] {n}"+(f"   ({e})" if not c2 else ""))
print(f"\n{p}/{len(R)} checks passed")
sys.exit(0 if p==len(R) else 1)
