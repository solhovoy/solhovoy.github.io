class PreferencesController {
  constructor({ onSortChange }) {
    this.onSortChange = onSortChange;
    this.sortButton = document.getElementById("sticky-sort");
    this.sortColumn = document.getElementById("bar-col-sort");
    this.themeToggle = document.getElementById("theme-toggle");
    this.themeIcon = this.themeToggle.querySelector(".theme-toggle-icon");
    this.sortOrder = localStorage.getItem("elkSortOrder") || "asc";
    this.theme = localStorage.getItem("elkTheme") || "dark";

    this.applySortLabel();
    this.applyTheme();
    this.sortColumn.addEventListener("click", () => this.toggleSort());
    this.themeToggle.addEventListener("click", () => this.toggleTheme());
    this.makeCollapsible("collapse-input", "panel-input", true);
  }

  getSortOrder() {
    return this.sortOrder;
  }

  applySortLabel() {
    this.sortButton.textContent = this.sortOrder === "asc" ? "⬆ Sort Old-New" : "⬇ Sort New-Old";
  }

  applyTheme() {
    if (this.theme === "light") {
      document.documentElement.classList.add("light");
      this.themeIcon.style.setProperty("--theme-icon", 'url("/assets/icon_theme_dark.svg")');
      this.themeToggle.title = "Switch to dark mode";
      return;
    }
    document.documentElement.classList.remove("light");
    this.themeIcon.style.setProperty("--theme-icon", 'url("/assets/icon_theme_light.svg")');
    this.themeToggle.title = "Switch to light mode";
  }

  toggleSort() {
    this.sortOrder = this.sortOrder === "asc" ? "desc" : "asc";
    localStorage.setItem("elkSortOrder", this.sortOrder);
    this.applySortLabel();
    this.onSortChange(this.sortOrder);
  }

  toggleTheme() {
    this.theme = this.theme === "dark" ? "light" : "dark";
    localStorage.setItem("elkTheme", this.theme);
    this.applyTheme();
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