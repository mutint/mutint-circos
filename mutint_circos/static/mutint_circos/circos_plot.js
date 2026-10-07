/* The reference genome as a circle, with mutations marked around it.
 *
 * `window.mutintCircosPlot.draw(data, state, width)` returns an SVG: the contigs laid end to
 * end clockwise from twelve o'clock as a grey band with coordinate ticks outside it, and
 * inside it one or more rings, thin grey lines shaded light (innermost) to dark (outermost),
 * each holding the mutations of a set of samples. A **point** mutation -- a base
 * substitution, a small indel, a mobile element at its insertion point -- is a short dash
 * across its ring, coloured by type; a **span** -- a deletion, amplification, inversion or
 * conversion longer than `data.arc_threshold` -- is a thick arc along it. Two points of one
 * type under the same pixel become one mark that knows how many it stands for.
 *
 * On the outermost ring every mark wears its **glyph** -- the shape mutint-core's sprite gives
 * its kind (`mutint_common/glyphs.py`) -- just beyond the dash, pointing outward. On an inner
 * ring the glyph caps a dash only when no sample on the outermost ring carries the mutation:
 * the figure this follows drew such a mutation as a pin, "off the line of descent".
 *
 * `rings(data, state)` decides what the rings are: one for a chosen set of samples, one per
 * chosen sample, or one per time point of a population with the earliest innermost -- that
 * last being how a population's mutations are followed through time. Rings share the space
 * between the centre hole and the band, so more rings are thinner rings, down to a floor.
 *
 * The geometry (`layout`, `angle`, `geometry`, `arcPath`, `tickStep`, `rings`, `ringGrey`,
 * `glyphed`, `glyphTransform`) is free of the DOM so it can be run under node; `draw`,
 * `standalone` and `download` need a document.
 *
 * The design -- one ring per clone, a dash per mutation coloured by type, long deletions as
 * arcs -- follows the LTEE figure (Barrick et al. 2009, Fig. 1) and
 * github.com/PadmanabhanKann/genome_visualisation, which draws breseq output with NG-Circos.
 * Nothing is copied from the latter: that library is licensed for non-commercial use only.
 */
