from django.urls import path
from . import views

app_name = "month_close"

urlpatterns = [
    path("", views.month_close_page, name="month_close"),
    path("api/overview/", views.get_overview, name="get_overview"),
    path("api/preview/", views.preview, name="preview"),
    path("api/close/", views.close_month, name="close_month"),
    path("api/reverse/", views.reverse_month, name="reverse_month"),
]
