from django.urls import path
from . import views

app_name = "opening_stock"

urlpatterns = [
    path("", views.opening_stock_page, name="opening_stock"),
    path("api/create/", views.create_opening_stock, name="create"),
    path("api/list/", views.list_opening_stock, name="list"),
    path("api/details/", views.opening_stock_details, name="details"),
    path("api/check-serials/", views.check_serials, name="check_serials"),
    path("api/delete/", views.delete_opening_stock, name="delete"),
    path("api/obe-status/", views.opening_balance_status, name="obe_status"),
    path("api/reclassify/", views.reclassify_opening_balance, name="reclassify"),
]
