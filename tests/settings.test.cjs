const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sections = ["uiState", "general", "output", "savedFilters", "recentDateRanges", "pinnedFields"];
const plain = value => JSON.parse(JSON.stringify(value));

function createSettings(storage = new Map()) {
  const elements = new Map();
  const node = () => ({
    checked: false,
    dataset: {},
    style: { setProperty() {} },
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    setAttribute() {},
    toggleAttribute() {},
    replaceChildren(...children) { this.children = children; },
    focus() {},
    blur() {},
    click() {},
    querySelector: () => node()
  });
  const exportInputs = sections.map(key => ({ ...node(), dataset: { settingsExport: key } }));
  const toasts = [];
  const downloads = [];
  const context = vm.createContext({
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key)
    },
    document: {
      addEventListener() {},
      documentElement: node(),
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, node());
        return elements.get(id);
      },
      querySelectorAll: selector => selector === "[data-settings-export]" ? exportInputs : [],
      createElement: node
    },
    requestAnimationFrame: callback => callback(),
    showToast: (...args) => toasts.push(args),
    Blob,
    URL: { createObjectURL: blob => { downloads.push(blob); return "blob:test"; }, revokeObjectURL() {} }
  });
  for (const file of ["constants", "storage", "preferences-controller", "fields-controller", "popup-manager", "settings-controller"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, `../scripts/${file}.js`), "utf8"), context);
  }
  const { PreferencesController, FieldsController, PopupManager, SettingsController } = vm.runInContext(
    "({ PreferencesController, FieldsController, PopupManager, SettingsController })", context
  );
  const preferences = new PreferencesController({ onSortChange() {} });
  let renders = 0;
  const fields = Object.assign(Object.create(FieldsController.prototype), {
    panel: node(),
    pinnedFields: context.getPinnedFields(),
    render: () => renders++,
    updateToggle() {},
    toggle: node()
  });
  fields.panel.hidden = storage.get("elkFieldsPanelOpen") !== "true";
  const settings = new SettingsController({
    preferencesController: preferences,
    fieldsController: fields,
    outputController: { setHighlightSelectedRows() {} },
    onOutputSettingsChange() {},
    popupManager: new PopupManager()
  });
  settings.popup.hidden = true;
  settings.popupManager.toggle("settings");
  return { settings, preferences, fields, context, storage, toasts, downloads, get renders() { return renders; } };
}

function seed() {
  return new Map([
    ["elkTheme", "light"],
    ["elkFieldsPanelOpen", "true"],
    ["elkFieldsPanelWidth", "375"],
    ["elkSortOrder", "desc"],
    ["elkOutputSettings", JSON.stringify({
      highlightSelectedRows: true,
      showRawElk: false,
      hideEmptyMetadata: true,
      shownFields: { t: false, a: true, r: false, p: true, h: false }
    })],
    ["elkSavedFilters", JSON.stringify(['c:"Service"', "error AND NOT timeout"])],
    ["elkRecentDateRanges", JSON.stringify([
      { start: "2026-11-12T10:00:00.123Z", end: "2026-11-12T11:00:00.456Z" }
    ])],
    ["elkPinnedFields", JSON.stringify(["c", "nested.code"])]
  ]);
}

test("exports exactly the selected sections, defaulting to all six, with UI state independent of general settings", async () => {
  const { settings, downloads, toasts } = createSettings(seed());
  assert.ok(settings.exportInputs.every(input => input.checked));
  const full = plain(settings.getSnapshot());
  assert.deepEqual(full, {
    theme: "light",
    fieldsPanelOpen: true,
    fieldsPanelWidth: 375,
    sortOrder: "desc",
    outputSettings: {
      highlightSelectedRows: true, showRawElk: false, hideEmptyMetadata: true,
      shownFields: { t: false, a: true, r: false, p: true, h: false }
    },
    savedFilters: ['c:"Service"', "error AND NOT timeout"],
    recentDateRanges: [{ start: "2026-11-12T10:00:00.123Z", end: "2026-11-12T11:00:00.456Z" }],
    pinnedFields: ["c", "nested.code"]
  });
  const keys = [
    ["fieldsPanelOpen", "fieldsPanelWidth", "sortOrder"], ["theme"], ["outputSettings"],
    ["savedFilters"], ["recentDateRanges"], ["pinnedFields"]
  ];
  const combinations = 2 ** sections.length;
  for (let mask = 1; mask < combinations; mask++) {
    settings.exportInputs.forEach((input, index) => { input.checked = Boolean(mask & (1 << index)); });
    settings.export({ stopPropagation() {} });
    const snapshot = JSON.parse(await downloads.at(-1).text());
    const expected = Object.fromEntries(keys.flatMap((group, index) =>
      mask & (1 << index) ? group.map(key => [key, full[key]]) : []));
    assert.deepEqual(snapshot, expected);
    assert.equal(settings.isValidSnapshot(snapshot), true);
  }
  settings.exportInputs.forEach(input => { input.checked = false; });
  settings.export({ stopPropagation() {} });
  assert.equal(downloads.length, combinations - 1);
  assert.equal(toasts.at(-1)[0], "Cannot export");
});

