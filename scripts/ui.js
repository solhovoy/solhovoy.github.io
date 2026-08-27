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
    preferencesController.getOutputSettings()
  );

  if (result.error) {
    outputEl.innerHTML = "";
    plainText = "";
    plainLines = [];
    outputController.reset();
    setLinenumWidth(0);
    setStatus(result.error, "err");
    return;
  }

  outputEl.innerHTML = result.html;
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
const outputController = new OutputController({
  getPlainText: () => plainText,
  getPlainLines: () => plainLines
});
const preferencesController = new PreferencesController({
  onSortChange: () => {
    if (parsedData.length) applyFilter({ flash: false });
  }
});
const settingsController = new SettingsController({
  popupManager,
  preferencesController,
  outputController,
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
    renderHits(parsedData);
    if (flash) flashOutput();
    return;
  }
  if (SEARCH_INPUT_FLASH_ENABLED && flash && q) searchController.flash();
  const result = filterHits(parsedData, q, preferencesController.getOutputSettings());
  if (result.error) {
    searchController.setError(true);
    setStatus(`Filter error: ${result.error}`, "err");
    return;
  }
  searchController.setError(false);
  setStatus("", "");
  const hits = dateRangeFilter.filterHits(result.hits);
  if (hits.length === 0) {
    outputEl.innerHTML = `<div class="no-filter-results">No entries match the filter / date range</div>`;
    outputController.showOutputControls(false);
    setStatus(`✓ 0 of ${parsedData.length} entries formatted`, "ok");
    if (flash) flashOutput();
    return;
  }
  renderHits(hits, parsedData.length);
  highlightSearchTerms(result.patterns);
  if (flash) flashOutput();
}

/**
 * Highlight search terms in rendered output.
 * Uses the exact same regex patterns as search (from buildMatchPattern).
 */
function highlightSearchTerms(patterns) {
  if (!patterns || !patterns.length) return;

  // Combine patterns from search.js (already built with correct word boundaries)
  const regex = new RegExp(`(${patterns.join("|")})`, "gi");

  // Walk text nodes in output and wrap matches
  const walker = document.createTreeWalker(
    outputEl,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        // Skip nodes inside raw-json sections
        if (node.parentElement?.closest(".raw-json")) return NodeFilter.FILTER_REJECT;
        // Skip line numbers
        if (node.parentElement?.closest(".line-num")) return NodeFilter.FILTER_REJECT;
        // Skip if no match
        if (!regex.test(node.textContent)) return NodeFilter.FILTER_REJECT;
        regex.lastIndex = 0;
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const nodesToProcess = [];
  while (walker.nextNode()) {
    nodesToProcess.push(walker.currentNode);
  }

  for (const textNode of nodesToProcess) {
    const text = textNode.textContent;
    regex.lastIndex = 0;
    
    // Use matchAll to find matches
    const matches = [...text.matchAll(regex)];
    if (!matches.length) continue;

    const frag = document.createDocumentFragment();
    let lastIndex = 0;

    for (const match of matches) {
      // Add text before match
      if (match.index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }
      // Add highlighted match
      const mark = document.createElement("span");
      mark.className = "search-match";
      mark.textContent = match[0];
      frag.appendChild(mark);
      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    textNode.parentNode.replaceChild(frag, textNode);
  }
}

// ── Clear ───────────────────────────────────────────────────────────────
btnClear.addEventListener("click", () => {
  inputController.clear();
  outputEl.innerHTML = "";
  plainText = "";
  plainLines = [];
  parsedData = [];
  outputController.reset();
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

