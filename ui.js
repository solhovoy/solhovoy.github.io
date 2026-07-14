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
const inputMeta  = document.getElementById("input-meta");
const outputMeta = document.getElementById("output-meta");
const statusEl   = document.getElementById("status");
const btnFormat      = document.getElementById("btn-format");
const stickySortBtn  = document.getElementById("sticky-sort");
const stickySortCol  = document.getElementById("bar-col-sort");
const btnClear       = document.getElementById("btn-clear");
const copyOutputBtn    = document.getElementById("copy-output");
const copySelectedBtn  = document.getElementById("copy-selected");
const outputSelectBar  = document.getElementById("output-select-bar");
const selectAllCheck   = document.getElementById("select-all-check");

const searchInput  = document.getElementById("search-input");
const searchClear  = document.getElementById("search-clear");
const searchMeta   = document.getElementById("search-meta");

let plainText  = "";
let plainLines = [];   // per-entry plain text for selective copy
let parsedData = [];   // raw hits kept for filtering

// ── Sort order (persisted in localStorage) ───────────────────────────────
let sortOrder = localStorage.getItem("elkSortOrder") || "asc";

function applySortLabel() {

  stickySortBtn.textContent = sortOrder === "asc" ? "⬆ Sort Old-New" : "⬇ Sort New-Old";
}
applySortLabel();

// ── Theme (persisted in localStorage) ────────────────────────────────────
const themeToggle = document.getElementById("theme-toggle");
let theme = localStorage.getItem("elkTheme") || "dark";
applyTheme(theme);

function applyTheme(t) {
  if (t === "light") {
    document.documentElement.classList.add("light");
    themeToggle.textContent = "🌙";
    themeToggle.title = "Switch to dark mode";
  } else {
    document.documentElement.classList.remove("light");
    themeToggle.textContent = "☀️";
    themeToggle.title = "Switch to light mode";
  }
}

themeToggle.addEventListener("click", () => {
  theme = theme === "dark" ? "light" : "dark";
  localStorage.setItem("elkTheme", theme);
  applyTheme(theme);
});

// ── Sort toggle ──────────────────────────────────────────────────────────
function doSortToggle() {
  sortOrder = sortOrder === "asc" ? "desc" : "asc";
  applySortLabel();
  localStorage.setItem("elkSortOrder", sortOrder);
  if (parsedData.length) applyFilter();
}
stickySortCol.addEventListener("click", doSortToggle);

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
  if (searchInput.value.trim()) {
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

function renderHits(hits) {
  // Capture checked entries by plain text before re-render
  const prevChecked = new Set(
    [...outputEl.querySelectorAll(".row-check:checked")]
      .map(cb => plainLines[+cb.closest(".log-entry").dataset.index])
      .filter(Boolean)
  );

  const result = formatLogs(JSON.stringify(hits), sortOrder);

  if (result.error) {
    outputEl.innerHTML = "";
    plainText = "";
    plainLines = [];
    copyOutputBtn.disabled = true;
    outputSelectBar.hidden = true;
    selectAllCheck.checked = false;
    selectAllCheck.indeterminate = false;
    setLinenumWidth(0);
    updateCopySelected();
    setStatus(result.error, "err");
    outputMeta.textContent = "";
    return;
  }

  outputEl.innerHTML = result.html;
  plainText = result.plain;
  plainLines = result.plains || [];
  setLinenumWidth(result.count);

  // Restore checked state for entries still present after re-render
  if (prevChecked.size > 0) {
    outputEl.querySelectorAll(".row-check").forEach(cb => {
      const idx = +cb.closest(".log-entry").dataset.index;
      if (prevChecked.has(plainLines[idx])) cb.checked = true;
    });
  }

  copyOutputBtn.disabled = false;
  outputSelectBar.hidden = outputEl.querySelectorAll(".row-check").length === 0;
  syncSelectAll();
  updateCopySelected();

  if (result.warning) {
    setStatus(result.warning, "warn");
  } else {
    setStatus(`✓ ${result.count} entries formatted`, "ok");
  }
  outputMeta.textContent = result.count ? `${result.count} entries` : "";
}

btnFormat.addEventListener("click", doFormat);

// Auto-format on paste
inputEl.addEventListener("paste", () => setTimeout(() => { 
  doFormat(); 
  inputEl.blur(); 
}, 0));

// Format on Ctrl/Cmd+Enter
inputEl.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    doFormat();
  }
});

