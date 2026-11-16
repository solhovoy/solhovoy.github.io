const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const formatter = vm.createContext({});
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "../scripts/formatter.js"), "utf8"),
  formatter
);
const { normalizeInput, getLogFields, formatLogs } = formatter;
const timestamp = "2026-11-12T10:00:00.123Z";

test("discovers all data fields across supported input shapes, including nested and excluded fields", () => {
  const fields = { "@timestamp": timestamp, nested: { errorCode: 0 }, source_type: "test" };
  const inputs = [
    { _id: "source", _source: fields },
    { _id: "fields", fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, [v]])) },
    fields
  ];
  for (const input of inputs) {
    const values = getLogFields(normalizeInput(input)[0]);
    assert.deepEqual(Object.keys(values).sort(), ["@timestamp", "nested.errorCode", "source_type"]);
    assert.equal(values["nested.errorCode"], 0);
    assert.equal(values.source_type, "test");
  }
});

test("projects selected pairs only, preserves falsy and multi-valued fields, and shows missing values as null", () => {
  const records = [{
    "@timestamp": timestamp,
    c: "Service",
    "event.action": "unselected message",
    stack_trace: "unselected stack",
    nested: { code: 0 },
    enabled: false,
    empty: "",
    nil: null,
    tags: ["one", "two"]
  }, { "@timestamp": timestamp, c: "Other" }];
  const result = formatLogs(JSON.stringify(records), "asc", {
    selectedFields: ["nested.code", "enabled", "empty", "nil", "tags"],
    showRawElk: false
  });
  assert.equal(result.plains[0],
    '2026-11-12 10:00:00,123 nested.code=0 enabled=false empty= nil=null tags=["one","two"]');
  assert.equal(result.plains[1],
    "2026-11-12 10:00:00,123 nested.code=null enabled=null empty=null nil=null tags=null");
  assert.doesNotMatch(result.html, /unselected|Service|Other|stack-trace|class="level/);
  const firstRow = result.html.split('class="log-entry"')[1];
  assert.match(firstRow, /class="log-line is-columns"/);
  assert.equal((firstRow.match(/class="col msg"/g) || []).length, 5);
  assert.match(firstRow, /title="\[&quot;one&quot;,&quot;two&quot;\]">\["one","two"\]<\/span>/);
});

test("selected keys override metadata visibility, escape HTML, and keep the raw JSON original", () => {
  const record = { "@timestamp": timestamp, t: "thread", c: "RawOnly", "<key>": "<script>alert(1)</script>" };
  const result = formatLogs(JSON.stringify(record), "asc", {
    selectedFields: ["@timestamp", "t", "<key>"],
    shownFields: { t: false }
  });
  assert.equal(result.plain,
    "2026-11-12 10:00:00,123 t=thread <key>=<script>alert(1)</script>");
  assert.match(result.html, /class="col msg"[^>]*>&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/span>/);
  assert.doesNotMatch(result.html, /<script>/);
  assert.match(result.html, /class="raw-json"/);
  assert.match(result.html, /"c": "RawOnly"/);
  assert.doesNotMatch(result.plain, /RawOnly/);
  assert.equal((result.plain.match(/2026-11-12/g) || []).length, 1);
});

test("sorts by a selected field column numerically, keeps empty values as-is, and breaks ties by time", () => {
  const at = minute => `2026-11-12T10:0${minute}:00.000Z`;
  const records = [
    { "@timestamp": at(1), size: "10" },
    { "@timestamp": at(2), size: "9" },
    { "@timestamp": at(3) },
    { "@timestamp": at(4), size: "9" }
  ];
  const sizes = (order, sortOrder = "asc") => [...formatLogs(JSON.stringify(records), sortOrder, {
    selectedFields: ["size"], sortField: { field: "size", order }
  }).plains].map(line => line.slice(11, 16) + line.split(" ").pop());
  assert.deepEqual(sizes("asc"), ["10:02size=9", "10:04size=9", "10:01size=10", "10:03size=null"]);
  assert.deepEqual(sizes("desc", "desc"), ["10:03size=null", "10:01size=10", "10:04size=9", "10:02size=9"]);
  // A sort field that is no longer selected falls back to the date sort.
  const fallback = formatLogs(JSON.stringify(records), "asc", { sortField: { field: "size", order: "desc" } });
  assert.deepEqual([...fallback.plains].map(line => line.slice(11, 16)), ["10:01", "10:02", "10:03", "10:04"]);
});

test("empty selection restores the standard formatter without changing sort or settings", () => {
  const records = [
    { "@timestamp": timestamp, c: "First", "event.action": "hello" },
    { "@timestamp": "2026-11-12T11:00:00.000Z", c: "Second" }
  ];
  const settings = { showRawElk: false, hideEmptyMetadata: true };
  const standard = formatLogs(JSON.stringify(records), "desc", settings);
  const reset = formatLogs(JSON.stringify(records), "desc", { ...settings, selectedFields: [] });
  assert.equal(reset.plain, standard.plain);
  assert.equal(reset.html, standard.html);
  assert.match(reset.plains[0], /c=Second/);
  assert.match(reset.plains[1], /c=First hello/);
});

test("reorders pinned fields around visible neighbours, persists order, and leaves selection unchanged", () => {
  const stored = new Map();
  let drag;
  const context = vm.createContext({
    localStorage: {
      getItem: key => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, value)
    },
    startReorderDrag: (event, button, options) => { drag = options; }
  });
  for (const file of ["constants.js", "storage.js", "fields-controller.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../scripts", file), "utf8"), context);
  }
  const controller = vm.runInContext("Object.create(FieldsController.prototype)", context);
  controller.pinnedFields = ["hidden.first", "trace.id", "hidden.middle", "trace.name", "hidden.last"];
  controller.selectedFields = new Set(["trace.name", "trace.id"]);
  controller.pinnedList = {};
  controller.render = () => {};
  controller.onChange = () => assert.fail("Reordering pins must not change selected columns");
  const visible = ["trace.id", "trace.name"];
  const reorder = (key, from, to) => {
    controller.startFieldDrag({}, key, {}, visible, "pinned");
    assert.equal(drag.indicatorParent, controller.pinnedList);
    drag.onDrop(from, to);
    assert.deepEqual(JSON.parse(stored.get("elkPinnedFields")), [...controller.pinnedFields]);
    assert.deepEqual([...controller.selectedFields], ["trace.name", "trace.id"]);
  };
  reorder("trace.id", 0, 1);
  assert.deepEqual([...controller.pinnedFields],
    ["hidden.first", "hidden.middle", "trace.name", "trace.id", "hidden.last"]);
  visible.reverse();
  reorder("trace.id", 1, 0);
  assert.deepEqual([...controller.pinnedFields],
    ["hidden.first", "hidden.middle", "trace.id", "trace.name", "hidden.last"]);
  assert.deepEqual([...vm.runInContext("getPinnedFields()", context)], [...controller.pinnedFields]);
});
