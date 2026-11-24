class SettingsController {
  constructor({ popupManager, preferencesController, outputController, outputMinimap, fieldsController, onOutputSettingsChange }) {
    this.popupManager = popupManager;
    this.preferencesController = preferencesController;
    this.outputController = outputController;
    this.outputMinimap = outputMinimap;
    this.fieldsController = fieldsController;
    this.onOutputSettingsChange = onOutputSettingsChange;
    this.popup = document.getElementById("settings-modal");
    this.trigger = document.getElementById("settings-toggle");
    this.closeButton = document.getElementById("settings-close");
    this.cancelButton = document.getElementById("settings-cancel");
    this.applyButton = document.getElementById("settings-apply");
    this.saveButton = document.getElementById("settings-save");
    this.exportButton = document.getElementById("settings-export");
    this.exportInputs = [...document.querySelectorAll("[data-settings-export]")];
    this.dropOverlay = document.getElementById("settings-drop-overlay");
    this.themeSwitch = document.getElementById("settings-theme-switch");
    this.themeSwitchIcon = this.themeSwitch.querySelector(".theme-switch-icon");
    this.themeSwitchLabel = this.themeSwitch.querySelector(".theme-switch-label");
    this.showMinimapInput = document.getElementById("settings-show-minimap");
    this.highlightSelectedInput = document.getElementById("settings-highlight-selected");
    this.showRawElkInput = document.getElementById("settings-show-raw-elk");
    this.hideEmptyMetadataInput = document.getElementById("settings-hide-empty-metadata");
    this.shownFieldInputs = {
      t: document.getElementById("settings-show-thread"),
      a: document.getElementById("settings-show-actor"),
      r: document.getElementById("settings-show-r"),
      p: document.getElementById("settings-show-p"),
      h: document.getElementById("settings-show-host")
    };
    this.previewRow = document.getElementById("settings-output-preview-row");
    this.previewEntry = document.getElementById("settings-preview-entry");
    this.previewMessage = document.getElementById("settings-preview-message");
    this.previewMessageText = this.previewMessage.textContent;
    this.highlightEnabledInput = document.getElementById("settings-highlight-enabled");
    this.highlightResetButton = document.getElementById("settings-highlight-reset");
    this.highlightDraft = this.preferencesController.getHighlightSettings();
    this.highlightControls = {
      ...this.createHighlightControls(document.getElementById("settings-highlight-rules"), "types", ["Token", "Sample", "Dark theme", "Light theme"]),
      ...this.createHighlightControls(document.getElementById("settings-highlight-elements"), "elements", ["Element", "Sample", "Dark theme", "Light theme"])
    };
    this.customList = document.getElementById("settings-highlight-custom");
    this.customEmpty = document.getElementById("settings-highlight-custom-empty");
    this.customAddButton = document.getElementById("settings-highlight-custom-add");
    this.customRows = [];
    this.draggedRuleIndex = null;
    this.highlightTabs = [...document.querySelectorAll("[data-settings-subtab]")];
    this.highlightTabPanels = [...document.querySelectorAll("[data-settings-subpanel]")];
    this.categoryButtons = [...document.querySelectorAll("[data-settings-category]")];
    this.panels = [...document.querySelectorAll("[data-settings-panel]")];
    this.activeCategory = "general";
    this.dragCounter = 0;
    this.originalTheme = this.preferencesController.getTheme();
    this.saved = false;

    this.popupManager.register({
      name: "settings",
      popup: this.popup,
      trigger: this.trigger,
      onOpen: () => this.open(),
      onClose: () => this.close()
    });

    this.trigger.addEventListener("click", () => this.popupManager.toggle("settings"));
    this.closeButton.addEventListener("click", () => this.cancel());
    this.cancelButton.addEventListener("click", () => this.cancel());
    this.applyButton.addEventListener("click", () => this.save({ closeDialog: false }));
    this.saveButton.addEventListener("click", () => this.save());
    this.exportButton.addEventListener("click", event => this.export(event));
    this.popup.addEventListener("dragenter", event => this.handleDragEnter(event));
    this.popup.addEventListener("dragleave", event => this.handleDragLeave(event));
    this.popup.addEventListener("dragover", event => this.handleDragOver(event));
    this.popup.addEventListener("drop", event => this.handleImport(event));
    this.popup.querySelector("[data-settings-cancel]").addEventListener("click", () => this.cancel());
    this.categoryButtons.forEach(button => button.addEventListener("click", () => this.selectCategory(button.dataset.settingsCategory)));
    this.themeSwitch.addEventListener("click", () => this.toggleTheme());
    this.highlightTabs.forEach(tab => tab.addEventListener("click", () => this.selectHighlightTab(tab.dataset.settingsSubtab)));
    this.highlightSelectedInput.addEventListener("change", () => this.renderOutputPreview());
    this.showRawElkInput.addEventListener("change", () => this.renderOutputPreview());
    this.hideEmptyMetadataInput.addEventListener("change", () => this.renderOutputPreview());
    Object.values(this.shownFieldInputs).forEach(input => input.addEventListener("change", () => this.renderOutputPreview()));
    this.highlightEnabledInput.addEventListener("change", () => {
      this.highlightDraft.enabled = this.highlightEnabledInput.checked;
      this.renderHighlightSettings();
    });
    this.customAddButton.addEventListener("click", () => this.addCustomRule());
    this.highlightResetButton.addEventListener("click", () => {
      // Custom rules are the user's own, so they survive a reset of the built-in colors and toggles.
      const { custom } = this.highlightDraft;
      this.highlightDraft = { ...getDefaultHighlightSettings(), custom };
      this.renderHighlightSettings();
    });
  }

  open() {
    this.originalTheme = this.preferencesController.getTheme();
    this.saved = false;
    const exportSettings = getExportSettings();
    this.exportInputs.forEach(input => {
      input.checked = exportSettings[input.dataset.settingsExport] !== false;
    });
    this.showMinimapInput.checked = this.preferencesController.getShowMinimap();
    this.highlightSelectedInput.checked = this.preferencesController.getHighlightSelectedRows();
    this.showRawElkInput.checked = this.preferencesController.getShowRawElk();
    this.hideEmptyMetadataInput.checked = this.preferencesController.getHideEmptyMetadata();
    const shownFields = this.preferencesController.getShownFields();
    Object.entries(this.shownFieldInputs).forEach(([key, input]) => {
      input.checked = shownFields[key];
    });
    this.highlightDraft = this.preferencesController.getHighlightSettings();
    this.renderCustomRules();
    this.renderHighlightSettings();
    this.renderOutputPreview();
    this.renderThemeSwitch();
    this.selectCategory("general");
    this.selectHighlightTab("elements");
    requestAnimationFrame(() => this.closeButton.focus());
  }

  close() {
    if (!this.saved) this.preferencesController.setTheme(this.originalTheme);
  }

  toggleTheme() {
    const nextTheme = this.preferencesController.getTheme() === "dark" ? "light" : "dark";
    this.preferencesController.setTheme(nextTheme);
    this.renderThemeSwitch();
  }

  renderThemeSwitch() {
    const switchToLight = this.preferencesController.getTheme() === "dark";
    this.themeSwitchIcon.style.setProperty(
      "--theme-switch-icon",
      `var(--icon-theme-${switchToLight ? "light" : "dark"})`
    );
    this.themeSwitchLabel.textContent = `Switch to ${switchToLight ? "light" : "dark"} mode`;
  }

  renderOutputPreview() {
    this.previewEntry.classList.toggle("is-selected", this.highlightSelectedInput.checked);
    this.previewEntry.classList.toggle("is-raw-elk-hidden", !this.showRawElkInput.checked);
    this.previewEntry.classList.toggle("is-empty-metadata-hidden", this.hideEmptyMetadataInput.checked);
    Object.entries(this.shownFieldInputs).forEach(([key, input]) => {
      this.previewEntry.classList.toggle(`is-${key}-hidden`, !input.checked);
    });
  }

  // One row per rule of a settings group: toggle, sample, and a color picker with a hex field per theme.
  createHighlightControls(container, group, headings) {
    const create = (tag, props) => Object.assign(document.createElement(tag), props);
    container.append(...headings.map(textContent => create("span", { className: "settings-highlight-head", textContent })));
    return Object.fromEntries(Object.entries(HIGHLIGHT_GROUPS[group]).map(([id, { label: name }]) => {
      const toggle = create("input", { type: "checkbox" });
      toggle.addEventListener("change", () => {
        this.highlightDraft[group][id].enabled = toggle.checked;
        this.renderHighlightSettings();
      });
      const label = create("label", { className: "settings-checkbox" });
      label.append(toggle, create("span", { textContent: name }));
      const sample = create("span", { className: "settings-highlight-sample" });
      const colors = {};
      const cells = ["dark", "light"].map(theme => {
        const picker = create("input", { type: "color" });
        const hex = create("input", { type: "text", className: "settings-color-hex", spellcheck: false });
        picker.setAttribute("aria-label", `${name} color, ${theme} theme`);
        hex.setAttribute("aria-label", `${name} hex color, ${theme} theme`);
        picker.addEventListener("input", () => this.setHighlightColor(id, theme, picker.value));
        hex.addEventListener("input", () => {
          const color = normalizeHighlightColor(hex.value);
          hex.setAttribute("aria-invalid", String(!color));
          if (color) this.setHighlightColor(id, theme, color, hex);
        });
        // Committing the field normalizes it or restores the last valid color.
        hex.addEventListener("change", () => this.renderHighlightSettings());
        colors[theme] = { picker, hex };
        const cell = create("span", { className: "settings-color" });
        cell.append(picker, hex);
        return cell;
      });
      container.append(label, sample, ...cells);
      return [id, { group, toggle, sample, colors }];
    }));
  }

  setHighlightColor(id, theme, color, editing = null) {
    this.highlightDraft[this.highlightControls[id].group][id].colors[theme] = color;
    this.renderHighlightSettings(editing);
  }

  addCustomRule() {
    const { custom } = this.highlightDraft;
    if (custom.length >= MAX_CUSTOM_HIGHLIGHTS) return;
    custom.push({ enabled: true, pattern: "", caseSensitive: false, continue: false, colors: { ...DEFAULT_CUSTOM_COLORS } });
    this.renderCustomRules();
    this.renderHighlightSettings();
    this.customRows.at(-1).input.focus();
  }

  moveCustomRule(from, to, focusHandle = false) {
    const { custom } = this.highlightDraft;
    if (to < 0 || to >= custom.length || to === from) return;
    custom.splice(to, 0, ...custom.splice(from, 1));
    this.renderCustomRules();
    this.renderHighlightSettings();
    if (focusHandle) this.customRows[to].handle.focus();
  }

  // Rebuilds the rows from the draft; only needed when rules are added, removed, moved or replaced.
  renderCustomRules() {
    const { custom } = this.highlightDraft;
    this.customRows = custom.map((rule, index) => this.createCustomRow(rule, index));
    this.customList.replaceChildren(...this.customRows.map(({ row }) => row));
    this.customEmpty.hidden = custom.length > 0;
    this.customAddButton.disabled = custom.length >= MAX_CUSTOM_HIGHLIGHTS;
  }

  createCustomRow(rule, index) {
    const create = (tag, props) => Object.assign(document.createElement(tag), props);
    const row = create("div", { className: "settings-custom-row" });
    const handle = create("button", { type: "button", className: "settings-custom-handle", textContent: "⋮⋮", draggable: true });
    handle.title = "Drag to reorder (or press ↑/↓)";
    handle.setAttribute("aria-label", `Reorder rule ${index + 1}`);
    handle.addEventListener("dragstart", event => {
      this.draggedRuleIndex = index;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", rule.pattern);
      event.dataTransfer.setDragImage?.(row, 0, 0);
      row.classList.add("dragging");
    });
    handle.addEventListener("dragend", () => this.clearRuleDrag());
    handle.addEventListener("keydown", event => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      this.moveCustomRule(index, index + (event.key === "ArrowUp" ? -1 : 1), true);
    });
    row.addEventListener("dragover", event => {
      if (this.draggedRuleIndex === null) return;
      event.preventDefault();
      event.stopPropagation();
      const after = event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
      this.clearRuleDropMarks();
      row.classList.add(after ? "drop-after" : "drop-before");
    });
    row.addEventListener("drop", event => {
      if (this.draggedRuleIndex === null) return;
      event.preventDefault();
      event.stopPropagation();
      const destination = index + (row.classList.contains("drop-after") ? 1 : 0);
      const from = this.draggedRuleIndex;
      this.clearRuleDrag();
      this.moveCustomRule(from, from < destination ? destination - 1 : destination);
    });

    const toggle = create("input", { type: "checkbox", checked: rule.enabled });
    toggle.setAttribute("aria-label", `Enable rule ${index + 1}`);
    toggle.addEventListener("change", () => {
      rule.enabled = toggle.checked;
      this.renderHighlightSettings();
    });
    const input = create("input", { type: "text", className: "settings-custom-pattern", value: rule.pattern, spellcheck: false, placeholder: "Regular expression" });
    input.setAttribute("aria-label", `Regular expression of rule ${index + 1}`);
    input.addEventListener("input", () => {
      rule.pattern = input.value;
      this.renderHighlightSettings();
    });
    const caseInput = create("input", { type: "checkbox", checked: rule.caseSensitive });
    caseInput.title = "Case sensitive";
    caseInput.setAttribute("aria-label", `Case sensitive, rule ${index + 1}`);
    caseInput.addEventListener("change", () => {
      rule.caseSensitive = caseInput.checked;
      this.renderHighlightSettings();
    });
    const continueInput = create("input", { type: "checkbox", checked: rule.continue === true });
    continueInput.title = "Continue: apply the rules below inside the match";
    continueInput.setAttribute("aria-label", `Continue with next rules, rule ${index + 1}`);
    continueInput.addEventListener("change", () => {
      rule.continue = continueInput.checked;
      this.renderHighlightSettings();
    });
    const pickers = {};
    const hexes = {};
    const colors = ["dark", "light"].map(theme => {
      const label = `Rule ${index + 1} color, ${theme} theme`;
      const picker = create("input", { type: "color", value: rule.colors[theme] });
      const hex = create("input", { type: "text", className: "settings-color-hex", spellcheck: false, value: rule.colors[theme] });
      picker.setAttribute("aria-label", label);
      hex.setAttribute("aria-label", `${label}, hex`);
      picker.addEventListener("input", () => {
        rule.colors[theme] = picker.value;
        hex.value = picker.value;
        hex.setAttribute("aria-invalid", "false");
        this.renderHighlightSettings();
      });
      hex.addEventListener("input", () => {
        const color = normalizeHighlightColor(hex.value);
        hex.setAttribute("aria-invalid", String(!color));
        if (!color) return;
        rule.colors[theme] = color;
        picker.value = color;
        this.renderHighlightSettings();
      });
      // Committing the field normalizes it or restores the last valid color.
      hex.addEventListener("change", () => {
        hex.value = rule.colors[theme];
        hex.setAttribute("aria-invalid", "false");
      });
      pickers[theme] = picker;
      hexes[theme] = hex;
      const cell = create("span", { className: "settings-color" });
      cell.append(picker, hex);
      return cell;
    });
    const remove = create("button", { type: "button", className: "settings-custom-remove", textContent: "✕" });
    remove.title = "Delete rule";
    remove.setAttribute("aria-label", `Delete rule ${index + 1}`);
    remove.addEventListener("click", () => {
      this.highlightDraft.custom.splice(index, 1);
      this.renderCustomRules();
      this.renderHighlightSettings();
    });
    row.append(handle, toggle, input, caseInput, continueInput, ...colors, remove);
    return { row, handle, rule, toggle, input, caseInput, continueInput, pickers, hexes, remove };
  }

  clearRuleDropMarks() {
    this.customRows.forEach(({ row }) => row.classList.remove("drop-before", "drop-after"));
  }

  clearRuleDrag() {
    this.clearRuleDropMarks();
    this.customRows.forEach(({ row }) => row.classList.remove("dragging"));
    this.draggedRuleIndex = null;
  }

  selectHighlightTab(name) {
    this.highlightTabs.forEach(tab => {
      const selected = tab.dataset.settingsSubtab === name;
      tab.setAttribute("aria-selected", String(selected));
    });
    this.highlightTabPanels.forEach(panel => {
      panel.hidden = panel.dataset.settingsSubpanel !== name;
    });
  }

  // `editing` is a hex field being typed in; its text is left as is.
  renderHighlightSettings(editing = null) {
    const draft = this.highlightDraft;
    const { enabled, types } = draft;
    this.highlightEnabledInput.checked = enabled;
    for (const { rule, toggle, input, caseInput, continueInput, pickers, hexes } of this.customRows) {
      const active = enabled && rule.enabled;
      toggle.disabled = !enabled;
      caseInput.disabled = !active;
      continueInput.disabled = !active;
      [...Object.values(pickers), ...Object.values(hexes)].forEach(control => { control.disabled = !active; });
      input.setAttribute("aria-invalid", String(rule.pattern !== "" && !compileCustomHighlight(rule.pattern, rule.caseSensitive)));
    }
    for (const [id, { group, toggle, sample, colors }] of Object.entries(this.highlightControls)) {
      const state = draft[group][id];
      const active = enabled && state.enabled;
      toggle.checked = state.enabled;
      toggle.disabled = !enabled;
      const rule = HIGHLIGHT_GROUPS[group][id];
      sample.innerHTML = rule.pattern
        ? applyHighlighting(rule.sample, "", active ? [id] : [], [])
        : `<span class="${rule.className}">${esc(rule.sample)}</span>`;
      for (const [theme, { picker, hex }] of Object.entries(colors)) {
        picker.value = state.colors[theme];
        picker.disabled = !active;
        hex.disabled = !active;
        if (hex === editing) continue;
        hex.value = state.colors[theme];
        hex.setAttribute("aria-invalid", "false");
      }
    }
    const activeTypes = enabled ? Object.keys(types).filter(type => types[type].enabled) : [];
    const activeCustom = enabled
      ? draft.custom.filter(rule => rule.enabled && compileCustomHighlight(rule.pattern, rule.caseSensitive))
      : [];
    this.previewMessage.innerHTML = applyHighlighting(this.previewMessageText, "", activeTypes, activeCustom);
    // Unsaved colors are scoped to the dialog; the output keeps the saved ones until Save.
    const elements = Object.fromEntries(Object.entries(draft.elements).map(([id, element]) =>
      [id, { ...element, enabled: enabled && element.enabled }]));
    const tokenTypes = Object.fromEntries(Object.entries(types).map(([id, type]) =>
      [id, { ...type, enabled: enabled && type.enabled }]));
    applyHighlightColors(this.popup, tokenTypes, elements);
  }

  selectCategory(category) {
    this.activeCategory = category;
    this.categoryButtons.forEach(button => {
      const selected = button.dataset.settingsCategory === category;
      button.classList.toggle("is-active", selected);
      button.toggleAttribute("aria-current", selected);
    });
    this.panels.forEach(panel => {
      panel.hidden = panel.dataset.settingsPanel !== category;
    });
  }

  cancel() {
    this.popupManager.close("settings", { blurTrigger: true });
  }

  getSnapshot() {
    const included = Object.fromEntries(
      this.exportInputs.map(input => [input.dataset.settingsExport, input.checked])
    );
    const snapshot = {};
    if (included.uiState) {
      snapshot.fieldsPanelOpen = this.fieldsController.isOpen();
      snapshot.fieldsPanelWidth = this.fieldsController.getWidth();
      snapshot.sortOrder = this.preferencesController.getSortOrder();
    }
    if (included.general) {
      snapshot.theme = this.preferencesController.getTheme();
      snapshot.showMinimap = this.preferencesController.getShowMinimap();
    }
    if (included.output) {
      const outputSettings = this.preferencesController.getOutputSettings();
      snapshot.outputSettings = {
        highlightSelectedRows: outputSettings.highlightSelectedRows === true,
        showRawElk: outputSettings.showRawElk !== false,
        hideEmptyMetadata: outputSettings.hideEmptyMetadata === true,
        shownFields: { ...this.preferencesController.getShownFields() }
      };
    }
    if (included.highlighting) snapshot.highlightSettings = this.preferencesController.getHighlightSettings();
    if (included.savedFilters) snapshot.savedFilters = getSavedFilters();
    if (included.recentDateRanges) snapshot.recentDateRanges = getRecentDateRanges();
    if (included.pinnedFields) snapshot.pinnedFields = getPinnedFields();
    return snapshot;
  }

  export(event) {
    event.stopPropagation();
    const snapshot = this.getSnapshot();
    if (!Object.keys(snapshot).length) {
      showToast(TOAST_TITLE_NOTHING_EXPORT, { description: MSG_NOTHING_EXPORT, category: TOAST_CATEGORY_WARNING });
      return;
    }
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "elk-formatter-settings.json";
    link.click();
    URL.revokeObjectURL(url);
    this.cancel();
  }

  handleDragEnter(event) {
    if (this.draggedRuleIndex !== null) return;
    event.preventDefault();
    this.dragCounter++;
    this.dropOverlay.hidden = false;
  }

  handleDragLeave(event) {
    if (this.draggedRuleIndex !== null) return;
    if (event.currentTarget.contains(event.relatedTarget)) return;
    this.dragCounter = 0;
    this.dropOverlay.hidden = true;
  }

  handleDragOver(event) {
    if (this.draggedRuleIndex !== null) return;
    event.preventDefault();
  }

  handleImport(event) {
    event.preventDefault();
    this.dragCounter = 0;
    this.dropOverlay.hidden = true;
    const file = event.dataTransfer?.files?.[0];
    if (!file || !file.name.endsWith(".json")) {
      showToast(TOAST_TITLE_WRONG_FILE, { description: MSG_DROP_NOT_JSON, category: TOAST_CATEGORY_WARNING });
      return;
    }
    const reader = new FileReader();
    reader.onload = event => this.importSettings(event.target.result);
    reader.onerror = () => showToast(TOAST_TITLE_IMPORT_FAILED, {
      description: MSG_IMPORT_READ_FAILED,
      category: TOAST_CATEGORY_ERROR
    });
    reader.readAsText(file);
  }

  importSettings(content) {
    let snapshot;
    try {
      snapshot = JSON.parse(content);
    } catch {
      showToast(TOAST_TITLE_IMPORT_FAILED, { description: MSG_IMPORT_INVALID_JSON, category: TOAST_CATEGORY_ERROR });
      return;
    }
    if (!this.isValidSnapshot(snapshot)) {
      const badHighlight = snapshot?.highlightSettings !== undefined
        && !isValidHighlightSettings(snapshot.highlightSettings);
      showToast(TOAST_TITLE_IMPORT_FAILED, {
        description: badHighlight ? MSG_SETTINGS_IMPORT_BAD_HIGHLIGHT : MSG_SETTINGS_IMPORT_BAD_FORMAT,
        category: TOAST_CATEGORY_ERROR
      });
      return;
    }

    const currentOutputSettings = this.preferencesController.getOutputSettings();
    if ("theme" in snapshot) this.preferencesController.setTheme(snapshot.theme);
    if ("showMinimap" in snapshot) this.showMinimapInput.checked = snapshot.showMinimap;
    if ("fieldsPanelOpen" in snapshot) this.fieldsController.setOpen(snapshot.fieldsPanelOpen);
    if ("fieldsPanelWidth" in snapshot) this.fieldsController.setWidth(snapshot.fieldsPanelWidth);
    if ("sortOrder" in snapshot) this.preferencesController.setSortOrder(snapshot.sortOrder);
    if ("savedFilters" in snapshot) setSavedFilters(snapshot.savedFilters);
    if ("recentDateRanges" in snapshot) {
      setRecentDateRanges(snapshot.recentDateRanges.slice(0, MAX_RECENT_DATE_RANGES).map(range => ({
        start: new Date(range.start).toISOString(),
        end: new Date(range.end).toISOString()
      })));
    }
    if ("pinnedFields" in snapshot) this.fieldsController.setPinnedFields(snapshot.pinnedFields);
    this.setOutputControls({ ...currentOutputSettings, ...snapshot.outputSettings });
    this.highlightDraft = mergeHighlightSettings(
      this.preferencesController.getHighlightSettings(),
      snapshot.highlightSettings
    );
    this.renderCustomRules();
    this.renderHighlightSettings();
    this.renderThemeSwitch();
    this.renderOutputPreview();
    this.save({ showToast: false });
    showToast(TOAST_TITLE_IMPORTED, { description: MSG_SETTINGS_IMPORTED });
  }

  isValidSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return false;
    if (![
      "theme", "showMinimap", "fieldsPanelOpen", "fieldsPanelWidth", "sortOrder",
      "outputSettings", "highlightSettings", "savedFilters", "recentDateRanges", "pinnedFields"
    ].some(key => key in snapshot)) return false;
    if ("theme" in snapshot && snapshot.theme !== "dark" && snapshot.theme !== "light") return false;
    if ("showMinimap" in snapshot && typeof snapshot.showMinimap !== "boolean") return false;
    if ("highlightSettings" in snapshot && !isValidHighlightSettings(snapshot.highlightSettings)) return false;
    if ("sortOrder" in snapshot && snapshot.sortOrder !== "asc" && snapshot.sortOrder !== "desc") return false;
    if ("fieldsPanelOpen" in snapshot && typeof snapshot.fieldsPanelOpen !== "boolean") return false;
    if ("fieldsPanelWidth" in snapshot
      && !(Number.isFinite(snapshot.fieldsPanelWidth) && snapshot.fieldsPanelWidth > 0)) return false;
    for (const key of ["savedFilters", "pinnedFields"]) {
      if (key in snapshot && (!Array.isArray(snapshot[key])
        || !snapshot[key].every(value => typeof value === "string" && (key !== "pinnedFields" || value.length > 0)))) return false;
    }
    if ("recentDateRanges" in snapshot) {
      if (!Array.isArray(snapshot.recentDateRanges) || !snapshot.recentDateRanges.every(range => {
        if (typeof range?.start !== "string" || typeof range?.end !== "string") return false;
        const start = new Date(range.start);
        const end = new Date(range.end);
        return Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) && start <= end;
      })) return false;
    }
    if (!("outputSettings" in snapshot)) return true;
    const outputSettings = snapshot.outputSettings;
    if (!outputSettings || typeof outputSettings !== "object" || Array.isArray(outputSettings)) return false;
    for (const key of ["highlightSelectedRows", "showRawElk", "hideEmptyMetadata"]) {
      if (key in outputSettings && typeof outputSettings[key] !== "boolean") return false;
    }
    if ("shownFields" in outputSettings) {
      const shownFields = outputSettings.shownFields;
      if (!shownFields || typeof shownFields !== "object" || Array.isArray(shownFields)) return false;
      if (Object.values(shownFields).some(value => typeof value !== "boolean")) return false;
      if (Object.keys(shownFields).some(key => !["t", "a", "r", "p", "h"].includes(key))) return false;
    }
    return true;
  }

  setOutputControls(settings) {
    this.highlightSelectedInput.checked = settings.highlightSelectedRows === true;
    this.showRawElkInput.checked = settings.showRawElk !== false;
    this.hideEmptyMetadataInput.checked = settings.hideEmptyMetadata === true;
    const shownFields = this.preferencesController.getShownFields();
    Object.entries(this.shownFieldInputs).forEach(([key, input]) => {
      input.checked = settings.shownFields?.[key] ?? shownFields[key];
    });
  }

  save({ showToast: shouldShowToast = true, closeDialog = true } = {}) {
    const { custom } = this.highlightDraft;
    const filled = custom.filter(rule => rule.pattern !== "");
    if (filled.length !== custom.length) {
      this.highlightDraft.custom = filled;
      this.renderCustomRules();
      this.renderHighlightSettings();
    }
    const invalid = this.customRows.find(({ rule }) => !compileCustomHighlight(rule.pattern, rule.caseSensitive));
    if (invalid) {
      this.selectCategory("highlighting");
      this.selectHighlightTab("custom");
      invalid.input.focus();
      showToast(TOAST_TITLE_INVALID_RULE, { description: MSG_INVALID_CUSTOM_RULE, category: TOAST_CATEGORY_ERROR });
      return;
    }
    setExportSettings(Object.fromEntries(
      this.exportInputs.map(input => [input.dataset.settingsExport, input.checked])
    ));
    this.preferencesController.setShowMinimap(this.showMinimapInput.checked);
    this.outputMinimap.setEnabled(this.showMinimapInput.checked);
    this.preferencesController.setHighlightSelectedRows(this.highlightSelectedInput.checked);
    this.preferencesController.setShowRawElk(this.showRawElkInput.checked);
    this.preferencesController.setHideEmptyMetadata(this.hideEmptyMetadataInput.checked);
    const shownFields = Object.fromEntries(
      Object.entries(this.shownFieldInputs).map(([key, input]) => [key, input.checked])
    );
    this.preferencesController.setShownFields(shownFields);
    this.preferencesController.setHighlightSettings(this.highlightDraft);
    this.outputController.setHighlightSelectedRows(this.highlightSelectedInput.checked);
    this.onOutputSettingsChange();
    this.originalTheme = this.preferencesController.getTheme();
    this.saved = closeDialog;
    if (shouldShowToast) showToast(TOAST_TITLE_SAVED, { description: MSG_SETTINGS_SAVED });
    if (closeDialog) this.popupManager.close("settings", { blurTrigger: true });
  }
}