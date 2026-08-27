class InputController {
  constructor({ onFormat }) {
    this.onFormat = onFormat;
    this.input = document.getElementById("input");
    this.panel = document.getElementById("panel-input");
    this.dropOverlay = document.getElementById("raw-json-drop-overlay");
    this.dragCounter = 0;

    this.input.addEventListener("paste", () => setTimeout(() => {
      this.onFormat();
      this.input.blur();
    }, 0));
    this.input.addEventListener("keydown", event => this.handleKeydown(event));
    this.panel.addEventListener("dragenter", event => this.handleDragEnter(event));
    this.panel.addEventListener("dragleave", () => this.handleDragLeave());
    this.panel.addEventListener("dragover", event => event.preventDefault());
    this.panel.addEventListener("drop", event => this.handleDrop(event));
  }

  clear() {
    this.input.value = "";
  }

  focus() {
    this.input.focus();
  }

  handleKeydown(event) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      this.onFormat();
    }
  }

  handleDragEnter(event) {
    event.preventDefault();
    this.dragCounter++;
    this.dropOverlay.hidden = false;
  }

  handleDragLeave() {
    this.dragCounter--;
    if (this.dragCounter <= 0) {
      this.dragCounter = 0;
      this.dropOverlay.hidden = true;
    }
  }

  handleDrop(event) {
    event.preventDefault();
    this.dragCounter = 0;
    this.dropOverlay.hidden = true;
    const file = event.dataTransfer?.files?.[0];
    if (!file || !file.name.toLowerCase().endsWith(".json")) {
      showToast(TOAST_TITLE_WRONG_FILE, { description: MSG_DROP_NOT_JSON, category: TOAST_CATEGORY_WARNING });
      return;
    }
    const reader = new FileReader();
    reader.onload = loadEvent => {
      this.input.value = loadEvent.target.result;
      this.onFormat();
    };
    reader.onerror = () => {
      showToast(TOAST_TITLE_IMPORT_FAILED, { description: MSG_IMPORT_READ_FAILED, category: TOAST_CATEGORY_ERROR });
    };
    reader.readAsText(file);
  }
}