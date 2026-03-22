const API_BASE = "https://celebrated-enjoyment-production.up.railway.app";
const HISTORY_LIMIT = 8;
const CLIENT_ID_KEY = "promptTranslatorClientId";
const HISTORY_KEY = "promptTranslatorHistory";

const elements = {
  sourcePrompt: document.getElementById("source-prompt"),
  sourceLanguage: document.getElementById("source-language"),
  targetLanguage: document.getElementById("target-language"),
  preserveSections: document.getElementById("preserve-sections"),
  addTranslationNote: document.getElementById("add-translation-note"),
  planBadge: document.getElementById("plan-badge"),
  quotaValue: document.getElementById("quota-value"),
  runtimeValue: document.getElementById("runtime-value"),
  accessMessage: document.getElementById("access-message"),
  redeemCode: document.getElementById("redeem-code"),
  redeemButton: document.getElementById("redeem-button"),
  checkoutLink: document.getElementById("checkout-link"),
  result: document.getElementById("result"),
  status: document.getElementById("status"),
  history: document.getElementById("history"),
  selectionMeta: document.getElementById("selection-meta"),
  translate: document.getElementById("translate"),
  copyResult: document.getElementById("copy-result"),
  clearHistory: document.getElementById("clear-history")
};

let clientId = "";
let accessState = null;

init();

async function init() {
  clientId = await getOrCreateClientId();
  await Promise.all([refreshAccess(), renderHistory()]);

  elements.translate.addEventListener("click", handleTranslate);
  elements.copyResult.addEventListener("click", handleCopy);
  elements.clearHistory.addEventListener("click", clearHistory);
  elements.redeemButton.addEventListener("click", handleRedeem);
}

async function getOrCreateClientId() {
  const stored = await chrome.storage.local.get(CLIENT_ID_KEY);
  if (stored[CLIENT_ID_KEY]) {
    return stored[CLIENT_ID_KEY];
  }

  const generated = `pt_${crypto.randomUUID().replaceAll("-", "")}`;
  await chrome.storage.local.set({ [CLIENT_ID_KEY]: generated });
  return generated;
}

async function refreshAccess() {
  try {
    const response = await postJson("/api/extension/status", { clientId });
    accessState = response;
    renderAccess(response);
  } catch (error) {
    renderAccess(null);
    elements.accessMessage.textContent = error.message || "Could not load access status.";
  }
}

function renderAccess(access) {
  const plan = access?.plan === "pro" ? "Pro" : "Free";
  const monthlyLimit = Number(access?.monthly_limit || 300);
  const monthlyRemaining = Math.max(0, Number(access?.monthly_remaining ?? monthlyLimit));
  const charLimit = Number(access?.char_limit || 2000);
  const monthlyPrice = Number(access?.pro_monthly_usd || 4.99);
  const yearlyPrice = Number(access?.pro_yearly_usd || 39);

  elements.planBadge.textContent = plan;
  elements.quotaValue.textContent = `${monthlyRemaining} / ${monthlyLimit}`;
  elements.runtimeValue.textContent = `${charLimit} chars`;
  elements.accessMessage.textContent = access?.message || "Connect your billing backend to continue.";

  const checkoutUrl = String(access?.checkout_url || "").trim();
  elements.checkoutLink.href = checkoutUrl || "#";
  elements.checkoutLink.textContent = `Upgrade to Pro $${monthlyPrice.toFixed(2)}/mo`;
  elements.checkoutLink.setAttribute("aria-disabled", checkoutUrl ? "false" : "true");
  elements.translate.disabled = access ? !access.can_use : false;
  if (!access?.can_use) {
    elements.status.textContent = `Free trial finished. Upgrade to Pro ($${monthlyPrice.toFixed(2)}/month, $${Math.round(yearlyPrice)}/year) to continue.`;
  }
}

