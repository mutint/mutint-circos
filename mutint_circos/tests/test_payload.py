"""The payload: contigs from the reference, samples in order, present calls with the ancestor
subtracted, and each mutation's extent and whether it draws as an arc."""

from mutint_sample.models import ReferenceSequences

from mutint_circos import payload
from mutint_circos.tests import fixture as fx


class PayloadTestCase(fx.CircosFixture):

    def test_the_contigs_come_from_the_reference(self):
        data = payload.circos_payload(self.experiment)
        self.assertTrue(data["has_reference"])
        self.assertEqual([{"id": fx.SEQ_ID, "length": fx.LENGTH, "circular": False}], data["contigs"])
        self.assertEqual(fx.LENGTH, data["total_length"])
        self.assertEqual(payload.ARC_THRESHOLD, data["arc_threshold"])

    def test_without_a_reference_there_is_nothing_to_draw(self):
        ReferenceSequences.objects.filter(experiment=self.experiment).delete()
        data = payload.circos_payload(self.experiment)
        self.assertFalse(data["has_reference"])
        self.assertEqual([], data["contigs"])

    def test_the_samples_carry_their_place_in_the_experiment(self):
        data = payload.circos_payload(self.experiment)
        by_source = {}
        for entry in data["samples"]:
            by_source[self.sample_source(entry["id"])] = entry
        self.assertEqual({"1-100-1-1", "1-100-2-1", "1-500-1-1", "2-100-1-1"}, set(by_source))
        first = by_source["1-100-1-1"]
        self.assertEqual(("1", 100.0, "100"), (first["population"], first["time_point"], first["time_label"]))
        self.assertEqual("500", by_source["1-500-1-1"]["time_label"])
        self.assertEqual("2", by_source["2-100-1-1"]["population"])
        self.assertTrue(first["is_clonal"])
        self.assertEqual("/mutations/breseq?experiment_id=%d&sample_id=%d"
                         % (self.experiment.id, first["id"]), first["url"])
        self.assertEqual(["1", "2"], data["populations"])
        self.assertEqual([], data["treatments"])

    def sample_source(self, sample_id):
        from mutint_sample.models import Sample
        return Sample.objects.get(pk=sample_id).source_name

    def test_each_mutation_has_an_extent_and_long_ones_are_arcs(self):
        data = payload.circos_payload(self.experiment)
        by_key = {(m["type"], m["start"]): m for m in data["mutations"]}
        self.assertEqual({("SNP", 100), ("SNP", 150), ("DEL", 200), ("DEL", 1000),
                          ("AMP", 300), ("MOB", 400)}, set(by_key))
        big = by_key[("DEL", 1000)]
        self.assertTrue(big["span"])
        self.assertEqual((1000, 6999, 6000), (big["start"], big["end"], big["length"]))
        self.assertEqual("del 6000 bp", big["change"])
        self.assertFalse(by_key[("DEL", 200)]["span"])
        self.assertEqual(201, by_key[("DEL", 200)]["end"])
        self.assertFalse(by_key[("AMP", 300)]["span"])
        self.assertFalse(by_key[("SNP", 100)]["span"])
        self.assertEqual(100, by_key[("SNP", 100)]["end"])
        self.assertFalse(by_key[("MOB", 400)]["span"])
        self.assertIn("IS1", by_key[("MOB", 400)]["change"])

    def test_the_calls_name_present_observations_with_their_frequency(self):
        data = payload.circos_payload(self.experiment)
        mixed = self.sample("1-500-1-1")
        snp150 = [m for m in data["mutations"] if m["start"] == 150][0]
        calls = [c for c in data["calls"] if c[0] == mixed.id and c[1] == snp150["id"]]
        self.assertEqual(1, len(calls))
        self.assertAlmostEqual(0.42, calls[0][2], places=3)
        shared = [m for m in data["mutations"] if m["start"] == 100][0]
        self.assertEqual(4, len([c for c in data["calls"] if c[1] == shared["id"]]))

    def test_the_ancestor_is_subtracted(self):
        self.experiment.set_ancestor(self.sample("2-100-1-1"))
        data = payload.circos_payload(self.experiment)
        self.assertNotIn("2", data["populations"])
        self.assertEqual(3, len(data["samples"]))
        self.assertNotIn(100, [m["start"] for m in data["mutations"]])
        self.assertTrue(all(c[1] in {m["id"] for m in data["mutations"]} for c in data["calls"]))

    def test_the_panel_payload_has_the_mutations_and_no_calls(self):
        data = payload.circos_payload(self.experiment, with_calls=False)
        self.assertEqual([], data["calls"])
        self.assertEqual(6, len(data["mutations"]))

    def test_is_span_draws_the_boundary_at_the_threshold(self):
        self.assertFalse(payload.is_span("DEL", 1, payload.ARC_THRESHOLD))
        self.assertTrue(payload.is_span("DEL", 1, payload.ARC_THRESHOLD + 1))
        self.assertFalse(payload.is_span("SNP", 1, payload.ARC_THRESHOLD + 1))
