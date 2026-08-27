class OutputController {
  constructor({ getPlainText, getPlainLines }) {
    this.getPlainText = getPlainText;
    this.getPlainLines = getPlainLines;
    this.output = document.getElementById("output");
    this.copyOutputButton = document.getElementById("copy-output");
    this.copySelectedButton = document.getElementById("copy-selected");
    this.selectBar = document.getElementById("output-select-bar");
    this.selectAll = document.getElementById("select-all-check");
    this.highlightSelectedRows = false;

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