"""The geometry in `circos_plot.js`, run under node: ring order, the layout's angle budget,
monotone positions and the arc flag. Skipped, saying why, where node is not installed."""

import json
import os
import shutil
import subprocess
import unittest

NODE = shutil.which("node")
SCRIPT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                      "static", "mutint_circos", "circos_plot.js")
SKIP_REASON = "node is not installed, so the plot's geometry cannot be run here"

_PROGRAM = """
const api = require(process.argv[1]);
let input = "";
process.stdin.on("data", chunk => { input += chunk; });
process.stdin.on("end", () => {
    const job = JSON.parse(input);
    const out = {};
    const contigs = job.contigs;
    const lay = api.layout(contigs, {rings: job.rings});
    out.span = lay.contigs.length ? (lay.contigs[lay.contigs.length - 1].theta1 - lay.contigs[0].theta0) + lay.originGap : 0;
    out.angles = job.positions.map(p => api.angle(lay, p[0], p[1]));
    out.rings = api.rings(job.data, job.state).map(r => [r.label, r.sampleIds, r.mixed]);
    out.arc = api.arcPath(0, 0, 10, -Math.PI / 2, -Math.PI / 2 + job.arcSpan);
    out.step = api.tickStep(job.total);
    out.geometry = (function () { const g = api.geometry(600, job.rings); return [g.ringWidth, g.r0(0), g.r0(job.rings - 1), g.inner]; }());
    out.grey = [api.ringGrey(0, 5), api.ringGrey(4, 5), api.ringGrey(0, 1), api.ringGrey(2, 5)];
    out.transform = api.glyphTransform(0, 0, 10, 0);
    const outer = {1: true};
    out.glyphed = [api.glyphed({ids: [1]}, outer), api.glyphed({ids: [2]}, outer), api.glyphed({ids: [1, 2]}, outer), api.glyphed({ids: [2]}, null)];
    const index = api.indexCalls({calls: [[1, 10, 1], [2, 11, 1], [2, 12, 0.5]], mutations: [{id: 10, glyph: "circle"}, {id: 11, glyph: "square"}, {id: 12, glyph: "bowtie"}]});
    out.carried = Object.keys(api.carriedIds({mutations: []}, {sampleIds: [2]}, index)).sort();
    out.carriedAll = Object.keys(api.carriedIds({mutations: [{id: 10}, {id: 11}, {id: 12}]}, {sampleIds: null}, index)).sort();
    out.glyphById = index.glyphById;
    out.maxRings = api.MAX_RINGS;
    const capped = api.rings(job.data, {mode: "population", population: "many"});
    out.capped = [capped.length, capped[0] && capped[0].label, capped[capped.length - 1] && capped[capped.length - 1].label, capped.dropped, capped.droppedSamples];
    const tracks = api.tracks(job.data, {mode: "linear", sampleIds: job.linearIds});
    out.tracks = tracks.map(t => [t.label, t.shade, t.outer, t.treatment, t.population]);
    out.shades = tracks.shades;
    out.groups = tracks.groups;
    out.outerIds = api.outerIdsByGroup(job.data, tracks, api.indexCalls(job.data)).map(o => o === null ? null : Object.keys(o).sort());
    const lin = api.linearLayout(contigs, 1000, 100);
    out.xs = job.positions.map(p => api.xOf(lin, p[0], p[1]));
    out.right = lin.right;
    out.rightGiven = api.linearLayout(contigs, 1000, 16, 700).right;
    const geo = api.linearGeometry(1000, tracks, 80);
    out.geometry2 = [geo.trackHeight, geo.left, geo.right, geo.labelX, geo.height, geo.headed, tracks.map((t, i) => geo.trackY(i))];
    const tall = api.linearGeometry(1000, Object.assign(Array.from({length: 80}, (_, i) => ({group: "g"})), {groups: 1}), 500);
    out.tall = [tall.trackHeight, tall.right, tall.headed];
    out.narrowLabels = api.linearGeometry(1000, tracks, 20).right;
    const singletons = api.linearGeometry(1000, Object.assign(Array.from({length: 5}, (_, i) => ({group: "g" + i})), {groups: 5}), 80);
    out.singletons = singletons.headed;
    out.natural = [api.naturalKey("2 mM") < api.naturalKey("10 mM"), api.naturalKey("b") > api.naturalKey("a10")];
    process.stdout.write(JSON.stringify(out));
});
"""

