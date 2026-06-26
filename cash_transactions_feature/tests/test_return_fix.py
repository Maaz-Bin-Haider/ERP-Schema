"""
test_return_fix.py - verifies serial-return data integrity:
  * a serial re-sold (cash or to another customer) cannot be returned to the
    original/wrong party, and a correct return uses the CURRENT sale price;
  * a serial currently sold to a customer cannot be purchase-returned, and a
    serial cannot be double-returned;
  * update_sale_return enforces the same party guard.
Run inside the web container:
    docker compose -f deploy/docker-compose.yml exec -e PYTHONPATH=/app web python tests/test_return_fix.py
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import os, sys, json, time
os.environ.setdefault("DJANGO_SETTINGS_MODULE","financee.settings")
import django; django.setup()
from django.db import connection
from django.contrib.auth import get_user_model
from tenancy.models import Company
TAG=time.strftime("%H%M%S")
user=get_user_model().objects.filter(is_superuser=True).first()
sch=Company.objects.first().schema_name
def q(sql,p=None,fetch=True):
    with connection.cursor() as cur:
        cur.execute(f'SET search_path TO "{sch}", public'); cur.execute(sql,p or [])
        if fetch:
            try: return cur.fetchall()
            except: return None
def one(sql,p=None):
    r=q(sql,p); return r[0][0] if r else None
def call(sql,p=None):
    try: q(sql,p,False); return (True,"")
    except Exception as e: return (False, str(e).strip().split("\n")[0])

R=[]
def chk(n,ok,extra=""): R.append((n,ok,extra))

vend=f"FX VEND {TAG}"; A=f"FX A {TAG}"; B=f"FX B {TAG}"; item=f"FX ITEM {TAG}"
for nm,ty in [(vend,"Vendor"),(A,"Customer"),(B,"Customer")]:
    q("SELECT add_party_from_json(%s::jsonb)",[json.dumps({"party_name":nm,"party_type":ty,"created_by_id":str(user.id)})],False)
q("SELECT add_item_from_json(%s::jsonb)",[json.dumps({"item_name":item,"sale_price":100,"created_by_id":str(user.id)})],False)
vid=one("SELECT party_id FROM parties WHERE party_name=%s",[vend])
aid=one("SELECT party_id FROM parties WHERE party_name=%s",[A])
bid=one("SELECT party_id FROM parties WHERE party_name=%s",[B])
cashid=one("SELECT get_cash_party_id('sale')")

def purchase(serial, price=50):
    q("SELECT create_purchase(%s,%s,%s::jsonb,%s)",[vid,"2025-06-01",json.dumps([{"item_name":item,"qty":1,"unit_price":price,"serials":[{"serial":serial,"comment":""}]}]),user.id],False)
def sale(party_id, serial, price):
    q("SELECT create_sale(%s,%s,%s::jsonb,%s)",[party_id,"2025-06-02",json.dumps([{"item_name":item,"qty":1,"unit_price":price,"serials":[serial]}]),user.id],False)

# ---- SCENARIO 1: the reported bug (cash re-sale) ----
s1=f"FX1-{TAG}"
purchase(s1,50); sale(aid,s1,100)                 # credit sale to A @100
q("SELECT create_sale_return(%s,%s::jsonb,%s)",[A,json.dumps([s1]),user.id],False)  # return from A
sale(cashid,s1,300)                                # cash sale @300
ok,msg=call("SELECT create_sale_return(%s,%s::jsonb,%s)",[A,json.dumps([s1]),user.id])
chk("BUG repro: wrong-party return REJECTED", (not ok) and "not sold to this customer" in msg, msg)
# correct cash return works at correct price
ok,_=call("SELECT create_sale_return(%s,%s::jsonb,%s)",["Cash Sale",json.dumps([s1]),user.id])
rid=one("SELECT sales_return_id FROM salesreturns ORDER BY sales_return_id DESC LIMIT 1")
price=one("SELECT sold_price FROM salesreturnitems WHERE sales_return_id=%s",[rid]) if rid else None
chk("correct cash return accepted @300 (current price)", ok and float(price)==300.00, f"price={price}")

# ---- SCENARIO 2: credit re-sale to a DIFFERENT customer ----
s2=f"FX2-{TAG}"
purchase(s2,50); sale(aid,s2,100); q("SELECT create_sale_return(%s,%s::jsonb,%s)",[A,json.dumps([s2]),user.id],False)
sale(bid,s2,120)                                   # now sold to B
okA,msgA=call("SELECT create_sale_return(%s,%s::jsonb,%s)",[A,json.dumps([s2]),user.id])
chk("re-sold to B: return to A REJECTED", (not okA) and "not sold to this customer" in msgA, msgA)
okB,_=call("SELECT create_sale_return(%s,%s::jsonb,%s)",[B,json.dumps([s2]),user.id])
rid2=one("SELECT sales_return_id FROM salesreturns ORDER BY sales_return_id DESC LIMIT 1")
price2=one("SELECT sold_price FROM salesreturnitems WHERE sales_return_id=%s",[rid2]) if okB else None
chk("return to B accepted @120 (current price)", okB and float(price2)==120.00, f"price={price2}")

# ---- SCENARIO 3: normal single sale return (regression) ----
s3=f"FX3-{TAG}"; purchase(s3,50); sale(aid,s3,150)
okn,_=call("SELECT create_sale_return(%s,%s::jsonb,%s)",[A,json.dumps([s3]),user.id])
chk("normal sale return still works", okn)

# ---- SCENARIO 4: PURCHASE RETURN in_stock guard ----
s4=f"FX4-{TAG}"; purchase(s4,50); sale(aid,s4,100)   # serial now SOLD (in_stock=FALSE)
okp,msgp=call("SELECT create_purchase_return(%s,%s::jsonb,%s)",[vend,json.dumps([s4]),user.id])
chk("purchase-return of a SOLD serial REJECTED", (not okp) and ("in stock" in msgp.lower()), msgp)
# unsold serial can be purchase-returned
s5=f"FX5-{TAG}"; purchase(s5,50)
okp2,_=call("SELECT create_purchase_return(%s,%s::jsonb,%s)",[vend,json.dumps([s5]),user.id])
chk("purchase-return of in-stock serial works", okp2)
# double purchase-return rejected
okp3,msgp3=call("SELECT create_purchase_return(%s,%s::jsonb,%s)",[vend,json.dumps([s5]),user.id])
chk("double purchase-return REJECTED", not okp3, msgp3)

# ---- SCENARIO 5: update_sale_return guard ----
s6=f"FX6-{TAG}"; purchase(s6,50); sale(aid,s6,100)
q("SELECT create_sale_return(%s,%s::jsonb,%s)",[A,json.dumps([s6]),user.id],False)
sr6=one("SELECT sales_return_id FROM salesreturns ORDER BY sales_return_id DESC LIMIT 1")
# re-sell s6 to cash, then try to update the A-return to include s6 again -> reject
sale(cashid,s6,300)
oku,msgu=call("SELECT update_sale_return(%s,%s::jsonb,%s)",[sr6,json.dumps([s6]),user.id])
chk("update_sale_return wrong-party REJECTED", (not oku) and "not sold to this customer" in msgu, msgu)

print("\n==== RETURN INTEGRITY FIX TEST ====")
p=sum(1 for _,ok,_ in R if ok)
for n,ok,extra in R: print(f"  [{'PASS' if ok else 'FAIL'}] {n}"+(f"   ({extra})" if not ok else ""))
print(f"\n{p}/{len(R)} checks passed")
sys.exit(0 if p==len(R) else 1)
