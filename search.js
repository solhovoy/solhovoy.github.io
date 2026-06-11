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

/**
 * Build a matcher function from a term.
 * Wildcard patterns:
 *   *tune  - word ends with "tune"
 *   tune*  - word starts with "tune"  
 *   *tune* - contains "tune" anywhere
 * No wildcards: exact whole-word match.
 */
function buildMatcher(term) {
  const t = term.toLowerCase();
  
  if (!t.includes("*")) {
    // No wildcards - exact whole-word match
    const escaped = t.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<![\\w])${escaped}(?![\\w])`, "i");
    return val => re.test(String(val));
  }
  
  const startsWithStar = t.startsWith("*");
  const endsWithStar = t.endsWith("*");
  
  // Remove leading/trailing wildcards and escape the core
  let core = t.replace(/^\*+|\*+$/g, "");
  const escaped = core.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  
  let pattern;
  if (startsWithStar && endsWithStar) {
    // *tune* - contains anywhere
    pattern = escaped;
  } else if (startsWithStar) {
    // *tune - ends with (word boundary after)
    pattern = escaped + "(?![\\w])";
  } else if (endsWithStar) {
    // tune* - starts with (word boundary before)
    pattern = "(?<![\\w])" + escaped;
  } else {
    // Internal wildcards only
    pattern = escaped;
  }
  
  const re = new RegExp(pattern, "i");
  return val => re.test(String(val));
}

function matchLeaf(node, hit) {
  const fields = hit.fields || {};
  const term   = String(node.term ?? "").toLowerCase();
  const field  = node.field;

  if (!term) return true;

  const matches = buildMatcher(term);

  // Free-text: search all field values
  if (!field || field === "<implicit>") {
    return Object.values(fields).some(raw => {
      if (raw === undefined) return false;
      const val = unwrap(raw);
      // Handle nested objects (like json_ fields)
      if (val && typeof val === "object") {
        return JSON.stringify(val).toLowerCase().includes(term);
      }
      return matches(val ?? "");
    });
  }

  // Field-specific — try exact key and kv_obj.* prefix
  const candidates = [fields[field], fields["kv_obj." + field]]
    .filter(v => v !== undefined);

  if (!candidates.length) return false;

  return candidates.some(raw => matches(unwrap(raw) ?? ""));
}