(function (root) {
    "use strict";

    var NS = "http://www.w3.org/2000/svg";
    var TAU = 2 * Math.PI;
    var GAP_DEG = 1.5;          // between contigs
    var LABEL_GAP_DEG = 14;     // at the origin, when ring labels need a column
    var OUTER_MARGIN = 60;      // tick labels and contig names live here
    var BAND = 10;              // the genome band
    var RING_GAP = 18;          // between the band and the outermost ring: room for a glyph
    var RING_LINE = 1.5;        // a ring is a line this wide
    var DASH_GAP = 3, DASH_MAX = 12;   // a dash stops short of the rings beside it, and is never long
    var SPAN_MIN = 4, SPAN_MAX = 6;   // a span's stroke
    var GLYPH = 10, GLYPH_MIN = 6;    // a glyph's size: outermost ring, and the floor inside
    var GREY_FIRST = 0xd9, GREY_LAST = 0x55;   // the ring ramp, innermost to outermost
    var XLINK = "http://www.w3.org/1999/xlink";
    var MIN_RING = 5, MAX_RING = 30;
    var HOLE = 0.28;            // the centre hole, as a fraction of R
    var MIN_WIDTH = 480, MAX_WIDTH = 900, WIDE_WIDTH = 1100, WIDE_AFTER = 12;
    var TICK_STEPS = [1e3, 2e3, 5e3, 1e4, 2e4, 5e4, 1e5, 2e5, 5e5, 1e6, 2e6, 5e6, 1e7];
    var MAX_TICKS = 24;
    var FONT = 11;
    var FONT_FAMILY = "Helvetica, Arial, sans-serif";
    /* The file's font list leads with Arial: Illustrator takes the first font it has and
       substitutes nothing per glyph. */
    var FILE_FONT_FAMILY = "Arial, Helvetica, sans-serif";
    var XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>\n';
    var BUCKET_PX = 1.5;        // points of one type closer than this become one mark
    var MIN_ARC_PX = 1.5;       // a span is at least this long on the page
    var OPACITY_FLOOR = 0.25;
    var UNTIMED = "untimed";

    function rad(deg) { return deg * Math.PI / 180; }

    /* Where each contig sits on the circle. Contigs run end to end clockwise from twelve
       o'clock, a small gap between them, and a wider gap centred on the origin when rings
       need a column for their labels. `k` is radians per base. */
    function layout(contigs, options) {
        options = options || {};
        var n = contigs.length;
        var total = 0;
        contigs.forEach(function (c) { total += c.length; });
        var between = n > 1 ? rad(GAP_DEG) : 0;
        // The origin is always a gap, a single contig's included: it marks position 1 of
        // a circular genome, and a band from an angle back to the same angle is an arc SVG
        // draws as nothing at all.
        var origin = (options.rings || 1) > 1 ? rad(LABEL_GAP_DEG) : rad(GAP_DEG);
        var available = TAU - origin - between * Math.max(0, n - 1);
        var k = total > 0 ? available / total : 0;
        var theta = -Math.PI / 2 + origin / 2;
        var placed = [], byId = {};
        contigs.forEach(function (c, i) {
            var entry = { id: c.id, length: c.length, circular: !!c.circular,
                          theta0: theta, theta1: theta + c.length * k, index: i };
            placed.push(entry);
            byId[c.id] = entry;
            theta = entry.theta1 + between;
        });
        return { k: k, total: total, contigs: placed, byId: byId, originGap: origin };
    }

    /* The angle of a 1-based position on a contig; null for a contig the reference lacks. */
    function angle(lay, seqId, pos) {
        var c = lay.byId[seqId];
        if (!c) { return null; }
        return c.theta0 + (pos - 1) * lay.k;
    }

    function polar(cx, cy, r, theta) {
        return [cx + r * Math.cos(theta), cy + r * Math.sin(theta)];
    }

    /* The radii: the band just inside the outer margin, the rings sharing the space between
       the hole and the band. Ring 0 is innermost. */
    function geometry(width, nRings) {
        var n = Math.max(1, nRings);
        var R = width / 2 - OUTER_MARGIN;
        var inner = R - BAND - RING_GAP;
        var hole = HOLE * R;
        var ringWidth = Math.max(MIN_RING, Math.min(MAX_RING, (inner - hole) / n));
        return {
            cx: width / 2, cy: width / 2, R: R, band: BAND, inner: inner, hole: hole,
            ringWidth: ringWidth,
            r0: function (i) { return inner - (n - i) * ringWidth; }
        };
    }

    /* How wide to draw: the box, within limits; wider when there are many rings. */
    function plotWidth(boxWidth, nRings) {
        var width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, boxWidth || MAX_WIDTH));
        if (nRings > WIDE_AFTER) {
            width = Math.max(width, Math.min(WIDE_WIDTH, boxWidth || WIDE_WIDTH));
        }
        return width;
    }

    /* The A commands of an arc of radius r from t1 to t2, `sweep` 1 clockwise or 0 back.
       An arc over more than a half turn is written as two, because an arc whose two ends
       round to the same point -- a whole contig on its own -- is an arc SVG draws as nothing. */
    function arcCommands(cx, cy, r, t1, t2, sweep) {
        var pieces = (t2 - t1) > Math.PI ? [[t1, (t1 + t2) / 2], [(t1 + t2) / 2, t2]] : [[t1, t2]];
        if (sweep === 0) { pieces = pieces.reverse().map(function (p) { return [p[1], p[0]]; }); }
        return pieces.map(function (p) {
            var end = polar(cx, cy, r, p[1]);
            return " A" + fmt(r) + " " + fmt(r) + " 0 0 " + sweep + " " + fmt(end[0]) + " " + fmt(end[1]);
        }).join("");
    }

    /* The grey of ring i of n: a ramp from light, innermost and earliest, to dark. One ring
       is drawn dark. */
    function ringGrey(i, n) {
        var v = n < 2 ? GREY_LAST : Math.round(GREY_FIRST + (GREY_LAST - GREY_FIRST) * i / (n - 1));
        var hex = ("0" + v.toString(16)).slice(-2);
        return "#" + hex + hex + hex;
    }

    function ringRadius(g, i) { return g.r0(i) + g.ringWidth / 2; }
    // Capped, or a shared mutation's dashes on successive rings would join into one line.
    function dashLength(g) { return Math.min(DASH_MAX, Math.max(4, g.ringWidth - DASH_GAP)); }
    function spanStroke(g) { return Math.min(SPAN_MAX, Math.max(SPAN_MIN, g.ringWidth - 4)); }

    /* The mutation ids the ring's samples carry; every mutation when the ring is all of them. */
    function carriedIds(data, ring, index) {
        var ids = {};
        if (ring.sampleIds === null) {
            data.mutations.forEach(function (m) { ids[m.id] = true; });
            return ids;
        }
        ring.sampleIds.forEach(function (id) {
            (index.callsBySample[String(id)] || []).forEach(function (call) { ids[call[1]] = true; });
        });
        return ids;
    }

    /* Whether a mark wears its glyph: always on the outermost (or only) ring, which passes
       null; inside, only when none of the mark's mutations reaches the outermost ring. A
       bucket with one survivor reads as surviving; the tooltip lists what is in it. */
    function glyphed(mark, outerIds) {
        if (outerIds === null || outerIds === undefined) { return true; }
        return !mark.ids.some(function (id) { return outerIds[id]; });
    }

    /* Where a glyph sits: moved to (r, theta) and turned so its up points outward. */
    function glyphTransform(cx, cy, r, theta) {
        var p = polar(cx, cy, r, theta);
        return "translate(" + fmt(p[0]) + "," + fmt(p[1]) + ") rotate(" + fmt(theta * 180 / Math.PI + 90) + ")";
    }

    /* An arc of radius r from t1 to t2 clockwise. */
    function arcPath(cx, cy, r, t1, t2) {
        var a = polar(cx, cy, r, t1);
        return "M" + fmt(a[0]) + " " + fmt(a[1]) + arcCommands(cx, cy, r, t1, t2, 1);
    }

    /* A closed band between two radii from t1 to t2. */
    function annulusPath(cx, cy, r1, r2, t1, t2) {
        var a = polar(cx, cy, r2, t1), c = polar(cx, cy, r1, t2);
        return "M" + fmt(a[0]) + " " + fmt(a[1]) + arcCommands(cx, cy, r2, t1, t2, 1)
            + " L" + fmt(c[0]) + " " + fmt(c[1]) + arcCommands(cx, cy, r1, t1, t2, 0) + " Z";
    }

    function fmt(x) { return Math.round(x * 100) / 100; }

    /* The coarsest step giving at most MAX_TICKS major ticks over `total` bases. */
    function tickStep(total, maxTicks) {
        var limit = maxTicks || MAX_TICKS;
        for (var i = 0; i < TICK_STEPS.length; i++) {
            if (total / TICK_STEPS[i] <= limit) { return TICK_STEPS[i]; }
        }
        return TICK_STEPS[TICK_STEPS.length - 1];
    }

    function fmtBp(v) {
        function trim(x) { return String(Math.round(x * 100) / 100); }
        if (v >= 1e6) { return trim(v / 1e6) + " Mb"; }
        if (v >= 1e3) { return trim(v / 1e3) + " kb"; }
        return trim(v) + " bp";
    }

    /* What the rings are. `state.mode` is "sample" (`state.sampleId`, one sample on one
       ring), "samples" (`state.sampleIds`, every chosen sample on one ring, or one ring each
       with `state.stack`), "population" (`state.population`,
       narrowed by `state.treatment`, one ring per time point ascending, the untimed last),
       or "all" (one ring of every sample, the panel's). Each ring is
       {key, label, sampleIds, mixed}; `sampleIds` null means every mutation in the data. */
    function rings(data, state) {
        var byId = {};
        data.samples.forEach(function (s) { byId[String(s.id)] = s; });
        function mixed(ids) {
            return ids.some(function (id) { var s = byId[String(id)]; return s && s.is_clonal === false; });
        }
        if (state.mode === "all") {
            return [{ key: "all", label: null, sampleIds: null, mixed: false }];
        }
        if (state.mode === "sample") {
            var one = byId[String(state.sampleId)];
            return one ? [{ key: "s" + one.id, label: null, sampleIds: [one.id], mixed: mixed([one.id]) }] : [];
        }
        if (state.mode === "population") {
            var chosen = data.samples.filter(function (s) {
                return s.population === state.population
                    && (!state.treatment || s.treatment === state.treatment);
            });
            var byTime = {}, times = [], untimed = [];
            chosen.forEach(function (s) {
                if (s.time_point === null || s.time_point === undefined) { untimed.push(s.id); return; }
                var key = String(s.time_point);
                if (!(key in byTime)) { byTime[key] = { time: s.time_point, label: s.time_label, ids: [] }; times.push(key); }
                byTime[key].ids.push(s.id);
            });
            times.sort(function (a, b) { return byTime[a].time - byTime[b].time; });
            var out = times.map(function (key) {
                return { key: "t" + key, label: byTime[key].label, time: byTime[key].time,
                         sampleIds: byTime[key].ids, mixed: mixed(byTime[key].ids) };
            });
            if (untimed.length) {
                out.push({ key: "untimed", label: UNTIMED, time: null, sampleIds: untimed, mixed: mixed(untimed) });
            }
            return out;
        }
        var ids = (state.sampleIds || []).map(Number).filter(function (id) { return byId[String(id)]; });
        if (state.stack) {
            return ids.map(function (id) {
                return { key: "s" + id, label: byId[String(id)].label, sampleIds: [id], mixed: mixed([id]) };
            });
        }
        return [{ key: "chosen", label: null, sampleIds: ids, mixed: mixed(ids) }];
    }

    /* The marks of one ring: `points` bucketed by type and pixel, `spans` one per mutation,
       and the contigs the reference lacks counted in `skipped`. */
    function marksFor(data, ring, lay, r, index) {
        var calls = {};
        var wanted = null;
        if (ring.sampleIds !== null) {
            wanted = {};
            ring.sampleIds.forEach(function (id) { wanted[String(id)] = true; });
            ring.sampleIds.forEach(function (id) {
                (index.callsBySample[String(id)] || []).forEach(function (call) {
                    (calls[call[1]] = calls[call[1]] || []).push({ sample: call[0], frequency: call[2] });
                });
            });
        }
        var points = {}, pointOrder = [], spans = [], skipped = 0;
        data.mutations.forEach(function (m) {
            var carried = wanted === null ? [] : calls[m.id];
            if (wanted !== null && !carried) { return; }
            var t1 = angle(lay, m.seq_id, m.start);
            if (t1 === null) { skipped += 1; return; }
            if (m.span) {
                var contig = lay.byId[m.seq_id];
                var endPos = Math.min(m.end, contig.length);
                var t2 = angle(lay, m.seq_id, endPos);
                var pieces = [[t1, t2]];
                if (m.end > contig.length && contig.circular) {
                    pieces.push([contig.theta0, angle(lay, m.seq_id, m.end - contig.length)]);
                }
                spans.push({ type: m.type, pieces: pieces, ids: [m.id], calls: carried, n: 1 });
                return;
            }
            var key = m.type + ":" + Math.round(t1 * r / BUCKET_PX);
            if (!points[key]) {
                points[key] = { type: m.type, theta: t1, ids: [], calls: [], n: 0 };
                pointOrder.push(key);
            }
            points[key].ids.push(m.id);
            points[key].n += 1;
            carried.forEach(function (c) { points[key].calls.push(c); });
        });
        return { points: pointOrder.map(function (k) { return points[k]; }), spans: spans, skipped: skipped };
    }

    function indexCalls(data) {
        var bySample = {}, glyphById = {};
        (data.calls || []).forEach(function (call) {
            (bySample[String(call[0])] = bySample[String(call[0])] || []).push(call);
        });
        (data.mutations || []).forEach(function (m) { glyphById[m.id] = m.glyph; });
        return { callsBySample: bySample, glyphById: glyphById };
    }

    function opacityOf(mark, ring, useFrequency) {
        if (!useFrequency || !ring.mixed || !mark.calls.length) { return 1; }
        var best = 0, any = false;
        mark.calls.forEach(function (c) {
            if (c.frequency === null || c.frequency === undefined) { best = 1; any = true; return; }
            any = true;
            best = Math.max(best, c.frequency);
        });
        if (!any) { return 1; }
        return Math.max(OPACITY_FLOOR, Math.min(1, best));
    }

    /* ---- the DOM half ---- */

    var measurer = null;
    function textWidth(text, size) {
        if (typeof document === "undefined") { return text.length * (size || FONT) * 0.6; }
        if (!measurer) { measurer = document.createElement("canvas").getContext("2d"); }
        measurer.font = (size || FONT) + "px " + FONT_FAMILY;
        return measurer.measureText(text).width;
    }

    function el(name, attrs, text) {
        var node = document.createElementNS(NS, name);
        Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
        if (text !== undefined) { node.textContent = text; }
        return node;
    }

    function anchorFor(theta) {
        var c = Math.cos(theta);
        return c > 0.15 ? "start" : c < -0.15 ? "end" : "middle";
    }

    function baselineFor(theta) {
        var s = Math.sin(theta);
        return s > 0.15 ? "hanging" : s < -0.15 ? "alphabetic" : "middle";
    }

    function drawGenome(svg, lay, g, labels) {
        var band = el("g", { "class": "circos-genome" });
        var step = tickStep(lay.total);
        lay.contigs.forEach(function (c) {
            band.appendChild(el("path", {
                d: annulusPath(g.cx, g.cy, g.R - g.band, g.R, c.theta0, c.theta1),
                fill: "#e6e6e6", stroke: "#999", "stroke-width": 1
            }));
            if (!labels) { return; }
            var lastLabelEnd = -Infinity;
            for (var pos = step; pos <= c.length; pos += step) {
                var theta = angle(lay, c.id, pos);
                var a = polar(g.cx, g.cy, g.R, theta), b = polar(g.cx, g.cy, g.R + 6, theta);
                band.appendChild(el("line", { x1: fmt(a[0]), y1: fmt(a[1]), x2: fmt(b[0]), y2: fmt(b[1]),
                                               stroke: "#333", "stroke-width": 1 }));
                var words = fmtBp(pos);
                var width = textWidth(words, FONT - 1);
                var along = theta * (g.R + 9);
                if (along - lastLabelEnd < width + 6) { continue; }
                lastLabelEnd = along;
                var p = polar(g.cx, g.cy, g.R + 9, theta);
                band.appendChild(el("text", { x: fmt(p[0]), y: fmt(p[1]), "font-size": FONT - 1,
                                               "text-anchor": anchorFor(theta),
                                               "dominant-baseline": baselineFor(theta), fill: "#333" }, words));
            }
            for (var minor = step / 5; minor <= c.length; minor += step / 5) {
                if (Math.abs((minor / step) - Math.round(minor / step)) < 1e-9) { continue; }
                var tm = angle(lay, c.id, minor);
                var m1 = polar(g.cx, g.cy, g.R, tm), m2 = polar(g.cx, g.cy, g.R + 3, tm);
                band.appendChild(el("line", { x1: fmt(m1[0]), y1: fmt(m1[1]), x2: fmt(m2[0]), y2: fmt(m2[1]),
                                               stroke: "#666", "stroke-width": 0.5 }));
            }
            if (lay.contigs.length > 1) {
                var mid = (c.theta0 + c.theta1) / 2;
                if (c.theta1 - c.theta0 >= rad(4)) {
                    var q = polar(g.cx, g.cy, g.R + 34, mid);
                    band.appendChild(el("text", { x: fmt(q[0]), y: fmt(q[1]), "font-size": FONT, "font-weight": "bold",
                                                   "text-anchor": anchorFor(mid), "dominant-baseline": baselineFor(mid),
                                                   fill: "#222" }, c.id));
                } else {
                    var title = el("title", {}, c.id + " (" + fmtBp(c.length) + ")");
                    band.lastChild.appendChild(title);
                }
            }
        });
        if (labels && lay.contigs.length === 1) {
            band.appendChild(el("text", { x: g.cx, y: g.cy - 7, "font-size": FONT + 2, "font-weight": "bold",
                                           "text-anchor": "middle", fill: "#222" }, lay.contigs[0].id));
            band.appendChild(el("text", { x: g.cx, y: g.cy + 10, "font-size": FONT, "text-anchor": "middle",
                                           fill: "#555" }, fmtBp(lay.contigs[0].length)));
        }
        svg.appendChild(band);
    }

    function glyphUse(name, size, color, transform) {
        var u = el("use", { href: "#glyph-" + name, x: -size / 2, y: -size / 2, width: size, height: size,
                            fill: color, stroke: "none", transform: transform, "class": "circos-glyph-mark" });
        u.setAttributeNS(XLINK, "xlink:href", "#glyph-" + name);
        return u;
    }

    /* One ring: a thin grey line per contig, a dash per point, a thick arc per span, and the
       glyph on whichever marks `glyphed` says. `options.outerIds` is the outermost ring's
       carried set, or null on the outermost ring itself. */
    function drawRing(svg, data, ring, i, lay, g, index, options) {
        var n = Number(svg.getAttribute("data-rings")) || 1;
        var rl = ringRadius(g, i);
        var d = dashLength(g);
        var size = i === n - 1 ? GLYPH : Math.max(GLYPH_MIN, Math.min(GLYPH, g.ringWidth - 3));
        var group = el("g", { "class": "circos-ring", "data-ring": i });
        // The line spans the genome and nothing else: over the gap between contigs and at the
        // origin there is no reference to be mutated, so there is no ring.
        lay.contigs.forEach(function (c) {
            group.appendChild(el("path", { d: arcPath(g.cx, g.cy, rl, c.theta0, c.theta1), fill: "none",
                                           stroke: ringGrey(i, n), "stroke-width": RING_LINE, "class": "circos-ring-line" }));
        });
        var marks = marksFor(data, ring, lay, rl, index);
        var stroke = spanStroke(g);
        marks.spans.forEach(function (span) {
            var color = data.colors[span.type] || "#333";
            var node = el("g", { "class": "circos-mark", "data-ids": span.ids.join(","), "data-type": span.type,
                                 "data-ring": i, opacity: opacityOf(span, ring, options.frequency) });
            span.pieces.forEach(function (piece) {
                var t1 = piece[0], t2 = piece[1];
                var minAngle = MIN_ARC_PX / rl;
                if (t2 - t1 < minAngle) { var c = (t1 + t2) / 2; t1 = c - minAngle / 2; t2 = c + minAngle / 2; }
                node.appendChild(el("path", { d: arcPath(g.cx, g.cy, rl, t1, t2), fill: "none",
                                              stroke: color, "stroke-width": fmt(stroke) }));
            });
            if (glyphed(span, options.outerIds)) {
                var first = span.pieces[0];
                node.appendChild(glyphUse(index.glyphById[span.ids[0]] || "square", size, color,
                                          glyphTransform(g.cx, g.cy, rl + stroke / 2 + 1 + size / 2, (first[0] + first[1]) / 2)));
            }
            node.__circos = span;
            group.appendChild(node);
        });
        marks.points.forEach(function (point) {
            var a = polar(g.cx, g.cy, rl - d / 2, point.theta), b = polar(g.cx, g.cy, rl + d / 2, point.theta);
            var color = data.colors[point.type] || "#333";
            var node = el("g", { "class": "circos-mark", "data-ids": point.ids.join(","), "data-type": point.type,
                                 "data-ring": i, opacity: opacityOf(point, ring, options.frequency) });
            node.appendChild(el("line", { x1: fmt(a[0]), y1: fmt(a[1]), x2: fmt(b[0]), y2: fmt(b[1]),
                                          stroke: color, "stroke-width": 1.5 }));
            if (glyphed(point, options.outerIds)) {
                node.appendChild(glyphUse(index.glyphById[point.ids[0]] || "square", size, color,
                                          glyphTransform(g.cx, g.cy, rl + d / 2 + 1 + size / 2, point.theta)));
            }
            node.__circos = point;
            group.appendChild(node);
        });
        svg.appendChild(group);
        return marks.skipped;
    }

    function drawRingLabels(svg, ringList, g) {
        if (ringList.length < 2) { return; }
        var every = Math.max(1, Math.ceil(ringList.length / 24));
        var labels = el("g", { "class": "circos-ring-labels" });
        ringList.forEach(function (ring, i) {
            if (ring.label === null || ring.label === undefined) { return; }
            if (i % every !== 0 && i !== ringList.length - 1) { return; }
            var y = g.cy - ringRadius(g, i);
            labels.appendChild(el("text", { x: g.cx, y: fmt(y), "font-size": Math.min(FONT - 1, Math.max(7, g.ringWidth - 2)),
                                             "text-anchor": "middle", "dominant-baseline": "middle",
                                             fill: "#333" }, ring.label));
        });
        svg.appendChild(labels);
    }

    /* The plot. `state` is what `rings` reads plus `labels` (ticks and names) and
       `frequency` (opacity by frequency). The SVG carries `data-rings`, `data-skipped` (the
       mutations on contigs the reference lacks) and each mark's mutation ids. */
    function draw(data, state, width) {
        var ringList = rings(data, state);
        if (!ringList.length) { ringList = [{ key: "none", label: null, sampleIds: [], mixed: false }]; }
        var lay = layout(data.contigs, { rings: ringList.length });
        var g = geometry(width, ringList.length);
        var svg = el("svg", { xmlns: NS, width: width, height: width, viewBox: "0 0 " + width + " " + width,
                              "font-family": FONT_FAMILY, "data-circos": "1", "data-rings": ringList.length });
        svg.appendChild(el("rect", { width: width, height: width, fill: "#fff" }));
        var index = indexCalls(data);
        var skipped = 0;
        var labels = state.labels !== false;
        var outerIds = ringList.length > 1 ? carriedIds(data, ringList[ringList.length - 1], index) : null;
        ringList.forEach(function (ring, i) {
            skipped += drawRing(svg, data, ring, i, lay, g, index, {
                frequency: state.frequency !== false,
                outerIds: i === ringList.length - 1 ? null : outerIds
            });
        });
        drawGenome(svg, lay, g, labels);
        if (labels) { drawRingLabels(svg, ringList, g); }
        svg.setAttribute("data-skipped", skipped);
        svg.__rings = ringList;
        return svg;
    }

    function fileStyle() {
        return el("style", {}, "text{font-family:" + FILE_FONT_FAMILY + "}");
    }

    /* The SVG as a file: the sprite's symbols copied in, a legend of the types and the glyphs
       drawn, a note and a title beneath, so it stands alone. */
    function standalone(svg, options) {
        options = options || {};
        var copy = svg.cloneNode(true);
        var width = Number(svg.getAttribute("width")), height = Number(svg.getAttribute("height"));
        var defs = el("defs");
        var sprite = document.querySelector("[data-glyph-sprite] defs");
        if (sprite) {
            Array.prototype.forEach.call(sprite.querySelectorAll("symbol"), function (symbol) {
                defs.appendChild(symbol.cloneNode(true));
            });
        }
        defs.appendChild(fileStyle());
        copy.insertBefore(defs, copy.firstChild);
        var types = {}, glyphs = {};
        Array.prototype.forEach.call(svg.querySelectorAll("[data-type]"), function (node) {
            types[node.getAttribute("data-type")] = true;
        });
        Array.prototype.forEach.call(svg.querySelectorAll("use"), function (node) {
            glyphs[(node.getAttribute("href") || "").replace("#glyph-", "")] = true;
        });
        var legend = el("g", { transform: "translate(16," + (height + 8) + ")" });
        var x = 0, y = 0;
        var LINE = 18, SW = 12;
        Object.keys(options.colors || {}).filter(function (t) { return types[t]; }).forEach(function (type) {
            legend.appendChild(el("rect", { x: x, y: y + 2, width: SW, height: SW, fill: options.colors[type] }));
            legend.appendChild(el("text", { x: x + SW + 4, y: y + SW, "font-size": FONT, fill: "#222" }, type));
            x += SW + 4 + textWidth(type) + 14;
        });
        y += LINE; x = 0;
        (options.glyphs || []).filter(function (entry) { return glyphs[entry[0]]; }).forEach(function (entry) {
            var w = SW + 4 + textWidth(entry[1]) + 14;
            if (x + w > width - 32 && x > 0) { x = 0; y += LINE; }
            var u = el("use", { href: "#glyph-" + entry[0], x: x, y: y + 2, width: SW, height: SW, fill: "#333" });
            u.setAttributeNS(XLINK, "xlink:href", "#glyph-" + entry[0]);
            legend.appendChild(u);
            legend.appendChild(el("text", { x: x + SW + 4, y: y + SW, "font-size": FONT, fill: "#222" }, entry[1]));
            x += w;
        });
        y += LINE;
        if (Number(svg.getAttribute("data-rings")) > 1) {
            legend.appendChild(el("text", { x: 0, y: y + SW, "font-size": FONT, fill: "#555" },
                                  "Rings are time points, innermost earliest. A symbol inside the outermost ring marks a mutation no sample on that ring carries."));
            y += LINE;
        }
        if (options.title) {
            legend.appendChild(el("text", { x: 0, y: y + SW, "font-size": FONT, fill: "#555" }, options.title));
            y += LINE;
        }
        copy.appendChild(legend);
        var total = height + 8 + y + 4;
        copy.setAttribute("height", total);
        copy.setAttribute("viewBox", "0 0 " + width + " " + total);
        copy.removeAttribute("data-circos");
        return XML_DECLARATION + new XMLSerializer().serializeToString(copy);
    }

    function download(text, name, type) {
        var blob = new Blob([text], { type: type });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    var api = { layout: layout, angle: angle, polar: polar, geometry: geometry, plotWidth: plotWidth,
                arcPath: arcPath, annulusPath: annulusPath, tickStep: tickStep, fmtBp: fmtBp,
                rings: rings, marksFor: marksFor, indexCalls: indexCalls, opacityOf: opacityOf,
                ringGrey: ringGrey, ringRadius: ringRadius, dashLength: dashLength, spanStroke: spanStroke,
                carriedIds: carriedIds, glyphed: glyphed, glyphTransform: glyphTransform,
                draw: draw, standalone: standalone, download: download, UNTIMED: UNTIMED };
    root.mutintCircosPlot = api;
    if (typeof module !== "undefined" && module.exports) { module.exports = api; }
}(typeof window !== "undefined" ? window : this));
