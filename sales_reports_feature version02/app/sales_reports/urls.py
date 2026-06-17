from django.urls import path
from . import views

app_name = "sales_reports"

urlpatterns = [
    path("", views.sales_reports_page, name="sales_reports"),
    path("api/summary/",               views.api_summary,               name="api_summary"),
    path("api/product-profitability/", views.api_product_profitability, name="api_product_profitability"),
    path("api/customer-profitability/",views.api_customer_profitability,name="api_customer_profitability"),
    path("api/sales-by-product/",      views.api_sales_by_product,      name="api_sales_by_product"),
    path("api/sales-by-customer/",     views.api_sales_by_customer,     name="api_sales_by_customer"),
    path("api/sale-wise/",             views.api_sale_wise,             name="api_sale_wise"),
    path("api/trend/",                 views.api_trend,                 name="api_trend"),
    path("api/invoice-register/",      views.api_invoice_register,      name="api_invoice_register"),
]
