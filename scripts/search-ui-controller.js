class SearchUiController {
  constructor({ onApply, onApplyButton, onClear }) {
    this.onApply = onApply;
    this.onApplyButton = onApplyButton;
    this.onClear = onClear;
    this.input = document.getElementById("search-input");
    this.expand = document.getElementById("search-expand");
    this.filterIcon = document.querySelector(".search-filter-icon");
    this.clearButton = document.getElementById("search-clear");
    this.applyButton = document.getElementById("filter-apply-btn");

    this.input.addEventListener("focus", () => this.openExpansion());
    this.input.addEventListener("input", () => this.updateInputState());
    this.input.addEventListener("keydown", event => this.applyOnEnter(event));
    this.expand.addEventListener("input", () => this.updateExpansionState());
    this.expand.addEventListener("keydown", event => this.applyExpansionOnEnter(event));
    this.expand.addEventListener("blur", () => this.hideExpansion());
    this.clearButton.addEventListener("click", () => this.clear());
    this.applyButton.addEventListener("click", () => this.onApplyButton());
  }

  getValue() {
    return this.input.value;
  }

  setValue(value) {
    this.input.value = value;
    this.input.title = value;
    this.clearButton.hidden = !value;
    if (!this.expand.hidden) {
      this.expand.value = value;
      this.resizeExpansion();
    }
  }

  setError(hasError) {
    this.input.classList.toggle("search-error", hasError);
    this.expand.classList.toggle("search-error", hasError);
  }

  flash() {
    for (const element of [this.input, this.expand]) {
      element.classList.remove("search-input-flash");
      void element.offsetWidth;
      element.classList.add("search-input-flash");
    }
  }

  isExpansionOpen() {
    return !this.expand.hidden;
  }

  closeExpansion() {
    this.expand.blur();
    this.hideExpansion();
  }

  hideExpansion() {
    this.input.value = this.expand.value;
    this.input.title = this.expand.value;
    this.expand.hidden = true;
    this.filterIcon.style.removeProperty("height");
  }

  focus() {
    this.input.focus();
  }

  openExpansion() {
    this.expand.value = this.input.value;
    this.expand.classList.remove("search-input-flash");
    this.expand.hidden = false;
    this.resizeExpansion();
    this.expand.focus();
    this.expand.setSelectionRange(this.expand.value.length, this.expand.value.length);
  }

  updateInputState() {
    this.input.title = this.input.value;
    this.clearButton.hidden = !this.input.value;
  }

  updateExpansionState() {
    this.input.value = this.expand.value;
    this.input.title = this.expand.value;
    this.clearButton.hidden = !this.expand.value;
    this.resizeExpansion();
  }

  resizeExpansion() {
    this.expand.style.height = "auto";
    this.expand.style.height = `${this.expand.scrollHeight}px`;
    this.filterIcon.style.height = `${this.expand.offsetHeight - 2}px`;
  }

  applyOnEnter(event) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    this.onApply();
    this.input.blur();
  }

  applyExpansionOnEnter(event) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    this.onApply();
    this.expand.blur();
  }

  clear() {
    this.setValue("");
    this.setError(false);
    this.onClear();
    this.focus();
  }
}