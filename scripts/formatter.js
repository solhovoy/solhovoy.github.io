/**
 * ELK Log Formatter — JS port of format_json.py
 */

const LEVEL_CLASS = {
  FATAL: "lvl-fatal",
  ERROR: "lvl-error",
  WARN:  "lvl-warn",
  INFO:  "lvl-info",
  DEBUG: "lvl-debug",
  TRACE: "lvl-trace",
};

function unwrap(value) {
  if (Array.isArray(value) && value.length === 1) {
    // Return "?" for null/undefined values inside arrays
    return value[0] ?? "?";
  }
  return value ?? "?";
}

function isEmptyMetadataValue(value) {
  if (value == null || value === "") return true;
  if (!Array.isArray(value)) return false;
  return value.length === 0 || value.every(item => item == null || item === "");
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

function getSelectionId(hit) {
  if (hit._id) return `id-${stableHash(String(hit._id))}`;
  return `record-${stableHash(JSON.stringify(hit._original || hit))}`;
}

function stableHash(value) {
  let hash = 5381;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
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

function getLogFields(hit) {
  // Values too long for the keyword mapping are only in ignored_field_values; regular fields win.
  const source = { ...hit?.ignored_field_values, ...hit?.fields };
  return Object.fromEntries(Object.entries(source).flatMap(([key, raw]) => {
    const value = Array.isArray(raw) && raw.length === 1 ? raw[0] : raw;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.entries(flattenObject(value, key));
    }
    return [[key, value]];
  }));
}

/**
 * Returns { plain: string, html: string } for a single hit.
 */
function formatHit(hit, index, outputSettings = {}) {
  const fields = hit.fields || {};
  const selectionId = getSelectionId(hit);

  const ts       = formatTimestamp(unwrap(fields["@timestamp"]    ?? ["?"]));
  const selectedFields = (outputSettings.selectedFields || []).filter(key => key !== "@timestamp");
  const logFields = selectedFields.length ? getLogFields(hit) : null;
  const selectedValues = selectedFields.map(key => getSelectedValue(logFields, key));
  const selectedPairs = selectedFields.map((key, i) => `${key}=${selectedValues[i]}`);
  const level    = String(unwrap(fields["log.level"]              ?? ["??"])).toUpperCase();
  const actor    = unwrap(fields["a"]                             ?? ["?"]);
  const thread   = unwrap(fields["t"]                             ?? ["?"]);
  const hostname = unwrap(fields["host.hostname"]                 ?? ["?"]);
  const r        = unwrap(fields["r"]                             ?? ["?"]);
  const p        = unwrap(fields["p"]                             ?? ["?"]);
  
  // Class or service field (prefer c, fallback to s)
  const clsField = fields["c"] ? "c" : (fields["s"] ? "s" : "c");
  const clsValue = unwrap(fields["c"] ?? fields["s"] ?? ["?"]);
  
  // Long values exceed the keyword ignore_above limit and are moved to ignored_field_values;
  // prefer that untouched original over the punctuation-stripped kv-parsing copy.
  const rawMessage = unwrap(
    fields["event_action_original"]        ??
    hit.ignored_field_values?.["event_action_original"] ??
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

  const shownFields = {
    t: true,
    a: true,
    r: true,
    p: true,
    h: true,
    ...outputSettings.shownFields
  };
  const outputFields = [
    { key: "t", value: `t=${thread}`, className: "meta meta-t", empty: isEmptyMetadataValue(fields["t"]) },
    { key: "a", value: `a=${actor}`, className: "meta meta-a", empty: isEmptyMetadataValue(fields["a"]) },
    { key: "r", value: `r=${r}`, className: "meta meta-r", empty: isEmptyMetadataValue(fields["r"]) },
    { key: "p", value: `p=${p}`, className: "meta meta-p", empty: isEmptyMetadataValue(fields["p"]) },
    { key: "h", value: `h=${hostname}`, className: "meta meta-h", empty: isEmptyMetadataValue(fields["host.hostname"]) }
  ].filter(field => shownFields[field.key] && (!outputSettings.hideEmptyMetadata || !field.empty));

  // ── plain text ────────────────────────────────────────────────────────────
  const plainFields = outputFields.map(field => field.value).join(" ");
  let plain = `${ts}${plainFields ? ` ${plainFields} ` : " "}${level} ${clsField}=${clsValue}`;
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
  if (selectedFields.length) {
    plain = `${ts} ${selectedPairs.join(" ")}`;
  }

  // ── raw JSON (pretty-printed, use original if available) ─────────────────
  const showRawElk = outputSettings.showRawElk !== false;
  const rawJsonHtml = showRawElk
    ? `<div class="raw-json" hidden>` +
      `<button class="raw-collapse" title="Hide raw JSON">✕</button>` +
      `<button class="raw-copy" title="Copy raw JSON">⧉</button>` +
      `<pre class="raw-content">${esc(JSON.stringify(hit._original || hit, null, 2))}</pre>` +
      `</div>`
    : "";

  // ── html (coloured) ───────────────────────────────────────────────────────
  const lvlClass = LEVEL_CLASS[level] ?? "";
  const msgHtml = displayMessage ? ` <span class="msg">${applyHighlighting(displayMessage)}</span>` : "";
  const customHtml = customData ? ` <span class="msg">${applyHighlighting(customData)}</span>` : "";
  const extraHtml = extraFields ? ` <span class="msg">${applyHighlighting(extraFields)}</span>` : "";
  const fieldsHtml = outputFields.map(field => ` <span class="${field.className}">${esc(field.value)}</span>`).join("");
  // Stack trace HTML (inline with preserved formatting)
  const stackHtml = stackTrace && !selectedFields.length ?
    `<pre class="stack-trace">${esc(stackTrace)}</pre>` : "";
  const contentHtml = selectedFields.length
    ? selectedValues.map((value, i) =>
        `<span class="col msg" data-field="${esc(selectedFields[i]).replace(/"/g, "&quot;")}" title="${esc(value).replace(/"/g, "&quot;")}">${applyHighlighting(value, selectedFields[i])}</span>`
      ).join("")
    : fieldsHtml +
      ` <span class="level ${lvlClass}">${esc(level)}</span>` +
      ` <span class="cls">${clsField}=${esc(clsValue)}</span>` +
      msgHtml + customHtml + extraHtml;

  const html =
    `<div class="log-entry" data-index="${index}" data-selection-id="${selectionId}"${lvlClass ? ` data-level="${level}"` : ""}>` +
    `<div class="log-line${selectedFields.length ? " is-columns" : ""}">` +
    `<span class="line-prefix">` +
    `<input type="checkbox" class="row-check" />` +
    `<span class="line-num">${index + 1}</span>` +
    (showRawElk
      ? `<button class="raw-toggle" title="Show raw JSON">▶</button>`
      : `<button class="raw-toggle-placeholder" type="button" tabindex="-1" aria-hidden="true">▶</button>`) +
    `</span>` +
    `<span class="ts">${esc(ts)}</span>` +
    contentHtml +
    `</div>` +
    stackHtml +
    rawJsonHtml +
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
 * Check if a field already exists in the message as key=value or as a JSON key ("key": value).
 */
function isFieldInMessage(key, message) {
  const k = escapeRegex(key);
  // key= not glued to a longer key, so nested values like "Resp{key=" or "[key=" also count.
  const pattern = new RegExp(`(?<![\\w.@-])${k}=|"${k}"\\s*:`, "i");
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

// The value shown in a selected-field column; also used as its sort key.
function getSelectedValue(logFields, key) {
  return formatValue(Object.hasOwn(logFields, key) ? logFields[key] : null);
}

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Syntax highlighting for formatted output. `enabled` and `colors` are the defaults; Settings → Highlighting
 * can override them per browser (see applyHighlightSettings).
 * Rules are listed by priority: when several match at the same position, the earlier wins.
 *   label   — name shown in Settings → Highlighting
 *   sample  — text previewed next to the label in Settings
 *   colors  — text color per theme, exposed as CSS variables --hl-<type>-dark / --hl-<type>-light
 *   pattern — regex source (case-insensitive, no named groups)
 *   inner   — rule types still highlighted inside this token (e.g. URLs inside strings)
 *   field   — colors a whole selected-field column value when the column name matches
 */
const SYNTAX_HIGHLIGHTS = {
  // strings (quoted text)
  string: {
    enabled: true,
    label: "Strings",
    sample: `"double" 'single'`,
    className: "log-string",
    colors: { dark: "#e6da6a", light: "#766a00" },
    // A closing quote directly followed by a word char, "{" or "[" is treated as an opening one, which keeps
    // pairs aligned in unescaped embedded JSON (a="{"b":1}" c="{"d":2}") and skips apostrophes (Men's).
    pattern: String.raw`"(?:\\[^\r\n]|[^"\\\r\n])*"(?![\w{[])|(?<!\w)'(?:\\[^\r\n]|[^'\\\r\n])*'(?![\w{[])`,
    inner: ["url", "literal", "number"]
  },
  // URLs
  url: {
    enabled: true,
    label: "URLs",
    sample: "https://example.com",
    className: "url",
    colors: { dark: "#3d87c1", light: "#3d87c1" },
    // Unpaired brackets/braces end the URL; an IPv6 host and {placeholder} segments are kept.
    // Trailing punctuation is left out.
    pattern: String.raw`[a-z][a-z0-9+.-]*:\/\/(?:\[[0-9a-f:.]+\](?:(?:[^\s"'\\[\]{}]|\{[^\s"'\\[\]{}]*\})*(?:[^\s"'\\[\]{}.,;:!?)]|\{[^\s"'\\[\]{}]*\}))?|(?:[^\s"'\\[\]{}]|\{[^\s"'\\[\]{}]*\})*(?:[^\s"'\\[\]{}.,;:!?)]|\{[^\s"'\\[\]{}]*\}))`
  },
  // UUIDs and request/trace IDs (requestId, trace_id, request.id, ...).
  identifier: {
    enabled: true,
    label: "Identifiers", 
    sample: "b91e42ef-933a-4e5f-97f9-9c39f7b52cc7",
    className: "log-identifier",
    colors: { dark: "#63c3b4", light: "#0b7265" },
    pattern: [
      String.raw`(?<![\w-])[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?![\w-])`,
      String.raw`(?<=(?<![\w.@-])(?:[@\w-]+\.)*(?:request|trace)[._-]?id\s*=\s*)(?!(?:true|false|null)(?![\w.:-]))\w[\w.:-]*`
    ].join("|"),
    field: {
      name: /(?:^|\.)(?:request|trace)[._-]?id$/i,
      value: /^(?!(?:true|false|null)$)\w[\w.:-]*$/i
    }
  },
  // keys (e.g., variable names before assignment)
  key: {
    enabled: true,
    label: "Keys",
    sample: "key=logEvent106",
    className: "log-key",
    colors: { dark: "#91a7b3", light: "#526b78" },
    pattern: String.raw`(?<![\w.@-])[@a-z_][\w.@-]*(?=\s*=)`
  },
  // booleans (true/false)
  literal: {
    enabled: true,
    label: "Booleans",
    sample: "true false",
    className: "log-literal",
    colors: { dark: "#b197fc", light: "#7042a6" },
    pattern: String.raw`(?<![\w.-])(?:true|false)(?![\w.-])`
  },
  // number (integer, floating-point or dotted version like 2.0.2.0)
  number: {
    enabled: true,
    label: "Numbers",
    sample: "42 1.5s 2.0.2.0",
    className: "log-number",
    colors: { dark: "#e5b567", light: "#906016" },
    pattern: String.raw`(?<![\w.-])[-+]?(?:\d+(?:\.\d+)*|\.\d+)(?:e[-+]?\d+)?(?:[ \t]*(?:ns|us|ms|s|m|h|d))?(?![\w.-])`
  }
};

/**
 * Colored parts of a formatted log line (as opposed to the tokens inside messages above).
 * Same shape as SYNTAX_HIGHLIGHTS; a disabled element is drawn in the plain text color rather than removed.
 *   className — classes of the rendered span; the color comes from --hl-<id>-dark / --hl-<id>-light
 */
const LOG_ELEMENTS = {
  ts: {
    enabled: true,
    label: "Timestamp",
    sample: "2026-06-09 13:01:58,256",
    className: "ts",
    colors: { dark: "#74c0fc", light: "#1971c2" }
  },
  meta: {
    enabled: true,
    label: "Metadata",
    sample: "t=x33 a=ui@4322 r=fd324d h=example.com",
    className: "meta",
    colors: { dark: "#868e96", light: "#868e96" }
  },
  cls: {
    enabled: true,
    label: "Class",
    sample: "c=Utils",
    className: "cls",
    colors: { dark: "#cc6de4", light: "#9c0dc0" }
  },
  fatal: {
    enabled: true,
    label: "FATAL",
    sample: "FATAL",
    className: "level lvl-fatal",
    colors: { dark: "#ff6b6b", light: "#c92a2a" }
  },
  error: {
    enabled: true,
    label: "ERROR",
    sample: "ERROR",
    className: "level lvl-error",
    colors: { dark: "#fa5252", light: "#e03131" }
  },
  warn: {
    enabled: true,
    label: "WARN",
    sample: "WARN",
    className: "level lvl-warn",
    colors: { dark: "#fab005", light: "#e67700" }
  },
  info: {
    enabled: true,
    label: "INFO",
    sample: "INFO",
    className: "level lvl-info",
    colors: { dark: "#51cf66", light: "#2f9e44" }
  },
  debug: {
    enabled: true,
    label: "DEBUG",
    sample: "DEBUG",
    className: "level lvl-debug",
    colors: { dark: "#868e96", light: "#868e96" }
  },
  trace: {
    enabled: true,
    label: "TRACE",
    sample: "TRACE",
    className: "level lvl-trace",
    colors: { dark: "#868e96", light: "#868e96" }
  }
};

// Message text color; keep in sync with `#output .msg` in styles/output.css.
const PLAIN_TEXT_COLORS = { dark: "#e9ecef", light: "#212529" };

/**
 * Publish rule colors as CSS variables on `root`; call again after changing `colors` to restyle without re-rendering.
 * `types` and `elements` map each id to its { enabled, colors } (e.g. unsaved settings scoped to a preview element).
 */
function applyHighlightColors(root = globalThis.document?.documentElement, types = SYNTAX_HIGHLIGHTS, elements = LOG_ELEMENTS) {
  if (!root) return;
  const publish = (id, { dark, light }) => {
    root.style.setProperty(`--hl-${id}-dark`, dark);
    root.style.setProperty(`--hl-${id}-light`, light);
  };
  for (const [type, { colors }] of Object.entries(types)) publish(type, colors);
  for (const [id, { enabled, colors }] of Object.entries(elements)) publish(id, enabled ? colors : PLAIN_TEXT_COLORS);
}

applyHighlightColors();

const isPlainObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);

// Each settings group maps ids to the rules they configure.
const HIGHLIGHT_GROUPS = { types: SYNTAX_HIGHLIGHTS, elements: LOG_ELEMENTS };

const cloneHighlightGroup = group => Object.fromEntries(Object.entries(group).map(([id, { enabled, colors }]) =>
  [id, { enabled, colors: { dark: colors.dark, light: colors.light } }]));

/**
 * Highlight settings:
 *   { enabled, types: { <type>: { enabled, colors: { dark, light } } }, elements: { <element>: same } }.
 * `enabled` is the master switch; turning it off keeps the per-rule flags and colors.
 */
function cloneHighlightSettings({ enabled, types, elements }) {
  return { enabled, types: cloneHighlightGroup(types), elements: cloneHighlightGroup(elements) };
}

// Code defaults, captured before any user settings are applied.
const DEFAULT_HIGHLIGHT_SETTINGS = cloneHighlightSettings({ enabled: true, types: SYNTAX_HIGHLIGHTS, elements: LOG_ELEMENTS });

function getDefaultHighlightSettings() {
  return cloneHighlightSettings(DEFAULT_HIGHLIGHT_SETTINGS);
}

// "#rgb" or "#rrggbb" in any case, "#" optional → "#rrggbb"; anything else → null.
function normalizeHighlightColor(value) {
  const hex = typeof value === "string" && value.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (!hex) return null;
  return `#${hex.length === 3 ? [...hex].map(char => char + char).join("") : hex}`.toLowerCase();
}

// Strict check for imported (possibly partial) settings: known keys and ids only, valid colors.
function isValidHighlightSettings(value) {
  if (!isPlainObject(value) || Object.keys(value).some(key => key !== "enabled" && !Object.hasOwn(HIGHLIGHT_GROUPS, key))) return false;
  if ("enabled" in value && typeof value.enabled !== "boolean") return false;
  return Object.entries(HIGHLIGHT_GROUPS).every(([group, rules]) => {
    if (!(group in value)) return true;
    if (!isPlainObject(value[group])) return false;
    return Object.entries(value[group]).every(([id, settings]) => {
      if (!Object.hasOwn(rules, id) || !isPlainObject(settings)) return false;
      if (Object.keys(settings).some(key => key !== "enabled" && key !== "colors")) return false;
      if ("enabled" in settings && typeof settings.enabled !== "boolean") return false;
      if (!("colors" in settings)) return true;
      return isPlainObject(settings.colors) && Object.entries(settings.colors).every(([theme, color]) =>
        (theme === "dark" || theme === "light") && normalizeHighlightColor(color) !== null);
    });
  });
}

// Deep-merge partial settings over complete ones; unknown or invalid parts are ignored.
function mergeHighlightSettings(base, patch) {
  const settings = cloneHighlightSettings(base);
  if (!isPlainObject(patch)) return settings;
  if (typeof patch.enabled === "boolean") settings.enabled = patch.enabled;
  for (const group of Object.keys(HIGHLIGHT_GROUPS)) {
    if (!isPlainObject(patch[group])) continue;
    for (const [id, value] of Object.entries(patch[group])) {
      if (!Object.hasOwn(settings[group], id) || !isPlainObject(value)) continue;
      const target = settings[group][id];
      if (typeof value.enabled === "boolean") target.enabled = value.enabled;
      for (const theme of ["dark", "light"]) {
        const color = normalizeHighlightColor(value.colors?.[theme]);
        if (color) target.colors[theme] = color;
      }
    }
  }
  return settings;
}

/**
 * Apply complete settings to the rules and republish their colors; re-render to update existing output.
 */
function applyHighlightSettings(settings) {
  for (const [group, rules] of Object.entries(HIGHLIGHT_GROUPS)) {
    for (const [id, rule] of Object.entries(rules)) {
      const { enabled, colors } = settings[group][id];
      rule.enabled = settings.enabled && enabled;
      rule.colors = { dark: colors.dark, light: colors.light };
    }
  }
  applyHighlightColors();
}

const compiledHighlights = new Map();

function getEnabledHighlightTypes() {
  return Object.keys(SYNTAX_HIGHLIGHTS).filter(type => SYNTAX_HIGHLIGHTS[type].enabled);
}

// Combined regex for the given types; rule order in SYNTAX_HIGHLIGHTS is the priority order.
function getHighlightRegex(types) {
  const ordered = Object.keys(SYNTAX_HIGHLIGHTS).filter(type => types.includes(type));
  const key = ordered.join();
  if (!compiledHighlights.has(key)) {
    const source = ordered.map(type => `(?<${type}>${SYNTAX_HIGHLIGHTS[type].pattern})`).join("|");
    compiledHighlights.set(key, source ? new RegExp(source, "gi") : null);
  }
  return compiledHighlights.get(key);
}

// Tokenize raw text in one pass, escaping each fragment, so generated markup is never re-tokenized.
// `types` are matched at this level; `enabled` limits the inner types highlighted inside tokens.
function highlightTokens(text, types, enabled) {
  const regex = getHighlightRegex(types);
  if (!regex) return esc(text);
  let html = "";
  let offset = 0;
  for (const match of text.matchAll(regex)) {
    html += esc(text.slice(offset, match.index));
    const [type, value] = Object.entries(match.groups).find(([, group]) => group !== undefined);
    html += wrapToken(type, value, enabled);
    offset = match.index + match[0].length;
  }
  return html + esc(text.slice(offset));
}

function wrapToken(type, value, enabled) {
  const { className, inner = [] } = SYNTAX_HIGHLIGHTS[type];
  const nested = inner.filter(innerType => enabled.includes(innerType));
  const content = nested.length ? highlightTokens(value, nested, enabled) : esc(value);
  return `<span class="${className}">${content}</span>`;
}

/**
 * Highlight raw text, escaping each fragment before adding spans.
 * `enabled` overrides the enabled rule types, e.g. to preview unsaved settings.
 */
function applyHighlighting(text, fieldName = "", enabled = getEnabledHighlightTypes()) {
  const fieldType = fieldName && Object.keys(SYNTAX_HIGHLIGHTS).find(type => {
    const { field } = SYNTAX_HIGHLIGHTS[type];
    return enabled.includes(type) && field?.name.test(fieldName) && field.value.test(text);
  });
  if (fieldType) return wrapToken(fieldType, text, enabled);
  return highlightTokens(text, enabled, enabled);
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
    if (!hit || typeof hit !== "object" || Array.isArray(hit)) return hit;
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
function formatLogs(rawJson, sortOrder = "asc", outputSettings = {}) {
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

  // Sort by a selected-field column if requested, otherwise (and for ties) by @timestamp.
  const { sortField } = outputSettings;
  const sortByField = Boolean(sortField) && sortField.field !== "@timestamp" &&
    (outputSettings.selectedFields || []).includes(sortField.field);
  // Numeric-aware, so "9" < "10" and "15ms" < "120ms".
  const collator = new Intl.Collator(undefined, { numeric: true });
  const sorted = data
    .map(hit => ({
      hit,
      time: unwrap((hit.fields || {})["@timestamp"] ?? ["0"]),
      key: sortByField ? getSelectedValue(getLogFields(hit), sortField.field) : ""
    }))
    .sort((a, b) => {
      if (sortByField) {
        const cmp = collator.compare(a.key, b.key);
        if (cmp) return sortField.order === "desc" ? -cmp : cmp;
      }
      const cmp = a.time < b.time ? -1 : a.time > b.time ? 1 : 0;
      return sortOrder === "asc" ? cmp : -cmp;
    })
    .map(item => item.hit);

  const plains = [];
  const htmls  = [];

  for (let i = 0; i < sorted.length; i++) {
    const { plain, html } = formatHit(sorted[i], i, outputSettings);
    plains.push(plain);
    htmls.push(html);
  }

  return {
    plain:  plains.join("\n\r"),
    plains: plains,
    html:   htmls.join(""),
    count:  data.length,
  };
}

