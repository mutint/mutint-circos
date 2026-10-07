/* The reference genome as a circle, with mutations marked around it.
 *
 * `window.mutintCircosPlot.draw(data, state, width)` returns an SVG: the contigs laid end to
 * end clockwise from twelve o'clock as a grey band with coordinate ticks outside it, and
 * inside it one or more rings, each holding the mutations of a set of samples. A **point**
 * mutation -- a base substitution, a small indel, a mobile element at its insertion point --
 * is a radial line across its ring, coloured by type; a **span** -- a deletion, amplification,
 * inversion or conversion longer than `data.arc_threshold` -- is an arc over its extent. Two
 * points of one type under the same pixel become one mark that knows how many it stands for.
 *
 * `rings(data, state)` decides what the rings are: one for a chosen set of samples, one per
 * chosen sample, or one per time point of a population with the earliest innermost -- that
 * last being how a population's mutations are followed through time. Rings share the space
 * between the centre hole and the band, so more rings are thinner rings, down to a floor.
 *
 * The geometry (`layout`, `angle`, `geometry`, `arcPath`, `tickStep`, `rings`) is free of the
 * DOM so it can be run under node; `draw`, `standalone` and `download` need a document.
 *
 * The design -- one ring, Okabe-Ito colours by type, long deletions as arcs -- follows
 * github.com/PadmanabhanKann/genome_visualisation, which draws breseq output with NG-Circos.
 * Nothing is copied from it: that library is licensed for non-commercial use only.
 */
