/**
 * ELK Log Formatter — JS port of format_json.py
 */

const LEVEL_CLASS = {
  ERROR: "lvl-error",
  WARN:  "lvl-warn",
  INFO:  "lvl-info",
  DEBUG: "lvl-debug",
};

function unwrap(value) {
  if (Array.isArray(value) && value.length === 1) return value[0];
  return value ?? "?";
}

function formatTimestamp(raw) {
  try {
    // "2026-06-09T12:56:28.142Z" → "2026-06-09 12:56:28,142"
    let ts = raw.replace("T", " ").replace("Z", "");
    const dot = ts.lastIndexOf(".");
    if (dot !== -1) {
      ts = ts.substring(0, dot) + "," + ts.substring(dot + 1, dot + 4);
    }
    return ts;
  } catch {
    return raw;
  }
}

/**
 * Returns { plain: string, html: string } for a single hit.
 */
function formatHit(hit, index) {
  const fields = hit.fields || {};

  const ts       = formatTimestamp(unwrap(fields["@timestamp"]    ?? ["?"]));
  const level    = String(unwrap(fields["log.level"]              ?? ["??"])).toUpperCase();
  const actor    = unwrap(fields["a"]                             ?? ["?"]);
  const cls      = unwrap(fields["c"]                             ?? ["?"]);
  const thread   = unwrap(fields["t"]                             ?? ["?"]);
  const hostname = unwrap(fields["host.hostname"]                 ?? ["?"]);
  const r        = unwrap(fields["r"]                             ?? ["?"]);
  const p        = unwrap(fields["p"]                             ?? ["?"]);
  const rawMessage = unwrap(
    fields["event_action_original"]        ??
    fields["event_action_before_kv_parsing"] ??
    fields["event.action"]                 ??
    ["?"]
  );
  // strip the "firstText= " prefix added by kv-parsing
  const message = String(rawMessage).replace(/^firstText=\s*/, "");

  // Extract custom json_ fields for this class
  const customData = extractCustomFields(fields, cls);

  const host = `h=${hostname}`;
  const lvlPadded = level.padEnd(5);

  // ── plain text ────────────────────────────────────────────────────────────
  let plain =
    `${ts} t=${thread} a=${actor} r=${r} p=${p} ${host}  ${lvlPadded} c=${cls} ${message}`;
  if (customData) {
    plain += ` ${customData}`;
  }

  // ── raw JSON (pretty-printed) ─────────────────────────────────────────────
  const rawJson = JSON.stringify(hit, null, 2);

  // ── html (coloured) ───────────────────────────────────────────────────────
  const lvlClass = LEVEL_CLASS[level] ?? "";
  const customHtml = customData ? ` <span class="msg">${esc(customData)}</span>` : "";
  const html =
    `<div class="log-entry" data-index="${index}">` +
    `<div class="log-line">` +
    `<button class="raw-toggle" title="Show raw JSON">▶</button>` +
    `<span class="ts">${esc(ts)}</span>` +
    ` <span class="meta">t=${esc(thread)} a=${esc(actor)} r=${esc(r)} p=${esc(p)}</span>` +
    ` <span class="host">${esc(host)}</span>` +
    `  <span class="level ${lvlClass}">${esc(lvlPadded)}</span>` +
    ` <span class="cls">c=${esc(cls)}</span>` +
    ` <span class="msg">${esc(message)}</span>` +
    customHtml +
    `</div>` +
    `<div class="raw-json" hidden>` +
    `<button class="raw-copy" title="Copy raw JSON">⧉</button>` +
    `<pre class="raw-content">${esc(rawJson)}</pre>` +
    `</div>` +
    `</div>`;

  return { plain, html };
}

/**
 * Extract custom json_{className} or json_{className}.* fields.
 * Returns formatted string or null if no custom data found.
 */