async function handleTranslate() {
  const sourcePrompt = clean(elements.sourcePrompt.value);
  if (!sourcePrompt) {
    elements.status.textContent = "Paste a prompt first.";
    return;
  }
  const charLimit = Number(accessState?.char_limit || 2000);
  if (sourcePrompt.length > charLimit) {
    elements.status.textContent = `Keep the prompt under ${charLimit} characters.`;
    return;
  }

  setBusy(true, "Translating prompt...");

  try {
    const response = await postJson("/api/extension/prompt-translate", {
      clientId,
      text: sourcePrompt,
      sourceLanguage: elements.sourceLanguage.value,
      targetLanguage: elements.targetLanguage.value,
      preserveStructure: elements.preserveSections.checked
    });

    let output = String(response.translation || "").trim();
    if (elements.addTranslationNote.checked) {
      output = [
        output,
        "",
        elements.targetLanguage.value === "ko"
          ? "[검토 메모]\n실사용 전 목적과 출력 형식이 자연스러운지 한 번 더 확인하세요."
          : "[Review Note]\nCheck once more that the translated prompt still matches the intended task and output."
      ].join("\n");
    }

    elements.result.value = output;
    elements.status.textContent = "AI translation generated.";
    if (response.access) {
      accessState = response.access;
      renderAccess(response.access);
    }

    await saveHistory({
      createdAt: new Date().toISOString(),
      title: `${elements.sourceLanguage.value.toUpperCase()} -> ${elements.targetLanguage.value.toUpperCase()}`,
      prompt: output
    });
    await renderHistory();
  } catch (error) {
    elements.status.textContent = error.message || "Translation failed.";
    if (error.access) {
      accessState = error.access;
      renderAccess(error.access);
    }
  } finally {
    setBusy(false);
  }
}

async function handleRedeem() {
  const code = clean(elements.redeemCode.value);
  if (!code) {
    elements.status.textContent = "Enter a Pro code first.";
    return;
  }

  setBusy(true, "Applying Pro code...");
  try {
    const response = await postJson("/api/extension/redeem", { clientId, code });
    elements.redeemCode.value = "";
    elements.status.textContent = response.message || "Pro activated.";
    accessState = response.access || accessState;
    renderAccess(accessState);
  } catch (error) {
    elements.status.textContent = error.message || "Could not redeem that code.";
    if (error.access) {
      accessState = error.access;
      renderAccess(error.access);
    }
  } finally {
    setBusy(false);
  }
}

async function handleCopy() {
  if (!elements.result.value.trim()) {
    elements.status.textContent = "Translate a prompt first.";
    return;
  }

  await navigator.clipboard.writeText(elements.result.value);
  elements.status.textContent = "Translated prompt copied to clipboard.";
}

async function saveHistory(entry) {
  const stored = await chrome.storage.local.get(HISTORY_KEY);
  const history = Array.isArray(stored[HISTORY_KEY]) ? stored[HISTORY_KEY] : [];
  const nextHistory = [entry, ...history].slice(0, HISTORY_LIMIT);
  await chrome.storage.local.set({ [HISTORY_KEY]: nextHistory });
}

async function renderHistory() {
  const stored = await chrome.storage.local.get(HISTORY_KEY);
  const history = Array.isArray(stored[HISTORY_KEY]) ? stored[HISTORY_KEY] : [];

  if (!history.length) {
    elements.history.innerHTML = '<p class="empty">No recent translations yet.</p>';
    return;
  }

  elements.history.innerHTML = history.map((entry, index) => `
    <article class="history-card">
      <strong>${escapeHtml(entry.title || "Untitled translation")}</strong>
      <p class="meta">${escapeHtml(trim(entry.prompt, 96))}</p>
      <button type="button" data-history-index="${index}">Load</button>
    </article>
  `).join("");

  elements.history.querySelectorAll("[data-history-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = history[Number(button.dataset.historyIndex)];
      elements.result.value = target.prompt || "";
      elements.status.textContent = "Loaded a recent translation.";
    });
  });
}

async function clearHistory() {
  await chrome.storage.local.set({ [HISTORY_KEY]: [] });
  elements.result.value = "";
  elements.status.textContent = "Recent history cleared.";
  await renderHistory();
}

function setBusy(isBusy, message = "") {
  elements.translate.disabled = isBusy || Boolean(accessState && !accessState.can_use);
  elements.redeemButton.disabled = isBusy;
  if (message) {
    elements.status.textContent = message;
  }
}

async function postJson(path, payload) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || "Request failed");
    error.access = data.access || null;
    throw error;
  }
  return data;
}

function clean(value) {
  return String(value || "").trim();
}

function trim(value, maxLength) {
  const text = String(value || "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
