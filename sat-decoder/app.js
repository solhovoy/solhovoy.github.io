const tokenInput = document.querySelector("#token-input");
const emptyState = document.querySelector("#empty-state");
const resultContent = document.querySelector("#result-content");
const headerOutput = document.querySelector("#header-output");
const payloadOutput = document.querySelector("#payload-output");
const claimSummary = document.querySelector("#claim-summary");
const expiryBadge = document.querySelector("#expiry-badge");
const errorMessage = document.querySelector("#error-message");
const inputStatus = document.querySelector("#input-status");
const tokenMeta = document.querySelector("#token-meta");
const clearButton = document.querySelector("#clear-button");
const copyButton = document.querySelector("#copy-button");

let decodedToken = null;

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

function renderClaims(payload) {
  const details = [];
  if (payload.sub) details.push(["sub", payload.sub]);
  if (payload.iss) details.push(["iss", payload.iss]);
  if (payload.exp) details.push(["exp", formatDate(payload.exp)]);

  claimSummary.replaceChildren(
    ...details.map(([key, value]) => {
      const card = document.createElement("div");
      card.className = "claim-card";
      const name = document.createElement("strong");
      name.textContent = key;
      const text = document.createElement("span");
      text.textContent = value;
      card.append(name, text);
      return card;
    }),
  );
}

function renderExpiry(payload) {
  if (!payload.exp) {
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
  errorMessage.hidden = true;
  inputStatus.textContent = "Waiting";
  inputStatus.className = "status-dot";
  tokenMeta.textContent = "Bearer JWT format supported";
  clearButton.disabled = true;
  copyButton.disabled = true;
}

function showError(error) {
  decodedToken = null;
  emptyState.hidden = true;
  resultContent.hidden = true;
  errorMessage.textContent = error.message;
  errorMessage.hidden = false;
  inputStatus.textContent = "Error";
  inputStatus.className = "status-dot is-error";
  tokenMeta.textContent = "Check the token and try again";
  clearButton.disabled = false;
  copyButton.disabled = true;
}

function decodeInput() {
  const value = tokenInput.value;

  if (!value.trim()) {
    resetView();
    return;
  }

  try {
    decodedToken = parseToken(value);
    headerOutput.textContent = JSON.stringify(decodedToken.header, null, 2);
    payloadOutput.textContent = JSON.stringify(decodedToken.payload, null, 2);
    renderClaims(decodedToken.payload);
    renderExpiry(decodedToken.payload);
    emptyState.hidden = true;
    resultContent.hidden = false;
    errorMessage.hidden = true;
    inputStatus.textContent = "Ready";
    inputStatus.className = "status-dot is-ready";
    tokenMeta.textContent = `${decodedToken.segments} JWT segments · signature not verified`;
    clearButton.disabled = false;
    copyButton.disabled = false;
  } catch (error) {
    showError(error);
  }
}

tokenInput.addEventListener("input", decodeInput);

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