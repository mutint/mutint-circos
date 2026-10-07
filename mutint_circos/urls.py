from django.urls import re_path

from mutint_circos import views

# Mounted at ^circos/ (apps.py). One route; the sidebar's entry reverses its name.
urlpatterns = [
    re_path(r'^$', views.circos, name='circos'),
]
