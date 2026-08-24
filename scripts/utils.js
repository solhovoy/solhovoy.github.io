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

function showToast(title, { description = "", category = TOAST_CATEGORY_SUCCESS } = {}) {
  document.getElementById("toaster").toast({
    category,
    title,
    ...(description && { description }),
    duration: 3000,
    cancel: { label: "Dismiss" }
  });
}