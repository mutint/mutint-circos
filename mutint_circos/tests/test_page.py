"""The page: its header, its sidebar entry, its payload and controls, and who may see it."""

import json
import re

from django.contrib.auth.models import User

from mutint_sample.models import ReferenceSequences

from mutint_circos.tests import fixture as fx


def payload(html, key="circos-data"):
    match = re.search(r'<script id="%s" type="application/json">(.*?)</script>' % key, html, re.S)
    return json.loads(match.group(1)) if match else None


class PageTestCase(fx.CircosFixture):

    def get(self):
        return self.client.get("/circos/", {"experiment_id": self.experiment.id})

    def test_the_page_renders_under_the_experiments_header(self):
        response = self.get()
        self.assertEqual(200, response.status_code)
        html = response.content.decode()
        self.assertIn('class="mutint-experiment-name">E</span></b> <span class="mutint-header-sep">&raquo;</span> Circos', html)
        self.assertIn('data-mode="sample">Sample</a>', html)
        self.assertIn('data-mode="population">Population</a>', html)
        self.assertIn('data-export="svg"', html)
        self.assertNotIn("view filter", html)
        self.assertIn("longer than 5 kb", html)

    def test_the_payload_and_the_picker_list_the_samples(self):
        html = self.get().content.decode()
        data = payload(html)
        self.assertEqual(4, len(data["samples"]))
        self.assertEqual(7, len(data["mutations"]))
        self.assertIn('data-role="sample"', html)
        for entry in data["samples"]:
            self.assertIn('<li data-value="%d"><a href="#">%s</a></li>' % (entry["id"], entry["label"]), html)
        self.assertIn('<option value="1">1</option>', html)
        self.assertNotIn('data-role="treatment"', html)

    def test_the_scripts_and_the_style_are_in_the_rendered_page(self):
        html = self.get().content.decode()
        self.assertIn("mutint_circos/circos.js", html)
        self.assertIn("mutint_circos/circos_plot.js", html)
        self.assertIn("mutint_circos/circos.css", html)
        self.assertIn('<symbol id="glyph-tombstone"', html)
        self.assertIn('href="#glyph-circle"', html)
        self.assertIn("background: #000000", html)

    def test_the_sidebar_and_the_header_bar_carry_the_entry(self):
        html = self.get().content.decode()
        self.assertIn('href="/circos/?experiment_id=%d">Circos</a>' % self.experiment.id, html)

    def test_without_a_reference_the_page_says_so(self):
        ReferenceSequences.objects.filter(experiment=self.experiment).delete()
        html = self.get().content.decode()
        self.assertIn("there is no circle to draw", html)
        self.assertNotIn('data-mode="population"', html)

    def test_without_an_experiment_the_page_says_so(self):
        response = self.client.get("/circos/")
        self.assertEqual(200, response.status_code)
        self.assertIsNone(payload(response.content.decode()))

    def test_a_reader_without_access_is_refused(self):
        outsider = User.objects.create(username="outsider", is_active=True)
        self.client.force_login(outsider)
        response = self.get()
        self.assertEqual(403, response.status_code)
        self.assertIsNone(payload(response.content.decode()))

    def test_the_about_page_lists_the_component(self):
        html = self.client.get("/about").content.decode()
        self.assertIn("mutint-circos", html)
        self.assertIn("genome_visualisation", html)

    def test_the_overview_carries_the_panel(self):
        html = self.client.get("/stats", {"experiment_id": self.experiment.id}, follow=True).content.decode()
        data = payload(html, "circos-panel-data")
        self.assertIsNotNone(data)
        self.assertEqual([], data["calls"])
        self.assertEqual(7, len(data["mutations"]))
        self.assertIn('href="/circos/?experiment_id=%d">Circos page</a>' % self.experiment.id, html)
        self.assertIn('<symbol id="glyph-tombstone"', html)


class PreferencesTestCase(fx.CircosFixture):

    def test_a_saved_choice_is_embedded_in_the_page(self):
        response = self.client.post("/preferences/", data=json.dumps({"key": "circos.mode", "value": "population"}),
                                    content_type="application/json")
        self.assertEqual(200, response.status_code)
        html = self.client.get("/circos/", {"experiment_id": self.experiment.id}).content.decode()
        self.assertEqual({"circos.mode": "population"}, payload(html, "circos-prefs"))

    def test_an_anonymous_reader_gets_no_prefs_block(self):
        from mutint_experiment.models import Project
        project = Project.objects.get()
        project.is_public = True
        project.save()
        self.client.logout()
        response = self.client.get("/circos/", {"experiment_id": self.experiment.id})
        if response.status_code == 200:
            self.assertIsNone(payload(response.content.decode(), "circos-prefs"))
