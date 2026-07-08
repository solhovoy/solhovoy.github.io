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
  if (Array.isArray(value) && value.length === 1) {
    // Return "?" for null/undefined values inside arrays
    return value[0] ?? "?";
  }
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

// Fields that are already handled in the core output format
const CORE_FIELDS = [
  "@timestamp", "log.level", "a", "c", "t", "host.hostname", "r", "p", "s",
  "event_action_original", "event_action_before_kv_parsing", "event.action",
  // Meta fields we don't need to display
  "source_type", "path", "stack", "container.id", "event.size"
];

// Additional fields to exclude from "extra fields" output (can be customized)
const EXCLUDED_FIELDS = ["isVectorDebug", "stack_trace"];

/**
 * Returns { plain: string, html: string } for a single hit.
 */
function formatHit(hit, index) {
  const fields = hit.fields || {};

  const ts       = formatTimestamp(unwrap(fields["@timestamp"]    ?? ["?"]));
  const level    = String(unwrap(fields["log.level"]              ?? ["??"])).toUpperCase();
  const actor    = unwrap(fields["a"]                             ?? ["?"]);
  const thread   = unwrap(fields["t"]                             ?? ["?"]);
  const hostname = unwrap(fields["host.hostname"]                 ?? ["?"]);
  const r        = unwrap(fields["r"]                             ?? ["?"]);
  const p        = unwrap(fields["p"]                             ?? ["?"]);
  
  // Class or service field (prefer c, fallback to s)
  const clsField = fields["c"] ? "c" : (fields["s"] ? "s" : "c");
  const clsValue = unwrap(fields["c"] ?? fields["s"] ?? ["?"]);
  
  const rawMessage = unwrap(
    fields["event_action_original"]        ??
    fields["event_action_before_kv_parsing"] ??
    fields["event.action"]                 ??
    ["?"]
  );
  // strip the "firstText= " prefix added by kv-parsing
  const message = String(rawMessage).replace(/^firstText=\s*/, "");

  // Extract custom json_ fields for this class
  const customData = extractCustomFields(fields, clsValue);

  // Extract remaining fields not already displayed (pass message to avoid duplicates)
  const extraFields = extractExtraFields(fields, clsValue, message);

  // Extract and sanitize stack trace if present
  let stackTrace = fields["stack_trace"] ? unwrap(fields["stack_trace"]) : null;
  if (stackTrace && stackTrace !== "?") {
    // Remove internal hex reference IDs like <#98c76bb7> and any trailing spaces
    stackTrace = stackTrace.replace(/<#[0-9a-fA-F]{6,8}>\s*/g, "");
  } else {
    stackTrace = null;
  }

  // Don't show "?" message if we have custom or extra fields
  const displayMessage = (message === "?" && (customData || extraFields)) ? "" : message;

  const host = `h=${hostname}`;
  const lvlPadded = level.padEnd(5);

  // ── plain text ────────────────────────────────────────────────────────────
  let plain =
    `${ts} t=${thread} a=${actor} r=${r} p=${p} ${host}  ${lvlPadded} ${clsField}=${clsValue}`;
  if (displayMessage) {
    plain += ` ${displayMessage}`;
  }
  if (customData) {
    plain += ` ${customData}`;
  }
  if (extraFields) {
    plain += ` ${extraFields}`;
  }
  if (stackTrace) {
    plain += `\n${stackTrace}`;
  }

  // ── raw JSON (pretty-printed, use original if available) ─────────────────
  const rawJson = JSON.stringify(hit._original || hit, null, 2);

  // ── html (coloured) ───────────────────────────────────────────────────────
  const lvlClass = LEVEL_CLASS[level] ?? "";
  const msgHtml = displayMessage ? ` <span class="msg">${applyHighlighting(esc(displayMessage))}</span>` : "";
  const customHtml = customData ? ` <span class="msg">${applyHighlighting(esc(customData))}</span>` : "";
  const extraHtml = extraFields ? ` <span class="msg">${applyHighlighting(esc(extraFields))}</span>` : "";
  // Stack trace HTML (inline with preserved formatting)
  const stackHtml = stackTrace ? 
    `<pre class="stack-trace">${esc(stackTrace)}</pre>` : "";

  const html =
    `<div class="log-entry" data-index="${index}">` +
    `<div class="log-line">` +
    `<span class="line-num">${index + 1}</span>` +
    `<button class="raw-toggle" title="Show raw JSON">▶</button>` +
    `<span class="ts">${esc(ts)}</span>` +
    ` <span class="meta">t=${esc(thread)} a=${esc(actor)} r=${esc(r)} p=${esc(p)}</span>` +
    ` <span class="host">${esc(host)}</span>` +
    `  <span class="level ${lvlClass}">${esc(lvlPadded)}</span>` +
    ` <span class="cls">${clsField}=${esc(clsValue)}</span>` +
    msgHtml +
    customHtml +
    extraHtml +
    `</div>` +
    stackHtml +
    `<div class="raw-json" hidden>` +
    `<button class="raw-collapse" title="Hide raw JSON">✕</button>` +
    `<button class="raw-copy" title="Copy raw JSON">⧉</button>` +
    `<pre class="raw-content">${esc(rawJson)}</pre>` +
    `</div>` +
    `<span class="break"><br></span>` +
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
          if (v === null || v === "" || v === "?") continue;
          customPairs.push(`${k}=${formatValue(v)}`);
        }
      } else if (val !== "?" && val !== null && val !== "") {
        customPairs.push(`${className}=${formatValue(val)}`);
      }
    } else if (key.startsWith(prefix + ".")) {
      // Case: json_ClassName.fieldName
      const fieldName = key.substring(prefix.length + 1);
      const val = unwrap(value);
      if (val === "?" || val === null || val === "") continue;
      customPairs.push(`${fieldName}=${formatValue(val)}`);
    }
  }

  return customPairs.length > 0 ? customPairs.join(" ") : null;
}

