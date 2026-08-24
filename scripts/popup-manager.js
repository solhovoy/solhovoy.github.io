class PopupManager {
  constructor() {
    this.popups = new Map();
    document.addEventListener("click", event => this.closeOnOutsideClick(event));
    document.addEventListener("keydown", event => this.closeOnEscape(event));
  }

  register({ name, popup, trigger, onOpen = () => {}, onClose = () => {} }) {
    this.popups.set(name, { popup, trigger, onOpen, onClose });
  }

  toggle(name) {
    const entry = this.get(name);
    if (entry.popup.hidden) {
      this.closeAll(name);
      entry.onOpen();
      entry.popup.hidden = false;
    } else {
      this.close(name);
    }
  }

  close(name, { blurTrigger = false } = {}) {
    const entry = this.get(name);
    if (entry.popup.hidden) return;
    entry.popup.hidden = true;
    entry.onClose();
    if (blurTrigger) entry.trigger.blur();
  }

  closeAll(exceptName = null) {
    this.popups.forEach((_, name) => {
      if (name !== exceptName) this.close(name);
    });
  }

  get(name) {
    const entry = this.popups.get(name);
    if (!entry) throw new Error(`Unknown popup: ${name}`);
    return entry;
  }

  closeOnOutsideClick(event) {
    this.popups.forEach((entry, name) => {
      if (!entry.popup.hidden && !entry.popup.contains(event.target) && !entry.trigger.contains(event.target)) {
        this.close(name);
      }
    });
  }

  closeOnEscape(event) {
    if (event.key !== "Escape") return;
    const openNames = [...this.popups].filter(([, entry]) => !entry.popup.hidden).map(([name]) => name);
    if (!openNames.length) return;
    event.preventDefault();
    openNames.forEach(name => this.close(name, { blurTrigger: true }));
  }
}