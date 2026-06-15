/**
 * ELK Log Formatter — UI Controller
 */

const inputEl    = document.getElementById("input");
const outputEl   = document.getElementById("output");
const inputMeta  = document.getElementById("input-meta");
const outputMeta = document.getElementById("output-meta");
const statusEl   = document.getElementById("status");
const btnFormat      = document.getElementById("btn-format");
const btnSort        = document.getElementById("btn-sort");
const btnClear       = document.getElementById("btn-clear");
const copyOutputBtn  = document.getElementById("copy-output");

const searchInput  = document.getElementById("search-input");
const searchClear  = document.getElementById("search-clear");
const searchMeta   = document.getElementById("search-meta");

let plainText  = "";
let parsedData = [];   // raw hits kept for filtering

// ── Sort order (persisted in localStorage) ───────────────────────────────
let sortOrder = localStorage.getItem("elkSortOrder") || "asc";
btnSort.textContent = sortOrder === "asc" ? "↑ ASC" : "↓ DESC";

// ── Sort toggle ──────────────────────────────────────────────────────────
btnSort.addEventListener("click", () => {
  sortOrder = sortOrder === "asc" ? "desc" : "asc";
  btnSort.textContent = sortOrder === "asc" ? "↑ ASC" : "↓ DESC";
  localStorage.setItem("elkSortOrder", sortOrder);
  if (parsedData.length) applyFilter();
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
  if (searchInput.value.trim()) {
    applyFilter();
  } else {
    renderHits(data);
  }
}

function renderHits(hits) {
  const result = formatLogs(JSON.stringify(hits), sortOrder);

  if (result.error) {
    outputEl.innerHTML = "";
    plainText = "";
    copyOutputBtn.disabled = true;
    setStatus(result.error, "err");
    outputMeta.textContent = "";
    return;
  }

  outputEl.innerHTML = result.html;
  plainText = result.plain;
  copyOutputBtn.disabled = false;

  if (result.warning) {
    setStatus(result.warning, "warn");
  } else {
    setStatus(`✓ ${result.count} entries formatted`, "ok");
  }
  outputMeta.textContent = result.count ? `${result.count} entries` : "";
}

btnFormat.addEventListener("click", doFormat);

// Auto-format on paste
inputEl.addEventListener("paste", () => setTimeout(doFormat, 0));

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

// ── Search / filter ──────────────────────────────────────────────────────
searchInput.addEventListener("input", () => {
  searchClear.hidden = !searchInput.value;
  applyFilter();
});

searchClear.addEventListener("click", () => {
  searchInput.value = "";
  searchClear.hidden = true;
  searchMeta.textContent = "";
  searchInput.classList.remove("search-error");
  renderHits(parsedData);
  searchInput.focus();
});

function applyFilter() {
  const q = searchInput.value.trim();
  if (!q) {
    searchMeta.textContent = "";
    searchInput.classList.remove("search-error");
    renderHits(parsedData);
    return;
  }
  const result = filterHits(parsedData, q);
  if (result && result.error) {
    searchInput.classList.add("search-error");
    searchMeta.textContent = result.error;
    return;
  }
  searchInput.classList.remove("search-error");
  searchMeta.textContent = `${result.length} / ${parsedData.length}`;
  renderHits(result);
}

// ── Copy ────────────────────────────────────────────────────────────────
async function doCopy() {
  if (!plainText) return;
  try {
    await navigator.clipboard.writeText(plainText);
    showToast();
  } catch {
    const ta = document.createElement("textarea");
    ta.value = plainText;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showToast();
  }
}

// ── Clear ───────────────────────────────────────────────────────────────
btnClear.addEventListener("click", () => {
  inputEl.value = "";
  outputEl.innerHTML = "";
  plainText = "";
  parsedData = [];
  copyOutputBtn.disabled = true;
  searchInput.value = "";
  searchClear.hidden = true;
  searchMeta.textContent = "";
  searchInput.classList.remove("search-error");
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

// ── Copy (header button) ─────────────────────────────────────────────────
copyOutputBtn.addEventListener("click", () => doCopy());

// ── Raw JSON toggle (event delegation) ──────────────────────────────────
outputEl.addEventListener("click", (e) => {
  // Handle copy button
  const copyBtn = e.target.closest(".raw-copy");
  if (copyBtn) {
    const rawJson = copyBtn.closest(".raw-json");
    const content = rawJson.querySelector(".raw-content").textContent;
    navigator.clipboard.writeText(content).then(() => showToast());
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
function showToast() {
  const toast = document.getElementById("toast");
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2000);
}
