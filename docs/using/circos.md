# Circos

**Circos**, in the sidebar's experiment section, draws the reference genome as a circle with
the mutations of the samples you choose marked around it.

The contigs of the reference run end to end clockwise from twelve o'clock, as a grey band
with coordinate ticks outside it and each contig's name beyond them (a single contig is
named in the centre). Inside the band, each mutation is a mark at its position, coloured by
its type:

| Type | Colour |
|---|---|
| SNP | black |
| DEL | red |
| INS | green |
| MOB | blue |
| INV | orange |
| SUB | purple |
| AMP | teal |
| CON | brown |
| INT | grey |

A deletion, amplification, inversion or conversion longer than 5 kb is drawn as a thick arc
over its extent rather than as a dash. On the outermost ring every mutation also wears a
symbol for its kind -- the same shapes the Recurrent page draws: a circle for a synonymous
base substitution, a square for a nonsynonymous one, a tombstone for nonsense, a diamond for
intergenic, triangles for small indels, a bowtie for a mobile element, trapezoids for large
deletions and insertions, a barbell for an inversion. The legend under the controls names
them all. Hover any mark for what the mutation is, where it is,
which gene it touches and which of the drawn samples carry it. Two mutations of one type
closer together than the plot can separate become one mark that says how many it stands for.

## Choosing what to draw

**One Sample (Circular)** draws one sample on one ring, chosen from the same menu the
Mutations page uses.

**Multiple Samples (Circular)** takes one population (and a treatment, where the experiment
records any) and draws one ring per time point, innermost earliest, so a lineage's mutations
can be followed outward through time. Rings are shaded light to dark from earliest to latest.
A mutation on an inner ring that no sample on the outermost ring carries is capped with its
symbol: it was there, and is not in the latest clones. Samples at the same time point share a
ring. Samples with no time point are drawn on an outermost ring labelled *untimed*; the line
under the controls says how many rings there are and where everything went. At most 30 time
points are drawn as rings, the earliest first; when a population has more, the line under the
controls says how many were left off and points at the linear tab, which has no such limit.

**Multiple Samples (Linear)** draws any number of samples as horizontal tracks stacked under
the genome, one per sample. Tracks are ordered by treatment, then population, then time
point, with a heading over each population's block where a block holds more than one track,
and each track is shaded by its time point -- lightest earliest -- on one scale for the whole
plot, so the same time point is the same grey in every population. Within a population's
block the track at its latest time point wears every symbol, and an earlier track's mark is
capped only when no sample at that latest time point carries it, the same rule the rings use.
The **Samples** menu ticks which samples are drawn, **Show all** and **Hide all** set the
whole selection, and the **Population** and **Treatment** menus select every sample of one
population or one treatment at once; single rows can then be toggled. Which samples are
hidden is remembered per experiment.

**Frequency as opacity** draws a mutation found at less than 100% in a mixed-population
sample paler, in proportion to its frequency; a clonal sample's marks are always solid. It
does nothing when no mixed sample is drawn.

The experiment's designated ancestor is subtracted before anything is drawn, and your view
filter is not applied: every stored mutation of the chosen sample is on the plot.

**Download SVG** saves the plot as drawn, with a legend of the types present and a line
saying what was chosen, ready for Illustrator (an XML declaration naming UTF-8, Arial first).

## On the Overview

The same plot, with every sample's mutations on one ring, is a panel on the experiment's
Overview. Choosing samples, and rings by time, is the page's.
