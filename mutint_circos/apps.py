from django.apps import AppConfig


class CircosConfig(AppConfig):
    """The Circos plugin: the reference genome drawn as a circle, with the mutations of the
    samples a reader chooses marked around it.

    A page in the experiment section (**Circos**, at `/circos/`), a panel of the same name on
    the experiment's Overview, and an About section. Nothing is stored: the page is handed
    every sample and every present call of the experiment as JSON, and decides in the
    browser which of them to draw and on how many rings -- one ring for a set of samples,
    or one ring per time point of a population, innermost earliest.

    The design -- one ring, each mutation a mark coloured by its type, a deletion or
    amplification long enough to see drawn over its extent -- is that of
    https://github.com/PadmanabhanKann/genome_visualisation, which renders breseq output
    with NG-Circos. Nothing is copied from it: NG-Circos is licensed for non-commercial use
    only, which an MIT component cannot carry, so the drawing here is the plugin's own SVG.
    """

    name = 'mutint_circos'

    def ready(self):
        from django.urls import include, re_path
        from mutint_common.about_registry import register_about_section
        from mutint_common.nav_registry import EXPERIMENT_SECTION, register_nav_item
        from mutint_common.panel_registry import register_overview_panel
        from mutint_common.plugin_registry import register_plugin_urlpatterns
        from mutint_circos.panel import circos_panel_context
        from mutint_circos.version import __version__

        register_plugin_urlpatterns([
            re_path(r'^circos/', include('mutint_circos.urls')),
        ])
        register_nav_item('Circos', url_name='circos', section=EXPERIMENT_SECTION)

        register_overview_panel(self, name='circos', title='Circos',
                                template='circos/panel.html',
                                context=circos_panel_context)

        register_about_section(self, name='mutint-circos', version=__version__,
                               template='about/sections/mutint_circos.html')
