class PreferencesController {
  constructor({ onSortChange, interceptSortClick = () => false }) {
    this.onSortChange = onSortChange;
    this.sortButton = document.getElementById("sticky-sort");
    this.sortColumn = document.getElementById("bar-col-sort");
    this.sortOrder = localStorage.getItem("elkSortOrder") || "asc";
    this.theme = localStorage.getItem(LS_KEY_THEME) || "dark";
    this.showMinimap = localStorage.getItem(LS_KEY_SHOW_MINIMAP) !== "false";
    this.outputSettings = getOutputSettings();
    if (!this.outputSettings.shownFields) this.setShownFields(this.getShownFields());
    this.highlightSelectedRows = this.outputSettings.highlightSelectedRows === true;
    this.highlightSettings = getHighlightSettings();

    this.applySortLabel();
    this.applyTheme();
    applyHighlightSettings(this.highlightSettings);
    this.sortColumn.addEventListener("click", () => {
      if (!interceptSortClick()) this.toggleSort();
    });
    this.makeCollapsible("collapse-input", "panel-input", true);
  }

  getSortOrder() {
    return this.sortOrder;
  }

  getTheme() {
    return this.theme;
  }

  getShowMinimap() {
    return this.showMinimap;
  }

  getHighlightSelectedRows() {
    return this.highlightSelectedRows;
  }

  getHideEmptyMetadata() {
    return this.outputSettings.hideEmptyMetadata === true;
  }

  getShowRawElk() {
    return this.outputSettings.showRawElk !== false;
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

  getHighlightSettings() {
    return cloneHighlightSettings(this.highlightSettings);
  }

  applySortLabel() {
    const icon = document.createElement("span");
    icon.className = "bar-col-sort-icon";
    icon.textContent = this.sortOrder === "asc" ? "⬆" : "⬇";
    this.sortButton.replaceChildren(this.sortOrder === "asc" ? "Sort Old-New" : "Sort New-Old", icon);
  }

  applyTheme() {
    if (this.theme === "light") {
      document.documentElement.classList.add("light");
      return;
    }
    document.documentElement.classList.remove("light");
  }

  toggleSort() {
    this.setSortOrder(this.sortOrder === "asc" ? "desc" : "asc");
    this.onSortChange(this.sortOrder);
  }

  setSortOrder(sortOrder) {
    this.sortOrder = sortOrder;
    localStorage.setItem("elkSortOrder", this.sortOrder);
    this.applySortLabel();
  }

  setTheme(theme) {
    if (theme !== "dark" && theme !== "light") return;
    this.theme = theme;
    localStorage.setItem(LS_KEY_THEME, this.theme);
    this.applyTheme();
  }

  setShowMinimap(enabled) {
    this.showMinimap = Boolean(enabled);
    localStorage.setItem(LS_KEY_SHOW_MINIMAP, String(this.showMinimap));
  }

  setHighlightSelectedRows(enabled) {
    this.setOutputSettings({ highlightSelectedRows: Boolean(enabled) });
    this.highlightSelectedRows = this.outputSettings.highlightSelectedRows;
  }

  setHideEmptyMetadata(enabled) {
    this.setOutputSettings({ hideEmptyMetadata: Boolean(enabled) });
  }

  setShowRawElk(enabled) {
    this.setOutputSettings({ showRawElk: Boolean(enabled) });
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

  setHighlightSettings(settings) {
    this.highlightSettings = cloneHighlightSettings(settings);
    setHighlightSettings(this.highlightSettings);
    applyHighlightSettings(this.highlightSettings);
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