/**
 * Extract fields not already handled by core fields or json_ custom fields.
 * Returns formatted string or null if no extra fields found.
 */
function extractExtraFields(fields, className, message = "") {
  const prefix = className && className !== "?" ? `json_${className}` : null;
  const extraPairs = [];

  for (const [key, value] of Object.entries(fields)) {
    // Skip core fields
    if (CORE_FIELDS.includes(key)) continue;

    // Skip user-excluded fields
    if (EXCLUDED_FIELDS.includes(key)) continue;

    // Skip json_ custom fields (already handled)
    if (prefix && (key === prefix || key.startsWith(prefix + "."))) continue;

    // Skip any other json_ prefixed fields
    if (key.startsWith("json_")) continue;

    // Skip kv_obj.* fields (internal kv-parsing artifacts, duplicates of other fields)
    if (key.startsWith("kv_obj.")) continue;

    // Skip internal metadata fields from kv-parsing
    if (key.endsWith("_kv") || key.endsWith("_length") || key === "length_diff") continue;

    // Skip fields already present in the message (kv-parsed fields)
    if (message && isFieldInMessage(key, message)) continue;

    const val = unwrap(value);
    // Skip null/empty values (common in ES|QL flat format)
    if (val === "?" || val === null || val === "") continue;

    extraPairs.push(`${key}=${formatValue(val)}`);
  }

  return extraPairs.length > 0 ? extraPairs.join(" ") : null;
}

/**
 * Check if a field key=value pattern already exists in the message.
 */
function isFieldInMessage(key, message) {
  // Check for key= pattern (after start, whitespace, or comma to handle kv-parsed fields)
  const pattern = new RegExp(`(?:^|[\\s,])${escapeRegex(key)}=`, "i");
  return pattern.test(message);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Highlighting patterns for formatted output.
 * Each entry: { pattern: RegExp (must have capturing group), className: string }
 */
const HIGHLIGHT_PATTERNS = [
  // URLs: http://, https://, ws://, wss://, etc.
  { pattern: /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s]+)/g, className: "url" },
];

/**
 * Apply all highlighting patterns to already-escaped HTML text.
 */
function applyHighlighting(escapedText) {
  let result = escapedText;
  for (const { pattern, className } of HIGHLIGHT_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    result = result.replace(pattern, `<span class="${className}">$1</span>`);
  }
  return result;
}

