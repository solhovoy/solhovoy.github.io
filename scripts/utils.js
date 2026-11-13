function copyText(text) {
  const fallbackCopy = () => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  };

  if (!navigator.clipboard?.writeText) {
    fallbackCopy();
    return Promise.resolve();
  }

  return navigator.clipboard.writeText(text).catch(fallbackCopy);
}

function positionPopup(popup, trigger, width, { align = "end", offset = 8 } = {}) {
  const rect = trigger.getBoundingClientRect();
  const preferredLeft = align === "center"
    ? rect.left + rect.width / 2 - width / 2
    : rect.right - width + 8;
  const left = Math.max(8, Math.min(preferredLeft, window.innerWidth - width - 8));
  const availableHeight = window.innerHeight - rect.bottom - offset - 4;
  popup.style.top = `${rect.bottom + offset}px`;
  popup.style.left = `${left}px`;
  popup.style.maxHeight = `${Math.max(200, availableHeight)}px`;

  const arrowPosition = Math.max(14, Math.min(rect.left + rect.width / 2 - left, width - 14));
  popup.style.setProperty("--filter-popup-arrow-x", `${arrowPosition}px`);
}

// Pointer-driven drag-to-reorder. The drag starts only after a small move so plain clicks still work;
// it shows a floating label and a drop line, and reports the move via onDrop(fromIndex, toIndex).
// Escape cancels the drag.
function startReorderDrag(event, source, {
  axis, getItems, indicatorParent, label, indicatorLength, onDrop, onDragMove = () => {}, onDragEnd = () => {}
}) {
  if (event.button !== 0) return;
  const fromIndex = getItems().indexOf(source);
  if (fromIndex === -1 || getItems().length < 2) return;
  event.preventDefault();
  const start = { x: event.clientX, y: event.clientY };
  const point = { ...start };
  let dragging = false;
  let dropIndex = -1;
  let ghost = null;
  let indicator = null;
  source.setPointerCapture(event.pointerId);

  const update = () => {
    ghost.style.transform = `translate(${point.x + 12}px, ${point.y + 12}px)`;
    const rects = getItems().map(item => item.getBoundingClientRect());
    const pos = axis === "x" ? point.x : point.y;
    let index = rects.findIndex(rect => axis === "x"
      ? pos < rect.left + rect.width / 2
      : pos < rect.top + rect.height / 2);
    if (index === -1) index = rects.length;
    dropIndex = index === fromIndex || index === fromIndex + 1 ? -1 : index;
    indicator.hidden = dropIndex === -1;
    if (dropIndex === -1) return;
    const parentRect = indicatorParent.getBoundingClientRect();
    const edgeRect = rects[Math.min(index, rects.length - 1)];
    if (axis === "x") {
      const edge = index < rects.length ? edgeRect.left : edgeRect.right;
      indicator.style.left = `${edge - parentRect.left}px`;
      if (indicatorLength) indicator.style.height = `${indicatorLength()}px`;
    } else {
      const edge = index < rects.length ? edgeRect.top : edgeRect.bottom;
      indicator.style.top = `${edge - parentRect.top}px`;
      if (indicatorLength) indicator.style.width = `${indicatorLength()}px`;
    }
  };

  const begin = () => {
    dragging = true;
    source.classList.add("is-dragging");
    document.body.classList.add("is-reordering");
    ghost = document.createElement("div");
    ghost.className = "reorder-ghost";
    ghost.textContent = label;
    document.body.append(ghost);
    indicator = document.createElement("div");
    indicator.className = `reorder-indicator is-${axis}`;
    indicatorParent.append(indicator);
  };

  const onMove = moveEvent => {
    point.x = moveEvent.clientX;
    point.y = moveEvent.clientY;
    if (!dragging) {
      if (Math.hypot(point.x - start.x, point.y - start.y) < REORDER_DRAG_THRESHOLD) return;
      begin();
    }
    update();
    onDragMove(point, update);
  };

  const finish = commit => {
    source.removeEventListener("pointermove", onMove);
    source.removeEventListener("pointerup", onUp);
    source.removeEventListener("pointercancel", onCancel);
    document.removeEventListener("keydown", onKey, true);
    if (!dragging) return;
    source.classList.remove("is-dragging");
    document.body.classList.remove("is-reordering");
    ghost.remove();
    indicator.remove();
    onDragEnd();
    // The pointerup that ends a drag is followed by a click on the source; don't treat it as one.
    const swallowClick = clickEvent => {
      clickEvent.stopImmediatePropagation();
      clickEvent.preventDefault();
    };
    source.addEventListener("click", swallowClick, { capture: true, once: true });
    setTimeout(() => source.removeEventListener("click", swallowClick, { capture: true }));
    if (commit && dropIndex !== -1) onDrop(fromIndex, dropIndex > fromIndex ? dropIndex - 1 : dropIndex);
  };
  const onUp = () => finish(true);
  const onCancel = () => finish(false);
  const onKey = keyEvent => {
    if (keyEvent.key !== "Escape" || !dragging) return;
    keyEvent.preventDefault();
    keyEvent.stopPropagation();
    if (source.hasPointerCapture(event.pointerId)) source.releasePointerCapture(event.pointerId);
    finish(false);
  };
  source.addEventListener("pointermove", onMove);
  source.addEventListener("pointerup", onUp);
  source.addEventListener("pointercancel", onCancel);
  document.addEventListener("keydown", onKey, true);
}

function showToast(title, { description = "", category = TOAST_CATEGORY_SUCCESS } = {}) {
  document.getElementById("toaster").toast({
    category,
    title,
    ...(description && { description }),
    duration: 3000,
    cancel: { label: "Dismiss" }
  });
}