test("closes settings after export without saving draft changes, but stays open when nothing is selected", async () => {
  const { settings, preferences, downloads, toasts, storage } = createSettings(seed());
  const before = [...storage];
  settings.toggleTheme();
  settings.highlightSelectedInput.checked = false;
  settings.exportInputs.find(input => input.dataset.settingsExport === "output").checked = false;
  settings.export({ stopPropagation() {} });
  assert.equal(settings.popup.hidden, true);
  assert.equal(JSON.parse(await downloads[0].text()).theme, "dark");
  assert.equal(preferences.getTheme(), "light");
  assert.deepEqual([...storage], before);

  settings.popupManager.toggle("settings");
  settings.exportInputs.forEach(input => { input.checked = false; });
  settings.export({ stopPropagation() {} });
  assert.equal(settings.popup.hidden, false);
  assert.equal(downloads.length, 1);
  assert.equal(toasts.at(-1)[0], "Cannot export");
});

test("round-trips all sections into persisted preferences and refreshes pinned fields immediately", () => {
  const snapshot = plain(createSettings(seed()).settings.getSnapshot());
  const target = createSettings();
  target.settings.importSettings(JSON.stringify(snapshot));
  assert.deepEqual(plain(target.settings.getSnapshot()), snapshot);
  assert.deepEqual(plain(target.fields.pinnedFields), ["c", "nested.code"]);
  assert.equal(target.renders, 1);
  assert.equal(target.toasts.at(-1)[0], "Imported");
  assert.deepEqual(plain(createSettings(target.storage).settings.getSnapshot()), snapshot);
});

test("partial imports preserve omitted sections and empty lists clear only the included data", () => {
  const { settings, fields } = createSettings(seed());
  const before = plain(settings.getSnapshot());
  settings.importSettings(JSON.stringify({ savedFilters: [] }));
  assert.deepEqual(plain(settings.getSnapshot()), { ...before, savedFilters: [] });
  settings.importSettings(JSON.stringify({ recentDateRanges: [], pinnedFields: [] }));
  assert.deepEqual(plain(settings.getSnapshot()), {
    ...before, savedFilters: [], recentDateRanges: [], pinnedFields: []
  });
  assert.deepEqual(plain(fields.pinnedFields), []);
});

test("imports legacy settings snapshots and merges partial output visibility without resetting other fields", () => {
  const { settings } = createSettings(seed());
  const before = plain(settings.getSnapshot());
  settings.importSettings(JSON.stringify({ theme: "dark", outputSettings: { shownFields: { a: false } } }));
  const expected = {
    ...before, theme: "dark",
    outputSettings: { ...before.outputSettings, shownFields: { ...before.outputSettings.shownFields, a: false } }
  };
  assert.deepEqual(plain(settings.getSnapshot()), expected);
  settings.importSettings(JSON.stringify({ outputSettings: { showRawElk: true } }));
  assert.deepEqual(plain(settings.getSnapshot()), {
    ...expected, outputSettings: { ...expected.outputSettings, showRawElk: true }
  });
});

