class PreferencesController {
  constructor({ onSortChange }) {
    this.onSortChange = onSortChange;
    this.sortButton = document.getElementById("sticky-sort");
    this.sortColumn = document.getElementById("bar-col-sort");
    this.sortOrder = localStorage.getItem("elkSortOrder") || "asc";
    this.theme = localStorage.getItem(LS_KEY_THEME) || "dark";
    this.outputSettings = getOutputSettings();
    if (!this.outputSettings.shownFields) this.setShownFields(this.getShownFields());
    this.highlightSelectedRows = this.outputSettings.highlightSelectedRows === true;

    this.applySortLabel();
    this.applyTheme();
    this.sortColumn.addEventListener("click", () => this.toggleSort());
    this.makeCollapsible("collapse-input", "panel-input", true);
  }

  getSortOrder() {
    return this.sortOrder;
  }

  getTheme() {
    return this.theme;
  }

  getHighlightSelectedRows() {
    return this.highlightSelectedRows;
  }

  getShownFields() {
    const shownFields = { t: true, a: true, r: true, p: true, h: true };
    if (this.outputSettings.shownFields) return { ...shownFields, ...this.outputSettings.shownFields };
    return shownFields;
  }

  getOutputSettings() {
    return {
      ...this.outputSettings,
      shownFields: this.getShownFields()
    };
  }

  applySortLabel() {
    this.sortButton.textContent = this.sortOrder === "asc" ? "⬆ Sort Old-New" : "⬇ Sort New-Old";
  }

  applyTheme() {
    if (this.theme === "light") {
      document.documentElement.classList.add("light");
      return;
    }
    document.documentElement.classList.remove("light");
  }

  toggleSort() {
    this.sortOrder = this.sortOrder === "asc" ? "desc" : "asc";
    localStorage.setItem("elkSortOrder", this.sortOrder);
    this.applySortLabel();
    this.onSortChange(this.sortOrder);
  }

  setTheme(theme) {
    if (theme !== "dark" && theme !== "light") return;
    this.theme = theme;
    localStorage.setItem(LS_KEY_THEME, this.theme);
    this.applyTheme();
  }

  setHighlightSelectedRows(enabled) {
    this.setOutputSettings({ highlightSelectedRows: Boolean(enabled) });
    this.highlightSelectedRows = this.outputSettings.highlightSelectedRows;
  }

  setShownFields(shownFields) {
    const { hideHost, hiddenFields, ...outputSettings } = this.outputSettings;
    this.outputSettings = { ...outputSettings, shownFields };
    setOutputSettings(this.outputSettings);
  }

  setOutputSettings(settings) {
    this.outputSettings = { ...this.outputSettings, ...settings };
    setOutputSettings(this.outputSettings);
  }

  makeCollapsible(buttonId, panelId, isInput) {
    const button = document.getElementById(buttonId);
    const panel = document.getElementById(panelId);
    button.addEventListener("click", () => {
      const collapsed = panel.classList.toggle("collapsed");
      button.textContent = collapsed ? (isInput ? "▼" : "▲") : (isInput ? "▲" : "▼");
      button.title = collapsed ? "Expand" : "Collapse";
    });
  }
}