// Update input char/line count
inputEl.addEventListener("input", () => {
  const lines = inputEl.value.split("\n").length;
  const chars = inputEl.value.length;
  inputMeta.textContent = chars ? `${chars.toLocaleString()} chars` : "";
});

// ── Filter expand overlay ────────────────────────────────────────────────
const searchExpand = document.getElementById("search-expand");

function flashSearchInput() {
  searchInput.classList.remove("search-input-flash");
  void searchInput.offsetWidth; // reflow to restart animation
  searchInput.classList.add("search-input-flash");
}

function autoResizeExpand() {
  searchExpand.style.height = "auto";
  searchExpand.style.height = searchExpand.scrollHeight + "px";
}

searchInput.addEventListener("focus", () => {
  searchExpand.value = searchInput.value;
  searchExpand.hidden = false;
  autoResizeExpand();
  searchExpand.focus();
  searchExpand.setSelectionRange(searchExpand.value.length, searchExpand.value.length);
});

searchExpand.addEventListener("input", () => {
  searchInput.value = searchExpand.value;
  searchInput.title = searchExpand.value;
  searchClear.hidden = !searchExpand.value;
  autoResizeExpand();
  applyFilter();
});

searchExpand.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    // searchExpand.blur();
  }
});

searchExpand.addEventListener("blur", () => {
  searchInput.value = searchExpand.value;
  searchInput.title = searchExpand.value;
  searchExpand.hidden = true;
});

// ── Search / filter ──────────────────────────────────────────────────────
searchInput.addEventListener("input", () => {
  searchInput.title = searchInput.value;
  searchClear.hidden = !searchInput.value;
  applyFilter();
});

searchClear.addEventListener("click", () => {
  setSearchValue("");
  searchClear.hidden = true;
  searchMeta.textContent = "";
  searchInput.classList.remove("search-error");
  searchExpand.classList.remove("search-error");
  renderHits(parsedData);
  searchInput.focus();
});

function setSearchValue(v) {
  searchInput.value = v;
  searchInput.title = v;
  if (!searchExpand.hidden) {
    searchExpand.value = v;
    autoResizeExpand();
  }
}

