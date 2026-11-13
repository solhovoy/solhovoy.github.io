class OutputController {
  constructor({ getPlainText, getPlainLines, onReorderColumns, onColumnSortChange }) {
    this.getPlainText = getPlainText;
    this.getPlainLines = getPlainLines;
    this.onReorderColumns = onReorderColumns;
    this.onColumnSortChange = onColumnSortChange;
    // { field, order: "asc" | "desc" } while sorting by a field column; not persisted.
    this.columnSort = null;
    this.output = document.getElementById("output");
    this.copyOutputButton = document.getElementById("copy-output");
    this.copySelectedButton = document.getElementById("copy-selected");
    this.selectBar = document.getElementById("output-select-bar");
    this.selectAll = document.getElementById("select-all-check");
    this.highlightSelectedRows = false;
    this.outputWrap = document.getElementById("output-wrap");
    this.columnFields = [];
    // Widths live only for the page session; they are not persisted.
    this.columnWidths = new Map();
    this.autoWidths = new Map();

    this.output.addEventListener("change", event => this.handleSelectionChange(event));
    this.output.addEventListener("click", event => this.handleOutputClick(event));
    this.selectAll.addEventListener("change", () => this.toggleSelectAll());
    this.copyOutputButton.addEventListener("click", () => this.copyAll());
    this.copySelectedButton.addEventListener("click", () => this.copySelected());
  }

  captureCheckedSelectionIds() {
    return new Set(
      [...this.output.querySelectorAll(".row-check:checked")]
        .map(checkbox => checkbox.closest(".log-entry").dataset.selectionId)
        .filter(Boolean)
    );
  }

  restoreCheckedSelectionIds(selectionIds) {
    if (!selectionIds.size) return;
    this.output.querySelectorAll(".row-check").forEach(checkbox => {
      const selectionId = checkbox.closest(".log-entry").dataset.selectionId;
      if (selectionIds.has(selectionId)) checkbox.checked = true;
    });
  }

  getColumnSort() {
    return this.columnSort;
  }

  // Returns true if a field sort was active, i.e. the date sort was restored.
  clearColumnSort() {
    if (!this.columnSort) return false;
    this.columnSort = null;
    this.onColumnSortChange?.();
    return true;
  }

  toggleColumnSort(key) {
    const order = this.columnSort?.field === key && this.columnSort.order === "asc" ? "desc" : "asc";
    this.columnSort = { field: key, order };
    this.onColumnSortChange?.();
  }

  setFieldColumns(fields) {
    this.columnFields = fields.filter(key => key !== "@timestamp");
    if (this.columnSort && !this.columnFields.includes(this.columnSort.field)) this.columnSort = null;
    document.getElementById("bar-col-sort").classList.toggle("is-inactive", Boolean(this.columnSort));
    this.selectBar.querySelectorAll(".bar-col-field").forEach(cell => cell.remove());
    const active = this.columnFields.length > 0;
    this.outputWrap.classList.toggle("is-columns", active);
    if (!active) return;
    const fragment = document.createDocumentFragment();
    this.columnFields.forEach(key => {
      const cell = document.createElement("div");
      cell.className = "bar-col bar-col-field";
      const sortOrder = this.columnSort?.field === key ? this.columnSort.order : null;
      const hints = [this.columnFields.length > 1 && "Drag to reorder", `Click to sort ${sortOrder === "asc" ? "descending" : "ascending"}`];
      cell.title = [key, ...hints.filter(Boolean)].join("\n");
      cell.addEventListener("pointerdown", event => {
        if (!event.target.closest(".col-resizer")) this.startColumnDrag(event, key, cell);
      });
      cell.addEventListener("click", event => {
        if (!event.target.closest(".col-resizer")) this.toggleColumnSort(key);
      });
      const label = document.createElement("span");
      label.className = "bar-col-label";
      label.textContent = key;
      cell.append(label);
      if (sortOrder) {
        cell.classList.add("is-sorted");
        cell.setAttribute("aria-sort", sortOrder === "asc" ? "ascending" : "descending");
        const icon = document.createElement("span");
        icon.className = "bar-col-sort-icon";
        icon.textContent = sortOrder === "asc" ? "⬆" : "⬇";
        icon.setAttribute("aria-hidden", "true");
        cell.append(icon);
      }
      const handle = document.createElement("div");
      handle.className = "col-resizer";
      handle.title = "Drag to resize, double-click to reset";
      handle.setAttribute("aria-hidden", "true");
      handle.addEventListener("pointerdown", event => this.startColumnResize(event, key, cell));
      handle.addEventListener("dblclick", () => {
        this.columnWidths.delete(key);
        this.applyColumnWidths();
      });
      cell.append(handle);
      fragment.append(cell);
    });
    this.selectBar.append(fragment);
    this.applyColumnWidths();
  }

  applyColumnWidths() {
    const lastIndex = this.columnFields.length - 1;
    let minWidth = 0;
    const tracks = this.columnFields.map((key, index) => {
      if (index === lastIndex) {
        // The last column fills free space but can be dragged wider than the viewport.
        const width = this.columnWidths.get(key) ?? FIELD_COLUMN_LAST_MIN_WIDTH;
        minWidth += width;
        return `minmax(${width}px, 1fr)`;
      }
      const width = this.columnWidths.get(key) ?? this.autoWidths.get(key) ?? FIELD_COLUMN_DEFAULT_WIDTH;
      minWidth += width;
      return `${width}px`;
    });
    this.outputWrap.style.setProperty("--field-cols", tracks.join(" "));
    this.outputWrap.style.setProperty("--field-cols-min", `${minWidth}px`);
  }

  // Sizes each column to its widest rendered value or header, capped at the default width.
  fitColumnsToContent() {
    this.autoWidths.clear();
    if (!this.columnFields.length) return;
    const range = document.createRange();
    const textWidth = element => {
      range.selectNodeContents(element);
      return range.getBoundingClientRect().width;
    };
    const widths = [...this.selectBar.querySelectorAll(".bar-col-field")].map(cell => {
      const icon = cell.querySelector(".bar-col-sort-icon");
      return textWidth(cell.querySelector(".bar-col-label")) +
        (icon ? icon.getBoundingClientRect().width + parseFloat(getComputedStyle(icon).marginLeft) : 0);
    });
    this.output.querySelectorAll(".log-line.is-columns").forEach(line => {
      line.querySelectorAll(".col").forEach((cell, index) => {
        widths[index] = Math.max(widths[index] ?? 0, textWidth(cell));
      });
    });
    this.columnFields.forEach((key, index) => {
      const width = Math.ceil((widths[index] ?? 0) + FIELD_COLUMN_PADDING);
      this.autoWidths.set(key, Math.max(FIELD_COLUMN_MIN_WIDTH, Math.min(FIELD_COLUMN_DEFAULT_WIDTH, width)));
    });
    this.applyColumnWidths();
  }

  // Horizontal auto-scroll distance (px) for a pointer near the output edges during a drag.
  edgeScrollStep(clientX, startX, elapsed) {
    const rect = this.outputWrap.getBoundingClientRect();
    const speed = depth => FIELD_COLUMN_AUTOSCROLL_SPEED * Math.min(1, depth / FIELD_COLUMN_AUTOSCROLL_EDGE);
    // Edge zones never start before the grab point, so grabbing something that already sits
    // in a zone (e.g. the last column) doesn't scroll until the pointer moves outward.
    const rightZone = Math.max(rect.right - FIELD_COLUMN_AUTOSCROLL_EDGE, startX);
    const leftZone = Math.min(rect.left + FIELD_COLUMN_AUTOSCROLL_EDGE, startX);
    if (clientX > rightZone) return speed(clientX - rightZone) * elapsed / 1000;
    if (clientX < leftZone) return -speed(leftZone - clientX) * elapsed / 1000;
    return 0;
  }

  startColumnDrag(event, key, cell) {
    const startX = event.clientX;
    let frame = 0;
    let lastTime = 0;
    let scrollPos = 0;
    let point = null;
    let refresh = null;
    const autoScroll = time => {
      frame = 0;
      const elapsed = lastTime ? Math.min(time - lastTime, 50) : 16;
      lastTime = time;
      if (Math.abs(this.outputWrap.scrollLeft - scrollPos) > 1) scrollPos = this.outputWrap.scrollLeft;
      const maxScroll = this.outputWrap.scrollWidth - this.outputWrap.clientWidth;
      const next = Math.max(0, Math.min(maxScroll, scrollPos + this.edgeScrollStep(point.x, startX, elapsed)));
      if (next === scrollPos) {
        lastTime = 0;
        return;
      }
      scrollPos = next;
      this.outputWrap.scrollLeft = scrollPos;
      refresh();
      frame = requestAnimationFrame(autoScroll);
    };
    startReorderDrag(event, cell, {
      axis: "x",
      getItems: () => [...this.selectBar.querySelectorAll(".bar-col-field")],
      indicatorParent: this.selectBar,
      indicatorLength: () => this.outputWrap.clientHeight,
      label: key,
      onDragMove: (currentPoint, update) => {
        point = currentPoint;
        refresh = update;
        if (!frame) {
          scrollPos = this.outputWrap.scrollLeft;
          frame = requestAnimationFrame(autoScroll);
        }
      },
      onDragEnd: () => cancelAnimationFrame(frame),
      onDrop: (from, to) => {
        const order = [...this.columnFields];
        order.splice(to, 0, ...order.splice(from, 1));
        this.onReorderColumns?.(order);
      }
    });
  }

  startColumnResize(event, key, cell) {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const startX = event.clientX;
    const startWidth = cell.getBoundingClientRect().width;
    // Accumulated auto-scroll; tracked separately because the browser clamps scrollLeft when content shrinks.
    let scrolled = 0;
    let clientX = startX;
    let frame = 0;
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add("is-resizing-column");
    const update = () => {
      const width = Math.max(FIELD_COLUMN_MIN_WIDTH, Math.round(startWidth + clientX - startX + scrolled));
      this.columnWidths.set(key, width);
      this.applyColumnWidths();
    };
    // Fractional scroll position; browsers round scrollLeft, which would stall slow scrolling.
    let scrollPos = this.outputWrap.scrollLeft;
    let lastTime = 0;
    const autoScroll = time => {
      frame = 0;
      // Time-based speed so scrolling is equally fast on 60Hz and 120Hz displays.
      const elapsed = lastTime ? Math.min(time - lastTime, 50) : 16;
      lastTime = time;
      // Resync if the browser clamped scrollLeft after the content shrank.
      if (Math.abs(this.outputWrap.scrollLeft - scrollPos) > 1) scrollPos = this.outputWrap.scrollLeft;
      let step = this.edgeScrollStep(clientX, startX, elapsed);
      if (step < 0) step = -Math.min(scrollPos, -step);
      if (!step) {
        lastTime = 0;
        return;
      }
      scrolled += step;
      scrollPos += step;
      // Grow the column first so there is room to scroll into.
      update();
      this.outputWrap.scrollLeft = scrollPos;
      frame = requestAnimationFrame(autoScroll);
    };
    const onMove = moveEvent => {
      clientX = moveEvent.clientX;
      update();
      if (!frame) frame = requestAnimationFrame(autoScroll);
    };
    const onEnd = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onEnd);
      handle.removeEventListener("pointercancel", onEnd);
      document.body.classList.remove("is-resizing-column");
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onEnd);
    handle.addEventListener("pointercancel", onEnd);
  }

  showOutputControls(hasRows) {
    this.copyOutputButton.hidden = !hasRows;
    this.selectBar.hidden = !hasRows;
    if (!hasRows) this.clearSelectionState();
  }

  syncSelection() {
    const all = this.output.querySelectorAll(".row-check");
    const checked = this.output.querySelectorAll(".row-check:checked");
    if (!all.length || !checked.length) {
      this.selectAll.checked = false;
      this.selectAll.indeterminate = false;
    } else if (checked.length === all.length) {
      this.selectAll.checked = true;
      this.selectAll.indeterminate = false;
    } else {
      this.selectAll.checked = false;
      this.selectAll.indeterminate = true;
    }
    this.syncSelectedRowHighlights();
    this.updateCopySelected();
  }

  setHighlightSelectedRows(enabled) {
    this.highlightSelectedRows = Boolean(enabled);
    this.syncSelectedRowHighlights();
  }

  syncSelectedRowHighlights() {
    this.output.querySelectorAll(".log-entry").forEach(entry => {
      const checkbox = entry.querySelector(".row-check");
      entry.classList.toggle("is-selected", this.highlightSelectedRows && checkbox?.checked);
    });
  }

  reset() {
    this.showOutputControls(false);
    this.updateCopySelected();
  }

  clearSelectionState() {
    this.selectAll.checked = false;
    this.selectAll.indeterminate = false;
  }

  updateCopySelected() {
    const count = this.output.querySelectorAll(".row-check:checked").length;
    this.copySelectedButton.hidden = count === 0;
    this.copySelectedButton.disabled = count === 0;
    this.copySelectedButton.textContent = `⧉ Copy Selected (${count})`;
  }

  handleSelectionChange(event) {
    if (!event.target.closest(".row-check")) return;
    this.syncSelection();
  }

  // Clicks on the first-column overlay (.log-entry::after) target the entry itself
  toggleRowFromCheckColumn(event) {
    const entry = event.target;
    if (!entry.classList?.contains("log-entry")) return false;
    const checkbox = entry.querySelector(".row-check");
    if (!checkbox) return false;
    checkbox.checked = !checkbox.checked;
    this.syncSelection();
    return true;
  }

  toggleSelectAll() {
    this.output.querySelectorAll(".row-check").forEach(checkbox => {
      checkbox.checked = this.selectAll.checked;
    });
    this.syncSelection();
  }

  async copyAll() {
    const text = this.getPlainText();
    if (!text) return;
    await copyText(text);
    showToast(TOAST_TITLE_COPIED, { description: MSG_COPIED });
  }

  async copySelected() {
    const checked = this.output.querySelectorAll(".row-check:checked");
    if (!checked.length) return;
    const plainLines = this.getPlainLines();
    const text = [...checked]
      .map(checkbox => plainLines[parseInt(checkbox.closest(".log-entry").dataset.index, 10)])
      .filter(Boolean)
      .join("\n\r");
    await copyText(text);
    showToast(TOAST_TITLE_COPIED, { description: MSG_COPIED });
  }

  handleOutputClick(event) {
    if (this.toggleRowFromCheckColumn(event)) return;
    const copyButton = event.target.closest(".raw-copy");
    if (copyButton) {
      const rawJson = copyButton.closest(".raw-json");
      const content = rawJson.querySelector(".raw-content").textContent;
      copyText(content).then(() => showToast(TOAST_TITLE_COPIED, { description: MSG_COPIED }));
      return;
    }
    const collapseButton = event.target.closest(".raw-collapse");
    if (collapseButton) {
      const entry = collapseButton.closest(".log-entry");
      if (entry) {
        entry.classList.remove("expanded");
        entry.querySelector(".raw-json").hidden = true;
      }
      return;
    }
    const toggle = event.target.closest(".raw-toggle");
    if (!toggle) return;
    const entry = toggle.closest(".log-entry");
    if (!entry) return;
    const rawJson = entry.querySelector(".raw-json");
    const isExpanded = entry.classList.toggle("expanded");
    rawJson.hidden = !isExpanded;
  }
}