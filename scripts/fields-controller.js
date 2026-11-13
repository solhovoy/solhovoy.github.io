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
    this.pinnedFields = getPinnedFields();
    this.panel = document.getElementById("fields-panel");
    this.scrollArea = document.getElementById("fields-scroll");
    this.toggle = document.getElementById("fields-toggle");
    this.toggleCount = document.getElementById("fields-toggle-count");
    this.search = document.getElementById("fields-search");
    this.searchClearButton = document.getElementById("fields-search-clear");
    this.selectedList = document.getElementById("fields-selected");
    this.pinnedList = document.getElementById("fields-pinned");
    this.availableList = document.getElementById("fields-available");
    this.resetButton = document.getElementById("fields-reset");

    this.panel.querySelectorAll(".fields-section-toggle").forEach(button => {
      const list = document.getElementById(button.getAttribute("aria-controls"));
      button.addEventListener("click", () => {
        list.hidden = !list.hidden;
        button.setAttribute("aria-expanded", String(!list.hidden));
      });
    });
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
    this.panel.style.setProperty("--fields-panel-min-width", `${FIELDS_PANEL_MIN_WIDTH}px`);
    this.panel.style.setProperty("--fields-panel-width", `${this.getWidth()}px`);
    const resizer = document.getElementById("fields-resizer");
    resizer.addEventListener("pointerdown", event => this.startResize(event));
    resizer.addEventListener("dblclick", () => this.resetWidth());
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
      // CSS max-width still caps the panel at 60% of the layout.
      const width = Math.max(FIELDS_PANEL_MIN_WIDTH, Math.round(startWidth + moveEvent.clientX - startX));
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

  resetWidth() {
    this.panel.style.setProperty("--fields-panel-width", `${FIELDS_PANEL_DEFAULT_WIDTH}px`);
    localStorage.removeItem(LS_KEY_FIELDS_PANEL_WIDTH);
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

  togglePinned(key) {
    this.setPinnedFields(this.pinnedFields.includes(key)
      ? this.pinnedFields.filter(pinnedKey => pinnedKey !== key)
      : [...this.pinnedFields, key]);
  }

  setPinnedFields(fields) {
    this.pinnedFields = [...new Set(fields)];
    setPinnedFields(this.pinnedFields);
    this.render();
  }

  // Reorders selected fields; fields missing from `order` keep their relative order at the end.
  setSelectedOrder(order) {
    const rest = this.getSelectedFields().filter(key => !order.includes(key));
    this.selectedFields = new Set([...order.filter(key => this.selectedFields.has(key)), ...rest]);
    this.render();
    this.onChange();
  }

  startSelectedDrag(event, key, button, visibleKeys) {
    startReorderDrag(event, button, {
      axis: "y",
      getItems: () => [...this.selectedList.querySelectorAll(".field-option")],
      indicatorParent: this.selectedList,
      label: key,
      onDrop: (from, to) => {
        // The list may be filtered by search, so place the field next to its visible neighbour.
        const visible = visibleKeys.filter(visibleKey => visibleKey !== key);
        const order = this.getSelectedFields().filter(selectedKey => selectedKey !== key);
        const position = to < visible.length
          ? order.indexOf(visible[to])
          : order.indexOf(visible[visible.length - 1]) + 1;
        order.splice(position, 0, key);
        this.setSelectedOrder(order);
      }
    });
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
    const pinned = this.pinnedFields.filter(matches);
    const available = this.fields.filter(key => !this.selectedFields.has(key) && matches(key));
    this.renderList(this.selectedList, selected, "selected", query);
    this.renderList(this.pinnedList, pinned, "pinned", query);
    this.renderList(this.availableList, available, "available", query);
    document.getElementById("fields-selected-count").textContent = selected.length;
    document.getElementById("fields-pinned-count").textContent = pinned.length;
    document.getElementById("fields-available-count").textContent = available.length;
    this.resetButton.hidden = this.selectedFields.size === 0;
    this.updateToggle();
  }

  appendHighlighted(element, text, query) {
    if (!query) {
      element.textContent = text;
      return;
    }
    const lower = text.toLowerCase();
    let start = 0;
    let index = lower.indexOf(query);
    while (index !== -1) {
      if (index > start) element.append(text.slice(start, index));
      const mark = document.createElement("span");
      mark.className = "search-match";
      mark.textContent = text.slice(index, index + query.length);
      element.append(mark);
      start = index + query.length;
      index = lower.indexOf(query, start);
    }
    if (start < text.length) element.append(text.slice(start));
  }

  // Re-renders, then focuses the control at the same position in `list` without losing the scroll position.
  renderKeepingPlace(list, item, selector, update) {
    const index = [...list.children].indexOf(item);
    const scrollTop = this.scrollArea.scrollTop;
    update();
    const controls = list.querySelectorAll(selector);
    const next = controls[Math.min(index, controls.length - 1)];
    if (next) next.focus({ preventScroll: true });
    this.scrollArea.scrollTop = scrollTop;
  }

  // mode: "selected" removes on click, "available" adds, "pinned" always adds and never mirrors the selection.
  renderList(list, fields, mode, query = "") {
    const selected = mode === "selected";
    const fragment = document.createDocumentFragment();
    for (const key of fields) {
      const item = document.createElement("li");
      item.className = "field-item";
      if (mode === "pinned" && !this.fields.includes(key)) item.classList.add("is-missing");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "field-option";
      button.title = `${selected ? "Remove" : "Add"} ${key}`;
      const name = document.createElement("span");
      name.className = "field-name";
      this.appendHighlighted(name, key, query);
      const action = document.createElement("span");
      action.textContent = selected ? "-" : "+";
      action.setAttribute("aria-hidden", "true");
      button.append(name, action);
      button.setAttribute("aria-label", button.title);
      if (selected && fields.length > 1) {
        button.title += "\nDrag to reorder";
        button.addEventListener("pointerdown", event => this.startSelectedDrag(event, key, button, fields));
      }
      button.addEventListener("click", () => {
        if (mode === "pinned" && this.selectedFields.has(key)) return;
        this.renderKeepingPlace(list, item, ".field-option", () => {
          if (selected) this.selectedFields.delete(key);
          else this.selectedFields.add(key);
          this.render();
          this.onChange();
        });
      });
      const isPinned = this.pinnedFields.includes(key);
      const pin = document.createElement("button");
      pin.type = "button";
      pin.className = "field-pin-btn";
      pin.classList.toggle("is-pinned", isPinned);
      pin.title = `${isPinned ? "Unpin" : "Pin"} ${key}`;
      pin.setAttribute("aria-label", pin.title);
      pin.setAttribute("aria-pressed", String(isPinned));
      const pinIcon = document.createElement("span");
      pinIcon.className = "field-pin-icon";
      pinIcon.setAttribute("aria-hidden", "true");
      pin.appendChild(pinIcon);
      pin.addEventListener("click", () => {
        this.renderKeepingPlace(list, item, ".field-pin-btn", () => this.togglePinned(key));
      });
      item.append(button, pin);
      fragment.appendChild(item);
    }
    list.replaceChildren(fragment);
  }
}
