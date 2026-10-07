# Circos

**Circos**, in the sidebar's experiment section, draws the reference genome as a circle with
the mutations of the samples you choose marked around it.

The contigs of the reference run end to end clockwise from twelve o'clock, as a grey band
with coordinate ticks outside it and each contig's name beyond them (a single contig is
named in the centre). Inside the band, each mutation is a mark at its position, coloured by
its type:

| Type | Colour |
|---|---|
| SNP | light blue |
| SUB | dark blue |
| INS | green |
| DEL | pink |
| MOB | yellow, on a grey underlay |
| AMP | orange |
| INV | vermilion |
| CON | black |
| INT | grey |

A deletion, amplification, inversion or conversion longer than 5 kb is drawn as an arc over
its extent rather than as a point. Hover any mark for what the mutation is, where it is,
which gene it touches and which of the drawn samples carry it. Two mutations of one type
closer together than the plot can separate become one mark that says how many it stands for.

## Choosing what to draw

**Sample** draws one sample on one ring, chosen from the same menu the Mutations page uses.

**Population** takes one population (and a treatment, where the experiment records
any) and draws one ring per time point, innermost earliest, so a lineage's mutations can be
followed outward through time. Samples at the same time point share a ring. Samples with no
time point are drawn on an outermost ring labelled *untimed*; the line under the controls
says how many rings there are and where everything went.

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
