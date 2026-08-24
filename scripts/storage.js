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