function extractCustomFields(fields, className) {
  if (!className || className === "?") return null;

  const prefix = `json_${className}`;
  const customPairs = [];

  for (const [key, value] of Object.entries(fields)) {
    if (key === prefix) {
      // Case: json_ClassName (object value)
      const val = unwrap(value);
      if (val && typeof val === "object") {
        // Flatten the object into key=value pairs
        const flattened = flattenObject(val);
        for (const [k, v] of Object.entries(flattened)) {
          customPairs.push(`${k}=${formatValue(v)}`);
        }
      } else {
        customPairs.push(`${className}=${formatValue(val)}`);
      }
    } else if (key.startsWith(prefix + ".")) {
      // Case: json_ClassName.fieldName
      const fieldName = key.substring(prefix.length + 1);
      const val = unwrap(value);
      customPairs.push(`${fieldName}=${formatValue(val)}`);
    }
  }

  return customPairs.length > 0 ? customPairs.join(" ") : null;
}

/**
 * Flatten a nested object into dot-notation key-value pairs.
 */
function flattenObject(obj, prefix = "") {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

/**
 * Format a value for display.
 */
function formatValue(val) {
  if (val === null || val === undefined) return "null";
  return String(val);
}

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isSingleKibanaHit(data) {
  return data && typeof data === "object" && !Array.isArray(data) &&
    "_id" in data && ("fields" in data || "_source" in data);
}

function isKibanaHits(data) {
  return Array.isArray(data) && data.length > 0 &&
    typeof data[0] === "object" && ("fields" in data[0] || "_source" in data[0]) && "_id" in data[0];
}

/**
 * Normalize input: wrap single hit into array, ensure fields exist from _source if needed.
 */
function normalizeInput(data) {
  // Handle single hit
  if (isSingleKibanaHit(data)) {
    data = [data];
  }

  if (!Array.isArray(data)) return data;

  // Ensure each hit has fields (fallback to _source)
  return data.map(hit => {
    if (hit.fields) return hit;
    if (hit._source) {
      // Convert _source to fields-like format (wrap values in arrays)
      const fields = {};
      flattenSource(hit._source, "", fields);
      return { ...hit, fields };
    }
    return hit;
  });
}

/**
 * Flatten nested _source object into dot-notation keys with array values.
 */
function flattenSource(obj, prefix, result) {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flattenSource(value, fullKey, result);
    } else {
      result[fullKey] = Array.isArray(value) ? value : [value];
    }
  }
}

/**
 * Main entry: parse raw JSON string, return { plain, html, count, error }.
 * @param {string} rawJson
 * @param {"asc"|"desc"} sortOrder
 */
function formatLogs(rawJson, sortOrder = "asc") {
  let data;
  try {
    data = JSON.parse(rawJson);
  } catch (e) {
    return { error: `JSON parse error: ${e.message}` };
  }

  // Normalize: handle single hit, convert _source to fields if needed
  data = normalizeInput(data);

  // Handle empty array (e.g., filter with no matches)
  if (Array.isArray(data) && data.length === 0) {
    return {
      plain: "",
      html:  "",
      count: 0,
    };
  }

  if (!isKibanaHits(data)) {
    // Fallback: pretty-print
    return {
      plain: JSON.stringify(data, null, 4),
      html:  `<pre class="msg fallback-json">${esc(JSON.stringify(data, null, 4))}</pre>`,
      count: 0,
      warning: "Input doesn't look like Kibana hits — showing pretty-printed JSON.",
    };
  }

  // Sort by @timestamp
  const sorted = [...data].sort((a, b) => {
    const ta = unwrap((a.fields || {})["@timestamp"] ?? ["0"]);
    const tb = unwrap((b.fields || {})["@timestamp"] ?? ["0"]);
    const cmp = ta < tb ? -1 : ta > tb ? 1 : 0;
    return sortOrder === "asc" ? cmp : -cmp;
  });

  const plains = [];
  const htmls  = [];

  for (let i = 0; i < sorted.length; i++) {
    const { plain, html } = formatHit(sorted[i], i);
    plains.push(plain);
    htmls.push(html);
  }

  return {
    plain: plains.join("\n\n"),
    html:  htmls.join(""),
    count: data.length,
  };
}

