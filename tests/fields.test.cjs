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
const { normalizeInput, getLogFields, formatLogs, applyHighlighting } = formatter;
const SYNTAX_HIGHLIGHTS = vm.runInContext("SYNTAX_HIGHLIGHTS", formatter);
const timestamp = "2026-11-12T10:00:00.123Z";

function withHighlights(overrides, fn) {
  const previous = Object.fromEntries(Object.keys(overrides).map(type => [type, SYNTAX_HIGHLIGHTS[type].enabled]));
  Object.entries(overrides).forEach(([type, enabled]) => { SYNTAX_HIGHLIGHTS[type].enabled = enabled; });
  try { fn(); } finally {
    Object.entries(previous).forEach(([type, enabled]) => { SYNTAX_HIGHLIGHTS[type].enabled = enabled; });
  }
}

test("highlights keys, literals, numbers, versions and durations without matching inside words", () => {
  const cases = [
    ["nested.ready=true disabled=false optional=null",
      '<span class="log-key">nested.ready</span>=<span class="log-literal">true</span> ' +
      '<span class="log-key">disabled</span>=<span class="log-literal">false</span> ' +
      '<span class="log-key">optional</span>=null'],
    ["retries=3 latency=150 ms ratio=-2.5 elapsed=2.5s",
      '<span class="log-key">retries</span>=<span class="log-number">3</span> ' +
      '<span class="log-key">latency</span>=<span class="log-number">150 ms</span> ' +
      '<span class="log-key">ratio</span>=<span class="log-number">-2.5</span> ' +
      '<span class="log-key">elapsed</span>=<span class="log-number">2.5s</span>'],
    ["(.5) +2e-3", '(<span class="log-number">.5</span>) <span class="log-number">+2e-3</span>'],
    ["versionInfoSw=2.0.2.0 v1.2.3",
      '<span class="log-key">versionInfoSw</span>=<span class="log-number">2.0.2.0</span> v1.2.3'],
    ["trueish false_positive null-value user123 2026-11-16 1.2.3.",
      "trueish false_positive null-value user123 2026-11-16 1.2.3."]
  ];
  for (const [input, expected] of cases) assert.equal(applyHighlighting(input), expected);
});

test("applyHighlightColors publishes per-theme rule colors as CSS variables", () => {
  const props = {};
  const root = { style: { setProperty: (name, value) => { props[name] = value; } } };
  formatter.applyHighlightColors(root);
  assert.equal(props["--hl-string-dark"], "#e6da6a");
  assert.equal(props["--hl-string-light"], "#766a00");
  assert.deepEqual(Object.keys(props).length, Object.keys(SYNTAX_HIGHLIGHTS).length * 2);
});

test("identifier highlighting is enabled by default and can be disabled via SYNTAX_HIGHLIGHTS", () => {
  const uuid = "550e8400-e29b-41d4-a716-446655440000";
  const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
  const input = `${uuid} requestId=req-123 context.trace_id="${traceId}" request.id=42 traceId=null`;
  assert.equal(applyHighlighting(input),
    `<span class="log-identifier">${uuid}</span> ` +
    '<span class="log-key">requestId</span>=<span class="log-identifier">req-123</span> ' +
    `<span class="log-key">context.trace_id</span>=<span class="log-string">"${traceId}"</span> ` +
    '<span class="log-key">request.id</span>=<span class="log-identifier">42</span> ' +
    '<span class="log-key">traceId</span>=null');
  assert.equal(applyHighlighting("req-123", "requestId"), '<span class="log-identifier">req-123</span>');
  withHighlights({ identifier: false }, () => {
    assert.equal(applyHighlighting(input),
      `${uuid} ` +
      '<span class="log-key">requestId</span>=req-123 ' +
      `<span class="log-key">context.trace_id</span>=<span class="log-string">"${traceId}"</span> ` +
      '<span class="log-key">request.id</span>=<span class="log-number">42</span> ' +
      '<span class="log-key">traceId</span>=null');
    assert.equal(applyHighlighting("req-123", "requestId"), "req-123");
    assert.equal(applyHighlighting("null", "trace.id"), "null");
  });
});

