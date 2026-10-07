"""What the Overview panel is handed: the whole experiment on one ring.

The panel sends the mutations and not the calls (`with_calls=False`): the Overview draws
every sample's mutations together, so which sample carries which is a payload it has no use
for. The page is where that is chosen.
"""

from mutint_circos.payload import circos_payload


def circos_panel_context(experiment, request):
    return {"circos_panel": circos_payload(experiment, with_calls=False),
            "experiment_id": experiment.id}