function applyFilter() {
  const q = searchInput.value.trim();
  if (!q) {
    searchMeta.textContent = "";
    searchInput.classList.remove("search-error");
    searchExpand.classList.remove("search-error");
    setStatus("", "");
    renderHits(parsedData);
    return;
  }
  const result = filterHits(parsedData, q);
  if (result.error) {
    searchInput.classList.add("search-error");
    searchExpand.classList.add("search-error");
    searchMeta.textContent = "";
    setStatus(`Filter error: ${result.error}`, "err");
    return;
  }
  searchInput.classList.remove("search-error");
  searchExpand.classList.remove("search-error");
  setStatus("", "");
  searchMeta.textContent = `${result.hits.length} / ${parsedData.length}`;
  renderHits(result.hits);
  highlightSearchTerms(result.patterns);
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

// ── Checkbox selection ─────────────────────────────────────────────────
function updateCopySelected() {
  const count = outputEl.querySelectorAll(".row-check:checked").length;
  copySelectedBtn.hidden = count === 0;
  copySelectedBtn.disabled = count === 0;
  copySelectedBtn.textContent = `⧉ Copy Selected (${count})`;
}

function syncSelectAll() {
  const all     = outputEl.querySelectorAll(".row-check");
  const checked = outputEl.querySelectorAll(".row-check:checked");
  if (all.length === 0 || checked.length === 0) {
    selectAllCheck.checked = false;
    selectAllCheck.indeterminate = false;
  } else if (checked.length === all.length) {
    selectAllCheck.checked = true;
    selectAllCheck.indeterminate = false;
  } else {
    selectAllCheck.checked = false;
    selectAllCheck.indeterminate = true;
  }
}

outputEl.addEventListener("change", (e) => {
  const cb = e.target.closest(".row-check");
  if (!cb) return;
  updateCopySelected();
  syncSelectAll();
});

selectAllCheck.addEventListener("change", () => {
  outputEl.querySelectorAll(".row-check").forEach(cb => { cb.checked = selectAllCheck.checked; });
  updateCopySelected();
});

copySelectedBtn.addEventListener("click", async () => {
  const checked = outputEl.querySelectorAll(".row-check:checked");
  if (!checked.length) return;
  const text = [...checked]
    .map(cb => plainLines[parseInt(cb.closest(".log-entry").dataset.index, 10)])
    .filter(Boolean)
    .join("\n\r");
  try {
    await navigator.clipboard.writeText(text);
    showToast(MSG_COPIED);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showToast(MSG_COPIED);
  }
});

// ── Copy ────────────────────────────────────────────────────────────────
async function doCopy() {
  if (!plainText) return;
  try {
    await navigator.clipboard.writeText(plainText);
    showToast(MSG_COPIED);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = plainText;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showToast(MSG_COPIED);
  }
}

// ── Clear ───────────────────────────────────────────────────────────────
btnClear.addEventListener("click", () => {
  inputEl.value = "";
  outputEl.innerHTML = "";
  plainText = "";
  plainLines = [];
  parsedData = [];
  copyOutputBtn.disabled = true;
  outputSelectBar.hidden = true;
  selectAllCheck.checked = false;
  selectAllCheck.indeterminate = false;
  setLinenumWidth(0);
  updateCopySelected();
  setSearchValue("");
  searchClear.hidden = true;
  searchMeta.textContent = "";
  searchInput.classList.remove("search-error");
  searchExpand.classList.remove("search-error");
  inputMeta.textContent = "";
  outputMeta.textContent = "";
  setStatus("", "");
  inputEl.focus();
});

// ── Helpers ─────────────────────────────────────────────────────────────
function setStatus(msg, cls) {
  statusEl.textContent = msg;
  statusEl.className = "status" + (cls ? " " + cls : "");
}

// ── Collapse / expand ────────────────────────────────────────────────────
function makeCollapsible(btnId, panelId, isInput) {
  const btn   = document.getElementById(btnId);
  const panel = document.getElementById(panelId);
  btn.addEventListener("click", () => {
    const collapsed = panel.classList.toggle("collapsed");
    btn.textContent = collapsed ? (isInput ? "▼" : "▲") : (isInput ? "▲" : "▼");
    btn.title = collapsed ? "Expand" : "Collapse";
  });
}
makeCollapsible("collapse-input", "panel-input", true);

// ── Constants ────────────────────────────────────────────────────────
const SAVED_FILTERS_KEY       = "elkSavedFilters";
const MSG_COPIED              = "Copied to clipboard";
const MSG_FILTER_SAVED        = "Filter saved";
const MSG_FILTER_DUP          = "Sorry, filter already exists";
const MSG_NOTHING_SAVE        = "Sorry, nothing to save";
const MSG_NOTHING_EXPORT      = "Nothing to export";
const MSG_DROP_NOT_JSON       = "Please drop a .json file";
const MSG_IMPORT_INVALID_JSON = "Invalid JSON file";
const MSG_IMPORT_BAD_FORMAT   = "Expected an array of filter strings";
const MSG_IMPORT_NO_NEW       = "No new filters to import";
const MSG_IMPORT_OK           = "Imported {0} filter(s)";

// ── Saved filters ─────────────────────────────────────────────────────

function getSavedFilters() {
  try { return JSON.parse(localStorage.getItem(SAVED_FILTERS_KEY)) || []; }
  catch { return []; }
}

function setSavedFilters(filters) {
  localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(filters));
}

