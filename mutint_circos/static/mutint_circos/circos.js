/* The Circos page's controls, and the panel's one ring.
 *
 * The payload arrives whole as JSON (`#circos-data`); this script reads the controls into a
 * state, hands it to circos_plot.js, and redraws on every change -- no request is made after
 * the page loads. The choices are remembered through mutintPreferences: `circos.mode`,
 * `circos.frequency`, `circos.labels`, and per experiment `circos.sample.<experiment>`,
 * `circos.population.<experiment>`, `circos.treatment.<experiment>` and
 * `circos.linear.hidden.<experiment>` (the samples the linear tab leaves out, so one added
 * later is drawn by default).
 *
 * Three tabs. One Sample (Circular)'s menu is the Mutations page's sample picker: a dropdown
 * whose button carries the chosen sample's name and whose chosen row is the one marked
 * `active` -- one sample at a time. Multiple Samples (Circular) is one population as one
 * ring per time point. Multiple Samples (Linear)'s menu is Compare's Samples menu: every
 * row `active` is drawn, driven by mutintSelectList in toggle mode, with Show all / Hide
 * all and a population and a treatment menu that each set the selection to a subset.
 *
 * The tooltip is one box the whole plot shares, filled from the mark under the pointer:
 * what the mutation is, where, which samples carry it and at what frequency.
 */
