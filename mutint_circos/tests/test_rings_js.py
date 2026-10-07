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
    process.stdout.write(JSON.stringify(out));
});
"""

SAMPLES = [
    {"id": 1, "population": "A", "time_point": 500.0, "time_label": "500", "treatment": "", "is_clonal": True},
    {"id": 2, "population": "A", "time_point": 0.0, "time_label": "0", "treatment": "", "is_clonal": False},
    {"id": 3, "population": "A", "time_point": None, "time_label": None, "treatment": "", "is_clonal": True},
    {"id": 4, "population": "A", "time_point": 500.0, "time_label": "500", "treatment": "x", "is_clonal": True},
    {"id": 5, "population": "B", "time_point": 0.0, "time_label": "0", "treatment": "", "is_clonal": True},
]


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
               "data": {"samples": SAMPLES, "calls": [], "mutations": []},
               "state": {"mode": "population", "population": "A"},
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

    def test_a_span_over_half_the_circle_sets_the_large_arc_flag(self):
        self.assertIn(" 0 1 1 ", run(self.job(arcSpan=4.0))["arc"])
        self.assertIn(" 0 0 1 ", run(self.job(arcSpan=1.0))["arc"])

    def test_ticks_and_ring_radii(self):
        out = run(self.job())
        self.assertEqual(200000, out["step"])
        width, r_first, r_last, inner = out["geometry"]
        self.assertLess(r_first, r_last)
        self.assertAlmostEqual(inner - width, r_last, places=6)
