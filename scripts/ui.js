/**
 * ELK Log Formatter — UI Controller
 */

// Detect non-overlay scrollbars (Windows/Linux) and style them
{
  const d = document.createElement('div');
  d.style.cssText = 'width:100px;height:100px;overflow:scroll;position:absolute;visibility:hidden';
  document.body.appendChild(d);
  if (d.offsetWidth - d.clientWidth > 0) document.documentElement.classList.add('has-scrollbars');
  document.body.removeChild(d);
}

const inputEl    = document.getElementById("input");
const outputEl   = document.getElementById("output");
const statusEl   = document.getElementById("status");
const btnFormat      = document.getElementById("btn-format");
const btnClear       = document.getElementById("btn-clear");

const popupManager = new PopupManager();

let plainText  = "";
let plainLines = [];   // per-entry plain text for selective copy
let parsedData = [];   // raw hits kept for filtering

const dateRangeFilter = DateRangeFilter.init({
  getTimestamp: hit => unwrap((hit.fields || {})["@timestamp"] ?? [null]),
  onApply: saveRecentDateRange,
  onClear: () => applyFilter({ flash: false }),
  onInvalidRange: () => showToast(TOAST_TITLE_DATE_RANGE_IGNORED, {
    description: MSG_DATE_RANGE_IGNORED,
    category: TOAST_CATEGORY_WARNING
  }),
});

// ── Format ──────────────────────────────────────────────────────────────
function doFormat() {
  const raw = inputEl.value.trim();
  if (!raw) { setStatus("Paste some JSON first.", ""); return; }

  let data;
  try { data = JSON.parse(raw); } catch (e) {
    setStatus(`JSON parse error: ${e.message}`, "err"); return;
  }

  // Normalize: handle single hit, convert _source to fields if needed
  parsedData = normalizeInput(data);
  fieldsController.setHits(parsedData);
  dateRangeFilter.populateFromHits(parsedData);
  if (searchController.getValue().trim() || dateRangeFilter.hasRange()) {
    applyFilter();
  } else {
    renderHits(data);
  }
}

function setLinenumWidth(count) {
  const digits = count > 0 ? String(count).length : 1;
  // ~7px per digit at font-size 11px, minimum 14px (2 digits)
  const px = Math.max(14, digits * 7);
  document.documentElement.style.setProperty("--lnum-w", px + "px");
}

function renderHits(hits, totalCount = hits.length) {
  // Preserve checked entries across re-renders independently of output settings.
  const prevChecked = outputController.captureCheckedSelectionIds();

  const result = formatLogs(
    JSON.stringify(hits),
    preferencesController.getSortOrder(),
    {
      ...preferencesController.getOutputSettings(),
      selectedFields: fieldsController.getSelectedFields(),
      sortField: outputController.getColumnSort()
    }
  );

  if (result.error) {
    outputEl.innerHTML = "";
    plainText = "";
    plainLines = [];
    outputController.reset();
    outputMinimap.refresh();
    setLinenumWidth(0);
    setStatus(result.error, "err");
    return;
  }

  outputController.setFieldColumns(fieldsController.getSelectedFields());
  outputEl.innerHTML = result.html;
  outputController.fitColumnsToContent();
  plainText = result.plain;
  plainLines = result.plains || [];
  setLinenumWidth(result.count);

  // Restore checked state for entries still present after re-render.
  outputController.restoreCheckedSelectionIds(prevChecked);
  outputController.showOutputControls(outputEl.querySelectorAll(".row-check").length > 0);
  outputController.syncSelection();

  if (result.warning) {
    setStatus(result.warning, "warn");
  } else {
    setStatus(`✓ ${result.count} of ${totalCount} entries formatted`, "ok");
  }
}