(function () {
    "use strict";

    var plot = window.mutintCircosPlot;

    function percent(frequency) {
        if (frequency === null || frequency === undefined) { return ""; }
        return Math.round(frequency * 100) + "%";
    }

    function text(node, words) { node.textContent = words; return node; }

    function line(container, label, words, options) {
        if (!words && !(options && options.always)) { return; }
        var div = document.createElement("div");
        if (label) {
            var b = document.createElement("b");
            b.textContent = label + ": ";
            div.appendChild(b);
        }
        div.appendChild(document.createTextNode(words));
        container.appendChild(div);
    }

    /* What the tooltip says for a mark: the mutation (or the first few of a bucket), its
       place, and the samples carrying it on that ring. */
    function describe(tip, mark, data, index) {
        tip.textContent = "";
        var shown = mark.ids.slice(0, 3);
        if (mark.n > 1) {
            var head = document.createElement("div");
            head.className = "circos-tip-head";
            head.textContent = mark.n + " " + mark.type + " mutations at this position";
            tip.appendChild(head);
        }
        shown.forEach(function (id) {
            var m = index.mutations[String(id)];
            if (!m) { return; }
            var block = document.createElement("div");
            block.className = "circos-tip-mutation";
            var head = document.createElement("div");
            head.className = "circos-tip-head";
            head.textContent = m.type + (m.change ? " " + m.change : "");
            block.appendChild(head);
            var where = m.seq_id + ":" + m.start.toLocaleString();
            if (m.end > m.start) { where += "–" + m.end.toLocaleString(); }
            line(block, "Position", where);
            line(block, "Gene", m.gene);
            line(block, "Product", m.product);
            tip.appendChild(block);
        });
        if (mark.ids.length > shown.length) {
            line(tip, null, "and " + (mark.ids.length - shown.length) + " more");
        }
        if (mark.calls && mark.calls.length) {
            var samples = {};
            mark.calls.forEach(function (call) {
                var s = index.samples[String(call.sample)];
                if (!s) { return; }
                var words = s.label + (call.frequency !== null && call.frequency !== undefined && call.frequency < 1
                                       ? " " + percent(call.frequency) : "");
                samples[words] = true;
            });
            var names = Object.keys(samples);
            line(tip, names.length === 1 ? "Sample" : "Samples", names.slice(0, 8).join(", ")
                 + (names.length > 8 ? " and " + (names.length - 8) + " more" : ""));
        }
    }

    function wireTooltip(box, tip, data) {
        var index = { mutations: {}, samples: {} };
        data.mutations.forEach(function (m) { index.mutations[String(m.id)] = m; });
        data.samples.forEach(function (s) { index.samples[String(s.id)] = s; });
        var current = null;
        function place(event) {
            var rect = box.getBoundingClientRect();
            var x = event.clientX - rect.left + 14, y = event.clientY - rect.top + 14;
            tip.style.left = Math.min(x, Math.max(0, rect.width - tip.offsetWidth - 4)) + "px";
            tip.style.top = y + "px";
        }
        box.addEventListener("mouseover", function (event) {
            var mark = event.target.closest && event.target.closest("[data-ids]");
            if (!mark || !mark.__circos) { return; }
            if (mark !== current) { describe(tip, mark.__circos, data, index); current = mark; }
            tip.hidden = false;
            place(event);
        });
        box.addEventListener("mousemove", function (event) {
            if (!tip.hidden) { place(event); }
        });
        box.addEventListener("mouseout", function (event) {
            var mark = event.target.closest && event.target.closest("[data-ids]");
            if (mark) { tip.hidden = true; current = null; }
        });
    }

    function initPage(root) {
        var data = window.mutintPreferences.embedded("circos-data");
        if (!data.has_reference) { return; }
        var experimentId = root.getAttribute("data-experiment-id");
        var fileStem = root.getAttribute("data-file-stem") || "circos";
        var prefs = window.mutintPreferences({
            authenticated: root.getAttribute("data-authenticated") === "1",
            url: root.getAttribute("data-preferences-url"),
            embedded: window.mutintPreferences.embedded("circos-prefs")
        });
        var box = root.querySelector("[data-role='plot']");
        var tip = root.querySelector("[data-role='tip']");
        var summary = root.querySelector("[data-role='summary']");
        var note = root.querySelector("[data-role='note']");
        var sampleView = root.querySelector("[data-role='sample-view']");
        var sampleMenu = root.querySelector("[data-role='sample']");
        var sampleName = root.querySelector("[data-role='sample-name']");
        var populationView = root.querySelector("[data-role='population-view']");
        var populationSelect = root.querySelector("[data-role='population']");
        var treatmentSelect = root.querySelector("[data-role='treatment']");
        var linearView = root.querySelector("[data-role='linear-view']");
        var linearList = root.querySelector("[data-role='linear-samples']");
        var linearCount = root.querySelector("[data-role='linear-count']");
        var linearPopulation = root.querySelector("[data-role='linear-population']");
        var linearTreatment = root.querySelector("[data-role='linear-treatment']");
        var frequencyBox = root.querySelector("[data-role='frequency']");
        var labelsBox = root.querySelector("[data-role='labels']");
        var sampleKey = "circos.sample." + experimentId;
        var populationKey = "circos.population." + experimentId;
        var treatmentKey = "circos.treatment." + experimentId;
        var hiddenKey = "circos.linear.hidden." + experimentId;
        var labelOf = {}, sampleOf = {};
        data.samples.forEach(function (sample) { labelOf[String(sample.id)] = sample.label; sampleOf[String(sample.id)] = sample; });

        var MODES = ["sample", "population", "linear"];
        var mode = prefs.get("circos.mode", "sample");
        if (MODES.indexOf(mode) < 0) { mode = "sample"; }
        frequencyBox.checked = prefs.get("circos.frequency", true) !== false;
        labelsBox.checked = prefs.get("circos.labels", true) !== false;

        /* The linear tab's samples: every row is drawn unless it was hidden. */
        var hidden = {};
        (prefs.get(hiddenKey, []) || []).forEach(function (id) { hidden[String(id)] = true; });
        var picker = window.mutintSelectList(linearList, {
            toggle: true, controls: null,
            onChange: function () { rememberHidden(); showCount(); redraw(); }
        });
        picker.select(function (row) { return !hidden[row.getAttribute("data-value")]; });
        function rememberHidden() {
            var out = [];
            picker.rows().forEach(function (row) {
                if (!picker.isSelected(row)) { out.push(Number(row.getAttribute("data-value"))); }
            });
            prefs.set(hiddenKey, out);
        }
        function showCount() {
            if (linearCount) { linearCount.textContent = picker.count(); }
        }
        Array.prototype.forEach.call(root.querySelectorAll("[data-samples]"), function (button) {
            button.addEventListener("click", function () {
                var all = button.getAttribute("data-samples") === "all";
                picker.select(function () { return all; });
            });
        });
        /* The population and treatment menus set the selection to the samples matching
           both, "all" and "any" meaning no narrowing on that axis. */
        function selectSubset() {
            var population = linearPopulation ? linearPopulation.value : "all";
            var treatment = linearTreatment ? linearTreatment.value : "";
            picker.select(function (row) {
                var s = sampleOf[row.getAttribute("data-value")];
                return !!s && (population === "all" || s.population === population)
                    && (treatment === "" || (s.treatment || "") === treatment);
            });
        }
        if (linearPopulation) { linearPopulation.addEventListener("change", selectSubset); }
        if (linearTreatment) { linearTreatment.addEventListener("change", selectSubset); }

        /* One sample: the remembered one if it still exists, else the first. */
        var sampleId = String(prefs.get(sampleKey, ""));
        if (!(sampleId in labelOf)) { sampleId = data.samples.length ? String(data.samples[0].id) : ""; }
        function showSample() {
            sampleName.textContent = labelOf[sampleId] || "";
            Array.prototype.forEach.call(sampleMenu.querySelectorAll("li[data-value]"), function (row) {
                row.classList.toggle("active", row.getAttribute("data-value") === sampleId);
            });
        }
        sampleMenu.addEventListener("click", function (event) {
            var row = event.target.closest("li[data-value]");
            if (!row) { return; }
            event.preventDefault();
            sampleId = row.getAttribute("data-value");
            prefs.set(sampleKey, sampleId);
            showSample();
            redraw();
        });

        var population = prefs.get(populationKey, null);
        if (population !== null && Array.prototype.some.call(populationSelect.options, function (o) { return o.value === population; })) {
            populationSelect.value = population;
        }
        if (treatmentSelect) {
            var treatment = prefs.get(treatmentKey, "");
            if (Array.prototype.some.call(treatmentSelect.options, function (o) { return o.value === treatment; })) {
                treatmentSelect.value = treatment;
            }
        }

        function state() {
            return {
                mode: mode,
                sampleId: sampleId,
                sampleIds: picker.selected().map(Number),
                population: populationSelect.value,
                treatment: treatmentSelect ? treatmentSelect.value : "",
                frequency: frequencyBox.checked,
                labels: labelsBox.checked
            };
        }

        function showMode() {
            Array.prototype.forEach.call(root.querySelectorAll("[data-mode]"), function (tab) {
                (tab.closest("li") || tab).classList.toggle("active", tab.getAttribute("data-mode") === mode);
            });
            sampleView.hidden = mode !== "sample";
            populationView.hidden = mode !== "population";
            linearView.hidden = mode !== "linear";
        }

        function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }

        /* What the plot left off, if anything: said under the plot and in the file. */
        function droppedSentence(ringList) {
            if (!ringList.dropped) { return ""; }
            var shown = ringList.length;
            return "Drawing the first " + shown + " time points of " + (shown + ringList.dropped) + "; "
                + plural(ringList.dropped, "later time point") + " (" + plural(ringList.droppedSamples, "sample")
                + ") " + (ringList.dropped === 1 ? "is" : "are") + " not shown. Use Multiple Samples (Linear) for all of them.";
        }

        function summarize(ringList, s) {
            var mixed = ringList.some(function (ring) { return ring.mixed; });
            frequencyBox.disabled = !mixed;
            if (s.mode === "linear") {
                if (!ringList.length) { return "No samples chosen."; }
                var populations = {}, treatments = {}, times = {}, untimedTracks = 0;
                ringList.forEach(function (track) {
                    populations[track.population] = true;
                    if (track.treatment) { treatments[track.treatment] = true; }
                    if (track.time === null) { untimedTracks += 1; } else { times[String(track.time)] = true; }
                });
                var nPop = Object.keys(populations).length, nTreat = Object.keys(treatments).length,
                    nTimes = Object.keys(times).length;
                var parts = [];
                if (nPop > 1) { parts.push(plural(nPop, "population")); }
                if (nTreat > 1) { parts.push(plural(nTreat, "treatment")); }
                if (nTimes > 1) { parts.push(plural(nTimes, "time point") + ", lightest earliest"); }
                var linearWords = plural(ringList.length, "sample") + " as " + plural(ringList.length, "track")
                    + (parts.length ? ": " + parts.join(", ") : "");
                if (untimedTracks) { linearWords += "; " + plural(untimedTracks, "sample") + " with no time point drawn last"; }
                return linearWords + ".";
            }
            if (s.mode === "population") {
                var timed = ringList.filter(function (ring) { return ring.time !== null; });
                var untimed = ringList.filter(function (ring) { return ring.time === null; });
                var count = 0;
                ringList.forEach(function (ring) { count += ring.sampleIds.length; });
                if (!count) {
                    return "No samples in " + s.population + (s.treatment ? " under " + s.treatment : "") + ".";
                }
                var words = count + " sample" + (count === 1 ? "" : "s") + " of " + s.population
                    + (s.treatment ? " under " + s.treatment : "") + ": "
                    + timed.length + " time point" + (timed.length === 1 ? "" : "s") + " as "
                    + timed.length + " ring" + (timed.length === 1 ? "" : "s")
                    + (timed.length ? ", innermost " + timed[0].label : "");
                if (untimed.length) {
                    words += "; " + untimed[0].sampleIds.length + " with no time point in the outer ring";
                }
                words += ".";
                if (ringList.dropped) { words += " " + droppedSentence(ringList); }
                else if (ringList.length > 12) { words += " Many rings are thin: Multiple Samples (Linear) may read better."; }
                return words;
            }
            if (!ringList.length) { return "No sample to draw."; }
            var n = 0;
            ringList.forEach(function (ring) { n += ring.sampleIds ? ring.sampleIds.length : 0; });
            var marks = box.querySelectorAll(".circos-mark").length;
            return (labelOf[s.sampleId] || "") + ": " + marks + " mark" + (marks === 1 ? "" : "s") + ".";
        }

        var current = null;
        function redraw() {
            var s = state();
            var ringList = plot.rings(data, s);
            var width = s.mode === "linear" ? plot.linearWidth(box.clientWidth) : plot.plotWidth(box.clientWidth, ringList.length);
            var svg = plot.draw(data, s, width);
            box.textContent = "";
            box.appendChild(svg);
            current = svg;
            summary.textContent = summarize(ringList, s);
            var skipped = Number(svg.getAttribute("data-skipped")) || 0;
            note.textContent = skipped
                ? skipped + " mutation" + (skipped === 1 ? " is" : "s are") + " on a sequence the reference does not have and could not be drawn."
                : "";
        }

        Array.prototype.forEach.call(root.querySelectorAll("[data-mode]"), function (tab) {
            tab.addEventListener("click", function (event) {
                event.preventDefault();
                mode = tab.getAttribute("data-mode");
                prefs.set("circos.mode", mode);
                showMode();
                redraw();
            });
        });
        frequencyBox.addEventListener("change", function () { prefs.set("circos.frequency", frequencyBox.checked); redraw(); });
        labelsBox.addEventListener("change", function () { prefs.set("circos.labels", labelsBox.checked); redraw(); });
        populationSelect.addEventListener("change", function () { prefs.set(populationKey, populationSelect.value); redraw(); });
        if (treatmentSelect) {
            treatmentSelect.addEventListener("change", function () { prefs.set(treatmentKey, treatmentSelect.value); redraw(); });
        }
        var exportButton = root.querySelector("[data-export='svg']");
        exportButton.addEventListener("click", function () {
            if (!current) { return; }
            var s = state();
            var title = s.mode === "population"
                ? s.population + (s.treatment ? " under " + s.treatment : "") + ", one ring per time point, innermost earliest"
                : s.mode === "linear"
                ? plural(s.sampleIds.length, "sample") + ", one track each, ordered by treatment, population and time point"
                : (labelOf[s.sampleId] || "");
            plot.download(plot.standalone(current, { colors: data.colors, glyphs: data.glyphs, title: title,
                                                      dropped: droppedSentence(current.__rings || []) }),
                          fileStem + (s.mode === "linear" ? "_linear.svg" : "_circos.svg"), "image/svg+xml");
        });
        var timer = null;
        window.addEventListener("resize", function () {
            clearTimeout(timer);
            timer = setTimeout(redraw, 150);
        });

        showSample();
        showCount();
        wireTooltip(box, tip, data);
        showMode();
        redraw();
    }

    function initPanel(root) {
        var data = window.mutintPreferences.embedded("circos-panel-data");
        if (!data.has_reference) { return; }
        var box = root.querySelector("[data-role='plot']");
        var tip = root.querySelector("[data-role='tip']");
        var width = plot.plotWidth(Math.min(box.clientWidth || 480, 520), 1);
        box.appendChild(plot.draw(data, { mode: "all", labels: true }, width));
        wireTooltip(box, tip, data);
    }

    function init() {
        Array.prototype.forEach.call(document.querySelectorAll("[data-circos]"), initPage);
        Array.prototype.forEach.call(document.querySelectorAll("[data-circos-panel]"), initPanel);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
}());
