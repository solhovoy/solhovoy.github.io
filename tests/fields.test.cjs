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
});

test("selected keys override metadata visibility, escape HTML, and keep the raw JSON original", () => {
  const record = { "@timestamp": timestamp, t: "thread", c: "RawOnly", "<key>": "<script>alert(1)</script>" };
  const result = formatLogs(JSON.stringify(record), "asc", {
    selectedFields: ["@timestamp", "t", "<key>"],
    shownFields: { t: false }
  });
  assert.equal(result.plain,
    "2026-11-12 10:00:00,123 t=thread <key>=<script>alert(1)</script>");
  assert.match(result.html, /&lt;key&gt;=&lt;script&gt;/);
  assert.doesNotMatch(result.html, /<script>/);
  assert.match(result.html, /class="raw-json"/);
  assert.match(result.html, /"c": "RawOnly"/);
  assert.doesNotMatch(result.plain, /RawOnly/);
  assert.equal((result.plain.match(/2026-11-12/g) || []).length, 1);
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