btnFormat.addEventListener("click", doFormat);
const inputController = new InputController({ onFormat: doFormat });
const outputMinimap = new OutputMinimap({ scroller: document.getElementById("output-wrap"), content: outputEl });
const outputController = new OutputController({
  getPlainText: () => plainText,
  getPlainLines: () => plainLines,
  onSelectionChange: () => outputMinimap.refresh(),
  onReorderColumns: order => fieldsController.setSelectedOrder(order),
  onColumnSortChange: () => {
    if (parsedData.length) applyFilter({ flash: false });
  }
});
const preferencesController = new PreferencesController({
  // While sorting by a field column, clicking the date header restores the date sort.
  interceptSortClick: () => outputController.clearColumnSort(),
  onSortChange: () => {
    if (parsedData.length) applyFilter({ flash: false });
  }
});
outputMinimap.setEnabled(preferencesController.getShowMinimap());
const fieldsController = new FieldsController({
  onChange: () => {
    if (parsedData.length) applyFilter({ flash: false });
  }
});
const settingsController = new SettingsController({
  popupManager,
  preferencesController,
  outputController,
  outputMinimap,
  fieldsController,
  onOutputSettingsChange: () => {
    if (parsedData.length) applyFilter({ flash: false });
  }
});
outputController.setHighlightSelectedRows(preferencesController.getHighlightSelectedRows());
const searchController = new SearchUiController({
  onApply: () => applyFilter(),
  onApplyButton: () => {
    if (!dateRangeFilter.applyDraft()) return;
    applyFilter();
  },
  onClear: () => applyFilter()
});

function flashOutput() {
  outputEl.classList.remove("output-filter-flash");
  void outputEl.offsetWidth;
  outputEl.classList.add("output-filter-flash");
}

function applyFilter({ flash = true } = {}) {
  const q = searchController.getValue().trim();
  if (!q && !dateRangeFilter.hasRange()) {
    searchController.setError(false);
    setStatus("", "");
    fieldsController.setHits(parsedData, { keepSelected: true });
    renderHits(parsedData);
    if (flash) flashOutput();
    return true;
  }
  if (SEARCH_INPUT_FLASH_ENABLED && flash && q) searchController.flash();
  const result = filterHits(parsedData, q, preferencesController.getOutputSettings());
  if (result.error) {
    searchController.setError(true);
    setStatus(`Filter error: ${result.error}`, "err");
    return false;
  }
  searchController.setError(false);
  setStatus("", "");
  const hits = dateRangeFilter.filterHits(result.hits);
  fieldsController.setHits(hits, { keepSelected: true });
  if (hits.length === 0) {
    plainText = "";
    plainLines = [];
    outputController.setFieldColumns([]);
    outputEl.innerHTML = `<div class="no-filter-results">No entries match the filter / date range</div>`;
    outputController.showOutputControls(false);
    outputMinimap.refresh();
    setStatus(`✓ 0 of ${parsedData.length} entries formatted`, "ok");
    if (flash) flashOutput();
    return true;
  }
  renderHits(hits, parsedData.length);
  highlightFieldColumns(result.fieldPatterns);
  highlightSearchTerms(result.patterns);
  // Highlight marks add padding, so re-measure auto column widths.
  if (result.patterns?.length || result.fieldPatterns?.length) outputController.fitColumnsToContent();
  outputMinimap.refresh();
  if (flash) flashOutput();
  return true;
}

/**
 * Highlight field-specific matches (field:value) inside selected-field column cells,
 * which render only the value without the "field=" prefix used by highlightSearchTerms.
 */
function highlightFieldColumns(fieldPatterns) {
  if (!fieldPatterns || !fieldPatterns.length) return;
  const byField = new Map();
  for (const { field, pattern } of fieldPatterns) {
    for (const key of [field, `kv_obj.${field}`]) {
      if (!byField.has(key)) byField.set(key, []);
      byField.get(key).push(pattern);
    }
  }
  const regexes = new Map([...byField].map(([key, list]) => [key, new RegExp(`(${list.join("|")})`, "gi")]));
  outputEl.querySelectorAll(".col[data-field]").forEach(cell => {
    const regex = regexes.get(cell.dataset.field);
    if (!regex) return;
    // Match against the full cell text: syntax highlighting may split it into several text nodes.
    const ranges = [...cell.textContent.matchAll(regex)]
      .filter(match => match[0])
      .map(match => [match.index, match.index + match[0].length]);
    if (ranges.length) wrapTextRanges(cell, ranges);
  });
}

