/**
 * Vanilla absolute date range picker inspired by Elastic EUI.
 * All values are interpreted as UTC to match displayed @timestamp values.
 */
const DateRangeFilter = (() => {
  const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  function init({ getTimestamp, onApply = () => {}, onClear = () => {}, onInvalidRange = () => {} }) {
    const trigger = document.getElementById("date-range-picker");
    const startTrigger = document.getElementById("date-range-start");
    const endTrigger = document.getElementById("date-range-end");
    const startLabel = document.getElementById("date-range-start-label");
    const endLabel = document.getElementById("date-range-end-label");
    const clearButton = document.getElementById("date-range-clear");
    trigger.classList.add("is-empty");
    const popover = document.createElement("section");
    popover.className = "date-picker-popover";
    popover.hidden = true;
    popover.setAttribute("aria-label", "Absolute time range");
    document.body.appendChild(popover);

    let appliedRange = null;
    let availableRange = null;
    let pendingRange = null;
    let draftRange = null;
    let isDraftValid = true;
    let activeEndpoint = "start";
    let viewedMonth = null;
    let timeListScrollTop = 0;

    function cloneRange(range) {
      return range && { start: new Date(range.start), end: new Date(range.end), isAutomatic: range.isAutomatic };
    }

    function formatExact(date) {
      return `${date.toISOString().slice(0, 19).replace("T", " ")}.${String(date.getUTCMilliseconds()).padStart(3, "0")} UTC`;
    }

    function formatShort(date) {
      return formatDisplay(date);
    }

    function formatInput(date) {
      return formatDisplay(date);
    }

    function formatDisplay(date) {
      const time = date.toISOString().slice(11, 19);
      const milliseconds = String(date.getUTCMilliseconds()).padStart(3, "0");
      return `${MONTHS[date.getUTCMonth()].slice(0, 3)} ${date.getUTCDate()}, ${date.getUTCFullYear()} @ ${time}.${milliseconds}`;
    }

    function parseInput(value) {
      const match = value.trim().match(/^(?:([A-Za-z]{3,9})\s+(\d{1,2}),\s+(\d{4})\s+@\s+|)(?:(\d{4})-(\d{2})-(\d{2})[ T])?(\d{2}):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?$/);
      if (!match) return null;
      const [, monthName, dayName, namedYear, isoYear, isoMonth, isoDay, hour, minute, second, milliseconds = "0"] = match;
      const month = monthName
        ? MONTHS.findIndex(name => name.toLowerCase().startsWith(monthName.toLowerCase()))
        : Number(isoMonth) - 1;
      const year = Number(namedYear || isoYear);
      const day = Number(dayName || isoDay);
      const hourValue = Number(hour);
      const minuteValue = Number(minute);
      const secondValue = Number(second);
      const millisecond = Number(milliseconds.padEnd(3, "0"));
      const date = new Date(Date.UTC(year, month, day, hourValue, minuteValue, secondValue, millisecond));
      if (
        Number.isNaN(date.getTime()) ||
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month ||
        date.getUTCDate() !== day ||
        date.getUTCHours() !== hourValue ||
        date.getUTCMinutes() !== minuteValue ||
        date.getUTCSeconds() !== secondValue ||
        date.getUTCMilliseconds() !== millisecond
      ) {
        return null;
      }
      return date;
    }

    function setTriggerLabel() {
      const displayedRange = pendingRange || appliedRange;
      if (!displayedRange) {
        startLabel.textContent = "Any time";
        endLabel.textContent = "Any time";
        trigger.classList.remove("is-active");
        trigger.classList.add("is-empty");
        trigger.classList.remove("is-invalid-range");
        clearButton.hidden = true;
        return;
      }
      startLabel.textContent = formatShort(displayedRange.start);
      endLabel.textContent = formatShort(displayedRange.end);
      trigger.classList.add("is-active");
      trigger.classList.remove("is-empty");
      trigger.classList.toggle("is-invalid-range", displayedRange.start > displayedRange.end);
      clearButton.hidden = false;
    }

    function createRange(start, end, isAutomatic = false) {
      return { start: new Date(start), end: new Date(end), isAutomatic };
    }

    function setDraftEndpoint(date) {
      draftRange[activeEndpoint] = date;
      viewedMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    }

    function updateDraftEndpoint(date) {
      setDraftEndpoint(date);
      render();
    }

    function commitEndpoint(date) {
      setDraftEndpoint(date);
      isDraftValid = true;
      pendingRange = cloneRange(draftRange);
      setTriggerLabel();
      render();
      positionPopover();
    }

    function renderCalendar() {
      const year = viewedMonth.getUTCFullYear();
      const month = viewedMonth.getUTCMonth();
      const years = Array.from({ length: 11 }, (_, index) => year - 5 + index);
      const firstDay = new Date(Date.UTC(year, month, 1));
      const start = new Date(firstDay);
      start.setUTCDate(1 - firstDay.getUTCDay());
      const cells = [];
      for (let index = 0; index < 42; index++) {
        const date = new Date(start);
        date.setUTCDate(start.getUTCDate() + index);
        const isCurrentMonth = date.getUTCMonth() === month;
        const isSelected = date.toISOString().slice(0, 10) === draftRange[activeEndpoint].toISOString().slice(0, 10);
        const inRange = date >= atMidnight(draftRange.start) && date <= atMidnight(draftRange.end);
        cells.push(`<button class="date-picker-day${isCurrentMonth ? "" : " is-muted"}${isSelected ? " is-selected" : ""}${inRange ? " is-in-range" : ""}" data-date="${date.toISOString().slice(0, 10)}" type="button">${date.getUTCDate()}</button>`);
      }
      return `
        <div class="date-picker-calendar-head">
          <button class="date-picker-icon" data-action="previous-month" type="button" aria-label="Previous month">‹</button>
          <select class="date-picker-month" aria-label="Month">${MONTHS.map((name, index) => `<option value="${index}"${index === month ? " selected" : ""}>${name}</option>`).join("")}</select>
          <select class="date-picker-year" aria-label="Year">${years.map(value => `<option value="${value}"${value === year ? " selected" : ""}>${value}</option>`).join("")}</select>
          <button class="date-picker-icon" data-action="next-month" type="button" aria-label="Next month">›</button>
        </div>
        <div class="date-picker-weekdays">${WEEKDAYS.map(day => `<span>${day}</span>`).join("")}</div>
        <div class="date-picker-days">${cells.join("")}</div>`;
    }

    function renderTimeList(date) {
      const selectedHour = date.getUTCHours();
      const selectedMinute = date.getUTCMinutes();
      const times = [];
      for (let hour = 0; hour < 24; hour++) {
        for (const minute of [0, 30]) {
          const label = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
          const isSelected = hour === selectedHour && minute === selectedMinute;
          times.push(`<button class="date-picker-time-slot${isSelected ? " is-selected" : ""}" data-time="${label}" type="button">${label}</button>`);
        }
      }
      return times.join("");
    }

    function render() {
      if (!draftRange) return;
      const endpointDate = draftRange[activeEndpoint];
      const isEmptyRange = !pendingRange && !appliedRange;
      popover.innerHTML = `
        <div class="date-picker-popover-header">
          <div class="date-picker-popover-title">${activeEndpoint === "start" ? "Start date" : "End date"}</div>
          <button class="filter-help-close date-picker-close" type="button" title="Close">✕</button>
        </div>
        <div class="date-picker-content">
          <div class="date-picker-calendar">${renderCalendar()}</div>
          <div class="date-picker-time-list" aria-label="Time of day">
            ${renderTimeList(endpointDate)}
          </div>
          <label class="date-picker-exact">
            <span class="date-picker-exact-label">${activeEndpoint === "start" ? "Start date" : "End date"}</span>
            <span class="date-picker-exact-row">
              <input class="date-picker-exact-input" value="${formatInput(endpointDate)}" spellcheck="false">
              <button class="date-picker-confirm" type="button" title="Set ${activeEndpoint === "start" ? "From" : "To"}"${isEmptyRange ? "" : " hidden"}>✓</button>
            </span>
            <span class="date-picker-input-error" role="alert" hidden>Allowed formats:<br><code>MMM D, YYYY @ HH:mm:ss.SSS</code><br><code>YYYY-MM-DD HH:mm:ss,SSS</code></span>
          </label>
        </div>`;

      const timeList = popover.querySelector(".date-picker-time-list");
      timeList.scrollTop = timeListScrollTop;

      popover.querySelector(".date-picker-close").addEventListener("click", () => {
        close({ discard: true });
      });

      popover.querySelectorAll("[data-date]").forEach(button => button.addEventListener("click", () => {
        const [year, month, day] = button.dataset.date.split("-").map(Number);
        const date = new Date(draftRange[activeEndpoint]);
        date.setUTCFullYear(year, month - 1, day);
        commitEndpoint(date);
      }));
      popover.querySelectorAll("[data-time]").forEach(button => button.addEventListener("click", () => {
        timeListScrollTop = timeList.scrollTop;
        const [hour, minute] = button.dataset.time.split(":").map(Number);
        const date = new Date(draftRange[activeEndpoint]);
        date.setUTCHours(hour, minute, 0, 0);
        commitEndpoint(date);
      }));
      popover.querySelector("[data-action='previous-month']").addEventListener("click", () => {
        viewedMonth.setUTCMonth(viewedMonth.getUTCMonth() - 1);
        render();
      });
      popover.querySelector("[data-action='next-month']").addEventListener("click", () => {
        viewedMonth.setUTCMonth(viewedMonth.getUTCMonth() + 1);
        render();
      });
      popover.querySelector(".date-picker-month").addEventListener("change", event => {
        viewedMonth.setUTCMonth(Number(event.target.value));
        render();
      });
      popover.querySelector(".date-picker-year").addEventListener("change", event => {
        const year = Number(event.target.value);
        if (Number.isInteger(year) && year >= 1970 && year <= 9999) viewedMonth.setUTCFullYear(year);
        render();
      });
      const exactInput = popover.querySelector(".date-picker-exact-input");
      const confirmButton = popover.querySelector(".date-picker-confirm");
      const inputError = popover.querySelector(".date-picker-input-error");
      const originalValue = formatInput(endpointDate);
      const validateExactInput = () => {
        const isValid = Boolean(parseInput(exactInput.value));
        const isChanged = exactInput.value !== originalValue;
        isDraftValid = isValid;
        exactInput.classList.toggle("is-invalid", !isValid);
        inputError.hidden = isValid;
        confirmButton.hidden = !isChanged && !isEmptyRange;
        confirmButton.disabled = !isValid;
        return isValid;
      };
      exactInput.addEventListener("input", validateExactInput);
      exactInput.addEventListener("change", () => {
        const parsed = parseInput(exactInput.value);
        if (parsed) exactInput.value = formatInput(parsed);
        validateExactInput();
      });
      exactInput.addEventListener("keydown", event => {
        if (event.key !== "Enter" || confirmButton.hidden || confirmButton.disabled) return;
        event.preventDefault();
        confirmButton.click();
      });
      confirmButton.addEventListener("click", () => {
        if (!validateExactInput()) return;
        setDraftEndpoint(parseInput(exactInput.value));
        isDraftValid = true;
        saveDraft();
      });
    }

    function atMidnight(date) {
      return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    }

    function positionPopover() {
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(360, window.innerWidth - 16);
      const preferredLeft = activeEndpoint === "start" ? rect.left : rect.right - width;
      const left = Math.max(8, Math.min(preferredLeft, window.innerWidth - width - 8));
      popover.style.width = `${width}px`;
      popover.style.left = `${left}px`;
      popover.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - popover.offsetHeight - 8)}px`;
      const endpoint = activeEndpoint === "start" ? startTrigger : endTrigger;
      const endpointRect = endpoint.getBoundingClientRect();
      const popoverRect = popover.getBoundingClientRect();
      const arrowPosition = Math.max(14, Math.min(endpointRect.left + endpointRect.width / 2 - popoverRect.left, popoverRect.width - 14));
      popover.style.setProperty("--date-picker-arrow-x", `${arrowPosition}px`);
    }

    function open(endpoint) {
      if (popover.hidden) {
        const fallback = availableRange || createRange(new Date(), new Date());
        draftRange = cloneRange(pendingRange || appliedRange || fallback);
      }
      activeEndpoint = endpoint;
      isDraftValid = true;
      timeListScrollTop = 0;
      viewedMonth = new Date(Date.UTC(draftRange[endpoint].getUTCFullYear(), draftRange[endpoint].getUTCMonth(), 1));
      render();
      popover.hidden = false;
      updateEndpointHighlight();
      positionPopover();
      scrollTimeListToEndpoint();
    }

    function close({ discard = false } = {}) {
      popover.hidden = true;
      isDraftValid = true;
      updateEndpointHighlight();
      if (discard) draftRange = cloneRange(appliedRange);
    }

    function updateEndpointHighlight() {
      startTrigger.classList.toggle("is-editing", !popover.hidden && activeEndpoint === "start");
      endTrigger.classList.toggle("is-editing", !popover.hidden && activeEndpoint === "end");
    }

    function scrollTimeListToEndpoint() {
      const date = draftRange[activeEndpoint];
      const hour = String(date.getUTCHours()).padStart(2, "0");
      const minute = date.getUTCMinutes() < 30 ? "00" : "30";
      const slot = popover.querySelector(`[data-time="${hour}:${minute}"]`);
      slot?.scrollIntoView({ block: "center" });
      timeListScrollTop = popover.querySelector(".date-picker-time-list")?.scrollTop || 0;
    }

    function populateFromHits(hits) {
      if (!Array.isArray(hits)) return;
      const timestamps = hits.map(hit => new Date(getTimestamp(hit))).filter(date => !Number.isNaN(date.getTime()));
      if (!timestamps.length) return;
      const range = createRange(Math.min(...timestamps), Math.max(...timestamps), true);
      availableRange = cloneRange(range);
      if (!appliedRange || appliedRange.isAutomatic) {
        appliedRange = range;
        pendingRange = cloneRange(range);
        draftRange = cloneRange(range);
      }
      setTriggerLabel();
    }

    function saveDraft() {
      if (!draftRange) return;
      pendingRange = cloneRange(draftRange);
      setTriggerLabel();
      close();
    }

    function applyDraft() {
      if (!isDraftValid) return false;
      if (!pendingRange) return true;
      if (pendingRange.start > pendingRange.end) {
        appliedRange = null;
        setTriggerLabel();
        close();
        onInvalidRange();
        return true;
      }
      appliedRange = cloneRange(pendingRange);
      appliedRange.isAutomatic = false;
      setTriggerLabel();
      close();
      onApply(cloneRange(appliedRange));
      return true;
    }

    function applyRange(range) {
      const start = new Date(range?.start);
      const end = new Date(range?.end);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return false;
      appliedRange = createRange(start, end, false);
      pendingRange = cloneRange(appliedRange);
      draftRange = cloneRange(appliedRange);
      setTriggerLabel();
      close();
      onApply(cloneRange(appliedRange));
      return true;
    }

    function clear({ resetAvailableRange = false } = {}) {
      appliedRange = null;
      pendingRange = null;
      draftRange = null;
      if (resetAvailableRange) availableRange = null;
      close();
      setTriggerLabel();
    }

    function filterHits(hits) {
      if (!appliedRange || appliedRange.start > appliedRange.end) return hits;
      return hits.filter(hit => {
        const timestamp = new Date(getTimestamp(hit));
        if (Number.isNaN(timestamp.getTime())) return appliedRange.isAutomatic;
        return timestamp >= appliedRange.start && timestamp <= appliedRange.end;
      });
    }

    startTrigger.addEventListener("click", () => open("start"));
    endTrigger.addEventListener("click", () => open("end"));
    clearButton.addEventListener("click", event => {
      event.stopPropagation();
      clear();
      onClear();
    });
    document.addEventListener("pointerdown", event => {
      const applyButton = document.getElementById("filter-apply-btn");
      if (!popover.hidden && !popover.contains(event.target) && !trigger.contains(event.target) && !applyButton.contains(event.target)) {
        close({ discard: true });
      }
    });
    window.addEventListener("resize", () => { if (!popover.hidden) positionPopover(); });

    return {
      applyDraft,
      applyRange,
      close: () => close({ discard: true }),
      clear,
      filterHits,
      hasRange: () => appliedRange !== null,
      populateFromHits
    };
  }

  return { init };
})();
