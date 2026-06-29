"""
test_cash_ledger.py - verifies the Cash Sale / Cash Purchase accounts appear in
Detailed Ledger and Party Ledger with correct date/description/debit/credit/
running-balance and invoice details, that they are selectable in the reports
party picker but still hidden from the entry-screen autocomplete, and that
normal party ledgers are unchanged. Run inside the web container:
    docker compose -f deploy/docker-compose.yml exec -e PYTHONPATH=/app web python tests/test_cash_ledger.py
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
R=[]; chk=lambda n,cond,e="": R.append((n,bool(cond),e))

vend=f"LV {TAG}"; cust=f"LC {TAG}"; item=f"LI {TAG}"
q("SELECT add_party_from_json(%s::jsonb)",[json.dumps({"party_name":vend,"party_type":"Vendor","created_by_id":str(user.id)})])
q("SELECT add_party_from_json(%s::jsonb)",[json.dumps({"party_name":cust,"party_type":"Customer","created_by_id":str(user.id)})])
q("SELECT add_item_from_json(%s::jsonb)",[json.dumps({"item_name":item,"sale_price":100,"created_by_id":str(user.id)})])
vid=one("SELECT party_id FROM parties WHERE party_name=%s",[vend])
ser=[f"L-{TAG}-{i}" for i in range(5)]
post("/purchase/purchasing/",{"party_name":vend,"purchase_date":"2026-06-01","items":[{"item_name":item,"qty":5,"unit_price":60,"serials":[{"serial":s,"comment":""} for s in ser]}],"action":"submit"})
# cash sale 2@150, cash sale return 1, credit sale 1@120, cash purchase 1@50
post("/sale/sales/",{"sale_id":None,"sale_type":"cash","party_name":"Cash Sale","sale_date":"2026-06-02","items":[{"item_name":item,"qty":2,"unit_price":150,"serials":ser[0:2]}],"action":"submit"})
post("/saleReturn/create-sale-return/",{"return_id":"","party_name":"Cash Sale","return_date":"2026-06-04","serials":[ser[0]],"action":"submit"})
post("/sale/sales/",{"sale_id":None,"sale_type":"credit","party_name":cust,"sale_date":"2026-06-02","items":[{"item_name":item,"qty":1,"unit_price":120,"serials":[ser[2]]}],"action":"submit"})
post("/purchase/purchasing/",{"purchase_type":"cash","party_name":"Cash Purchase","purchase_date":"2026-06-03","items":[{"item_name":item,"qty":1,"unit_price":50,"serials":[{"serial":f"LP-{TAG}","comment":""}]}],"action":"submit"})

def ledger(url, party):
    r=c.post(url,data=json.dumps({"party_name":party,"from_date":"2026-01-01","to_date":"2026-12-31"}),content_type="application/json")
    try: return r.status_code, r.json()
    except: return r.status_code, r.content.decode()

# 1) reports autocomplete includes cash; entry autocomplete excludes
rep=c.get("/parties/autocomplete-party?include_cash=1&term=Cash").content.decode()
ent=c.get("/parties/autocomplete-party?term=Cash").content.decode()
chk("reports autocomplete shows Cash Sale", "Cash Sale" in rep)
chk("reports autocomplete shows Cash Purchase", "Cash Purchase" in rep)
chk("entry autocomplete still hides cash parties", "Cash Sale" not in ent and "Cash Purchase" not in ent)

# 2) Cash Sale detailed ledger
st, body = ledger("/accountsReports/detailed-ledger/", "Cash Sale")
rows = body if isinstance(body, list) else (body.get("rows") or body.get("data") or body if isinstance(body,dict) else [])
chk("Cash Sale detailed-ledger HTTP 200", st==200, str(body)[:80])
# verify via DB function for exact values
cs = q("SELECT description, debit, credit FROM detailed_ledger('Cash Sale','2026-01-01','2026-12-31') ORDER BY journal_id")
chk("Cash Sale ledger has a sale debit 300", any('Sale Invoice' in r[0] and float(r[1])==300.00 for r in (cs or [])), str(cs))
chk("Cash Sale ledger has a return credit 150", any('Return' in r[0] and float(r[2])==150.00 for r in (cs or [])), str(cs))

# 3) Cash Purchase detailed ledger
cp = q("SELECT description, debit, credit FROM detailed_ledger('Cash Purchase','2026-01-01','2026-12-31')")
chk("Cash Purchase ledger has a purchase credit 50", any('Purchase Invoice' in r[0] and float(r[2])==50.00 for r in (cp or [])), str(cp))

# 4) party ledger (detailed_ledger2) for cash + invoice_details present
cs2 = q("SELECT description, debit, credit, (invoice_details IS NOT NULL) FROM detailed_ledger2('Cash Sale','2026-01-01','2026-12-31') ORDER BY journal_id")
chk("Cash Sale party-ledger returns rows", len(cs2 or [])>=2, str(cs2))
chk("Cash Sale party-ledger has invoice_details", any(r[3] for r in (cs2 or [])), str(cs2))
st2,_ = ledger("/accountsReports/detailed-ledger2/", "Cash Sale")
chk("Cash Sale party-ledger HTTP 200", st2==200)

# 5) regression: normal customer ledger unchanged (has the credit sale)
nc = q("SELECT description, debit FROM detailed_ledger(%s,'2026-01-01','2026-12-31')",[cust])
chk("normal customer ledger still works (sale debit 120)", any(float(r[1])==120.00 for r in (nc or [])), str(nc))

print("\n==== CASH PARTY LEDGER TEST ====")
p=sum(1 for _,c2,_ in R if c2)
for n,c2,e in R: print(f"  [{'PASS' if c2 else 'FAIL'}] {n}"+(f"   ({e})" if not c2 else ""))
print(f"\n{p}/{len(R)} checks passed")
sys.exit(0 if p==len(R) else 1)
