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
 * Returns { hits: filteredArray, patterns: regexPatterns } or { error: string }.
 * patterns can be joined with | to create a highlight regex.
 */
function filterHits(hits, queryStr) {
  const q = (queryStr || "").trim();
  if (!q) return { hits, patterns: [] };

  // The lucene-query-parser silently drops NOT in "AND NOT" constructs (grammar bug:
  // it treats "AND" as the binary op and then discards "NOT" from "NOT term").
  // Normalize "AND NOT" → "NOT" since they are semantically identical in Lucene.
  const normalized = q.replace(/\bAND\s+NOT\b/gi, "NOT");

  let ast;
  try {
    ast = lucenequeryparser.parse(normalized);
  } catch (e) {
    return { error: `Query parse error: ${e.message}` };
  }

  // Extract regex patterns for highlighting (same patterns used in search)
  const patterns = [];
  collectPatterns(ast, patterns);

  return {
    hits: hits.filter(hit => evalNode(ast, hit)),
    patterns
  };
}

/**
 * Collect regex patterns from AST for highlighting.
 * Uses the same buildMatchPattern() as search.
 * For field-specific searches, includes field prefix in pattern.
 */
function collectPatterns(node, patterns) {
  if (!node) return;

  // Leaf node — has a "term" key
  if ("term" in node && node.term) {
    const term = String(node.term);
    const field = node.field;
    
    if (field && field !== "<implicit>") {
      // Field-specific search: create pattern that matches "field=value"
      const fieldPattern = buildFieldMatchPattern(field, term);
      if (fieldPattern) patterns.push(fieldPattern);
    } else {
      // Free-text search: match term anywhere
      const pattern = buildMatchPattern(term);
      if (pattern) patterns.push(pattern);
    }
  }

  // Recurse into left/right
  if (node.left) collectPatterns(node.left, patterns);
  if (node.right) collectPatterns(node.right, patterns);
}

/**
 * Build a regex pattern for field-specific highlighting.
 * Matches "field=value" in the formatted output.
 */
function buildFieldMatchPattern(field, term) {
  const t = term.toLowerCase();
  if (!t) return null;
  
  const escapedField = field.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  
  if (!t.includes("*")) {
    // Exact match: field=value (with word boundary after value)
    const escapedTerm = t.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    return `${escapedField}=${escapedTerm}(?!${WORD_CHARS})`;
  }
  
  const startsWithStar = t.startsWith("*");
  const endsWithStar = t.endsWith("*");
  
  // Remove leading/trailing wildcards and escape the core
  let core = t.replace(/^\*+|\*+$/g, "");
  const escaped = core.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  
  if (startsWithStar && endsWithStar) {
    // *tune* - field=...tune...
    return `${escapedField}=[^\\s]*${escaped}[^\\s]*`;
  } else if (startsWithStar) {
    // *tune - field=...tune (ends with)
    return `${escapedField}=[^\\s]*${escaped}(?!${WORD_CHARS})`;
  } else if (endsWithStar) {
    // tune* - field=tune... (starts with)
    return `${escapedField}=${escaped}[^\\s]*`;
  } else {
    // Internal wildcards
    return `${escapedField}=${escaped}`;
  }
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

  if (op === "AND" || op === "<IMPLICIT>") {
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
 * Build a regex pattern string from a term.
 * This is the SINGLE SOURCE OF TRUTH for matching logic.
 * Used by both search (buildMatcher) and highlighting.
 *
 * Wildcard patterns:
 *   *tune  - word ends with "tune"
 *   tune*  - word starts with "tune"  
 *   *tune* - contains "tune" anywhere
 * No wildcards: exact whole-word match.
 *
 * Word boundaries include common log delimiters: - / & % @
 * Trailing punctuation like : , . is treated as word boundary.
 * So "abc" won't match "aaa-abc" — use "*abc" for that.
 * However, "abc" will match "abc:" or "abc," since those are treated as word boundaries.
 */
// Characters that are considered part of a "word" for boundary matching
const WORD_CHARS = "[a-zA-Z0-9_\\-/&%@]";

function buildMatchPattern(term) {
  const t = term.toLowerCase();
  if (!t) return null;
  
  if (!t.includes("*")) {
    // No wildcards - exact whole-word match
    const escaped = t.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    return `(?<!${WORD_CHARS})${escaped}(?!${WORD_CHARS})`;
  }
  
  const startsWithStar = t.startsWith("*");
  const endsWithStar = t.endsWith("*");
  
  // Remove leading/trailing wildcards and escape the core
  let core = t.replace(/^\*+|\*+$/g, "");
  const escaped = core.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  
  if (startsWithStar && endsWithStar) {
    // *tune* - contains anywhere
    return escaped;
  } else if (startsWithStar) {
    // *tune - ends with (word boundary after)
    return escaped + `(?!${WORD_CHARS})`;
  } else if (endsWithStar) {
    // tune* - starts with (word boundary before)
    return `(?<!${WORD_CHARS})` + escaped;
  } else {
    // Internal wildcards only
    return escaped;
  }
}

/**
 * Build a matcher function from a term.
 * Uses buildMatchPattern() for the regex.
 */
function buildMatcher(term) {
  const pattern = buildMatchPattern(term);
  if (!pattern) return () => false;
  const re = new RegExp(pattern, "i");
  return val => re.test(String(val));
}

// Fields that are not displayed in formatted output (should be excluded from free-text search)
const HIDDEN_FIELDS = [
  "source_type", "path", "stack", "container.id", "event.size",
  "isVectorDebug", "length_diff"
];

function matchLeaf(node, hit) {
  const fields = hit.fields || {};
  const term   = String(node.term ?? "").toLowerCase();
  const field  = node.field;

  if (!term) return true;

  const matches = buildMatcher(term);

  // Free-text: search visible field values only
  if (!field || field === "<implicit>") {
    return Object.entries(fields).some(([key, raw]) => {
      if (raw === undefined) return false;
      // Skip hidden fields that aren't displayed in formatted output
      if (HIDDEN_FIELDS.includes(key)) return false;
      const val = unwrap(raw);
      // Handle nested objects (like json_ fields) — stringify and use same matcher
      if (val && typeof val === "object") {
        return matches(JSON.stringify(val));
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