test("each highlight type can be disabled independently, falling back to the remaining rules", () => {
  const input = `count=42 ok=true name="see https://example.test/1"`;
  withHighlights({ string: false }, () => assert.equal(applyHighlighting(input),
    '<span class="log-key">count</span>=<span class="log-number">42</span> ' +
    '<span class="log-key">ok</span>=<span class="log-literal">true</span> ' +
    '<span class="log-key">name</span>="see <span class="url">https://example.test/1</span>"'));
  withHighlights({ url: false, key: false }, () => assert.equal(applyHighlighting(input),
    'count=<span class="log-number">42</span> ok=<span class="log-literal">true</span> ' +
    'name=<span class="log-string">"see https://example.test/<span class="log-number">1</span>"</span>'));
  withHighlights({ number: false, literal: false }, () => assert.doesNotMatch(applyHighlighting(input), /log-number|log-literal/));
  const all = Object.fromEntries(Object.keys(SYNTAX_HIGHLIGHTS).map(type => [type, false]));
  withHighlights(all, () => assert.equal(applyHighlighting('<a href="x">'), '&lt;a href="x"&gt;'));
  assert.match(applyHighlighting(input), /log-string.*class="url"/);
});

test("applies saved highlight settings to the rules, and explicit type lists override them", () => {
  const { applyHighlightSettings, getDefaultHighlightSettings, mergeHighlightSettings } = formatter;
  const props = {};
  formatter.document = { documentElement: { style: { setProperty: (name, value) => { props[name] = value; } } } };
  const input = `ok=true link="https://example.test"`;
  try {
    applyHighlightSettings(mergeHighlightSettings(getDefaultHighlightSettings(), {
      types: { key: { enabled: false }, url: { colors: { dark: "#ABC" } } }
    }));
    assert.equal(props["--hl-url-dark"], "#aabbcc");
    assert.equal(applyHighlighting(input), 'ok=<span class="log-literal">true</span> ' +
      'link=<span class="log-string">"<span class="url">https://example.test</span>"</span>');
    assert.equal(applyHighlighting(input, "", ["url"]), 'ok=true link="<span class="url">https://example.test</span>"');
    applyHighlightSettings({ ...getDefaultHighlightSettings(), enabled: false });
    assert.equal(applyHighlighting(input), input);
  } finally {
    applyHighlightSettings(getDefaultHighlightSettings());
    delete formatter.document;
  }
  assert.match(applyHighlighting(input), /log-key/);
});

test("highlights single- and double-quoted strings as whole tokens, including escaped quotes", () => {
  const strings = [
    '""', "''",
    String.raw`"say \"hello\" and 'bye'"`,
    String.raw`'say \'hello\' and "bye"'`,
    String.raw`"C:\\logs\\"`,
    '"ready=true count=42"',
    "'550e8400-e29b-41d4-a716-446655440000'"
  ];
  for (const value of strings) {
    const expected = value === '"ready=true count=42"'
      ? '<span class="log-string">"ready=<span class="log-literal">true</span> count=<span class="log-number">42</span>"</span>'
      : `<span class="log-string">${value}</span>`;
    assert.equal(applyHighlighting(value), expected);
  }
  assert.equal(applyHighlighting("requestId='req-123'"),
    '<span class="log-key">requestId</span>=<span class="log-string">\'req-123\'</span>');
  assert.equal(applyHighlighting('"<b>&</b>"'),
    '<span class="log-string">"&lt;b&gt;&amp;&lt;/b&gt;"</span>');
  assert.equal(applyHighlighting("Can't open 'file.txt'"),
    'Can\'t open <span class="log-string">\'file.txt\'</span>');
  const unfinished = '"unfinished\n\'also unfinished';
  assert.equal(applyHighlighting(unfinished), unfinished);
});

test("keeps quote pairs aligned in unescaped embedded JSON with apostrophes", () => {
  const s = value => `<span class="log-string">${value}</span>`;
  assert.equal(applyHighlighting(`cfg="{"key":"'"}" json="{"Men's":"x"}" list="["a"]" on="true"`),
    `<span class="log-key">cfg</span>="{${s('"key"')}:${s(`"'"`)}}" ` +
    `<span class="log-key">json</span>="{${s(`"Men's"`)}:${s('"x"')}}" ` +
    `<span class="log-key">list</span>="[${s('"a"')}]" ` +
    `<span class="log-key">on</span>=${s('"<span class="log-literal">true</span>"')}`);
});

