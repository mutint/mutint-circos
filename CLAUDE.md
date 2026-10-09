# CLAUDE.md — mutint-circos

The **Circos** page, at `/circos/` in the sidebar's experiment section: the reference genome
drawn as a circle, with the mutations of one sample -- or of one population, as one ring per
time point -- marked around it, or drawn as a line with any number of samples stacked under
it as tracks -- each mutation a mark coloured by its type, a long deletion, amplification,
inversion or conversion an arc (or a bar) over its extent. One page, an Overview panel, an
About section, no models, no migrations, nothing stored. `apps.py` registers all four from
one `ready()`; `payload.py` is the derivation; the page's two scripts draw the plot from one
JSON payload.

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
calls): 4 ms and 54 KB of JSON with the glyph lookup (0 SUB rows there). A call is about
fifteen bytes, so an experiment of fifty thousand observations is under a megabyte.

The reader's view filter is deliberately not applied -- frequency is shown as opacity rather
than excluded on. The page does not render `{% view_filter_summary %}`: it said so in a
sentence under the plot, and that sentence was asked off the page.

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
  at twelve o'clock. A ring's grey background is drawn per contig, over the genome and
  nowhere else: across a gap there is no reference to be mutated, so there is no ring
  (it was a full circle, and read as genome where there was none). `k` is radians per base; a seq_id the reference lacks has no angle, is
  skipped, and is counted in a note under the plot.
- **Rings** share the space between the centre hole (28% of the radius) and the band, so
  more rings are thinner rings, between 5 and 30 px apart. Ring 0 is innermost. Each is a
  1.5 px line per contig in a grey that ramps from `#d9d9d9` (innermost, earliest) to
  `#555555` (outermost); one ring alone is dark. Past 12 rings the plot widens to 1100 px
  before rings shrink, and labels are thinned to every k-th.
- **Marks.** A point is a dash across its ring, at most 12 px so a shared mutation's dashes
  on successive rings do not join into one line; a span is a 4–6 px arc along the ring, a
  minimum 1.5 px long so a 6 kb deletion on a 4.6 Mb genome still shows. Points of one type
  under the same 1.5 px are **bucketed** into one mark that knows how many it stands for,
  which is what keeps 60 samples on one ring at a few thousand elements rather than fifty
  thousand. A span crossing the origin of a circular contig is two arcs.
- **Glyphs.** The payload names each mutation's glyph (`mutint_common.glyphs.glyph_for`, the
  same rule and sprite mutint-recurrent draws; `snp_type` rides along in the query and a
  SUB's `size_change` is read from `supplemental_data` for SUB rows alone). On the outermost
  ring every mark wears its glyph just beyond the dash, 10 px, turned to point outward
  (`glyphTransform`: rotate by θ + 90°). On an inner ring a mark is glyphed only when
  `glyphed(mark, outerIds)` says no mutation in it is carried by any sample on the
  outermost ring (`carriedIds`) -- the figure's "off the line of descent" pin, with the
  symbol for its head. A bucket with one survivor reads as surviving. The sprite is
  `{% include "glyphs/sprite.html" %}` on the page and the panel, and `standalone` copies its
  symbols into the file.
- **Opacity** is the highest frequency among the ring's calls for that mark, floored at 0.25,
  and only on a ring holding a mixed sample; a clonal ring is opaque whatever the stored
  frequencies say.
- **Ticks** share one step for every contig (the coarsest giving at most 24 majors over the
  genome), labelled in contig-local coordinates, a label dropped where it would overlap the
  previous one.
- **Colours** are the LTEE figure's (Barrick et al. 2009, Fig. 1) for the five types it has
  -- SNP black, DEL red, INS green, MOB blue, INV orange -- and distinct ones in the same
  family for SUB, AMP, CON and INT. All base substitutions are one colour; the glyph carries
  the functional class.
- **The file** is the SVG as drawn plus a legend of the types present and a title line, an
  XML declaration naming UTF-8 and Arial first -- copied from recurrent_plot.js, for the
  reason stated there.

`circos.js` owns the three tabs, the preferences (`circos.mode`, `circos.frequency`,
`circos.labels`, and per experiment `circos.sample.<id>`, `circos.population.<id>`,
`circos.treatment.<id>` and `circos.linear.hidden.<id>`), the summary line and the tooltip
-- one box the plot shares, filled from `node.__circos` on the mark under the pointer. The
tabs are **One Sample (Circular)**, **Multiple Samples (Circular)** and **Multiple Samples
(Linear)**; their mode keys stay `sample`, `population` and `linear`, since the key is what
the preference stores. **The one-sample tab draws one sample**, chosen from the Mutations
page's own menu shape -- a dropdown whose button carries the chosen name -- rather than a
multi-select: a set of samples on one ring was built first and taken out, since overlaid
samples cannot be told apart at a mark. `rings()` still accepts a `samples` mode with a list
and a `stack` flag, which the node test covers and nothing on the page uses. The tab strip
is the page's own, not `control_tabs.html`, whose tabs are the mutation tables'.

