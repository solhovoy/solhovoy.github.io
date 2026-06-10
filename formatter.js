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
function formatHit(hit) {
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

  const host = `h=${hostname}.x1.xcal.tv`;
  const lvlPadded = level.padEnd(5);

  // ── plain text ────────────────────────────────────────────────────────────
  const plain =
    `${ts} t=${thread} a=${actor} r=${r} p=${p} ${host}  ${lvlPadded} c=${cls} ${message}`;

  // ── html (coloured) ───────────────────────────────────────────────────────
  const lvlClass = LEVEL_CLASS[level] ?? "";
  const html =
    `<span class="ts">${esc(ts)}</span>` +
    ` <span class="meta">t=${esc(thread)} a=${esc(actor)} r=${esc(r)} p=${esc(p)}</span>` +
    ` <span class="host">${esc(host)}</span>` +
    `  <span class="level ${lvlClass}">${esc(lvlPadded)}</span>` +
    ` <span class="cls">c=${esc(cls)}</span>` +
    ` <span class="msg">${esc(message)}</span>`;

  return { plain, html };
}

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isKibanaHits(data) {
  return Array.isArray(data) && data.length > 0 &&
    typeof data[0] === "object" && "fields" in data[0] && "_id" in data[0];
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

  if (!isKibanaHits(data)) {
    // Fallback: pretty-print
    return {
      plain: JSON.stringify(data, null, 4),
      html:  `<span class="msg">${esc(JSON.stringify(data, null, 4))}</span>`,
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

  for (const hit of sorted) {
    const { plain, html } = formatHit(hit);
    plains.push(plain);
    htmls.push(html);
  }

  return {
    plain: plains.join("\n\n"),
    html:  htmls.join("\n\n"),
    count: data.length,
  };
}

