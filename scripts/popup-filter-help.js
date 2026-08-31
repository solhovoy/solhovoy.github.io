class FilterHelpPopup {
  constructor({ popupManager, onSelect }) {
    const popup = document.getElementById("filter-help-popup");
    const trigger = document.getElementById("filter-help-btn");
    const closeButton = document.getElementById("filter-help-close");

    popupManager.register({
      name: "filter-help",
      popup,
      trigger,
      onOpen: () => positionPopup(popup, trigger, 420, { offset: 9 })
    });

    trigger.addEventListener("click", event => {
      event.stopPropagation();
      popupManager.toggle("filter-help");
    });
    closeButton.addEventListener("click", () => popupManager.close("filter-help"));
    popup.querySelectorAll(".filter-examples li code").forEach(example => {
      example.addEventListener("click", () => {
        onSelect(example.textContent);
        popupManager.close("filter-help");
      });
    });
  }
}