test("highlights URLs inside quoted strings and other enabled nested tokens", () => {
  const url = "https://example.test/123?ready=true&requestId=req-123";
  const urlHtml = '<span class="url">https://example.test/123?ready=true&amp;requestId=req-123</span>';
  for (const quote of ["'", '"']) {
    assert.equal(applyHighlighting(`${quote}${url}${quote}`),
      `<span class="log-string">${quote}${urlHtml}${quote}</span>`);
    assert.equal(applyHighlighting(`${quote}before ${url} after true 42${quote}`),
      `<span class="log-string">${quote}before ${urlHtml} after <span class="log-literal">true</span> <span class="log-number">42</span>${quote}</span>`);
  }
  assert.equal(applyHighlighting('"https://one.test/1 and wss://two.test/2"'),
    '<span class="log-string">"<span class="url">https://one.test/1</span> and ' +
    '<span class="url">wss://two.test/2</span>"</span>');
  assert.equal(applyHighlighting(String.raw`"open \"https://example.test/1\" and 'http://example.test/2'"`),
    String.raw`<span class="log-string">"open \"<span class="url">https://example.test/1</span>\" and '<span class="url">http://example.test/2</span>'"</span>`);
});

test("ends URLs at unpaired brackets but keeps {placeholder} segments and IPv6 hosts", () => {
  assert.equal(applyHighlighting("urls=[http://a.test/x],[http://b.test/y]} (see https://c.test/z)."),
    '<span class="log-key">urls</span>=[<span class="url">http://a.test/x</span>],[<span class="url">http://b.test/y</span>]} ' +
    '(see <span class="url">https://c.test/z</span>).');
  assert.equal(applyHighlighting("http://[::1]:8080/p"), '<span class="url">http://[::1]:8080/p</span>');
  for (const url of ["https://x.test/a?trx={0}&codec=PCM&deviceId={1}", "https://x.test/s/{PARTNER}/{FOLDER}/s.xml"]) {
    assert.equal(applyHighlighting(`{u=${url}}`).replace(/&amp;/g, "&"), `{<span class="log-key">u</span>=<span class="url">${url}</span>}`);
  }
});

test("does not highlight numbers or literals inside a URL nested in a string", () => {
  assert.equal(applyHighlighting('"see https://x.test/1?ok=true"'),
    '<span class="log-string">"see <span class="url">https://x.test/1?ok=true</span>"</span>');
});

test("keeps URLs as single tokens and escapes raw text before adding markup", () => {
  const url = "https://example.test/123?ready=true&requestId=req-123&tag=<test>";
  assert.equal(
    applyHighlighting(`url=${url}`),
    '<span class="log-key">url</span>=' +
    '<span class="url">https://example.test/123?ready=true&amp;requestId=req-123&amp;tag=&lt;test&gt;</span>'
  );
  assert.equal(
    applyHighlighting('<script class="url">true & 42</script>'),
    '&lt;script <span class="log-key">class</span>=<span class="log-string">"url"</span>&gt;' +
    '<span class="log-literal">true</span> &amp; <span class="log-number">42</span>&lt;/script&gt;'
  );
});

test("does not repeat extra fields already present inside nested message values", () => {
  const record = {
    "@timestamp": timestamp,
    c: "Svc",
    event_action_original: "Received response=Resp{normalPrefs={a:[x]}, fallback={b:[]}}",
    normalPrefs: "a: x",
    fallback: "b:",
    response: "Resp",
    prefs: "kept"
  };
  const result = formatLogs(JSON.stringify(record), "asc", { hideEmptyMetadata: true });
  assert.match(result.plain, /fallback=\{b:\[\]\}\} prefs=kept$/);
});

test("does not repeat extra fields that are JSON keys inside the message", () => {
  const record = {
    "@timestamp": timestamp,
    c: "Svc",
    event_action_original: 'ARS Request: {"types":["A","B"],"profile":"X:2","info":{"map":"m:0"}}',
    types: "A  B",
    profile: "X:2",
    map: "m:0",
    "profile2": "kept"
  };
  const result = formatLogs(JSON.stringify(record), "asc", { hideEmptyMetadata: true });
  assert.match(result.plain, /"map":"m:0"\}\} profile2=kept$/);
});

