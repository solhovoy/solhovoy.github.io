const HIDDEN_FIELD_REGEXES = FIELDS_PANEL_HIDDEN_PATTERNS.map(pattern =>
  new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`)
);

function isHiddenField(key) {
  return HIDDEN_FIELD_REGEXES.some(regex => regex.test(key));
}

class FieldsController {
  constructor({ onChange }) {
    this.onChange = onChange;
    this.fields = [];
    this.selectedFields = new Set();
    this.panel = document.getElementById("fields-panel");
    this.scrollArea = document.getElementById("fields-scroll");
    this.toggle = document.getElementById("fields-toggle");
    this.toggleCount = document.getElementById("fields-toggle-count");
    this.search = document.getElementById("fields-search");
    this.searchClearButton = document.getElementById("fields-search-clear");
    this.selectedList = document.getElementById("fields-selected");
    this.availableList = document.getElementById("fields-available");
    this.resetButton = document.getElementById("fields-reset");

    this.toggle.addEventListener("click", () => this.setOpen(this.panel.hidden));
    document.getElementById("fields-close").addEventListener("click", () => {
      this.setOpen(false);
      this.toggle.focus();
    });
    this.panel.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      this.setOpen(false);
      this.toggle.focus();
    });
    this.search.addEventListener("input", () => this.render());
    this.searchClearButton.addEventListener("click", () => {
      this.search.value = "";
      this.render();
    });
    this.resetButton.addEventListener("click", () => {
      this.selectedFields.clear();
      this.render();
      this.onChange();
    });
    this.render();
    this.panel.style.setProperty("--fields-panel-width", `${this.getWidth()}px`);
    document.getElementById("fields-resizer").addEventListener("pointerdown", event => this.startResize(event));
    this.setOpen(localStorage.getItem(LS_KEY_FIELDS_PANEL_OPEN) === "true", { animate: false });
  }

  startResize(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const startX = event.clientX;
    const startWidth = this.panel.getBoundingClientRect().width;
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add("is-resizing-fields");
    const onMove = moveEvent => {
      // Negative flex-basis is invalid and would fall back to content width; CSS min-width handles the rest.
      const width = Math.max(0, Math.round(startWidth + moveEvent.clientX - startX));
      this.panel.style.setProperty("--fields-panel-width", `${width}px`);
    };
    const onEnd = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onEnd);
      handle.removeEventListener("pointercancel", onEnd);
      document.body.classList.remove("is-resizing-fields");
      // Persist the rendered width so CSS min/max limits are applied to the stored value.
      this.setWidth(this.panel.getBoundingClientRect().width);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onEnd);
    handle.addEventListener("pointercancel", onEnd);
  }

  getWidth() {
    const width = Number(localStorage.getItem(LS_KEY_FIELDS_PANEL_WIDTH));
    return Number.isFinite(width) && width > 0 ? width : FIELDS_PANEL_DEFAULT_WIDTH;
  }

  setWidth(width) {
    const rounded = Math.round(width);
    this.panel.style.setProperty("--fields-panel-width", `${rounded}px`);
    localStorage.setItem(LS_KEY_FIELDS_PANEL_WIDTH, String(rounded));
  }

  isOpen() {
    return !this.panel.hidden;
  }

  setOpen(open, { animate = true } = {}) {
    // Toggle the class only while hidden so restoring the panel on page load doesn't slide it in.
    if (open && this.panel.hidden) this.panel.classList.toggle("is-animated", animate);
    this.panel.hidden = !open;
    localStorage.setItem(LS_KEY_FIELDS_PANEL_OPEN, String(open));
    this.toggle.setAttribute("aria-expanded", String(open));
    this.updateToggle();
  }

  updateToggle() {
    const open = !this.panel.hidden;
    const count = this.selectedFields.size;
    const label = `${open ? "Hide" : "Show"} fields panel${count ? ` (${count} selected)` : ""}`;
    this.toggle.title = label;
    this.toggle.setAttribute("aria-label", label);
    this.toggleCount.textContent = count;
    this.toggleCount.hidden = count === 0;
  }

  setHits(hits, { keepSelected = false } = {}) {
    this.fields = [...new Set(
      (Array.isArray(hits) ? hits : []).flatMap(hit => Object.keys(getLogFields(hit)))
    )].filter(key => !isHiddenField(key)).sort((a, b) => a.localeCompare(b));
    if (!keepSelected) {
      const available = new Set(this.fields);
      this.selectedFields = new Set([...this.selectedFields].filter(key => available.has(key)));
    }
    this.render();
  }

  getSelectedFields() {
    return [...this.selectedFields];
  }

  clear() {
    this.selectedFields.clear();
    this.search.value = "";
    this.setHits([]);
  }

  render() {
    this.searchClearButton.hidden = this.search.value.length === 0;
    const query = this.search.value.trim().toLowerCase();
    const matches = key => key.toLowerCase().includes(query);
    const selected = this.getSelectedFields().filter(matches);
    const available = this.fields.filter(key => !this.selectedFields.has(key) && matches(key));
    this.renderList(this.selectedList, selected, true);
    this.renderList(this.availableList, available, false);
    document.getElementById("fields-selected-count").textContent = selected.length;
    document.getElementById("fields-available-count").textContent = available.length;
    this.resetButton.hidden = this.selectedFields.size === 0;
    this.updateToggle();
  }

  renderList(list, fields, selected) {
    const fragment = document.createDocumentFragment();
    for (const key of fields) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "field-option";
      button.title = `${selected ? "Remove" : "Add"} ${key}`;
      const name = document.createElement("span");
      name.className = "field-name";
      name.textContent = key;
      const action = document.createElement("span");
      action.textContent = selected ? "-" : "+";
      action.setAttribute("aria-hidden", "true");
      button.append(name, action);
      button.setAttribute("aria-label", button.title);
      button.addEventListener("click", () => {
        const index = [...list.children].indexOf(item);
        const scrollTop = this.scrollArea.scrollTop;
        if (selected) this.selectedFields.delete(key);
        else this.selectedFields.add(key);
        this.render();
        this.onChange();
        // Keep the user's place in long lists: focus the neighbouring item without scrolling.
        const buttons = list.querySelectorAll("button");
        const nextButton = buttons[Math.min(index, buttons.length - 1)];
        if (nextButton) nextButton.focus({ preventScroll: true });
        this.scrollArea.scrollTop = scrollTop;
      });
      item.appendChild(button);
      fragment.appendChild(item);
    }
    list.replaceChildren(fragment);
  }
}
