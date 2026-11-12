class SettingsController {
  constructor({ popupManager, preferencesController, outputController, fieldsController, onOutputSettingsChange }) {
    this.popupManager = popupManager;
    this.preferencesController = preferencesController;
    this.outputController = outputController;
    this.fieldsController = fieldsController;
    this.onOutputSettingsChange = onOutputSettingsChange;
    this.popup = document.getElementById("settings-modal");
    this.trigger = document.getElementById("settings-toggle");
    this.closeButton = document.getElementById("settings-close");
    this.cancelButton = document.getElementById("settings-cancel");
    this.saveButton = document.getElementById("settings-save");
    this.exportButton = document.getElementById("settings-export");
    this.dropOverlay = document.getElementById("settings-drop-overlay");
    this.themeSwitch = document.getElementById("settings-theme-switch");
    this.themeSwitchIcon = this.themeSwitch.querySelector(".theme-switch-icon");
    this.themeSwitchLabel = this.themeSwitch.querySelector(".theme-switch-label");
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
    this.saveButton.addEventListener("click", () => this.save());
    this.exportButton.addEventListener("click", event => this.export(event));
    this.popup.addEventListener("dragenter", event => this.handleDragEnter(event));
    this.popup.addEventListener("dragleave", event => this.handleDragLeave(event));
    this.popup.addEventListener("dragover", event => this.handleDragOver(event));
    this.popup.addEventListener("drop", event => this.handleImport(event));
    this.popup.querySelector("[data-settings-cancel]").addEventListener("click", () => this.cancel());
    this.categoryButtons.forEach(button => button.addEventListener("click", () => this.selectCategory(button.dataset.settingsCategory)));
    this.themeSwitch.addEventListener("click", () => this.toggleTheme());
    this.highlightSelectedInput.addEventListener("change", () => this.renderOutputPreview());
    this.showRawElkInput.addEventListener("change", () => this.renderOutputPreview());
    this.hideEmptyMetadataInput.addEventListener("change", () => this.renderOutputPreview());
    Object.values(this.shownFieldInputs).forEach(input => input.addEventListener("change", () => this.renderOutputPreview()));
  }

  open() {
    this.originalTheme = this.preferencesController.getTheme();
    this.saved = false;
    this.highlightSelectedInput.checked = this.preferencesController.getHighlightSelectedRows();
    this.showRawElkInput.checked = this.preferencesController.getShowRawElk();
    this.hideEmptyMetadataInput.checked = this.preferencesController.getHideEmptyMetadata();
    const shownFields = this.preferencesController.getShownFields();
    Object.entries(this.shownFieldInputs).forEach(([key, input]) => {
      input.checked = shownFields[key];
    });
    this.renderOutputPreview();
    this.renderThemeSwitch();
    this.selectCategory("general");
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
    const outputSettings = this.preferencesController.getOutputSettings();
    return {
      theme: this.preferencesController.getTheme(),
      fieldsPanelOpen: this.fieldsController.isOpen(),
      outputSettings: {
        highlightSelectedRows: outputSettings.highlightSelectedRows === true,
        showRawElk: outputSettings.showRawElk !== false,
        hideEmptyMetadata: outputSettings.hideEmptyMetadata === true,
        shownFields: { ...this.preferencesController.getShownFields() }
      }
    };
  }

  export(event) {
    event.stopPropagation();
    const blob = new Blob([JSON.stringify(this.getSnapshot(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "elk-formatter-settings.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  handleDragEnter(event) {
    event.preventDefault();
    this.dragCounter++;
    this.dropOverlay.hidden = false;
  }

  handleDragLeave(event) {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    this.dragCounter = 0;
    this.dropOverlay.hidden = true;
  }

  handleDragOver(event) {
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
      showToast(TOAST_TITLE_IMPORT_FAILED, {
        description: MSG_SETTINGS_IMPORT_BAD_FORMAT,
        category: TOAST_CATEGORY_ERROR
      });
      return;
    }

    const currentOutputSettings = this.preferencesController.getOutputSettings();
    this.preferencesController.setTheme(snapshot.theme);
    if ("fieldsPanelOpen" in snapshot) this.fieldsController.setOpen(snapshot.fieldsPanelOpen);
    this.setOutputControls({ ...currentOutputSettings, ...snapshot.outputSettings });
    this.renderThemeSwitch();
    this.renderOutputPreview();
    this.save({ showToast: false });
    showToast(TOAST_TITLE_IMPORTED, { description: MSG_SETTINGS_IMPORTED });
  }

  isValidSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return false;
    if (snapshot.theme !== "dark" && snapshot.theme !== "light") return false;
    if ("fieldsPanelOpen" in snapshot && typeof snapshot.fieldsPanelOpen !== "boolean") return false;
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

  save({ showToast: shouldShowToast = true } = {}) {
    this.preferencesController.setHighlightSelectedRows(this.highlightSelectedInput.checked);
    this.preferencesController.setShowRawElk(this.showRawElkInput.checked);
    this.preferencesController.setHideEmptyMetadata(this.hideEmptyMetadataInput.checked);
    const shownFields = Object.fromEntries(
      Object.entries(this.shownFieldInputs).map(([key, input]) => [key, input.checked])
    );
    this.preferencesController.setShownFields(shownFields);
    this.outputController.setHighlightSelectedRows(this.highlightSelectedInput.checked);
    this.onOutputSettingsChange();
    this.saved = true;
    if (shouldShowToast) showToast(TOAST_TITLE_SAVED, { description: MSG_SETTINGS_SAVED });
    this.popupManager.close("settings", { blurTrigger: true });
  }
}