const filterSaveBtn   = document.getElementById("filter-save-btn");
const filterSavedBtn  = document.getElementById("filter-saved-btn");
const filterSavedPopup = document.getElementById("filter-saved-popup");
const filterSavedClose = document.getElementById("filter-saved-close");
const filterSavedBody  = document.getElementById("filter-saved-body");

filterSaveBtn.addEventListener("click", () => {
  const q = searchInput.value.trim();
  if (!q) { showToast(MSG_NOTHING_SAVE); return; }
  // Only save if there's no parse error
  const check = filterHits([], q);
  if (check.error) return;
  const filters = getSavedFilters();
  if (!filters.includes(q)) {
    filters.unshift(q);
    setSavedFilters(filters);
    showToast(MSG_FILTER_SAVED);
  } else {
    showToast(MSG_FILTER_DUP);
  }
});

function renderSavedFilters() {
  const filters = getSavedFilters();
  filterSavedBody.innerHTML = "";
  if (!filters.length) {
    const p = document.createElement("p");
    p.className = "filter-saved-empty";
    p.textContent = "No saved filters yet. Drop a JSON file here to import.";
    filterSavedBody.appendChild(p);
    return;
  }
  const ul = document.createElement("ul");
  ul.className = "filter-saved-list";
  for (const [i, f] of filters.entries()) {
    const li  = document.createElement("li");
    li.className = "filter-saved-item";

    const num = document.createElement("span");
    num.className = "filter-saved-num";
    num.textContent = i + 1;

    const code = document.createElement("code");
    code.textContent = f;
    code.addEventListener("click", () => {
      setSearchValue(f);
      searchClear.hidden = false;
      filterSavedPopup.hidden = true;
      flashSearchInput();
      applyFilter();
    });

    const del = document.createElement("button");
    del.className = "filter-saved-delete";
    del.title = "Delete";
    del.textContent = "✕";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      setSavedFilters(getSavedFilters().filter(x => x !== f));
      renderSavedFilters();
    });

    li.appendChild(num);
    li.appendChild(code);
    li.appendChild(del);
    ul.appendChild(li);
  }
  filterSavedBody.appendChild(ul);
}

filterSavedBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const isHidden = filterSavedPopup.hidden;
  // Close help popup if open
  filterHelpPopup.hidden = true;
  filterSavedPopup.hidden = !isHidden;
  if (isHidden) {
    renderSavedFilters();
    const rect = filterSavedBtn.getBoundingClientRect();
    const popupWidth = 620;
    let left = rect.right - popupWidth;
    if (left < 8) left = 8;
    const availableHeight = window.innerHeight - rect.bottom - 12;
    filterSavedPopup.style.top       = (rect.bottom + 4) + "px";
    filterSavedPopup.style.left      = left + "px";
    filterSavedPopup.style.maxHeight = Math.max(200, availableHeight) + "px";
  }
});
filterSavedClose.addEventListener("click", () => { filterSavedPopup.hidden = true; });

// ── Export filters ────────────────────────────────────────────────────────
const filterExportBtn = document.getElementById("filter-export-btn");
filterExportBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const filters = getSavedFilters();
  if (!filters.length) { showToast(MSG_NOTHING_EXPORT); return; }
  const blob = new Blob([JSON.stringify(filters, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "elk-formatter-filters.json";
  a.click();
  URL.revokeObjectURL(url);
});

// ── Import filters via drag & drop ────────────────────────────────────────
const filterSavedDropOverlay = document.getElementById("filter-saved-drop-overlay");
let dragCounter = 0;

filterSavedPopup.addEventListener("dragenter", (e) => {
  e.preventDefault();
  dragCounter++;
  filterSavedDropOverlay.hidden = false;
});

filterSavedPopup.addEventListener("dragleave", () => {
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    filterSavedDropOverlay.hidden = true;
  }
});

filterSavedPopup.addEventListener("dragover", (e) => {
  e.preventDefault();
});

