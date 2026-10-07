"""The Circos page: the payload as JSON, the controls, and the plot the page's own scripts
draw."""

import logging

from django.http import HttpResponse
from django.shortcuts import render
from django.template import loader
from django.urls import reverse

import mutint_sample.views.common
from mutint_common.logger import user_extra
from mutint_common.preferences import get_preferences
from mutint_common.util import get_user_context
from mutint_experiment import models
from mutint_export.util import safe_filename
from mutint_circos.payload import ARC_THRESHOLD, COLORS, circos_payload

logger = logging.getLogger(__name__)

#: Every preference this page remembers is under this prefix.
PREFERENCE_PREFIX = "circos."


def circos(request):
    context = get_user_context(request.user)
    try:
        experiment = mutint_sample.views.common.get_experiment(request)
    except models.Experiment.DoesNotExist:
        return mutint_sample.views.common.no_experiment_selected(
            request, context, logger, "circos plot")
    except ValueError:
        return render(request, "403.html", context, status=403)

    data = circos_payload(experiment)
    user = request.user
    authenticated = bool(user is not None and user.is_authenticated)
    context.update({
        "experiment_id": experiment.id,
        "experiment_name": experiment.name,
        "project_name": experiment.project.name,
        "project_id": experiment.project.id,
        "title": experiment.name + " Circos",
        # What a download is named by: the project and the experiment, never an id.
        "file_stem": "%s_%s" % (safe_filename(experiment.project.name),
                                safe_filename(experiment.name)),
        "data": data,
        # Every row starts highlighted; the script turns off the ones the reader hid.
        "sample_ids": [entry["id"] for entry in data["samples"]],
        "legend": [(key, COLORS[key]) for key in COLORS],
        "arc_threshold_kb": ARC_THRESHOLD // 1000,
        "authenticated": authenticated,
        "preferences": get_preferences(user, PREFERENCE_PREFIX) if authenticated else {},
        "preferences_url": reverse("preferences"),
    })
    logger.info("circos page", extra=user_extra(request))
    return HttpResponse(loader.get_template("circos/page.html").render(context, request))