SAMPLES = [
    {"id": 1, "population": "A", "time_point": 500.0, "time_label": "500", "treatment": "", "is_clonal": True, "label": "A-500"},
    {"id": 2, "population": "A", "time_point": 0.0, "time_label": "0", "treatment": "", "is_clonal": False, "label": "A-0"},
    {"id": 3, "population": "A", "time_point": None, "time_label": None, "treatment": "", "is_clonal": True, "label": "A-untimed"},
    {"id": 4, "population": "A", "time_point": 500.0, "time_label": "500", "treatment": "x", "is_clonal": True, "label": "A-500-x"},
    {"id": 5, "population": "B", "time_point": 0.0, "time_label": "0", "treatment": "", "is_clonal": True, "label": "B-0"},
    # Two populations under two treatments, so the linear order and the shared shades can be
    # told apart: "10 mM" sorts after "2 mM" by value, and time point 500 is one grey in both.
    {"id": 6, "population": "C", "time_point": 500.0, "time_label": "500", "treatment": "10 mM", "is_clonal": True, "label": "C-500"},
    {"id": 7, "population": "C", "time_point": 1000.0, "time_label": "1000", "treatment": "10 mM", "is_clonal": True, "label": "C-1000"},
    {"id": 8, "population": "D", "time_point": 1000.0, "time_label": "1000", "treatment": "2 mM", "is_clonal": True, "label": "D-1000"},
    {"id": 9, "population": "D", "time_point": 1000.0, "time_label": "1000", "treatment": "2 mM", "is_clonal": True, "label": "D-1000b"},
] + [
    # More time points than the circular view draws, for the cap.
    {"id": 100 + i, "population": "many", "time_point": float(i * 10), "time_label": str(i * 10), "treatment": "",
     "is_clonal": True, "label": "many-%d" % i}
    for i in range(35)
]
POPULATIONS = ["A", "B", "C", "D", "many"]


def run(job):
    completed = subprocess.run([NODE, "-e", _PROGRAM, SCRIPT], input=json.dumps(job),
                               capture_output=True, text=True, timeout=60, check=True)
    return json.loads(completed.stdout)