test("restores and persists both timestamp sort orders, refreshes the label and output, and preserves the sort toggle", () => {
  const { settings, preferences, storage } = createSettings();
  const renderedOrders = [];
  settings.onOutputSettingsChange = () => renderedOrders.push(preferences.getSortOrder());
  for (const sortOrder of ["desc", "asc"]) {
    settings.importSettings(JSON.stringify({ sortOrder }));
    assert.equal(preferences.getSortOrder(), sortOrder);
    assert.equal(storage.get("elkSortOrder"), sortOrder);
    assert.equal(preferences.sortButton.children[0], sortOrder === "asc" ? "Sort Old-New" : "Sort New-Old");
    assert.equal(renderedOrders.at(-1), sortOrder);
    assert.equal(createSettings(storage).preferences.getSortOrder(), sortOrder);
  }
  const toggledOrders = [];
  preferences.onSortChange = order => toggledOrders.push(order);
  preferences.toggleSort();
  assert.deepEqual(toggledOrders, ["desc"]);
  assert.equal(storage.get("elkSortOrder"), "desc");
  assert.equal(preferences.sortButton.children[0], "Sort New-Old");
});

test("rejects malformed sections before making any changes", () => {
  const { settings, storage, toasts } = createSettings(seed());
  const before = [...storage];
  const invalid = [
    null, [], {}, { unknown: true }, { theme: "blue" },
    { sortOrder: "ascending" }, { sortOrder: null }, { theme: "dark", sortOrder: 1 },
    { savedFilters: "filter" }, { savedFilters: [42] },
    { pinnedFields: null }, { pinnedFields: [""] }, { pinnedFields: [false] },
    { recentDateRanges: {} }, { recentDateRanges: [null] },
    { recentDateRanges: [{ start: "invalid", end: "2026-11-12" }] },
    { recentDateRanges: [{ start: "2026-11-13", end: "2026-11-12" }] },
    { recentDateRanges: [{ start: 0, end: 1 }] },
    { outputSettings: null }, { outputSettings: { showRawElk: 1 } },
    { outputSettings: { shownFields: { unknown: true } } },
    { fieldsPanelOpen: "true" }, { fieldsPanelWidth: -1 }
  ];
  for (const snapshot of invalid) {
    settings.importSettings(JSON.stringify(snapshot));
    assert.deepEqual([...storage], before);
    assert.equal(toasts.at(-1)[0], "Import failed");
  }
  settings.importSettings(JSON.stringify({ theme: "dark", savedFilters: ["valid"], pinnedFields: [1] }));
  settings.importSettings("{");
  assert.deepEqual([...storage], before);
});

test("normalizes imported dates, preserves history order and milliseconds, and enforces the history limit", () => {
  const { settings, context } = createSettings();
  const ranges = Array.from({ length: 11 }, (_, i) => ({
    start: `2026-11-${String(20 - i).padStart(2, "0")}T10:00:00.123+02:00`,
    end: `2026-11-${String(20 - i).padStart(2, "0")}T11:00:00.456+02:00`
  }));
  settings.importSettings(JSON.stringify({ recentDateRanges: ranges }));
  assert.deepEqual(plain(context.getRecentDateRanges()), ranges.slice(0, 10).map(range => ({
    start: new Date(range.start).toISOString(),
    end: new Date(range.end).toISOString()
  })));
});

test("saves export choices across reloads while Cancel discards unsaved choices", () => {
  const { settings, storage } = createSettings();
  settings.exportInputs[0].checked = false;
  settings.cancel();
  settings.open();
  assert.equal(settings.exportInputs[0].checked, true);
  settings.exportInputs[0].checked = false;
  settings.save();
  const reloaded = createSettings(storage).settings;
  assert.equal(reloaded.exportInputs[0].checked, false);
  assert.ok(reloaded.exportInputs.slice(1).every(input => input.checked));
});

test("enables UI State by default when loading previously saved export choices", () => {
  const storage = seed();
  storage.set("elkExportSettings", JSON.stringify({ general: false, output: false }));
  const { settings } = createSettings(storage);
  assert.equal(settings.exportInputs[0].checked, true);
  assert.equal(settings.exportInputs[1].checked, false);
  assert.equal(settings.exportInputs[2].checked, false);
  const snapshot = settings.getSnapshot();
  assert.equal(snapshot.fieldsPanelOpen, true);
  assert.equal(snapshot.fieldsPanelWidth, 375);
  assert.equal("theme" in snapshot, false);
  assert.equal("outputSettings" in snapshot, false);
});
