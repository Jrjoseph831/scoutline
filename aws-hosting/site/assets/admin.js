const queue = document.querySelector("#moderation-queue");
const count = document.querySelector("#queue-count");
const authButton = document.querySelector("#auth-button");
const encoder = new TextEncoder();
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
let config;

async function beginLogin() {
  const verifier = b64(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64(await crypto.subtle.digest("SHA-256", encoder.encode(verifier)));
  sessionStorage.setItem("pkceVerifier", verifier);
  const redirect = `${location.origin}/admin/`;
  location.href = `${config.adminAuthDomain}/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(config.adminClientId)}&redirect_uri=${encodeURIComponent(redirect)}&scope=openid+email&code_challenge_method=S256&code_challenge=${challenge}`;
}

async function exchangeCode(code) {
  const verifier = sessionStorage.getItem("pkceVerifier");
  const body = new URLSearchParams({ grant_type: "authorization_code", client_id: config.adminClientId, code, redirect_uri: `${location.origin}/admin/`, code_verifier: verifier });
  const response = await fetch(`${config.adminAuthDomain}/oauth2/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  const tokens = await response.json();
  if (!response.ok) throw new Error(tokens.error_description || "Sign-in failed");
  localStorage.setItem("adminAccessToken", tokens.access_token);
  history.replaceState({}, "", "/admin/");
}

const token = () => localStorage.getItem("adminAccessToken");
async function api(path, options = {}) {
  const response = await fetch(`${config.apiUrl}${path}`, { ...options, headers: { "content-type": "application/json", authorization: `Bearer ${token()}`, ...(options.headers || {}) } });
  if (response.status === 401 || response.status === 403) throw new Error("Your account does not have Scoutline administrator access.");
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed");
  return result;
}

function card(item) {
  const warnings = (item.warningSigns || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("");
  const steps = (item.actionSteps || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("");
  return `<article class="moderation-card" data-id="${escapeHtml(item.candidateId)}"><span class="eyebrow">${escapeHtml(item.publicationState || item.verificationState)}</span><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.summary || item.reportedText || "")}</p><div class="detail-columns"><section><h3>Warning signs</h3><ul>${warnings || "<li>Not supplied</li>"}</ul></section><section><h3>Protective steps</h3><ol>${steps || "<li>Not supplied</li>"}</ol></section></div><small>${escapeHtml(item.sourceType)} · ${escapeHtml(item.location?.city || "")} ${escapeHtml(item.location?.state || "")} ${escapeHtml(item.location?.postalCode || "")}</small><div class="modal-actions"><button class="button" data-action="approve">Publish unverified</button><button class="button secondary" data-action="reject">Reject</button></div></article>`;
}

async function loadQueue() {
  if (!token()) { count.textContent = "Sign in to load the queue."; queue.innerHTML = ""; return; }
  try {
    const { items } = await api("/admin/reports");
    const pending = items.filter((item) => item.publicationState === "pending-moderation" || (item.sourceType === "community" && item.publicationState !== "rejected" && item.moderationState !== "approved"));
    count.textContent = `${pending.length} community reports`;
    queue.innerHTML = pending.map(card).join("") || "<p>No community reports are waiting.</p>";
  } catch (error) { count.textContent = error.message; }
}

queue?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const article = button.closest("[data-id]");
  button.disabled = true;
  try {
    await api(`/admin/reports/${encodeURIComponent(article.dataset.id)}`, { method: "PATCH", body: JSON.stringify({ action: button.dataset.action }) });
    article.remove();
  } catch (error) { alert(error.message); button.disabled = false; }
});

(async () => {
  config = await fetch("/config.json").then((response) => response.json());
  const code = new URLSearchParams(location.search).get("code");
  if (code) await exchangeCode(code);
  authButton.textContent = token() ? "Sign out" : "Sign in";
  authButton.addEventListener("click", () => {
    if (token()) { localStorage.removeItem("adminAccessToken"); location.reload(); } else beginLogin();
  });
  document.querySelector("#refresh-queue")?.addEventListener("click", loadQueue);
  loadQueue();
})().catch((error) => { count.textContent = error.message; });
