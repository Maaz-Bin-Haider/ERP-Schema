from django.urls import path
from .views import (
    make_contra, get_contra, get_old_contras,
    get_contras_date_wise, get_party_balance,
)

app_name = "contra"

urlpatterns = [
    path("contra/", make_contra, name="contra"),
    path("contra/get/", get_contra, name="get_contra"),
    path("get-old-contras/", get_old_contras, name="get_old_contras"),
    path("get-contras-date-wise/", get_contras_date_wise, name="get_contras_date_wise"),
    path("party-balance/", get_party_balance, name="get_party_balance"),
]
