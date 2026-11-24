const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sections = ["uiState", "general", "output", "highlighting", "savedFilters", "recentDateRanges", "pinnedFields"];
const plain = value => JSON.parse(JSON.stringify(value));

function createSettings(storage = new Map()) {
  const elements = new Map();
  const node = () => ({
    checked: false,
    dataset: {},
    attributes: {},
    listeners: {},
    style: { setProperty(name, value) { this[name] = value; } },
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); },
    dispatch(type) { (this.listeners[type] ?? []).forEach(listener => listener({ target: this })); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    toggleAttribute() {},
    append(...children) { this.children = [...(this.children ?? []), ...children]; },
    replaceChildren(...children) { this.children = children; },
    focus() {},
    blur() {},
    click() {},
    querySelector: () => node()
  });
  const exportInputs = sections.map(key => ({ ...node(), dataset: { settingsExport: key } }));
  elements.set("settings-preview-message", { ...node(), textContent: `ok=true n=1` });
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
  for (const file of ["formatter", "constants", "storage", "preferences-controller", "fields-controller", "popup-manager", "settings-controller"]) {
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
    outputMinimap: { setEnabled() {} },
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
    ["elkPinnedFields", JSON.stringify(["c", "nested.code"])],
    // Stored as overrides of the defaults; the unknown type and invalid color are ignored.
    ["elkHighlightSettings", JSON.stringify({
      enabled: false,
      types: { string: { colors: { dark: "#FF0000", light: "red" } }, number: { enabled: false }, unknown: {} }
    })]
  ]);
}

// Defaults with the overrides stored by seed().
function seededHighlightSettings(context) {
  const settings = plain(context.getDefaultHighlightSettings());
  settings.enabled = false;
  settings.types.string.colors.dark = "#ff0000";
  settings.types.number.enabled = false;
  return settings;
}