**The circular multi-sample view draws at most `MAX_RINGS` (30) time points**, the earliest
first, and says what it left off: `rings()` carries `dropped` and `droppedSamples` on the
list, the summary line names the count and points at the linear tab, and the exported SVG
carries the same sentence. The number is stated twice -- `payload.MAX_RINGS` for the page's
muted text and `MAX_RINGS` in `circos_plot.js`, which draws -- and the node test asserts
they are equal. Before the cap, rings reached the 5 px floor at about 50 and walked through
the centre past that, with nothing said; 30 is about 10 px a ring at the 1100 px width,
where a dash and its glyph still separate.

## Rings by time, and what it cost

**The time-progression view is the Population mode, and it was cheap**: with the plot drawn
by hand, one ring per time point is radius arithmetic, and `rings()` is forty lines. What
it does not do, and why, is the part worth keeping:

- **Rings are not binned.** Every distinct `Sample.time_point` is a ring. Merging close time
  points would misstate the data; past about 12 the rings are thin and the summary says the
  linear tab may read better, and past 30 the later ones are left off and counted.
- **Samples at one time point share a ring**, overplotted. A per-sample jitter was considered
  and left out because on a genome axis a jitter reads as a position. The tooltip names
  which samples carry the mark. This is also why the Sample tab draws one sample: several
  samples on one ring have the same problem with no time to justify it.
- **Persistence is read by eye**: a mark at one angle on successive rings is the same
  mutation only if its id matches, which the tooltip shows. A radial connector per mutation
  across the rings it appears on is the natural next step and was not built.
- **Mixed-population frequency is opacity only.** A trajectory (frequency against time) is a
  different plot -- the per-sample Mutations page's, not this one's.
- **Untimed samples** are an outermost ring rather than an error, and the summary line counts
  them. A treatment filter can empty a time point, which shortens the ring list; the summary
  says how many rings remain.

## The linear layout

**Multiple Samples (Linear)** is the same marks on a horizontal axis: the contigs end to end
from the label column to the right margin with 8 px between them (`linearLayout`, `xOf`), a
band with ticks and labels above it, and under it one track per chosen sample. It exists
because the circle has a ceiling and the question "show me these forty clones" does not. In
`circos_plot.js` it is `tracks`, `outerIdsByGroup`, `linearGeometry`, `linearMarksFor` and
`drawLinear`; `draw` dispatches on `state.mode === "linear"`, and the SVG says
`data-layout="linear"` so `standalone` writes the right sentence. Marks carry the same
`{type, ids, calls, n}` as a ring's, so the tooltip did not change.

- **Order is treatment, population, time point, then the payload's own order.** Treatment
  compares under `naturalKey` -- digits padded, the rule `ordering.sample_order` uses -- so
  `2 mM` precedes `10 mM`; an empty treatment sorts first; population takes the payload's
  order, which is core's natural order; within a block **the latest time point is on top**
  and the earliest at the bottom, with untimed samples first, as the untimed ring is
  outermost -- so a block reads as the rings do, from the ancestor's end outward. The server
  sorts nothing for it.
- **Shade is a rank on one scale.** Every distinct time point drawn, across every population,
  is ranked ascending, untimed last, and a track takes `ringGrey(rank, ranks)`. So time
  point 500 is one grey in every block, which is what makes two populations' blocks
  comparable by eye -- and what the per-ring ramp, indexed by ring position, could not say.
- **The glyph rule is applied per population block.** A block is one treatment and one
  population. Its outer tracks are every sample at its latest time point (untimed counts as
  latest where it occurs, as in `rings`); they wear every glyph, and an earlier track's mark
  is glyphed only when no outer sample of *its own* block carries it. `outerIdsByGroup`
  hands `drawTrack` null for an outer track and the block's union otherwise.
- **Blocks are headed only when some block holds more than one track.** Thirty clones from
  thirty populations are thirty labels already; a heading over each said every name twice
  and doubled the height. One block has no heading either.
- **Height follows the tracks.** 28 px a track to 24 tracks, then shrinking to a floor of
  12. The sample labels are at the **right**, past the axis's end, in a column measured
  from the widest label and never narrower than 60 px -- a label is never trimmed, so a long
  name costs axis width rather than legibility. The width is the box's, 800 to 1400 px, and
  **a box narrower than 800 px scrolls the plot** (`.circos-plot` is `overflow-x: auto` and
  the linear SVG opts out of `max-width: 100%`) rather than shrinking it; the tooltip adds
  the box's `scrollLeft` for it. A hundred tracks is a tall SVG, which is the right answer.
- **The picker is Compare's Samples menu**: `li.active` is drawn, `mutintSelectList` in
  toggle mode, Show all / Hide all set the whole selection, and the Population and Treatment
  menus **set the selection to a subset** -- every sample matching both -- rather than
  layering over it, so what the menu shows is always what is drawn. The hidden set is what
  is remembered (`circos.linear.hidden.<id>`), as the matrix remembers samples, so a sample
  added later is drawn by default. The two menus themselves are not remembered.
- **Spans are bars**, a thick horizontal line over the extent, at least 1.5 px, two pieces
  for one crossing the origin of a circular contig; points bucket by type and x at 1.5 px.

What it deliberately does not do: no connector between a mutation's marks on successive
tracks (read by eye at one x, as on the rings); no collapsing of samples at one time point
onto one track (a track is a sample; that is the point of the layout); no column for the
time point beside the label (it is in the shade and the label's `<title>`).

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