(function (root) {
    "use strict";

    var NS = "http://www.w3.org/2000/svg";
    var TAU = 2 * Math.PI;
    var GAP_DEG = 1.5;          // between contigs
    var LABEL_GAP_DEG = 14;     // at the origin, when ring labels need a column
    var OUTER_MARGIN = 60;      // tick labels and contig names live here
    var BAND = 10;              // the genome band
    var RING_GAP = 8;           // between the band and the outermost ring
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
        var origin = (options.rings || 1) > 1 ? rad(LABEL_GAP_DEG) : between;
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

    /* An arc of radius r from t1 to t2 clockwise. */
    function arcPath(cx, cy, r, t1, t2) {
        var a = polar(cx, cy, r, t1), b = polar(cx, cy, r, t2);
        var large = (t2 - t1) > Math.PI ? 1 : 0;
        return "M" + fmt(a[0]) + " " + fmt(a[1]) + " A" + fmt(r) + " " + fmt(r) + " 0 " + large
            + " 1 " + fmt(b[0]) + " " + fmt(b[1]);
    }

    /* A closed band between two radii from t1 to t2. */
    function annulusPath(cx, cy, r1, r2, t1, t2) {
        var a = polar(cx, cy, r2, t1), b = polar(cx, cy, r2, t2);
        var c = polar(cx, cy, r1, t2), d = polar(cx, cy, r1, t1);
        var large = (t2 - t1) > Math.PI ? 1 : 0;
        return "M" + fmt(a[0]) + " " + fmt(a[1]) + " A" + fmt(r2) + " " + fmt(r2) + " 0 " + large + " 1 " + fmt(b[0]) + " " + fmt(b[1])
            + " L" + fmt(c[0]) + " " + fmt(c[1]) + " A" + fmt(r1) + " " + fmt(r1) + " 0 " + large + " 0 " + fmt(d[0]) + " " + fmt(d[1]) + " Z";
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

    /* What the rings are. `state.mode` is "samples" (`state.sampleIds`, every chosen sample
       on one ring, or one ring each with `state.stack`), "population" (`state.population`,
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
        var bySample = {};
        (data.calls || []).forEach(function (call) {
            (bySample[String(call[0])] = bySample[String(call[0])] || []).push(call);
        });
        return { callsBySample: bySample };
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

    function drawRing(svg, data, ring, i, lay, g, index, options) {
        var r0 = g.r0(i), r1 = r0 + g.ringWidth - 2;
        var mid = (r0 + r1) / 2;
        var group = el("g", { "class": "circos-ring", "data-ring": i });
        group.appendChild(el("circle", { cx: g.cx, cy: g.cy, r: fmt(mid), fill: "none",
                                         stroke: "#eee", "stroke-width": fmt(r1 - r0) }));
        var marks = marksFor(data, ring, lay, r1, index);
        var stroke = r1 - r0;
        marks.spans.forEach(function (span) {
            var opacity = opacityOf(span, ring, options.frequency);
            span.pieces.forEach(function (piece) {
                var t1 = piece[0], t2 = piece[1];
                var minAngle = MIN_ARC_PX / mid;
                if (t2 - t1 < minAngle) { var c = (t1 + t2) / 2; t1 = c - minAngle / 2; t2 = c + minAngle / 2; }
                var node = el("path", { d: arcPath(g.cx, g.cy, mid, t1, t2), fill: "none",
                                        stroke: data.colors[span.type] || "#333", "stroke-width": fmt(stroke),
                                        "stroke-opacity": opacity, "data-ids": span.ids.join(","),
                                        "data-type": span.type, "data-ring": i, "class": "circos-mark" });
                node.__circos = span;
                group.appendChild(node);
            });
        });
        marks.points.forEach(function (point) {
            var a = polar(g.cx, g.cy, r0, point.theta), b = polar(g.cx, g.cy, r1, point.theta);
            var opacity = opacityOf(point, ring, options.frequency);
            if (point.type === "MOB") {
                group.appendChild(el("line", { x1: fmt(a[0]), y1: fmt(a[1]), x2: fmt(b[0]), y2: fmt(b[1]),
                                                stroke: "#777", "stroke-width": 2.5, "stroke-opacity": opacity }));
            }
            var node = el("line", { x1: fmt(a[0]), y1: fmt(a[1]), x2: fmt(b[0]), y2: fmt(b[1]),
                                    stroke: data.colors[point.type] || "#333", "stroke-width": 1.5,
                                    "stroke-opacity": opacity, "data-ids": point.ids.join(","),
                                    "data-type": point.type, "data-ring": i, "class": "circos-mark" });
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
            var y = g.cy - (g.r0(i) + (g.ringWidth - 2) / 2);
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
        var lay = layout(data.contigs, { rings: ringList.length });
        var g = geometry(width, ringList.length);
        var svg = el("svg", { xmlns: NS, width: width, height: width, viewBox: "0 0 " + width + " " + width,
                              "font-family": FONT_FAMILY, "data-circos": "1", "data-rings": ringList.length });
        svg.appendChild(el("rect", { width: width, height: width, fill: "#fff" }));
        var index = indexCalls(data);
        var skipped = 0;
        var labels = state.labels !== false;
        ringList.forEach(function (ring, i) {
            skipped += drawRing(svg, data, ring, i, lay, g, index, { frequency: state.frequency !== false });
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

    /* The SVG as a file: a legend of the types drawn and a title beneath, so it stands alone. */
    function standalone(svg, options) {
        options = options || {};
        var copy = svg.cloneNode(true);
        var width = Number(svg.getAttribute("width")), height = Number(svg.getAttribute("height"));
        var defs = el("defs");
        defs.appendChild(fileStyle());
        copy.insertBefore(defs, copy.firstChild);
        var types = {};
        Array.prototype.forEach.call(svg.querySelectorAll("[data-type]"), function (node) {
            types[node.getAttribute("data-type")] = true;
        });
        var order = Object.keys(options.colors || {});
        var present = order.filter(function (t) { return types[t]; });
        var legend = el("g", { transform: "translate(16," + (height + 8) + ")" });
        var x = 0;
        present.forEach(function (type) {
            legend.appendChild(el("rect", { x: x, y: 2, width: 12, height: 12, fill: options.colors[type] }));
            legend.appendChild(el("text", { x: x + 16, y: 12, "font-size": FONT, fill: "#222" }, type));
            x += 16 + textWidth(type) + 14;
        });
        var y = 30;
        if (options.title) {
            legend.appendChild(el("text", { x: 0, y: y, "font-size": FONT, fill: "#555" }, options.title));
            y += 16;
        }
        copy.appendChild(legend);
        var total = height + 8 + y;
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
                draw: draw, standalone: standalone, download: download, UNTIMED: UNTIMED };
    root.mutintCircosPlot = api;
    if (typeof module !== "undefined" && module.exports) { module.exports = api; }
}(typeof window !== "undefined" ? window : this));
