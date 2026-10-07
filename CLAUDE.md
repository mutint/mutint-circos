# CLAUDE.md — mutint-circos

The **Circos** page, at `/circos/` in the sidebar's experiment section: the reference genome
drawn as a circle, with the mutations of the chosen samples marked around it -- each a mark
coloured by its type, a long deletion, amplification, inversion or conversion an arc over
its extent. One page, an Overview panel, an About section, no models, no migrations, nothing
stored. `apps.py` registers all four from one `ready()`; `payload.py` is the derivation; the
page's two scripts draw the plot from one JSON payload.

**The design is borrowed and the code is not.** It follows
[genome_visualisation](https://github.com/PadmanabhanKann/genome_visualisation), six scripts
that turn a breseq `.gd` into NG-Circos tracks: one ring, Okabe-Ito colour per type, DEL/AMP/
INV longer than 5 kb as arcs, a tooltip naming gene and product. The obvious plugin vendored
NG-Circos, and that was looked at and declined: UC Irvine licenses it for **non-commercial
use only**, which an MIT component cannot redistribute, and the upstream's own change to it
is a 38-line tooltip patch. What the upstream contributes is the *design*, so the plugin draws
its own SVG in plain JavaScript -- the way mutint-recurrent does -- and credits the origin in
the README, the About section and here. A fork of the upstream was proposed and is not
needed, since nothing of it is used.

## The payload, and who decides

`payload.circos_payload(experiment)` is one dict per experiment: the reference's contigs
(`ReferenceSequences.seq_ids`, FASTA order, with `circular`), every sample in the site's
order, every **present** call as `[sample_id, mutation_id, frequency]`, and every mutation
those calls name with its type, extent and `span` flag. **The browser decides the rest**, as
Compare does: which samples, how many rings, which ring each goes on. One payload serves
every choice, and no control makes a request.

Two things to keep. **The calls come from `calls_for_samples`**, so the designated ancestor
is subtracted at the derivation -- an ancestral mutation is in every sample, and drawn it
would be the brightest ring of all. **The rows are tuples, not models**: `values_list` over
the calls, then one `only()`-shaped `values_list` over the mutations named, never the JSON
fields. Measured on the specificity example (30 samples after the ancestor is subtracted, 159
calls): 13 ms and 50 KB of JSON. A call is about fifteen bytes, so an experiment of fifty
thousand observations is under a megabyte.

The reader's view filter is deliberately not applied -- frequency is shown as opacity rather
than excluded on -- and `{% view_filter_summary own_rules=... %}` says so.

**A mutation's extent** is `end_position` where the annotator filled it, else `start +
feature_length − 1` for the four span types, else the start. `span` is true for DEL, AMP,
INV or CON longer than `ARC_THRESHOLD` (5 kb): at the scale of a bacterial genome a kilobase
is well under a pixel of arc, and the upstream drew the same boundary.

**The Overview panel sends no calls** (`with_calls=False`): it draws every sample's
mutations together, so which sample carries which is a payload it has no use for, and the
Overview is a page that draws several components' panels.

## The drawing

`circos_plot.js` is in two halves. The geometry -- `layout`, `angle`, `geometry`, `arcPath`,
`tickStep`, `rings`, `marksFor` -- is free of the DOM and is what `tests/test_rings_js.py`
runs under node (skipped, saying why, where node is not installed). `draw`, `standalone` and
`download` need a document.

- **Layout.** Contigs run end to end clockwise from twelve o'clock with 1.5° between them;
  with more than one ring the gap at the origin widens to 14° so ring labels have a column
  at twelve o'clock. `k` is radians per base; a seq_id the reference lacks has no angle, is
  skipped, and is counted in a note under the plot.
- **Rings** share the space between the centre hole (28% of the radius) and the band, so
  more rings are thinner rings, between 5 and 30 px. Ring 0 is innermost. Past 12 rings the
  plot widens to 1100 px before rings shrink, and labels are thinned to every k-th.
- **Marks.** A point is a radial line across its ring; a span is an arc as wide as the ring,
  a minimum 1.5 px long so a 6 kb deletion on a 4.6 Mb genome still shows. Points of one
  type under the same 1.5 px are **bucketed** into one mark that knows how many it stands
  for, which is what keeps 60 samples on one ring at a few thousand elements rather than
  fifty thousand. A span crossing the origin of a circular contig is two arcs.
- **Opacity** is the highest frequency among the ring's calls for that mark, floored at 0.25,
  and only on a ring holding a mixed sample; a clonal ring is opaque whatever the stored
  frequencies say.
- **Ticks** share one step for every contig (the coarsest giving at most 24 majors over the
  genome), labelled in contig-local coordinates, a label dropped where it would overlap the
  previous one. MOB is drawn over a grey underlay because the Okabe-Ito yellow is faint on
  white.
- **The file** is the SVG as drawn plus a legend of the types present and a title line, an
  XML declaration naming UTF-8 and Arial first -- copied from recurrent_plot.js, for the
  reason stated there.

`circos.js` owns the controls, the preferences (`circos.mode`, `circos.stack`,
`circos.frequency`, `circos.labels`, and per experiment `circos.samples.<id>` as the hidden
set, `circos.population.<id>`, `circos.treatment.<id>`), the summary line and the tooltip --
one box the plot shares, filled from `node.__circos` on the mark under the pointer. The
sample picker is core's `select_list.html` with `mutintSelectList` in toggle mode, in a
scrolling box rather than a dropdown.

## Rings by time, and what it cost

**The time-progression view is the Population mode, and it was cheap**: with the plot drawn
by hand, one ring per time point is radius arithmetic, and `rings()` is forty lines. What
it does not do, and why, is the part worth keeping:

- **Rings are not binned.** Every distinct `Sample.time_point` is a ring. Merging close time
  points would misstate the data; past about 12 the rings are thin and the summary says the
  Samples mode may read better.
- **Samples at one time point share a ring**, overplotted. A per-sample jitter was considered
  and left out because on a genome axis a jitter reads as a position. The tooltip names
  which samples carry the mark.
- **Persistence is read by eye**: a mark at one angle on successive rings is the same
  mutation only if its id matches, which the tooltip shows. A radial connector per mutation
  across the rings it appears on is the natural next step and was not built.
- **Mixed-population frequency is opacity only.** A trajectory (frequency against time) is a
  different plot -- the per-sample Mutations page's, not this one's.
- **Untimed samples** are an outermost ring rather than an error, and the summary line counts
  them. A treatment filter can empty a time point, which shortens the ring list; the summary
  says how many rings remain.

## Tests

`./mutint test mutint_circos` from an assembled project. Before the plugin is in a
`.gitmodules`, run from mutint-core with a settings module that adds the app:

```bash
cd mutint-core
cat > /tmp/circos_settings.py <<'PY'
from config.settings_local import *  # noqa: F401,F403
INSTALLED_APPS = INSTALLED_APPS + ["mutint_circos"]
PY
DJANGO_SETTINGS_MODULE=circos_settings PYTHONPATH=/tmp:../mutint-circos ./mutint test mutint_circos
```

The fixture is a real breseq-folder import of four samples at two populations and two time
points, on a 20 kb contig, with one of each mark the plot distinguishes.