test("prefers event_action_original from ignored_field_values over the kv-parsed copy", () => {
  const hit = {
    _id: "1",
    fields: {
      "@timestamp": [timestamp],
      event_action_before_kv_parsing: ["firstText= params= a=1  b=2"]
    },
    ignored_field_values: { event_action_original: ["params={a=1 , b=2}"] }
  };
  const result = formatLogs(JSON.stringify([hit]), "asc", { hideEmptyMetadata: true });
  assert.match(result.plain, /params=\{a=1 , b=2\}$/);
  const logFields = getLogFields({ ...hit, ignored_field_values: { ...hit.ignored_field_values, "@timestamp": ["other"] } });
  assert.equal(logFields.event_action_original, "params={a=1 , b=2}");
  assert.equal(logFields["@timestamp"], timestamp);
});

test("uses highlighting in messages, extra fields and columns without changing plain text or raw JSON", () => {
  const record = {
    "@timestamp": timestamp,
    "log.level": "INFO",
    c: "Service",
    "event.action": "ready=true count=42",
    "json_Service.duration": "150 ms",
    requestId: "req-123",
    traceId: "4bf92f3577b34da6a3ce929d0e0e4736"
  };
  const result = formatLogs(JSON.stringify(record), "asc", { hideEmptyMetadata: true });
  assert.equal(result.plain,
    "2026-11-12 10:00:00,123 INFO c=Service ready=true count=42 duration=150 ms " +
    "requestId=req-123 traceId=4bf92f3577b34da6a3ce929d0e0e4736");
  assert.match(result.html, /<span class="log-key">ready<\/span>=<span class="log-literal">true<\/span>/);
  assert.match(result.html, /<span class="log-key">duration<\/span>=<span class="log-number">150 ms<\/span>/);
  assert.match(result.html, /<span class="log-key">requestId<\/span>=<span class="log-identifier">req-123<\/span>/);
  assert.match(result.html, /<span class="log-key">traceId<\/span>=<span class="log-identifier">4bf92f3577b34da6a3ce929d0e0e4736<\/span>/);
  const raw = result.html.match(/<pre class="raw-content">([\s\S]*?)<\/pre>/)[1];
  assert.equal(raw, JSON.stringify(record, null, 2));
  const columns = formatLogs(JSON.stringify(record), "asc", {
    selectedFields: ["requestId", "traceId", "json_Service.duration", "missing"],
    showRawElk: false
  });
  assert.equal(columns.plain,
    "2026-11-12 10:00:00,123 requestId=req-123 traceId=4bf92f3577b34da6a3ce929d0e0e4736 " +
    "json_Service.duration=150 ms missing=null");
  assert.match(columns.html, /data-field="requestId" title="req-123"><span class="log-identifier">req-123<\/span><\/span>/);
  assert.match(columns.html, /data-field="traceId"[^>]*><span class="log-identifier">4bf92f3577b34da6a3ce929d0e0e4736<\/span><\/span>/);
  assert.match(columns.html, /data-field="missing" title="null">null<\/span>/);
});

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
  assert.match(firstRow, /title="\[&quot;one&quot;,&quot;two&quot;\]">\[<span class="log-string">"one"<\/span>,<span class="log-string">"two"<\/span>\]<\/span>/);
});

test("selected keys override metadata visibility, escape HTML, and keep the raw JSON original", () => {
  const record = { "@timestamp": timestamp, t: "thread", c: "RawOnly", "<key>": "<script>alert(1)</script>" };
  const result = formatLogs(JSON.stringify(record), "asc", {
    selectedFields: ["@timestamp", "t", "<key>"],
    shownFields: { t: false }
  });
  assert.equal(result.plain,
    "2026-11-12 10:00:00,123 t=thread <key>=<script>alert(1)</script>");
  assert.match(result.html, /class="col msg"[^>]*>&lt;script&gt;alert\(<span class="log-number">1<\/span>\)&lt;\/script&gt;<\/span>/);
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