test("exports exactly the selected sections, defaulting to all seven, with UI state independent of general settings", async () => {
  const { settings, context, downloads, toasts } = createSettings(seed());
  assert.ok(settings.exportInputs.every(input => input.checked));
  const full = plain(settings.getSnapshot());
  assert.deepEqual(full, {
    theme: "light",
    showMinimap: true,
    fieldsPanelOpen: true,
    fieldsPanelWidth: 375,
    sortOrder: "desc",
    outputSettings: {
      highlightSelectedRows: true, showRawElk: false, hideEmptyMetadata: true,
      shownFields: { t: false, a: true, r: false, p: true, h: false }
    },
    highlightSettings: seededHighlightSettings(context),
    savedFilters: ['c:"Service"', "error AND NOT timeout"],
    recentDateRanges: [{ start: "2026-11-12T10:00:00.123Z", end: "2026-11-12T11:00:00.456Z" }],
    pinnedFields: ["c", "nested.code"]
  });
  const keys = [
    ["fieldsPanelOpen", "fieldsPanelWidth", "sortOrder"], ["theme", "showMinimap"], ["outputSettings"],
    ["highlightSettings"], ["savedFilters"], ["recentDateRanges"], ["pinnedFields"]
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

test("saves element settings sparsely and publishes plain colors when an element or the master switch is off", () => {
  const { settings, context, storage } = createSettings(seed());
  settings.importSettings(JSON.stringify({ highlightSettings: { enabled: true, elements: { ts: { colors: { dark: "#F00" } }, cls: { enabled: false } } } }));
  const saved = JSON.parse(storage.get("elkHighlightSettings"));
  assert.deepEqual(saved.elements, { ts: { colors: { dark: "#ff0000" } }, cls: { enabled: false } });
  const style = context.document.documentElement.style;
  assert.equal(style["--hl-ts-dark"], "#ff0000");
  assert.equal(style["--hl-cls-dark"], "#e9ecef");
  settings.open();
  settings.highlightControls.ts.toggle.checked = false;
  settings.highlightControls.ts.toggle.dispatch("change");
  assert.equal(settings.popup.style["--hl-ts-dark"], "#e9ecef");
  assert.equal(settings.highlightDraft.elements.ts.enabled, false);
});

test("merges partial highlighting imports over the saved settings and applies them to the output rules", () => {
  const { settings, context, storage } = createSettings(seed());
  const before = plain(settings.getSnapshot());
  settings.importSettings(JSON.stringify({ highlightSettings: { enabled: true, types: { url: { colors: { light: "ABC" } } } } }));
  const expected = seededHighlightSettings(context);
  expected.enabled = true;
  expected.types.url.colors.light = "#aabbcc";
  assert.deepEqual(plain(settings.getSnapshot()), { ...before, highlightSettings: expected });
  assert.deepEqual(JSON.parse(storage.get("elkHighlightSettings")), {
    types: { string: { colors: { dark: "#ff0000" } }, url: { colors: { light: "#aabbcc" } }, number: { enabled: false } }
  });
  const rules = vm.runInContext("SYNTAX_HIGHLIGHTS", context);
  assert.deepEqual(
    Object.fromEntries(Object.entries(rules).map(([type, rule]) => [type, rule.enabled])),
    { string: true, url: true, identifier: true, key: true, literal: true, number: false, stack: true }
  );
  assert.equal(rules.url.colors.light, "#aabbcc");
  assert.equal(context.document.documentElement.style["--hl-url-light"], "#aabbcc");
});

test("edits highlighting as a dialog-scoped draft: Cancel discards it, Save stores only overrides, Reset restores defaults", () => {
  const { settings, context, storage } = createSettings();
  const rules = vm.runInContext("SYNTAX_HIGHLIGHTS", context);
  const root = context.document.documentElement;
  const { string, number } = settings.highlightControls;
  const edit = () => {
    string.colors.dark.hex.value = " #ABC";
    string.colors.dark.hex.dispatch("input");
    assert.equal(string.colors.dark.picker.value, "#aabbcc");
    assert.equal(string.colors.dark.hex.value, " #ABC");
    string.colors.dark.hex.dispatch("change");
    assert.equal(string.colors.dark.hex.value, "#aabbcc");
    string.colors.light.hex.value = "#12345";
    string.colors.light.hex.dispatch("input");
    assert.equal(string.colors.light.hex.attributes["aria-invalid"], "true");
    string.colors.light.hex.dispatch("change");
    assert.equal(string.colors.light.hex.value, "#766a00");
    assert.equal(string.colors.light.hex.attributes["aria-invalid"], "false");
    number.colors.light.picker.value = "#00ff00";
    number.colors.light.picker.dispatch("input");
    assert.equal(number.colors.light.hex.value, "#00ff00");
    number.toggle.checked = false;
    number.toggle.dispatch("change");
    assert.equal(number.sample.innerHTML, "42 1.5s 2.0.2.0");
    assert.equal(settings.previewMessage.innerHTML,
      `<span class="log-key">ok</span>=<span class="log-literal">true</span> <span class="log-key">n</span>=1`);
    assert.equal(number.colors.dark.picker.disabled, true);
    assert.equal(string.toggle.disabled, false);
  };

  assert.equal(string.sample.innerHTML, `<span class="log-string">"double"</span> <span class="log-string">'single'</span>`);
  edit();
  assert.equal(settings.popup.style["--hl-string-dark"], "#aabbcc");
  assert.equal(root.style["--hl-string-dark"], "#e6da6a");
  assert.equal(rules.number.enabled, true);
  settings.cancel();
  settings.popupManager.toggle("settings");
  assert.equal(string.colors.dark.hex.value, "#e6da6a");
  assert.equal(number.toggle.checked, true);

  edit();
  settings.highlightEnabledInput.checked = false;
  settings.highlightEnabledInput.dispatch("change");
  assert.equal(string.toggle.disabled, true);
  assert.equal(string.sample.innerHTML, `"double" 'single'`);
  assert.equal(settings.previewMessage.innerHTML, "ok=true n=1");
  settings.save();
  assert.deepEqual(JSON.parse(storage.get("elkHighlightSettings")), {
    enabled: false,
    types: { string: { colors: { dark: "#aabbcc" } }, number: { enabled: false, colors: { light: "#00ff00" } } }
  });
  assert.equal(root.style["--hl-string-dark"], "#aabbcc");
  assert.ok(Object.values(rules).every(rule => !rule.enabled));

  settings.popupManager.toggle("settings");
  settings.highlightResetButton.dispatch("click");
  assert.equal(string.colors.dark.hex.value, "#e6da6a");
  settings.save();
  assert.equal(storage.has("elkHighlightSettings"), false);
  assert.equal(root.style["--hl-string-dark"], "#e6da6a");
  assert.ok(Object.values(rules).every(rule => rule.enabled));
});

test("Apply saves without closing, and Cancel discards only subsequent edits", () => {
  const { settings, preferences, storage, context } = createSettings();
  settings.toggleTheme();
  const appliedTheme = preferences.getTheme();
  settings.setHighlightColor("string", "dark", "#123456");
  settings.showRawElkInput.checked = false;
  settings.applyButton.dispatch("click");
  assert.equal(settings.popup.hidden, false);
  assert.equal(context.document.documentElement.style["--hl-string-dark"], "#123456");
  assert.equal(preferences.getShowRawElk(), false);
  assert.equal(storage.get("elkTheme"), appliedTheme);

  settings.toggleTheme();
  settings.setHighlightColor("string", "dark", "#abcdef");
  settings.showRawElkInput.checked = true;
  settings.cancel();
  assert.equal(settings.popup.hidden, true);
  assert.equal(preferences.getTheme(), appliedTheme);
  assert.equal(preferences.getShowRawElk(), false);
  assert.equal(context.document.documentElement.style["--hl-string-dark"], "#123456");
  settings.popupManager.toggle("settings");
  assert.equal(settings.highlightDraft.types.string.colors.dark, "#123456");
  assert.equal(settings.showRawElkInput.checked, false);
  settings.saveButton.dispatch("click");
  assert.equal(settings.popup.hidden, true);
});

test("custom rules: add, reorder and delete in the draft, Reset keeps them, invalid patterns block Save, empty rows are dropped", () => {
  const { settings, preferences, storage, toasts, context } = createSettings();
  settings.addCustomRule();
  settings.addCustomRule();
  settings.addCustomRule();
  const rule = index => settings.highlightDraft.custom[index];
  assert.equal(rule(0).colors.dark, "#ff922b");
  assert.equal(rule(0).caseSensitive, false);
  ["abc", "[", ""].forEach((pattern, index) => {
    settings.customRows[index].input.value = pattern;
    settings.customRows[index].input.dispatch("input");
  });
  assert.equal(settings.customRows[1].input.attributes["aria-invalid"], "true");
  assert.equal(settings.customRows[0].input.attributes["aria-invalid"], "false");

  settings.moveCustomRule(0, 1);
  assert.deepEqual([...settings.highlightDraft.custom.map(item => item.pattern)], ["[", "abc", ""]);
  settings.moveCustomRule(1, 5);
  assert.equal(rule(1).pattern, "abc");

  settings.highlightResetButton.dispatch("click");
  assert.equal(settings.highlightDraft.custom.length, 3);

  settings.saveButton.dispatch("click");
  assert.equal(settings.popup.hidden, false);
  assert.equal(toasts.at(-1)[0], "Invalid custom rule");
  assert.equal(storage.has("elkHighlightSettings"), false);

  settings.customRows[0].remove.dispatch("click");
  settings.saveButton.dispatch("click");
  assert.deepEqual([...preferences.getHighlightSettings().custom.map(item => item.pattern)], ["abc"]);
  assert.deepEqual(JSON.parse(storage.get("elkHighlightSettings")).custom.map(item => item.pattern), ["abc"]);
  assert.equal(context.applyHighlighting("xABCx"), 'x<span class="log-custom" style="--hl-custom-dark:#ff922b;--hl-custom-light:#d9480f">ABC</span>x');
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
  const { settings, context, storage, toasts } = createSettings(seed());
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
  const invalidHighlights = [
    null, [], { enabled: "yes" }, { types: [] }, { colors: {} }, { types: { unknown: {} } },
    { types: { string: null } }, { types: { string: { enabled: 1 } } }, { types: { string: { pattern: "x" } } },
    { types: { string: { colors: { dark: "red" } } } }, { types: { string: { colors: { dim: "#fff" } } } },
    { elements: [] }, { elements: { unknown: {} } }, { elements: { ts: { colors: { dark: "red" } } } }
  ];
  for (const highlightSettings of invalidHighlights) {
    settings.importSettings(JSON.stringify({ highlightSettings }));
    assert.deepEqual([...storage], before);
    assert.match(toasts.at(-1)[1].description, /highlighting settings/);
  }
  settings.importSettings('{"highlightSettings":{"types":{"__proto__":{"enabled":true}}}}');
  assert.deepEqual([...storage], before);
  assert.match(toasts.at(-1)[1].description, /highlighting settings/);
  assert.equal(vm.runInContext("({}).enabled", context), undefined);
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
