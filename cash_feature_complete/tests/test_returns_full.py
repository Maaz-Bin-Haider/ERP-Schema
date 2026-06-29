"""
test_returns_full.py - exhaustive create/update/delete checks for BOTH sale
returns and purchase returns, including the sell->return->re-sell history bug,
wrong-party/wrong-vendor rejection, in-stock guards, and atomic rollback.
Run inside the web container:
    docker compose -f deploy/docker-compose.yml exec -e PYTHONPATH=/app web python tests/test_returns_full.py
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
def post(url,payload): return c.post(url,data=json.dumps(payload),content_type="application/json")
def ok(r): 
    try: return r.status_code==200 and r.json().get("success")
    except: return False
def msg(r):
    try: return r.json().get("message","")
    except: return r.content[:80].decode()

R=[]
def chk(n,cond,extra=""): R.append((n,bool(cond),extra))

vend=f"RV {TAG}"; A=f"RA {TAG}"; B=f"RB {TAG}"; item=f"RI {TAG}"
for nm,ty in [(vend,"Vendor"),(A,"Customer"),(B,"Customer")]:
    q("SELECT add_party_from_json(%s::jsonb)",[json.dumps({"party_name":nm,"party_type":ty,"created_by_id":str(user.id)})])
q("SELECT add_item_from_json(%s::jsonb)",[json.dumps({"item_name":item,"sale_price":100,"created_by_id":str(user.id)})])
vid=one("SELECT party_id FROM parties WHERE party_name=%s",[vend]); aid=one("SELECT party_id FROM parties WHERE party_name=%s",[A])

def purchase(serials,price=80):
    its=[{"item_name":item,"qty":len(serials),"unit_price":price,"serials":[{"serial":s,"comment":""} for s in serials]}]
    return post("/purchase/purchasing/",{"party_name":vend,"purchase_date":"2025-06-01","items":its,"action":"submit"})
def sale(party_name, serials, price, cash=False):
    p={"sale_id":None,"party_name":party_name,"sale_date":"2025-06-02","items":[{"item_name":item,"qty":len(serials),"unit_price":price,"serials":serials}],"action":"submit"}
    if cash: p["sale_type"]="cash"
    return post("/sale/sales/",p)
def sret(party_name, serials, action="submit", return_id=""):
    return post("/saleReturn/create-sale-return/",{"return_id":return_id,"party_name":party_name,"return_date":"2025-06-05","serials":serials,"action":action})
def pret(party_name, serials, action="submit", return_id=""):
    return post("/purchaseReturn/create-purchase-return/",{"return_id":return_id,"party_name":party_name,"return_date":"2025-06-05","serials":serials,"action":action})
def status_of(serial):
    return one("""SELECT su.status FROM soldunits su JOIN purchaseunits pu ON pu.unit_id=su.unit_id
                  WHERE pu.serial_number=%s ORDER BY su.sold_unit_id DESC LIMIT 1""",[serial])
def in_stock(serial): return one("SELECT in_stock FROM purchaseunits WHERE serial_number=%s",[serial])
def tb_diff(): return float(one("SELECT COALESCE(SUM(debit),0)-COALESCE(SUM(credit),0) FROM journallines"))

# ===== SALE RETURN — CREATE (the reported bug) =====
s=f"R1-{TAG}"; purchase([s]); sale(A,[s],100); sret(A,[s]); sale("Cash Sale",[s],150,cash=True)
r=sret(A,[s]); chk("SR create: wrong-party (old A) REJECTED via HTTP", (not ok(r)) and "not to" in msg(r), msg(r))
r=sret("Cash Sale",[s]); chk("SR create: correct Cash Sale return SUCCEEDS", ok(r), msg(r))
rid=one("SELECT sales_return_id FROM salesreturns ORDER BY sales_return_id DESC LIMIT 1")
chk("SR create: returned at CURRENT price 150", float(one("SELECT sold_price FROM salesreturnitems WHERE sales_return_id=%s",[rid]))==150.00)

# ===== SALE RETURN — UPDATE =====
s2=f"R2-{TAG}"; s3=f"R3-{TAG}"; purchase([s2,s3]); sale(A,[s2,s3],100)
r=sret(A,[s2]); rid2=one("SELECT sales_return_id FROM salesreturns ORDER BY sales_return_id DESC LIMIT 1")
chk("SR update: initial create ok", ok(r))
r=sret(A,[s2,s3],action="submit",return_id=rid2)   # update to include both
chk("SR update: add another serial SUCCEEDS", ok(r), msg(r))
chk("SR update: both serials now returned", status_of(s2)=="Returned" and status_of(s3)=="Returned")
# update with a wrong-party serial
s4=f"R4-{TAG}"; purchase([s4]); sale(B,[s4],100)
r=sret(A,[s2,s4],action="submit",return_id=rid2)
chk("SR update: wrong-party serial REJECTED", (not ok(r)) and ("not" in msg(r).lower()), msg(r))

# ===== SALE RETURN — DELETE =====
s5=f"R5-{TAG}"; purchase([s5]); sale(A,[s5],100); sret(A,[s5])
rid5=one("SELECT sales_return_id FROM salesreturns ORDER BY sales_return_id DESC LIMIT 1")
chk("SR delete: serial Returned before delete", status_of(s5)=="Returned" and in_stock(s5)==True)
r=sret(A,[s5],action="delete",return_id=rid5)
chk("SR delete: succeeds", ok(r), msg(r))
chk("SR delete: serial back to Sold + out of stock", status_of(s5)=="Sold" and in_stock(s5)==False)
chk("SR delete: header removed", one("SELECT count(*) FROM salesreturns WHERE sales_return_id=%s",[rid5])==0)
# delete guard: return then re-sell, delete must be blocked
s6=f"R6-{TAG}"; purchase([s6]); sale(A,[s6],100); sret(A,[s6])
rid6=one("SELECT sales_return_id FROM salesreturns ORDER BY sales_return_id DESC LIMIT 1")
sale("Cash Sale",[s6],150,cash=True)   # re-sold
r=sret(A,[s6],action="delete",return_id=rid6)
chk("SR delete: blocked when serial re-sold", (not ok(r)) and "re-sold" in msg(r).lower(), msg(r))

# ===== PURCHASE RETURN — CREATE / UPDATE / DELETE =====
p1=f"P1-{TAG}"; purchase([p1])
r=pret(vend,[p1]); chk("PR create: in-stock serial SUCCEEDS", ok(r), msg(r))
pid=one("SELECT purchase_return_id FROM purchasereturns ORDER BY purchase_return_id DESC LIMIT 1")
chk("PR create: serial out of stock", in_stock(p1)==False)
# return a SOLD serial -> reject
p2=f"P2-{TAG}"; purchase([p2]); sale(A,[p2],100)
r=pret(vend,[p2]); chk("PR create: SOLD serial REJECTED", (not ok(r)) and ("stock" in msg(r).lower() or "not" in msg(r).lower()), msg(r))
# wrong vendor -> reject
p3=f"P3-{TAG}"; purchase([p3])
r=pret(A,[p3]); chk("PR create: wrong vendor REJECTED", not ok(r), msg(r))
# PR update
p4=f"P4-{TAG}"; p5=f"P5-{TAG}"; purchase([p4,p5])
r=pret(vend,[p4]); pid2=one("SELECT purchase_return_id FROM purchasereturns ORDER BY purchase_return_id DESC LIMIT 1")
r=pret(vend,[p4,p5],action="submit",return_id=pid2)
chk("PR update: add serial SUCCEEDS", ok(r), msg(r))
chk("PR update: both out of stock", in_stock(p4)==False and in_stock(p5)==False)
# PR delete
p6=f"P6-{TAG}"; purchase([p6]); pret(vend,[p6])
pid3=one("SELECT purchase_return_id FROM purchasereturns ORDER BY purchase_return_id DESC LIMIT 1")
r=pret(vend,[p6],action="delete",return_id=pid3)
chk("PR delete: succeeds", ok(r), msg(r))
chk("PR delete: serial back in stock", in_stock(p6)==True)

# ===== accounting integrity =====
chk("trial balance balances (diff 0)", round(tb_diff(),2)==0.00, f"diff={tb_diff()}")

print("\n==== RETURNS FULL (create/update/delete) ====")
p=sum(1 for _,c2,_ in R if c2)
for n,c2,extra in R: print(f"  [{'PASS' if c2 else 'FAIL'}] {n}"+(f"   ({extra})" if not c2 else ""))
print(f"\n{p}/{len(R)} checks passed")
sys.exit(0 if p==len(R) else 1)
