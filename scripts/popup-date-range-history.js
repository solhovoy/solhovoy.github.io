class DateRangeHistoryPopup {
  constructor({ popupManager, dateRangeFilter, onApply }) {
    this.popupManager = popupManager;
    this.dateRangeFilter = dateRangeFilter;
    this.onApply = onApply;
    this.popup = document.getElementById("date-range-history-popup");
    this.trigger = document.getElementById("date-range-history-btn");
    this.closeButton = document.getElementById("date-range-history-close");
    this.body = document.getElementById("date-range-history-body");
    this.hint = document.getElementById("date-range-history-hint");

    popupManager.register({
      name: "date-range-history",
      popup: this.popup,
      trigger: this.trigger,
      onOpen: () => {
        this.render();
        positionPopup(this.popup, this.trigger, 550, { align: "center", offset: 9 });
      }
    });

    this.trigger.addEventListener("click", event => {
      event.stopPropagation();
      this.dateRangeFilter.close();
      popupManager.toggle("date-range-history");
    });
    this.closeButton.addEventListener("click", () => popupManager.close("date-range-history"));
  }

  render() {
    const ranges = getRecentDateRanges();
    this.body.innerHTML = "";
    this.hint.hidden = ranges.length === 0;
    if (!ranges.length) {
      const empty = document.createElement("p");
      empty.className = "filter-saved-empty";
      empty.textContent = "No recently used date ranges.";
      this.body.appendChild(empty);
      return;
    }
    const list = document.createElement("ul");
    list.className = "filter-saved-list recent-date-range-list";
    for (const [index, range] of ranges.entries()) {
      const item = document.createElement("li");
      item.className = "filter-saved-item";

      const number = document.createElement("span");
      number.className = "filter-saved-num";
      number.textContent = index + 1;

      const button = document.createElement("button");
      button.className = "recent-date-range-item";
      button.type = "button";
      button.textContent = `${this.formatRange(range.start)} to ${this.formatRange(range.end)}`;
      button.addEventListener("click", () => {
        if (!this.dateRangeFilter.applyRange(range)) return;
        this.popupManager.close("date-range-history");
        this.onApply();
      });

      const deleteButton = document.createElement("button");
      deleteButton.className = "filter-saved-delete";
      deleteButton.type = "button";
      deleteButton.title = "Delete";
      deleteButton.textContent = "✕";
      deleteButton.addEventListener("click", event => {
        event.stopPropagation();
        setRecentDateRanges(ranges.filter(candidate => candidate.start !== range.start || candidate.end !== range.end));
        this.render();
      });

      item.append(number, button, deleteButton);
      list.appendChild(item);
    }
    this.body.appendChild(list);
  }

  formatRange(date) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const value = new Date(date);
    const time = value.toISOString().slice(11, 19);
    const milliseconds = String(value.getUTCMilliseconds()).padStart(3, "0");
    return `${months[value.getUTCMonth()]} ${value.getUTCDate()}, ${value.getUTCFullYear()} @ ${time}.${milliseconds}`;
  }
}