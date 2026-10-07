/* The Circos page's controls, and the panel's one ring.
 *
 * The payload arrives whole as JSON (`#circos-data`); this script reads the controls into a
 * state, hands it to circos_plot.js, and redraws on every change -- no request is made after
 * the page loads. Six choices are remembered through mutintPreferences: `circos.mode`,
 * `circos.stack`, `circos.frequency`, `circos.labels`, and per experiment
 * `circos.samples.<experiment>` (the hidden set, so a sample imported later shows) and
 * `circos.population.<experiment>` / `circos.treatment.<experiment>`.
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
        var samplesView = root.querySelector("[data-role='samples-view']");
        var stackGroup = root.querySelector("[data-role='stack-group']");
        var stackBox = root.querySelector("[data-role='stack']");
        var populationGroup = root.querySelector("[data-role='population-group']");
        var populationSelect = root.querySelector("[data-role='population']");
        var treatmentGroup = root.querySelector("[data-role='treatment-group']");
        var treatmentSelect = root.querySelector("[data-role='treatment']");
        var frequencyBox = root.querySelector("[data-role='frequency']");
        var labelsBox = root.querySelector("[data-role='labels']");
        var list = root.querySelector("#circos-samples");
        var samplesKey = "circos.samples." + experimentId;
        var populationKey = "circos.population." + experimentId;
        var treatmentKey = "circos.treatment." + experimentId;

        var mode = prefs.get("circos.mode", "samples") === "population" ? "population" : "samples";
        stackBox.checked = !!prefs.get("circos.stack", false);
        frequencyBox.checked = prefs.get("circos.frequency", true) !== false;
        labelsBox.checked = prefs.get("circos.labels", true) !== false;

        var hidden = window.mutintPreferences.hiddenSet(prefs.get(samplesKey, null));
        var picker = window.mutintSelectList(list, {
            toggle: true,
            onChange: function () {
                var off = picker.rows().filter(function (row) { return !picker.isSelected(row); })
                    .map(function (row) { return row.getAttribute("data-value"); });
                prefs.set(samplesKey, { hidden: off });
                redraw();
            }
        });
        picker.select(function (row) { return !hidden[row.getAttribute("data-value")]; });

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
                sampleIds: picker.selected(),
                stack: stackBox.checked,
                population: populationSelect.value,
                treatment: treatmentSelect ? treatmentSelect.value : "",
                frequency: frequencyBox.checked,
                labels: labelsBox.checked
            };
        }

        function showMode() {
            Array.prototype.forEach.call(root.querySelectorAll("[data-mode]"), function (button) {
                button.classList.toggle("active", button.getAttribute("data-mode") === mode);
            });
            samplesView.hidden = mode !== "samples";
            stackGroup.hidden = mode !== "samples";
            populationGroup.hidden = mode !== "population";
            if (treatmentGroup) { treatmentGroup.hidden = mode !== "population"; }
        }

        function summarize(ringList, s) {
            var mixed = ringList.some(function (ring) { return ring.mixed; });
            frequencyBox.disabled = !mixed;
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
                if (ringList.length > 12) { words += ". Many rings are thin: the Samples mode may read better"; }
                return words + ".";
            }
            var n = s.sampleIds.length;
            if (!n) { return "No samples chosen."; }
            return n + " sample" + (n === 1 ? "" : "s") + (s.stack ? " as " + n + " ring" + (n === 1 ? "" : "s") : " on one ring") + ".";
        }

        var current = null;
        function redraw() {
            var s = state();
            var ringList = plot.rings(data, s);
            var width = plot.plotWidth(box.clientWidth, ringList.length);
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

        Array.prototype.forEach.call(root.querySelectorAll("[data-mode]"), function (button) {
            button.addEventListener("click", function () {
                mode = button.getAttribute("data-mode");
                prefs.set("circos.mode", mode);
                showMode();
                redraw();
            });
        });
        stackBox.addEventListener("change", function () { prefs.set("circos.stack", stackBox.checked); redraw(); });
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
                : s.sampleIds.length + " samples" + (s.stack ? ", one ring each" : "");
            plot.download(plot.standalone(current, { colors: data.colors, title: title }),
                          fileStem + "_circos.svg", "image/svg+xml");
        });
        var timer = null;
        window.addEventListener("resize", function () {
            clearTimeout(timer);
            timer = setTimeout(redraw, 150);
        });

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
