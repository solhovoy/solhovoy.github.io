class SettingsController {
  constructor({ popupManager, preferencesController, outputController, onOutputSettingsChange }) {
    this.popupManager = popupManager;
    this.preferencesController = preferencesController;
    this.outputController = outputController;
    this.onOutputSettingsChange = onOutputSettingsChange;
    this.popup = document.getElementById("settings-modal");
    this.trigger = document.getElementById("settings-toggle");
    this.closeButton = document.getElementById("settings-close");
    this.cancelButton = document.getElementById("settings-cancel");
    this.saveButton = document.getElementById("settings-save");
    this.themeSwitch = document.getElementById("settings-theme-switch");
    this.themeSwitchIcon = this.themeSwitch.querySelector(".theme-switch-icon");
    this.themeSwitchLabel = this.themeSwitch.querySelector(".theme-switch-label");
    this.highlightSelectedInput = document.getElementById("settings-highlight-selected");
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
    this.popup.querySelector("[data-settings-cancel]").addEventListener("click", () => this.cancel());
    this.categoryButtons.forEach(button => button.addEventListener("click", () => this.selectCategory(button.dataset.settingsCategory)));
    this.themeSwitch.addEventListener("click", () => this.toggleTheme());
    this.highlightSelectedInput.addEventListener("change", () => this.renderOutputPreview());
    this.hideEmptyMetadataInput.addEventListener("change", () => this.renderOutputPreview());
    Object.values(this.shownFieldInputs).forEach(input => input.addEventListener("change", () => this.renderOutputPreview()));
  }

  open() {
    this.originalTheme = this.preferencesController.getTheme();
    this.saved = false;
    this.highlightSelectedInput.checked = this.preferencesController.getHighlightSelectedRows();
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

  save() {
    this.preferencesController.setHighlightSelectedRows(this.highlightSelectedInput.checked);
    this.preferencesController.setHideEmptyMetadata(this.hideEmptyMetadataInput.checked);
    const shownFields = Object.fromEntries(
      Object.entries(this.shownFieldInputs).map(([key, input]) => [key, input.checked])
    );
    this.preferencesController.setShownFields(shownFields);
    this.outputController.setHighlightSelectedRows(this.highlightSelectedInput.checked);
    this.onOutputSettingsChange();
    this.saved = true;
    showToast(TOAST_TITLE_SAVED, { description: MSG_SETTINGS_SAVED });
    this.popupManager.close("settings", { blurTrigger: true });
  }
}