const API_BASE = "https://celebrated-enjoyment-production.up.railway.app";
const HISTORY_LIMIT = 8;
const CLIENT_ID_KEY = "promptGeneratorClientId";
const HISTORY_KEY = "promptGeneratorHistory";

const elements = {
  goal: document.getElementById("goal"),
  task: document.getElementById("task"),
  resultShape: document.getElementById("result-shape"),
  context: document.getElementById("context"),
  tone: document.getElementById("tone"),
  outputFormat: document.getElementById("output-format"),
  constraints: document.getElementById("constraints"),
  includeChecklist: document.getElementById("include-checklist"),
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
  generate: document.getElementById("generate"),
  copyResult: document.getElementById("copy-result"),
  clearHistory: document.getElementById("clear-history")
};

let clientId = "";
let accessState = null;

init();

async function init() {
  clientId = await getOrCreateClientId();
  await Promise.all([refreshAccess(), renderHistory()]);

  elements.generate.addEventListener("click", handleGenerate);
  elements.copyResult.addEventListener("click", handleCopy);
  elements.clearHistory.addEventListener("click", clearHistory);
  elements.redeemButton.addEventListener("click", handleRedeem);
}

async function getOrCreateClientId() {
  const stored = await chrome.storage.local.get(CLIENT_ID_KEY);
  if (stored[CLIENT_ID_KEY]) {
    return stored[CLIENT_ID_KEY];
  }

  const generated = `pg_${crypto.randomUUID().replaceAll("-", "")}`;
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
  const monthlyUsed = Number(access?.monthly_used || 0);
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
  elements.generate.disabled = access ? !access.can_use : false;
  if (!access?.can_use) {
    elements.status.textContent = `Free trial finished. Upgrade to Pro ($${monthlyPrice.toFixed(2)}/month, $${Math.round(yearlyPrice)}/year) to continue.`;
  }
}

async function handleGenerate() {
  const goal = clean(elements.goal.value);
  const task = clean(elements.task.value);
  const resultShape = clean(elements.resultShape.value);
  const context = clean(elements.context.value);
  const constraints = clean(elements.constraints.value);
  const tone = elements.tone.value;
  const outputFormat = elements.outputFormat.value;
  const includeChecklist = elements.includeChecklist.checked;

  if (!goal || !task || !resultShape) {
    elements.status.textContent = "Fill in Goal, What should the AI do?, and What result do you want?";
    return;
  }
  const totalChars = [goal, task, resultShape, context, constraints].join("").length;
  const charLimit = Number(accessState?.char_limit || 2000);
  if (totalChars > charLimit) {
    elements.status.textContent = `Keep the total input under ${charLimit} characters.`;
    return;
  }

  const systemPrompt = [
    "You rewrite rough user requests into production-ready prompts.",
    "Keep the final prompt specific, structured, and practical.",
    "Prefer a compact structure with clear sections.",
    "Return only the final prompt with no explanation."
  ].join("\n");

  const userPrompt = [
    "[Goal]",
    goal,
    "",
    "[Task]",
    task,
    "",
    "[Result]",
    resultShape,
    "",
    "[Tone]",
    tone,
    "",
    "[Output Format]",
    outputFormat,
    "",
    "[Context]",
    context || "No extra context provided.",
    "",
    "[Constraints]",
    constraints || "Stay concise, concrete, and ready to paste into another AI tool.",
    "",
    "[Checklist]",
    includeChecklist ? "Include a short self-check section at the end." : "Do not add a self-check section."
  ].join("\n");

  setBusy(true, "Generating prompt...");

  try {
    const response = await postJson("/api/extension/prompt-tailor", {
      clientId,
      systemPrompt,
      userPrompt
    });

    elements.result.value = String(response.prompt || "").trim();
    elements.status.textContent = "AI prompt generated.";
    if (response.access) {
      accessState = response.access;
      renderAccess(response.access);
    }

    await saveHistory({
      createdAt: new Date().toISOString(),
      title: goal,
      prompt: elements.result.value
    });
    await renderHistory();
  } catch (error) {
    elements.status.textContent = error.message || "Prompt generation failed.";
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
    elements.status.textContent = "Generate a prompt first.";
    return;
  }

  await navigator.clipboard.writeText(elements.result.value);
  elements.status.textContent = "Prompt copied to clipboard.";
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
    elements.history.innerHTML = '<p class="empty">No recent prompts yet.</p>';
    return;
  }

  elements.history.innerHTML = history.map((entry, index) => `
    <article class="history-card">
      <strong>${escapeHtml(entry.title || "Untitled prompt")}</strong>
      <p class="meta">${escapeHtml(trim(entry.prompt, 96))}</p>
      <button type="button" data-history-index="${index}">Load</button>
    </article>
  `).join("");

  elements.history.querySelectorAll("[data-history-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = history[Number(button.dataset.historyIndex)];
      elements.result.value = target.prompt || "";
      elements.status.textContent = "Loaded a recent prompt.";
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
  elements.generate.disabled = isBusy || Boolean(accessState && !accessState.can_use);
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
