/**
 * search.js — Lucene query evaluator for Kibana hit objects.
 * Depends on: lucene-query-parser (window.lucenequeryparser)
 *
 * Supports:
 *   field:"value"          → match specific field (also tries kv_obj.field)
 *   "free text"            → match across all field values
 *   AND / OR / NOT / <implicit>
 *   grouping with ()
 */

/**
 * Filter an array of hits by a Lucene query string.
 * Returns the filtered array (or all hits if query is empty/invalid).
 */
function filterHits(hits, queryStr) {
  const q = (queryStr || "").trim();
  if (!q) return hits;

  let ast;
  try {
    ast = lucenequeryparser.parse(q);
  } catch (e) {
    return { error: `Query parse error: ${e.message}` };
  }

  return hits.filter(hit => evalNode(ast, hit));
}

// ── AST walker ────────────────────────────────────────────────────────────────
// lucene-query-parser always produces { left, operator?, right? } at every level.
// Leaf nodes: { field, term, quoted?, regex? }

function evalNode(node, hit) {
  if (!node) return true;

  // Leaf node — has a "field" key but no "left"
  if ("field" in node && !("left" in node)) {
    return matchLeaf(node, hit);
  }

  // Boolean / group node
  const leftResult = evalNode(node.left, hit);
  const op = (node.operator || "<implicit>").toUpperCase();

  if (op === "AND" || op === "<implicit>") {
    return leftResult && evalNode(node.right, hit);
  }
  if (op === "OR") {
    return leftResult || evalNode(node.right, hit);
  }
  if (op === "NOT") {
    return leftResult && !evalNode(node.right, hit);
  }

  return leftResult;
}

// Fields searched for free-text (implicit field) queries — what the user sees on screen
const FREE_TEXT_FIELDS = [
  "event_action_original",
  "event_action_before_kv_parsing",
  "event.action",
  "a", "c", "t", "r", "p", "s",
  "host.hostname",
  "log.level",
];

/**
 * Build a matcher function from a term.
 * - If the term contains "*", treat it as a wildcard pattern (regex).
 * - Otherwise, require an exact whole-word match (word boundary).
 */
function buildMatcher(term) {
  const t = term.toLowerCase();
  if (t.includes("*")) {
    // Convert wildcard pattern to regex: escape regex chars except *, then replace * with .*
    const escaped = t.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    const re = new RegExp(escaped, "i");
    return val => re.test(String(val));
  }
  // Exact word-boundary match (case-insensitive)
  const re = new RegExp(`(?<![\\w])${t.replace(/[.+?^${}()|[\]\\*]/g, "\\$&")}(?![\\w])`, "i");
  return val => re.test(String(val));
}

function matchLeaf(node, hit) {
  const fields = hit.fields || {};
  const term   = String(node.term ?? "").toLowerCase();
  const field  = node.field;

  if (!term) return true;

  const matches = buildMatcher(term);

  // Free-text: only search visible/meaningful fields
  if (!field || field === "<implicit>") {
    return FREE_TEXT_FIELDS.some(key => {
      const raw = fields[key];
      if (raw === undefined) return false;
      return matches(unwrap(raw) ?? "");
    });
  }

  // Field-specific — try exact key and kv_obj.* prefix
  const candidates = [fields[field], fields["kv_obj." + field]]
    .filter(v => v !== undefined);

  if (!candidates.length) return false;

  return candidates.some(raw => matches(unwrap(raw) ?? ""));
}
