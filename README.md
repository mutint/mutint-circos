# mutint-circos

A plugin for [MutInt](https://github.com/mutint/mutint-core): the reference genome drawn as a
circle, with the mutations of the samples you choose marked around it.

**Circos**, in the sidebar's experiment section, draws every contig of the reference end to
end around a ring, with coordinate ticks outside it. Each mutation is a mark at its position,
coloured by type (Okabe-Ito); a deletion, amplification, inversion or conversion longer than
5 kb is drawn as an arc over its extent. Hover a mark for what it is, where, which samples
carry it and at what frequency.

Two tabs choose what is drawn:

- **Sample** -- one sample, from the same menu the Mutations page uses, on one ring.
- **Population** -- one population as one ring per time point, innermost earliest, so a
  lineage's mutations can be followed through time. Samples with no time point go to an
  outermost ring of their own.

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