// Elasticsearch metadata fields (not log data)
const ES_META_FIELDS = ["_id", "_index", "_score", "_size", "_version", "fields", "_source", "sort", "highlight"];

/**
 * Detect Kibana search response wrapper format (rawResponse.hits.hits structure).
 * This is the format returned by Kibana's search API with metadata like isPartial, isRunning, etc.
 */
function isKibanaSearchResponse(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  if (!("rawResponse" in data)) return false;
  const raw = data.rawResponse;
  if (!raw || typeof raw !== "object") return false;
  if (!raw.hits || !Array.isArray(raw.hits.hits)) return false;
  return true;
}

/**
 * Extract hits from Kibana search response wrapper.
 */
function extractFromSearchResponse(data) {
  return data.rawResponse.hits.hits;
}

function isSingleKibanaHit(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  if (!("_id" in data)) return false;
  // Has explicit fields or _source
  if ("fields" in data || "_source" in data) return true;
  // Fields at root level (has @timestamp as array)
  if ("@timestamp" in data && Array.isArray(data["@timestamp"])) return true;
  return false;
}

/**
 * Detect ES|QL flat format: single record with @timestamp as string (not array).
 */
function isSingleEsqlRecord(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  // ES|QL has @timestamp as plain string, not array, and no _id
  if (!("@timestamp" in data)) return false;
  if ("_id" in data) return false;
  return typeof data["@timestamp"] === "string";
}

/**
 * Detect ES|QL flat format: array of records with @timestamp as string (not array).
 */
function isEsqlResults(data) {
  if (!Array.isArray(data) || data.length === 0) return false;
  const first = data[0];
  if (!first || typeof first !== "object") return false;
  // ES|QL has @timestamp as plain string, not array, and no _id
  if (!("@timestamp" in first)) return false;
  if ("_id" in first) return false;
  return typeof first["@timestamp"] === "string";
}

function isKibanaHits(data) {
  if (!Array.isArray(data) || data.length === 0) return false;
  const first = data[0];
  if (!first || typeof first !== "object") return false;
  // Already normalized (has fields)
  if ("fields" in first) return true;
  // Standard Kibana format with _id
  if (!("_id" in first)) return false;
  // Has explicit fields or _source
  if ("_source" in first) return true;
  // Fields at root level
  if ("@timestamp" in first && Array.isArray(first["@timestamp"])) return true;
  return false;
}

/**
 * Normalize input: wrap single hit into array, ensure fields exist from _source if needed.
 * Supports: Kibana hits, ES|QL flat records, Kibana search response wrapper.
 */
function normalizeInput(data) {
  // Handle Kibana search response wrapper (rawResponse.hits.hits)
  if (isKibanaSearchResponse(data)) {
    data = extractFromSearchResponse(data);
  }

  // Handle single Kibana hit
  if (isSingleKibanaHit(data)) {
    data = [data];
  }
  // Handle single ES|QL record
  if (isSingleEsqlRecord(data)) {
    data = [data];
  }

  if (!Array.isArray(data)) return data;

  // Handle ES|QL format: convert flat records to fields format
  if (isEsqlResults(data)) {
    return data.map(record => {
      const fields = {};
      for (const [key, value] of Object.entries(record)) {
        // Wrap values in arrays to match Kibana format
        fields[key] = value === null ? [null] : [value];
      }
      return { fields, _original: record };
    });
  }

  // Ensure each hit has fields (fallback to _source or root-level fields)
  return data.map(hit => {
    if (hit.fields) return hit;
    if (hit._source) {
      // Convert _source to fields-like format (wrap values in arrays)
      const fields = {};
      flattenSource(hit._source, "", fields);
      return { ...hit, fields };
    }
    // Check for root-level fields (fields directly on hit object, not in fields/_source)
    if ("@timestamp" in hit && Array.isArray(hit["@timestamp"])) {
      const fields = {};
      const meta = {};
      for (const [key, value] of Object.entries(hit)) {
        if (ES_META_FIELDS.includes(key)) {
          meta[key] = value;
        } else {
          fields[key] = value;
        }
      }
      return { ...meta, fields };
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
    plain: plains.join("\n\r"),
    html:  htmls.join(""),
    count: data.length,
  };
}