/** Wrap [start, end) character ranges of an element's text in .search-match spans. */
function wrapTextRanges(element, ranges) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let offset = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    nodes.push({ node, start: offset, end: offset + node.textContent.length });
    offset += node.textContent.length;
  }
  for (const { node, start, end } of nodes) {
    // Keep offsets aligned with textContent, but don't nest marks in already highlighted text.
    if (node.parentElement?.closest(".search-match")) continue;
    const parts = ranges
      .filter(([from, to]) => Math.max(from, start) < Math.min(to, end))
      .map(([from, to]) => ({
        from: Math.max(from, start) - start,
        to: Math.min(to, end) - start,
        // The match continues from the previous / into the next text node.
        contStart: from < start,
        contEnd: to > end
      }));
    if (!parts.length) continue;
    const text = node.textContent;
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const { from, to, contStart, contEnd } of parts) {
      if (from > last) frag.appendChild(document.createTextNode(text.slice(last, from)));
      const mark = document.createElement("span");
      mark.className = "search-match";
      mark.classList.toggle("cont-start", contStart);
      mark.classList.toggle("cont-end", contEnd);
      mark.textContent = text.slice(from, to);
      frag.appendChild(mark);
      last = to;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }
}

/**
 * Highlight search terms in rendered output.
 * Uses the exact same regex patterns as search (from buildMatchPattern).
 */
function highlightSearchTerms(patterns) {
  if (!patterns || !patterns.length) return;

  // Combine patterns from search.js (already built with correct word boundaries)
  const regex = new RegExp(`(${patterns.join("|")})`, "gi");

  // Match against each line part's full text: syntax highlighting (e.g. URLs) splits
  // "field=value" into several text nodes. Line prefix and raw JSON are skipped.
  outputEl.querySelectorAll(".log-line > span:not(.line-prefix), .stack-trace").forEach(element => {
    const ranges = [...element.textContent.matchAll(regex)]
      .filter(match => match[0])
      .map(match => [match.index, match.index + match[0].length]);
    if (ranges.length) wrapTextRanges(element, ranges);
  });
}

// ── Clear ───────────────────────────────────────────────────────────────
btnClear.addEventListener("click", () => {
  inputController.clear();
  outputEl.innerHTML = "";
  plainText = "";
  plainLines = [];
  parsedData = [];
  fieldsController.clear();
  outputController.setFieldColumns([]);
  outputController.reset();
  outputMinimap.refresh();
  setLinenumWidth(0);
  searchController.setValue("");
  dateRangeFilter.clear({ resetAvailableRange: true });
  searchController.setError(false);
  setStatus("", "");
  inputController.focus();
});

// ── Helpers ─────────────────────────────────────────────────────────────
function setStatus(msg, cls) {
  statusEl.textContent = msg;
  statusEl.className = "status" + (cls ? " " + cls : "");
}

const escapablePopups = [
  { isOpen: () => searchController.isExpansionOpen(), close: () => searchController.closeExpansion() },
  { isOpen: () => dateRangeFilter.isOpen(), close: () => dateRangeFilter.close() }
];

document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  const openPopups = escapablePopups.filter(popup => popup.isOpen());
  if (!openPopups.length) return;
  e.preventDefault();
  openPopups.forEach(popup => popup.close());
});

new FilterHelpPopup({
  popupManager,
  onSelect: value => {
    searchController.setValue(value);
    applyFilter();
  }
});

new DateRangeHistoryPopup({
  popupManager,
  dateRangeFilter,
  onApply: () => applyFilter()
});

new SavedFiltersPopup({
  popupManager,
  onSelect: value => {
    if (value === undefined) return searchController.getValue().trim();
    searchController.setValue(value);
    applyFilter();
  }
});

