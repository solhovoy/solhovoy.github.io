class SavedFiltersPopup {
  constructor({ popupManager, onSelect }) {
    this.popupManager = popupManager;
    this.onSelect = onSelect;
    this.trigger = document.getElementById("filter-saved-btn");
    this.searchTrigger = document.getElementById("filter-saved-search-btn");
    this.trigger = this.trigger || this.searchTrigger;
    this.activeTrigger = this.trigger;
    this.saveButton = document.getElementById("filter-save-btn");
    this.popup = document.getElementById("filter-saved-popup");
    this.closeButton = document.getElementById("filter-saved-close");
    this.body = document.getElementById("filter-saved-body");
    this.hint = document.getElementById("filter-saved-hint");
    this.exportButton = document.getElementById("filter-export-btn");
    this.dropOverlay = document.getElementById("filter-saved-drop-overlay");
    this.draggedItem = null;
    this.draggedIndex = null;
    this.dragCounter = 0;

    popupManager.register({
      name: "saved-filters",
      popup: this.popup,
      trigger: this.trigger,
      onOpen: () => {
        this.render();
        positionPopup(this.popup, this.activeTrigger, 620, { offset: 7 });
      }
    });

    if (this.saveButton) this.saveButton.addEventListener("click", () => this.save());
    [...new Set([this.trigger, this.searchTrigger])].forEach(trigger => {
      trigger.addEventListener("click", event => {
        event.stopPropagation();
        this.activeTrigger = trigger;
        popupManager.toggle("saved-filters");
      });
    });
    this.closeButton.addEventListener("click", () => popupManager.close("saved-filters"));
    this.exportButton.addEventListener("click", event => this.export(event));
    this.popup.addEventListener("dragenter", event => this.handleDragEnter(event));
    this.popup.addEventListener("dragleave", () => this.handleDragLeave());
    this.popup.addEventListener("dragover", event => this.handleDragOver(event));
    this.popup.addEventListener("drop", event => this.handleImport(event));
  }

  save() {
    const query = this.onSelect();
    if (!query) {
      showToast(TOAST_TITLE_NOTHING_SAVE, { description: MSG_NOTHING_SAVE, category: TOAST_CATEGORY_WARNING });
      return;
    }
    if (filterHits([], query).error) return;
    const filters = getSavedFilters();
    if (filters.includes(query)) {
      showToast(TOAST_TITLE_DUP, { description: MSG_FILTER_DUP, category: TOAST_CATEGORY_WARNING });
      return;
    }
    filters.unshift(query);
    setSavedFilters(filters);
    showToast(TOAST_TITLE_SAVED, { description: MSG_FILTER_SAVED });
  }

  render() {
    const filters = getSavedFilters();
    this.body.innerHTML = "";
    this.hint.hidden = filters.length === 0;
    if (!filters.length) {
      const empty = document.createElement("p");
      empty.className = "filter-saved-empty";
      empty.textContent = "No saved filters yet. Drop a JSON file here to import.";
      this.body.appendChild(empty);
      return;
    }
    const list = document.createElement("ul");
    list.className = "filter-saved-list";
    filters.forEach((filter, index) => list.appendChild(this.createItem(filter, index)));
    this.body.appendChild(list);
  }

  createItem(filter, index) {
    const item = document.createElement("li");
    item.className = "filter-saved-item";
    item.draggable = true;
    item.addEventListener("dragstart", event => this.startReorder(event, item, index, filter));
    item.addEventListener("dragenter", event => this.handleItemDragEnter(event));
    item.addEventListener("dragover", event => this.handleItemDragOver(event, item));
    item.addEventListener("dragleave", event => this.handleItemDragLeave(event, item));
    item.addEventListener("drop", event => this.finishReorder(event, item, index));
    item.addEventListener("dragend", () => this.clearReorderState());

    const number = document.createElement("span");
    number.className = "filter-saved-num";
    number.textContent = index + 1;
    const code = document.createElement("code");
    code.textContent = filter;
    code.addEventListener("click", () => {
      this.onSelect(filter);
      this.popupManager.close("saved-filters");
    });
    const deleteButton = document.createElement("button");
    deleteButton.className = "filter-saved-delete";
    deleteButton.title = "Delete";
    deleteButton.textContent = "✕";
    deleteButton.addEventListener("click", event => {
      event.stopPropagation();
      setSavedFilters(getSavedFilters().filter(value => value !== filter));
      this.render();
    });
    item.append(number, code, deleteButton);
    return item;
  }

  startReorder(event, item, index, filter) {
    this.draggedItem = item;
    this.draggedIndex = index;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", filter);
    item.classList.add("dragging");
  }

  handleItemDragEnter(event) {
    if (!this.draggedItem) return;
    event.preventDefault();
    event.stopPropagation();
  }

  handleItemDragOver(event, item) {
    if (!this.draggedItem || this.draggedItem === item) return;
    event.preventDefault();
    event.stopPropagation();
    const insertAfter = event.clientY > item.getBoundingClientRect().top + item.offsetHeight / 2;
    this.body.querySelectorAll(".drop-before, .drop-after").forEach(element => element.classList.remove("drop-before", "drop-after"));
    item.classList.add(insertAfter ? "drop-after" : "drop-before");
    event.dataTransfer.dropEffect = "move";
  }

  handleItemDragLeave(event, item) {
    if (!this.draggedItem || item.contains(event.relatedTarget)) return;
    item.classList.remove("drop-before", "drop-after");
  }

  finishReorder(event, item, index) {
    if (!this.draggedItem || this.draggedItem === item) return;
    event.preventDefault();
    event.stopPropagation();
    const destinationIndex = index + (item.classList.contains("drop-after") ? 1 : 0);
    const insertionIndex = this.draggedIndex < destinationIndex ? destinationIndex - 1 : destinationIndex;
    if (this.draggedIndex === insertionIndex) return;
    const filters = getSavedFilters();
    const [filter] = filters.splice(this.draggedIndex, 1);
    filters.splice(insertionIndex, 0, filter);
    setSavedFilters(filters);
    this.render();
  }

  clearReorderState() {
    this.body.querySelectorAll(".dragging, .drop-before, .drop-after").forEach(element => {
      element.classList.remove("dragging", "drop-before", "drop-after");
    });
    this.draggedItem = null;
    this.draggedIndex = null;
  }

  export(event) {
    event.stopPropagation();
    const filters = getSavedFilters();
    if (!filters.length) {
      showToast(TOAST_TITLE_NOTHING_EXPORT, { description: MSG_NOTHING_EXPORT, category: TOAST_CATEGORY_WARNING });
      return;
    }
    const blob = new Blob([JSON.stringify(filters, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "elk-formatter-filters.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  handleDragEnter(event) {
    if (this.draggedItem) return;
    event.preventDefault();
    this.dragCounter++;
    this.dropOverlay.hidden = false;
  }

  handleDragLeave() {
    if (this.draggedItem) return;
    this.dragCounter--;
    if (this.dragCounter <= 0) {
      this.dragCounter = 0;
      this.dropOverlay.hidden = true;
    }
  }

  handleDragOver(event) {
    if (this.draggedItem) return;
    event.preventDefault();
  }

  handleImport(event) {
    if (this.draggedItem) return;
    event.preventDefault();
    this.dragCounter = 0;
    this.dropOverlay.hidden = true;
    const file = event.dataTransfer?.files?.[0];
    if (!file || !file.name.endsWith(".json")) {
      showToast(TOAST_TITLE_WRONG_FILE, { description: MSG_DROP_NOT_JSON, category: TOAST_CATEGORY_WARNING });
      return;
    }
    const reader = new FileReader();
    reader.onload = event => this.importFilters(event.target.result);
    reader.readAsText(file);
  }

  importFilters(content) {
    let imported;
    try {
      imported = JSON.parse(content);
    } catch {
      showToast(TOAST_TITLE_IMPORT_FAILED, { description: MSG_IMPORT_INVALID_JSON, category: TOAST_CATEGORY_ERROR });
      return;
    }
    if (!Array.isArray(imported) || !imported.every(value => typeof value === "string")) {
      showToast(TOAST_TITLE_IMPORT_FAILED, { description: MSG_IMPORT_BAD_FORMAT, category: TOAST_CATEGORY_ERROR });
      return;
    }
    const existing = getSavedFilters();
    const added = imported.filter(filter => filter.trim() && !existing.includes(filter));
    if (!added.length) {
      showToast(TOAST_TITLE_NOTHING_NEW, { description: MSG_IMPORT_NO_NEW, category: TOAST_CATEGORY_INFO });
      return;
    }
    setSavedFilters([...added, ...existing]);
    this.render();
    showToast(TOAST_TITLE_IMPORTED, { description: MSG_IMPORT_OK.replace("{0}", added.length) });
  }
}