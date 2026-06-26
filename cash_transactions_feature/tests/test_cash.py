"""
test_cash.py - verifies Cash Sale / Cash Purchase and their returns end-to-end:
cash balance moves correctly, NO receivable/payable is created, the sentinel cash
parties never accrue a balance, credit flow is unchanged, and the trial balance
still balances. Run inside the web container:
    docker compose -f deploy/docker-compose.yml exec -e PYTHONPATH=/app web python tests/test_cash.py
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
U=get_user_model(); user=U.objects.filter(is_superuser=True).first()
co=Company.objects.first(); Membership.objects.get_or_create(user=user, company=co)
allowed=[h for h in (settings.ALLOWED_HOSTS or []) if h not in ("*","")]
c=Client(SERVER_NAME=(allowed[0].lstrip(".") if allowed else "localhost")); c.force_login(user)
sch=co.schema_name
def q(sql, params=None):
    with connection.cursor() as cur:
        cur.execute(f'SET search_path TO "{sch}", public'); cur.execute(sql, params or [])
        try: return cur.fetchone()
        except: return None
def post(url, payload): return c.post(url, data=json.dumps(payload), content_type="application/json")

def cash_balance():
    return float(q("SELECT COALESCE(SUM(jl.debit-jl.credit),0) FROM journallines jl JOIN chartofaccounts a ON a.account_id=jl.account_id WHERE a.account_name='Cash'")[0])
def party_balance(name):
    r=q("SELECT COALESCE(SUM(jl.debit-jl.credit),0) FROM journallines jl JOIN parties p ON p.party_id=jl.party_id WHERE p.party_name=%s",[name])
    return float(r[0]) if r else 0.0
def ar_lines_for(journal_id):
    # count journal lines hitting AR/AP control accounts
    r=q("SELECT count(*) FROM journallines jl JOIN chartofaccounts a ON a.account_id=jl.account_id WHERE jl.journal_id=%s AND a.account_name IN ('Accounts Receivable','Accounts Payable')",[journal_id])
    return int(r[0])
def trial_balance_diff():
    r=q("SELECT COALESCE(SUM(debit),0)-COALESCE(SUM(credit),0) FROM journallines")
    return float(r[0])

results=[]
def chk(name, ok, extra=""): results.append((name,ok,extra))

item=f"CASH ITEM {TAG}"; vend=f"CASH VEND {TAG}"
q("SELECT add_party_from_json(%s::jsonb)", [json.dumps({"party_name":vend,"party_type":"Vendor","created_by_id":str(user.id)})])
q("SELECT add_item_from_json(%s::jsonb)", [json.dumps({"item_name":item,"sale_price":100,"created_by_id":str(user.id)})])

# stock via a CREDIT purchase (so sale has serials)
pser=[f"CASH-{TAG}-{i}" for i in range(6)]
pitems=[{"item_name":item,"qty":6,"unit_price":50,"serials":[{"serial":s,"comment":""} for s in pser]}]
post("/purchase/purchasing/", {"party_name":vend,"purchase_date":"2025-06-01","items":pitems,"action":"submit"})

cash0=cash_balance()

# ---- 1) CASH SALE ----
r=post("/sale/sales/", {"sale_id":None,"sale_type":"cash","party_name":"IGNORED","sale_date":"2025-06-02",
        "items":[{"item_name":item,"qty":2,"unit_price":100,"serials":pser[0:2]}],"action":"submit"})
si=q("SELECT sales_invoice_id, journal_id FROM salesinvoices ORDER BY sales_invoice_id DESC LIMIT 1")
cash1=cash_balance()
chk("cash sale: HTTP ok", r.status_code==200 and r.json().get("success"))
chk("cash sale: cash +200", round(cash1-cash0,2)==200.00, f"delta={cash1-cash0}")
chk("cash sale: NO AR line", ar_lines_for(si[1])==0)
chk("cash sale: Cash Sale party balance == 0", party_balance("Cash Sale")==0.0)

# ---- 2) CREDIT SALE regression ----
realcust=f"REAL CUST {TAG}"
q("SELECT add_party_from_json(%s::jsonb)", [json.dumps({"party_name":realcust,"party_type":"Customer","created_by_id":str(user.id)})])
cashA=cash_balance()
r=post("/sale/sales/", {"sale_id":None,"sale_type":"credit","party_name":realcust,"sale_date":"2025-06-02",
        "items":[{"item_name":item,"qty":1,"unit_price":100,"serials":[pser[2]]}],"action":"submit"})
si2=q("SELECT sales_invoice_id, journal_id FROM salesinvoices ORDER BY sales_invoice_id DESC LIMIT 1")
chk("credit sale: cash unchanged", cash_balance()==cashA)
chk("credit sale: has AR line", ar_lines_for(si2[1])==1)
chk("credit sale: customer AR balance +100", round(party_balance(realcust),2)==100.00)

# ---- 3) CASH PURCHASE ----
cashB=cash_balance()
cpser=[f"CASHP-{TAG}-{i}" for i in range(2)]
r=post("/purchase/purchasing/", {"purchase_type":"cash","party_name":"IGNORED","purchase_date":"2025-06-03",
        "items":[{"item_name":item,"qty":2,"unit_price":40,"serials":[{"serial":s,"comment":""} for s in cpser]}],"action":"submit"})
pi=q("SELECT purchase_invoice_id, journal_id FROM purchaseinvoices ORDER BY purchase_invoice_id DESC LIMIT 1")
chk("cash purchase: HTTP ok", r.status_code==200 and r.json().get("success"))
chk("cash purchase: cash -80", round(cash_balance()-cashB,2)==-80.00, f"delta={cash_balance()-cashB}")
chk("cash purchase: NO AP line", ar_lines_for(pi[1])==0)
chk("cash purchase: Cash Purchase party balance == 0", party_balance("Cash Purchase")==0.0)

# ---- 4) CASH SALE RETURN (return 1 serial sold in the cash sale) ----
cashC=cash_balance()
r=post("/saleReturn/create-sale-return/", {"return_id":"","party_name":"Cash Sale","return_date":"2025-06-04",
        "serials":[pser[0]],"action":"submit"})
sr=q("SELECT sales_return_id, journal_id FROM salesreturns ORDER BY sales_return_id DESC LIMIT 1")
chk("cash sale return: HTTP ok", r.status_code==200 and r.json().get("success"), r.content[:80].decode())
chk("cash sale return: cash -100 (refund out)", round(cash_balance()-cashC,2)==-100.00, f"delta={cash_balance()-cashC}")
chk("cash sale return: NO AR line", sr and ar_lines_for(sr[1])==0)

# ---- 5) CASH PURCHASE RETURN (return 1 unsold serial from the cash purchase) ----
cashD=cash_balance()
r=post("/purchaseReturn/create-purchase-return/", {"return_id":"","party_name":"Cash Purchase","return_date":"2025-06-04",
        "serials":[cpser[0]],"action":"submit"})
pr=q("SELECT purchase_return_id, journal_id FROM purchasereturns ORDER BY purchase_return_id DESC LIMIT 1")
chk("cash purchase return: HTTP ok", r.status_code==200 and r.json().get("success"), r.content[:80].decode())
chk("cash purchase return: cash +40 (refund in)", round(cash_balance()-cashD,2)==40.00, f"delta={cash_balance()-cashD}")
chk("cash purchase return: NO AP line", pr and ar_lines_for(pr[1])==0)

# ---- 6) Accounting integrity ----
chk("trial balance still balances (diff 0)", round(trial_balance_diff(),2)==0.00, f"diff={trial_balance_diff()}")
chk("Cash Sale party never accrues balance", party_balance("Cash Sale")==0.0)
chk("Cash Purchase party never accrues balance", party_balance("Cash Purchase")==0.0)

print("\n==== CASH TRANSACTIONS TEST ====")
p=sum(1 for _,ok,_ in results if ok)
for name,ok,extra in results:
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f"   ({extra})" if (not ok and extra) else ""))
print(f"\n{p}/{len(results)} checks passed")
sys.exit(0 if p==len(results) else 1)
