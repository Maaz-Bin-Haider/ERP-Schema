"""
URL configuration for financee project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.shortcuts import redirect

from financee.admin_site import financee_admin_site

from parties import urls as parties_urls
from items import urls as items_urls
from payments import urls as payments_urls
from receipts import urls as receipt_urls
from purchase import urls as purchase_urls
from sale import urls as sale_urls
from purchaseReturn import urls as purchase_return_urls
from home import urls as home_urls
from saleReturn import urls as sale_return_urls
from accountsReports import urls as account_reports_urls
from authentication import urls as authentication_urls
from set_opening import urls as set_opening_urls
from owner_equity import urls as owner_equity_urls
from month_close import urls as month_close_urls
from sales_reports import urls as sales_reports_urls
from contra import urls as contra_urls
from opening_stock import urls as opening_stock_urls


def redirect_to_home(request):
    if request.user.is_authenticated:
        return redirect('home:home')
    else:
        return redirect('authentication:login')

urlpatterns = [
    path('', redirect_to_home, name='home_redirect'),
    path('admin/', financee_admin_site.urls),
    path('parties/', include(parties_urls,namespace='parties')),
    path('items/', include(items_urls, namespace='items')),
    path('payments/',include(payments_urls,namespace='payments')),
    path('receipts/',include(receipt_urls, namespace='receipts')),
    path('purchase/',include(purchase_urls,namespace='purchase')),
    path('sale/',include(sale_urls,namespace='sale')),
    path('purchaseReturn/',include(purchase_return_urls,namespace='purchaseReturn')),
    path('saleReturn/',include(sale_return_urls,namespace='saleReturn')),
    path('home/', include(home_urls, namespace='home')),
    path('accountsReports/',include(account_reports_urls,namespace='accountsReports')),
    path('authentication/',include(authentication_urls,namespace='authentication')),
    path('set-opening/',include(set_opening_urls,namespace='set_opening')),
    path('owner-equity/', include(owner_equity_urls, namespace='owner_equity')),
    path('month-close/', include(month_close_urls, namespace='month_close')),
    path('sales-reports/', include(sales_reports_urls, namespace='sales_reports')),
    path('contra/', include(contra_urls, namespace='contra')),
    path('opening-stock/', include(opening_stock_urls, namespace='opening_stock')),
]
