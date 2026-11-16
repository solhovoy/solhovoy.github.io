const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const search = vm.createContext({});
for (const file of [
  "../scripts/lib/lucene-query-parser.min.js",
  "../scripts/formatter.js",
  "../scripts/search.js"
]) {
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, file), "utf8"),
    search
  );
}

const filterHits = search.filterHits;

test("KQL searches ignored field values by field name and free text", () => {
  const hit = {
    fields: {
      "@timestamp": ["2026-11-16T10:00:00.000Z"],
      event_action_before_kv_parsing: ["firstText= response= CallResultInfo params= a=1 b=2"]
    },
    ignored_field_values: {
      event_action_original: ["response=[CallResultInfo{originalOnly, params={a=1 , b=2}}]"]
    }
  };

  assert.equal(filterHits([hit], "event_action_original:*CallResultInfo*").hits.length, 1);
  assert.equal(filterHits([hit], "originalOnly").hits.length, 1);
});

test("regular fields take precedence over values with the same ignored field name", () => {
  const hit = {
    fields: { message: ["regular-value"] },
    ignored_field_values: { message: ["ignored-value"] }
  };

  assert.equal(filterHits([hit], "message:regular-value").hits.length, 1);
  assert.equal(filterHits([hit], "message:ignored-value").hits.length, 0);
});
