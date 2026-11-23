function getRecentDateRanges() {
  try {
    const ranges = JSON.parse(localStorage.getItem(LS_KEY_RECENT_DATE_RANGES)) || [];
    if (!Array.isArray(ranges)) return [];
    return ranges.flatMap(range => {
      if (typeof range?.start !== "string" || typeof range?.end !== "string") return [];
      const start = new Date(range.start);
      const end = new Date(range.end);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
      return [{ start: start.toISOString(), end: end.toISOString() }];
    }).slice(0, MAX_RECENT_DATE_RANGES);
  } catch {
    return [];
  }
}

function setRecentDateRanges(ranges) {
  localStorage.setItem(LS_KEY_RECENT_DATE_RANGES, JSON.stringify(ranges));
}

function saveRecentDateRange(range) {
  const start = new Date(range?.start);
  const end = new Date(range?.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return;
  const recentRange = { start: start.toISOString(), end: end.toISOString() };
  const ranges = getRecentDateRanges().filter(range => range.start !== recentRange.start || range.end !== recentRange.end);
  setRecentDateRanges([recentRange, ...ranges].slice(0, MAX_RECENT_DATE_RANGES));
}

function getSavedFilters() {
  try { return JSON.parse(localStorage.getItem(LS_KEY_SAVED_FILTERS)) || []; }
  catch { return []; }
}

function setSavedFilters(filters) {
  localStorage.setItem(LS_KEY_SAVED_FILTERS, JSON.stringify(filters));
}

function getPinnedFields() {
  try {
    const fields = JSON.parse(localStorage.getItem(LS_KEY_PINNED_FIELDS)) || [];
    return Array.isArray(fields) ? [...new Set(fields.filter(field => typeof field === "string" && field))] : [];
  } catch {
    return [];
  }
}

function setPinnedFields(fields) {
  localStorage.setItem(LS_KEY_PINNED_FIELDS, JSON.stringify(fields));
}

function getOutputSettings() {
  try {
    const settings = JSON.parse(localStorage.getItem(LS_KEY_OUTPUT_SETTINGS)) || {};
    return settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  } catch {
    return {};
  }
}

function setOutputSettings(settings) {
  localStorage.setItem(LS_KEY_OUTPUT_SETTINGS, JSON.stringify(settings));
}

function getExportSettings() {
  try {
    const settings = JSON.parse(localStorage.getItem(LS_KEY_EXPORT_SETTINGS)) || {};
    return settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  } catch {
    return {};
  }
}

function setExportSettings(settings) {
  localStorage.setItem(LS_KEY_EXPORT_SETTINGS, JSON.stringify(settings));
}

function getHighlightSettings() {
  try {
    return mergeHighlightSettings(
      getDefaultHighlightSettings(),
      JSON.parse(localStorage.getItem(LS_KEY_HIGHLIGHT_SETTINGS))
    );
  } catch {
    return getDefaultHighlightSettings();
  }
}

// Stores only the differences from the defaults, so untouched values follow future default changes.
function setHighlightSettings(settings) {
  const defaults = getDefaultHighlightSettings();
  const overrides = {};
  if (settings.enabled !== defaults.enabled) overrides.enabled = settings.enabled;
  for (const group of Object.keys(HIGHLIGHT_GROUPS)) {
    for (const [id, { enabled, colors }] of Object.entries(settings[group])) {
      const base = defaults[group][id];
      const override = {};
      if (enabled !== base.enabled) override.enabled = enabled;
      for (const theme of ["dark", "light"]) {
        if (colors[theme] !== base.colors[theme]) (override.colors ??= {})[theme] = colors[theme];
      }
      if (Object.keys(override).length) ((overrides[group] ??= {})[id] = override);
    }
  }
  if (Object.keys(overrides).length) {
    localStorage.setItem(LS_KEY_HIGHLIGHT_SETTINGS, JSON.stringify(overrides));
  } else {
    localStorage.removeItem(LS_KEY_HIGHLIGHT_SETTINGS);
  }
}