filterSavedPopup.addEventListener("drop", (e) => {
  e.preventDefault();
  dragCounter = 0;
  filterSavedDropOverlay.hidden = true;

  const file = e.dataTransfer?.files?.[0];
  if (!file || !file.name.endsWith(".json")) { showToast(MSG_DROP_NOT_JSON); return; }

  const reader = new FileReader();
  reader.onload = (ev) => {
    let imported;
    try { imported = JSON.parse(ev.target.result); } catch {
      showToast(MSG_IMPORT_INVALID_JSON); return;
    }
    if (!Array.isArray(imported) || !imported.every(x => typeof x === "string")) {
      showToast(MSG_IMPORT_BAD_FORMAT); return;
    }
    const existing = getSavedFilters();
    const added = imported.filter(f => f.trim() && !existing.includes(f));
    if (!added.length) { showToast(MSG_IMPORT_NO_NEW); return; }
    setSavedFilters([...added, ...existing]);
    renderSavedFilters();
    showToast(MSG_IMPORT_OK.replace("{0}", added.length));
  };
  reader.readAsText(file);
});
document.addEventListener("click", (e) => {
  if (!filterSavedPopup.hidden && !filterSavedPopup.contains(e.target) && e.target !== filterSavedBtn) {
    filterSavedPopup.hidden = true;
  }
});

// ── Filter help popup ─────────────────────────────────────────────────
const filterHelpBtn   = document.getElementById("filter-help-btn");
const filterHelpPopup = document.getElementById("filter-help-popup");
const filterHelpClose = document.getElementById("filter-help-close");

filterHelpBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const isHidden = filterHelpPopup.hidden;
  // Close saved popup if open
  filterSavedPopup.hidden = true;
  filterHelpPopup.hidden = !isHidden;
  if (isHidden) {
    const rect = filterHelpBtn.getBoundingClientRect();
    const popupWidth = 420;
    let left = rect.right - popupWidth;
    if (left < 8) left = 8;
    const availableHeight = window.innerHeight - rect.bottom - 12;
    filterHelpPopup.style.top       = (rect.bottom + 4) + "px";
    filterHelpPopup.style.left      = left + "px";
    filterHelpPopup.style.maxHeight = Math.max(200, availableHeight) + "px";
  }
});
filterHelpClose.addEventListener("click", () => { filterHelpPopup.hidden = true; });
document.addEventListener("click", (e) => {
  if (!filterHelpPopup.hidden && !filterHelpPopup.contains(e.target) && e.target !== filterHelpBtn) {
    filterHelpPopup.hidden = true;
  }
});

// Click an example to paste it into the search input
filterHelpPopup.querySelectorAll(".filter-examples li code").forEach(el => {
  el.addEventListener("click", () => {
    setSearchValue(el.textContent);
    searchClear.hidden = false;
    filterHelpPopup.hidden = true;
    flashSearchInput();
    applyFilter();
  });
});

// ── Copy (header button) ─────────────────────────────────────────────────
copyOutputBtn.addEventListener("click", () => doCopy());

// ── Raw JSON toggle (event delegation) ──────────────────────────────────
outputEl.addEventListener("click", (e) => {
  // Handle copy button
  const copyBtn = e.target.closest(".raw-copy");
  if (copyBtn) {
    const rawJson = copyBtn.closest(".raw-json");
    const content = rawJson.querySelector(".raw-content").textContent;
    navigator.clipboard.writeText(content).then(() => showToast(MSG_COPIED));
    return;
  }

  // Handle collapse button inside raw-json
  const collapseBtn = e.target.closest(".raw-collapse");
  if (collapseBtn) {
    const entry = collapseBtn.closest(".log-entry");
    if (entry) {
      entry.classList.remove("expanded");
      entry.querySelector(".raw-json").hidden = true;
    }
    return;
  }

  // Handle raw JSON toggle button
  const toggle = e.target.closest(".raw-toggle");
  if (!toggle) return;
  const entry = toggle.closest(".log-entry");
  if (!entry) return;
  const rawJson = entry.querySelector(".raw-json");
  const isExpanded = entry.classList.toggle("expanded");
  rawJson.hidden = !isExpanded;
});

let toastTimer;
function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2000);
}
