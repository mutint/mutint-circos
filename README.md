# mutint-circos

A plugin for [MutInt](https://github.com/mutint/mutint-core): the reference genome drawn as a
circle, with the mutations of the samples you choose marked around it.

**Circos**, in the sidebar's experiment section, draws every contig of the reference end to
end around a ring, with coordinate ticks outside it. Each mutation is a dash at its position,
coloured by type the way the LTEE figure colours them (base substitutions black, deletions
red, insertions green, mobile elements blue, inversions orange); a deletion, amplification,
inversion or conversion longer than 5 kb is drawn as a thick arc over its extent. On the
outermost ring every mutation wears a symbol for its kind, the same twelve shapes
mutint-recurrent draws. Hover a mark for what it is, where, which samples carry it and at
what frequency.

Three tabs choose what is drawn:

- **One Sample (Circular)** -- one sample, from the same menu the Mutations page uses, on
  one ring.
- **Multiple Samples (Circular)** -- one population as one ring per time point, innermost
  earliest and lightest, so a lineage's mutations can be followed through time. A mutation
  on an inner ring that no sample on the outermost ring carries is capped with its symbol,
  the figure's "off the line of descent" pin. Samples with no time point go to an outermost
  ring of their own. Up to 30 time points are drawn; later ones are counted under the plot.
- **Multiple Samples (Linear)** -- any number of samples as horizontal tracks stacked under
  the genome, ordered by treatment, population and time point, each track shaded by its time
  point so one time point is one grey in every population. Within a population's block the
  latest time point plays the outermost ring's part for the symbols. Samples are picked
  from a menu with Show all / Hide all, and a population or treatment menu selects a subset.

The designated ancestor's mutations are subtracted before anything is drawn. The same plot,
of every sample at once, is a panel on the experiment's Overview, and the page downloads the
SVG with its legend drawn in.

Nothing is stored and nothing is computed on the server beyond one payload per experiment;
the browser decides which samples go on which ring.

## Design

The design -- one ring, each mutation a mark coloured by its type, long structural mutations
as arcs -- follows [genome_visualisation](https://github.com/PadmanabhanKann/genome_visualisation),
which renders breseq output with NG-Circos. Nothing is copied from it: NG-Circos is licensed
for non-commercial use only, which an MIT component cannot carry, so the drawing here is
the plugin's own SVG in plain JavaScript.

## Installing

Add it to an assembled project's `.gitmodules` beside the other plugins; auto-discovery does
the rest. Its tests run from the assembled project: `./mutint test mutint_circos`.

MIT licensed.
