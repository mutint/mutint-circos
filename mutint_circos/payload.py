"""What the page and the panel are handed: the reference's contigs, the experiment's samples,
every present call of theirs with the designated ancestor subtracted, and the mutations those
calls name. The browser decides the rest -- which samples, how many rings -- so the server
builds one payload per experiment and never one per choice.

Two things worth copying rather than the payload itself. **The calls come from
`calls_for_samples`**, which subtracts the ancestor at the derivation: an ancestral mutation is
in every sample, and drawn, it would be the brightest ring of all. And **the rows are
tuples, not models**: `values_list` over three columns, then one `only()` query for the
mutations named, never the JSON fields.
"""

import collections

from mutint_common.glyphs import GLYPHS, glyph_for, size_change
from mutint_experiment.coordinates import format_time_point
from mutint_import.reference_topology import entry_circular
from mutint_sample.models import Mutation, ReferenceSequences
from mutint_sample.mutation_matrix import sample_page_url
from mutint_sample.util import calls_for_samples, get_ordered_sample_dict

#: A deletion, amplification, inversion or conversion longer than this is drawn over its
#: extent rather than as a point: at the scale of a bacterial genome a kilobase is well under
#: a pixel of arc, and the upstream design drew the same boundary.
ARC_THRESHOLD = 5000

#: The types whose length means an extent on the reference.
SPAN_TYPES = frozenset(("DEL", "AMP", "INV", "CON"))

#: The colours of the figure this follows (Barrick et al. 2009, Fig. 1): base substitutions
#: black, deletions red, insertions green, mobile elements blue, inversions orange. The four
#: types the figure has no colour for take distinct ones in the same family. INT's grey is
#: near the darker rings', and its glyph is what tells it apart; it is rare.
COLORS = collections.OrderedDict((
    ("SNP", "#000000"),
    ("DEL", "#e03030"),
    ("INS", "#2e8b3c"),
    ("MOB", "#3b5bb5"),
    ("INV", "#f0a030"),
    ("SUB", "#8e5bb5"),
    ("AMP", "#1aa39a"),
    ("CON", "#8c5a2b"),
    ("INT", "#999999"),
))

#: What a sample with no population is grouped under.
NO_POPULATION = "(no population)"


def reference_contigs(experiment_id):
    """The reference's contigs as `[{"id", "length", "circular"}]` in FASTA order, and
    whether the experiment has a reference at all."""
    try:
        reference = ReferenceSequences.objects.get(experiment_id=experiment_id)
    except ReferenceSequences.DoesNotExist:
        return [], False
    contigs = [{"id": entry["id"], "length": int(entry["length"]),
                "circular": bool(entry_circular(entry))}
               for entry in reference.seq_ids or []]
    return contigs, True


def is_span(mutation_type, start, end):
    return mutation_type in SPAN_TYPES and (end - start + 1) > ARC_THRESHOLD


def _end_of(mutation_type, start, end_position, feature_length):
    """Where a mutation stops: the annotated end, else the start plus its length for a type
    whose length is an extent, else the start itself."""
    if end_position is not None and end_position >= start:
        return int(end_position)
    if mutation_type in SPAN_TYPES and feature_length:
        return start + int(feature_length) - 1
    return start


def sample_entries(sample_dict, experiment):
    entries = []
    for sample in sample_dict.values():
        population = sample.population.name if sample.population_id else NO_POPULATION
        time_label = format_time_point(sample.time_point)
        entries.append({
            "id": sample.id,
            "label": sample.label,
            "population": population,
            "population_id": sample.population_id,
            "time_point": sample.time_point,
            "time_label": None if time_label is None else str(time_label),
            "treatment": sample.treatment or "",
            "is_clonal": bool(sample.is_clonal),
            "url": sample_page_url(sample, experiment),
        })
    return entries


def present_calls(sample_ids, experiment_id):
    """`(sample_id, mutation_id, frequency)` for every present call of the samples, the
    ancestor subtracted, one per (sample, mutation)."""
    seen = set()
    calls = []
    pairs = (calls_for_samples(list(sample_ids), experiment_id)
             .filter(present=True)
             .values_list("sample_id", "mutation_id", "frequency")
             .iterator(chunk_size=2000))
    for sample_id, mutation_id, frequency in pairs:
        key = (sample_id, mutation_id)
        if key in seen:
            continue
        seen.add(key)
        calls.append((sample_id, mutation_id, frequency))
    return calls


def _sub_size_changes(sub_ids):
    """`{id: size_change}` for the SUB rows named: the one glyph that needs the stored record,
    read for those rows alone so the JSON column is never pulled across an experiment."""
    if not sub_ids:
        return {}
    rows = (Mutation.objects.filter(id__in=list(sub_ids))
            .values_list("id", "supplemental_data").iterator(chunk_size=2000))
    return {pk: size_change(((data or {}).get(Mutation.COMPONENT) or {}).get(Mutation.GENOME_DIFF) or {})
            for pk, data in rows}


def mutation_entries(mutation_ids):
    rows = list(Mutation.objects.filter(id__in=list(mutation_ids))
                .order_by("seq_id", "start_position", "id")
                .values_list("id", "mutation_type", "seq_id", "start_position", "end_position",
                             "feature_length", "gene", "product", "sequence_change",
                             "mutation_category", "snp_type")
                .iterator(chunk_size=2000))
    sizes = _sub_size_changes([row[0] for row in rows if row[1] == "SUB"])
    entries = []
    for (pk, mutation_type, seq_id, start, end_position, feature_length, gene, product,
         change, category, snp_type) in rows:
        start = int(start)
        end = _end_of(mutation_type, start, end_position, feature_length)
        entries.append({
            "id": pk,
            "type": mutation_type,
            "seq_id": seq_id,
            "start": start,
            "end": end,
            "length": end - start + 1,
            "span": is_span(mutation_type, start, end),
            "gene": gene or "",
            "product": product or "",
            "change": change or "",
            "category": category or "",
            "glyph": glyph_for(mutation_type, snp_type, category, sizes.get(pk, 0)),
        })
    return entries


def circos_payload(experiment, *, with_calls=True):
    """Everything the browser needs to draw any choice of this experiment's samples.

    `with_calls=False` leaves the calls out and sends the mutations alone -- the union of
    every sample's, which is what the Overview panel draws.
    """
    contigs, has_reference = reference_contigs(experiment.id)
    sample_dict = get_ordered_sample_dict(experiment.id)
    samples = sample_entries(sample_dict, experiment)
    calls = present_calls(sample_dict, experiment.id) if sample_dict else []
    mutations = mutation_entries({mutation_id for _, mutation_id, _ in calls})
    populations = []
    for entry in samples:
        if entry["population"] not in populations:
            populations.append(entry["population"])
    treatments = sorted({entry["treatment"] for entry in samples if entry["treatment"]})
    return {
        "has_reference": has_reference,
        "contigs": contigs,
        "total_length": sum(contig["length"] for contig in contigs),
        "arc_threshold": ARC_THRESHOLD,
        "colors": dict(COLORS),
        "glyphs": [[name, words] for name, words in GLYPHS],
        "samples": samples,
        "populations": populations,
        "treatments": treatments,
        "mutations": mutations,
        "calls": [[s, m, f] for s, m, f in calls] if with_calls else [],
    }
