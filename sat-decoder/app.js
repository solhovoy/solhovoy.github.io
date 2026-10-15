const tokenInput = document.querySelector("#token-input");
const emptyState = document.querySelector("#empty-state");
const resultContent = document.querySelector("#result-content");
const headerMeta = document.querySelector("#header-meta");
const payloadOutput = document.querySelector("#payload-output");
const expiryBadge = document.querySelector("#expiry-badge");
const headingActions = document.querySelector("#heading-actions");
const errorMessage = document.querySelector("#error-message");
const inputStatus = document.querySelector("#input-status");
const tokenMeta = document.querySelector("#token-meta");
const clearButton = document.querySelector("#clear-button");
const copyButton = document.querySelector("#copy-button");
const viewToggle = document.querySelector("#view-toggle");

let decodedToken = null;
let currentView = "payload";

function renderJson() {
  if (!decodedToken) return;
  const nextView = currentView === "payload" ? "header" : "payload";
  payloadOutput.textContent = JSON.stringify(decodedToken[currentView], null, 2);
  viewToggle.textContent = nextView;
  viewToggle.title = `Show ${nextView}`;
  viewToggle.setAttribute("aria-label", `Showing ${currentView}. Show ${nextView}`);
}

function decodeBase64Url(segment) {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function parseToken(value) {
  const token = value.trim().replace(/^Bearer\s+/i, "");
  const segments = token.split(".");

  if (segments.length < 2 || !segments[0] || !segments[1]) {
    throw new Error("Use a JWT with two or three dot-separated segments.");
  }

  try {
    return {
      header: JSON.parse(decodeBase64Url(segments[0])),
      payload: JSON.parse(decodeBase64Url(segments[1])),
      segments: segments.length,
    };
  } catch {
    throw new Error("Could not read the header or payload. Check the token format.");
  }
}

function formatDate(unixTime) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(unixTime * 1000));
}

function createChip(label, value, className = "") {
  const chip = document.createElement("span");
  chip.className = `meta-chip ${className}`.trim();
  if (label) {
    const name = document.createElement("span");
    name.className = "meta-chip-key";
    name.textContent = label;
    chip.append(name);
  }
  chip.append(document.createTextNode(String(value)));
  return chip;
}

function createTimeChip(label, unixTime) {
  const chip = createChip(label, formatDate(unixTime), "meta-chip-time");
  chip.title = String(unixTime);
  return chip;
}

function renderMeta(header, payload) {
  const chips = [];
  if (header.alg) chips.push(createChip("", header.alg, "meta-chip-strong"));
  if (header.typ) chips.push(createChip("", header.typ));

  for (const [key, value] of Object.entries(header)) {
    if (["alg", "typ", "kid"].includes(key)) continue;
    const text = typeof value === "object" ? JSON.stringify(value) : value;
    chips.push(createChip(key, text));
  }

  if (typeof payload.iat === "number") {
    chips.push(createTimeChip("iat", payload.iat));
  } else if (typeof payload.nbf === "number") {
    chips.push(createTimeChip("nbf", payload.nbf));
  }
  if (typeof payload.exp === "number") chips.push(createTimeChip("exp", payload.exp));

  headerMeta.replaceChildren(...chips);
}

function renderExpiry(payload) {
  if (typeof payload.exp !== "number") {
    expiryBadge.textContent = "NO EXP";
    expiryBadge.className = "chip chip-header";
    return;
  }

  const isExpired = payload.exp * 1000 < Date.now();
  expiryBadge.textContent = isExpired ? "EXPIRED" : "ACTIVE";
  expiryBadge.className = `chip ${isExpired ? "chip-expired" : "chip-valid"}`;
}

function resetView() {
  decodedToken = null;
  emptyState.hidden = false;
  resultContent.hidden = true;
  headingActions.hidden = true;
  errorMessage.hidden = true;
  inputStatus.textContent = "Waiting";
  inputStatus.className = "status-dot";
  tokenMeta.textContent = "Bearer JWT format supported";
  clearButton.disabled = true;
  copyButton.disabled = true;
  viewToggle.disabled = true;
}

function showError(error) {
  decodedToken = null;
  emptyState.hidden = true;
  resultContent.hidden = true;
  headingActions.hidden = true;
  errorMessage.textContent = error.message;
  errorMessage.hidden = false;
  inputStatus.textContent = "Error";
  inputStatus.className = "status-dot is-error";
  tokenMeta.textContent = "Check the token and try again";
  clearButton.disabled = false;
  copyButton.disabled = true;
  viewToggle.disabled = true;
}

function decodeInput() {
  const value = tokenInput.value;

  if (!value.trim()) {
    resetView();
    return;
  }

  try {
    decodedToken = parseToken(value);
    renderMeta(decodedToken.header, decodedToken.payload);
    renderJson();
    renderExpiry(decodedToken.payload);
    emptyState.hidden = true;
    resultContent.hidden = false;
    headingActions.hidden = false;
    errorMessage.hidden = true;
    inputStatus.textContent = "Ready";
    inputStatus.className = "status-dot is-ready";
    tokenMeta.textContent = `${decodedToken.segments} JWT segments · signature not verified`;
    clearButton.disabled = false;
    copyButton.disabled = false;
    viewToggle.disabled = false;
  } catch (error) {
    showError(error);
  }
}

tokenInput.addEventListener("input", decodeInput);

viewToggle.addEventListener("click", () => {
  currentView = currentView === "payload" ? "header" : "payload";
  renderJson();
  payloadOutput.scrollTop = 0;
});

clearButton.addEventListener("click", () => {
  tokenInput.value = "";
  tokenInput.focus();
  resetView();
});

copyButton.addEventListener("click", async () => {
  if (!decodedToken) return;

  const text = JSON.stringify(
    { header: decodedToken.header, payload: decodedToken.payload },
    null,
    2,
  );

  try {
    await navigator.clipboard.writeText(text);
    copyButton.title = "Copied";
    setTimeout(() => {
      copyButton.title = "Copy JSON";
    }, 1500);
  } catch {
    copyButton.title = "Copy failed";
  }
});

resetView();