@unittest.skipUnless(NODE, SKIP_REASON)
class GeometryTestCase(unittest.TestCase):

    def job(self, **overrides):
        job = {"contigs": [{"id": "chr", "length": 4000000, "circular": True},
                           {"id": "p1", "length": 100000, "circular": True}],
               "rings": 3, "positions": [["chr", 1], ["chr", 2000000], ["chr", 4000000], ["p1", 1], ["nope", 5]],
               "data": {"samples": SAMPLES, "populations": POPULATIONS, "calls": [], "mutations": []},
               "state": {"mode": "population", "population": "A"},
               "linearIds": [9, 8, 7, 6, 5, 4, 3, 2, 1, 999],
               "arcSpan": 4.0, "total": 4100000}
        job.update(overrides)
        return job

    def test_the_contigs_and_gaps_fill_the_circle(self):
        out = run(self.job())
        import math
        self.assertAlmostEqual(2 * math.pi, out["span"], places=6, msg="contigs, the gap between them and the origin gap")
        a = out["angles"]
        self.assertLess(a[0], a[1])
        self.assertLess(a[1], a[2])
        self.assertLess(a[2], a[3], "the plasmid follows the chromosome")
        self.assertIsNone(a[4], "a contig the reference lacks has no angle")

    def test_rings_by_time_point_innermost_earliest_untimed_last(self):
        out = run(self.job())
        self.assertEqual([["0", [2], True], ["500", [1, 4], False], ["untimed", [3], False]], out["rings"])

    def test_a_treatment_narrows_the_rings(self):
        out = run(self.job(state={"mode": "population", "population": "A", "treatment": "x"}))
        self.assertEqual([["500", [4], False]], out["rings"])

    def test_samples_mode_is_one_ring_or_one_per_sample(self):
        out = run(self.job(state={"mode": "samples", "sampleIds": ["5", "2", "99"]}))
        self.assertEqual([[None, [5, 2], True]], out["rings"])
        out = run(self.job(state={"mode": "samples", "sampleIds": ["5", "2"], "stack": True}))
        self.assertEqual(2, len(out["rings"]))
        self.assertEqual([5], out["rings"][0][1])

    def test_sample_mode_is_one_ring_of_one_sample(self):
        out = run(self.job(state={"mode": "sample", "sampleId": "2"}))
        self.assertEqual([[None, [2], True]], out["rings"])
        self.assertEqual([], run(self.job(state={"mode": "sample", "sampleId": "99"}))["rings"])

    def test_a_span_over_half_the_circle_is_two_arcs(self):
        self.assertEqual(2, run(self.job(arcSpan=4.0))["arc"].count(" A"))
        self.assertEqual(1, run(self.job(arcSpan=1.0))["arc"].count(" A"))

    def test_rings_shade_from_light_to_dark_and_one_ring_is_dark(self):
        out = run(self.job())
        self.assertEqual(["#d9d9d9", "#555555", "#555555", "#979797"], out["grey"])

    def test_a_glyph_is_turned_to_point_outward(self):
        self.assertEqual("translate(10,0) rotate(90)", run(self.job())["transform"])

    def test_a_mark_wears_its_glyph_outside_or_when_the_outer_ring_lacks_it(self):
        out = run(self.job())
        self.assertEqual([False, True, False, True], out["glyphed"])
        self.assertEqual(["11", "12"], out["carried"])
        self.assertEqual(["10", "11", "12"], out["carriedAll"])
        self.assertEqual({"10": "circle", "11": "square", "12": "bowtie"}, out["glyphById"])

    def test_ticks_and_ring_radii(self):
        out = run(self.job())
        self.assertEqual(200000, out["step"])
        width, r_first, r_last, inner = out["geometry"]
        self.assertLess(r_first, r_last)
        self.assertAlmostEqual(inner - width, r_last, places=6)

    def test_the_circular_view_draws_the_first_time_points_and_counts_the_rest(self):
        from mutint_circos.payload import MAX_RINGS
        out = run(self.job())
        self.assertEqual(MAX_RINGS, out["maxRings"], "the script and the page must state one cap")
        self.assertEqual([30, "0", "290", 5, 5], out["capped"])

    def test_tracks_are_ordered_by_treatment_population_and_time(self):
        out = run(self.job())
        # Within a block the latest time point is on top (first), the earliest at the bottom.
        self.assertEqual([
            ["A-untimed", 3, True, "", "A"],       # no treatment first, A before B; untimed counts
            ["A-500", 1, False, "", "A"],          #   as latest where it occurs, so it leads A...
            ["A-0", 0, False, "", "A"],            #   ...and 500 is not outer
            ["B-0", 0, True, "", "B"],             # alone in its group, so outer
            ["D-1000", 2, True, "2 mM", "D"],      # 2 mM before 10 mM, by value
            ["D-1000b", 2, True, "2 mM", "D"],     # every sample at the latest time point is outer
            ["C-1000", 2, True, "10 mM", "C"],
            ["C-500", 1, False, "10 mM", "C"],
            ["A-500-x", 1, True, "x", "A"],
        ], [t[:2] + [t[2]] + t[3:] for t in out["tracks"]])
        self.assertEqual(4, out["shades"], "0, 500, 1000 and untimed")
        self.assertEqual(5, out["groups"])
        self.assertTrue(all(out["natural"]))

    def test_untimed_is_the_latest_of_its_group(self):
        # A holds 0, 500 and an untimed sample: the untimed one is outer and 500 is not.
        out = run(self.job())
        by_label = {t[0]: t for t in out["tracks"]}
        self.assertFalse(by_label["A-500"][2])
        self.assertTrue(by_label["A-untimed"][2])

    def test_an_inner_track_compares_against_its_own_groups_latest(self):
        calls = [[2, 10, 1], [1, 11, 1], [3, 12, 1], [6, 20, 1], [7, 21, 1]]
        mutations = [{"id": i, "glyph": "circle"} for i in (10, 11, 12, 20, 21)]
        out = run(self.job(data={"samples": SAMPLES, "populations": POPULATIONS, "calls": calls, "mutations": mutations}))
        by_label = dict(zip([t[0] for t in out["tracks"]], out["outerIds"]))
        self.assertEqual(["12"], by_label["A-0"], "A's outer set is its untimed sample's")
        self.assertEqual(["12"], by_label["A-500"])
        self.assertIsNone(by_label["A-untimed"])
        self.assertEqual(["21"], by_label["C-500"], "C's outer set is C-1000's, not A's")
        self.assertIsNone(by_label["C-1000"])
        self.assertIsNone(by_label["B-0"])

    def test_the_linear_axis_runs_left_to_right_with_a_gap(self):
        out = run(self.job())
        xs = out["xs"]
        self.assertAlmostEqual(100, xs[0], places=6, msg="the first base sits at the label column's edge")
        self.assertLess(xs[0], xs[1])
        self.assertLess(xs[1], xs[2])
        self.assertLess(xs[2], xs[3], "the plasmid follows the chromosome")
        self.assertAlmostEqual(out["right"], xs[3] + (xs[2] - xs[0]) / 3999999 * 99999, places=3,
                               msg="the last base of the last contig ends at the right margin")
        self.assertIsNone(xs[4], "a contig the reference lacks has no x")
        self.assertEqual(700, out["rightGiven"], "the axis ends where the label column begins")

    def test_tracks_shrink_with_number_and_groups_take_a_heading(self):
        out = run(self.job())
        height, left, right, label_x, total, headed, ys = out["geometry2"]
        self.assertEqual(28, height)
        self.assertEqual(16, left, "the axis starts at the left margin")
        self.assertEqual(1000 - 16 - 80, right, "the label column is at the right, as wide as asked")
        self.assertGreater(label_x, right, "labels start past the axis's end")
        self.assertTrue(headed, "five groups are headed")
        self.assertEqual(sorted(ys), ys)
        self.assertGreater(ys[3] - ys[2], ys[1] - ys[0], "a new group opens after a heading and a gap")
        self.assertGreater(total, ys[-1])
        tall_height, tall_right, tall_headed = out["tall"]
        self.assertEqual(12, tall_height, "eighty tracks sit at the floor")
        self.assertEqual(1000 - 16 - 500, tall_right, "a wide label column is never trimmed")
        self.assertEqual(1000 - 16 - 60, out["narrowLabels"], "short labels still get the minimum column")
        self.assertFalse(tall_headed, "one group has no heading")
        self.assertFalse(out["singletons"], "a heading per one-track group would name every sample twice")
