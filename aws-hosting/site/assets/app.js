const state = { items: [], selected: null, material: "poster" };
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
const sourceLine = (item) => `<small>Source: <a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(item.sourcePublisher)}</a> · ${escapeHtml(item.sourceCount)} evidence source${item.sourceCount === 1 ? "" : "s"}</small>`;

async function getScams() {
  const config = await fetch("/config.json").then((response) => response.json());
  const response = await fetch(`${config.apiUrl}/scams`);
  if (!response.ok) throw new Error("Scam service unavailable");
  return response.json();
}

function renderHome(items) {
  const target = document.querySelector("#recent-guides");
  if (!target) return;
  target.innerHTML = items.slice(0, 3).map((item) => `<article class="guide-card"><span>${escapeHtml(item.status)}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary)}</p>${sourceLine(item)}<a href="/library/?scam=${encodeURIComponent(item.slug)}">Read the guide →</a></article>`).join("");
}

function renderLibrary(items) {
  const grid = document.querySelector("#library-grid");
  if (!grid) return;
  const categorySelect = document.querySelector("#category");
  if (categorySelect && !categorySelect.dataset.ready) {
    const known = new Set([...categorySelect.options].map((option) => option.value));
    [...new Set(items.map((item) => item.category))].sort().forEach((value) => {
      if (known.has(value)) return;
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
      categorySelect.append(option);
    });
    categorySelect.dataset.ready = "true";
  }
  const query = (document.querySelector("#search")?.value || "").toLowerCase();
  const category = categorySelect?.value || "all";
  const filtered = items.filter((item) => {
    const haystack = `${item.title} ${item.summary} ${item.category} ${item.impersonates || ""}`.toLowerCase();
    return (!query || haystack.includes(query)) && (category === "all" || item.category === category);
  });
  document.querySelector("#result-count").textContent = `${filtered.length} source-backed guides`;
  grid.innerHTML = filtered.map((item) => `<button class="guide-card library-card" data-slug="${escapeHtml(item.slug)}"><span>${escapeHtml(item.category)}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary)}</p>${sourceLine(item)}<b>Open guide →</b></button>`).join("");
  grid.querySelectorAll("[data-slug]").forEach((button) => button.addEventListener("click", () => openDetail(button.dataset.slug)));
}

function openDetail(slug) {
  const item = state.items.find((candidate) => candidate.slug === slug);
  const modal = document.querySelector("#detail");
  if (!item || !modal) return;
  modal.innerHTML = `<div class="modal-card"><button class="modal-close" aria-label="Close">×</button><span class="eyebrow">${escapeHtml(item.category)}</span><h2>${escapeHtml(item.title)}</h2><p class="lead">${escapeHtml(item.summary)}</p><div class="detail-columns"><section><h3>Warning signs</h3><ul>${item.warningSigns.map((sign) => `<li>${escapeHtml(sign)}</li>`).join("")}</ul></section><section><h3>What to do</h3><ol>${item.actionSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol></section></div><blockquote>“${escapeHtml(item.responseScript || "I will verify this independently before responding.")}”</blockquote>${sourceLine(item)}<div class="modal-actions"><a class="button secondary" href="/toolkit/?scam=${encodeURIComponent(item.slug)}">Create safety kit</a><a class="button" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">Original source</a></div></div>`;
  modal.hidden = false;
  modal.querySelector(".modal-close").addEventListener("click", () => { modal.hidden = true; });
}

function renderToolkit(items) {
  const select = document.querySelector("#kit-select");
  if (!select) return;
  const requested = new URLSearchParams(location.search).get("scam");
  select.innerHTML = items.map((item) => `<option value="${escapeHtml(item.slug)}">${escapeHtml(item.title)}</option>`).join("");
  select.value = items.some((item) => item.slug === requested) ? requested : items[0]?.slug || "";
  const update = () => { state.selected = items.find((item) => item.slug === select.value); renderMaterial(); };
  select.addEventListener("change", update);
  document.querySelectorAll("[data-material]").forEach((button) => button.addEventListener("click", () => {
    state.material = button.dataset.material;
    document.querySelectorAll("[data-material]").forEach((candidate) => candidate.setAttribute("aria-selected", String(candidate === button)));
    renderMaterial();
  }));
  document.querySelector("#print-kit")?.addEventListener("click", () => print());
  document.querySelector("#download-kit")?.addEventListener("click", downloadKit);
  update();
}

function renderMaterial() {
  const item = state.selected;
  const sheet = document.querySelector("#kit-sheet");
  if (!item || !sheet) return;
  const warnings = item.warningSigns.slice(0, 4).map((value) => `<li>${escapeHtml(value)}</li>`).join("");
  const steps = item.actionSteps.slice(0, 4).map((value) => `<li>${escapeHtml(value)}</li>`).join("");
  const script = escapeHtml(item.responseScript || "I will verify this independently before responding.");
  const templates = {
    poster: `<span class="eyebrow">SCAM ALERT</span><h2>${escapeHtml(item.title)}</h2><p class="lead">${escapeHtml(item.summary)}</p><h3>Stop if you notice:</h3><ul>${warnings}</ul><div class="stop-box"><b>PAUSE. VERIFY. THEN RESPOND.</b><p>Use a phone number or website you already trust.</p></div>`,
    response: `<span class="eyebrow">KEEP BY THE PHONE</span><h2>${escapeHtml(item.title)}</h2><blockquote>“${script}”</blockquote><ol>${steps}</ol><div class="stop-box"><b>You are allowed to hang up, pause, and ask someone you trust.</b></div>`,
    discussion: `<span class="eyebrow">15-MINUTE DISCUSSION GUIDE</span><h2>${escapeHtml(item.title)}</h2><h3>2 MIN · Read</h3><p>${escapeHtml(item.summary)}</p><h3>4 MIN · Spot</h3><ul>${warnings}</ul><h3>5 MIN · Practice</h3><blockquote>“${script}”</blockquote><h3>4 MIN · Commit</h3><p>Name one trusted person or official source you would contact before acting.</p>`,
    brief: `<span class="eyebrow">COMMUNITY SAFETY BRIEF</span><h2>${escapeHtml(item.title)}</h2><p class="lead">${escapeHtml(item.summary)}</p><div class="detail-columns"><section><h3>Warning signs</h3><ul>${warnings}</ul></section><section><h3>What to do</h3><ol>${steps}</ol></section></div><blockquote>“${script}”</blockquote>`,
  };
  sheet.innerHTML = `<header><b>SCOUTLINE SAFETY KIT</b><span>SOURCE-BACKED</span></header>${templates[state.material]}<footer>${sourceLine(item)}</footer>`;
}

function downloadKit() {
  const item = state.selected;
  if (!item) return;
  const text = ["SCOUTLINE SAFETY KIT", item.title, "", item.summary, "", "WARNING SIGNS", ...item.warningSigns.map((x) => `- ${x}`), "", "WHAT TO DO", ...item.actionSteps.map((x, i) => `${i + 1}. ${x}`), "", "WHAT TO SAY", item.responseScript || "", "", `Source: ${item.sourcePublisher}`, item.sourceUrl].join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  Object.assign(document.createElement("a"), { href: url, download: `${item.slug}-safety-kit.txt` }).click();
  URL.revokeObjectURL(url);
}

getScams().then(({ items }) => {
  state.items = items;
  renderHome(items);
  renderLibrary(items);
  renderToolkit(items);
  document.querySelector("#search")?.addEventListener("input", () => renderLibrary(items));
  document.querySelector("#category")?.addEventListener("change", () => renderLibrary(items));
  const requested = new URLSearchParams(location.search).get("scam");
  if (requested && document.querySelector("#detail")) openDetail(requested);
}).catch(() => document.querySelectorAll("[data-loading]").forEach((node) => { node.textContent = "The verified scam service is temporarily unavailable. No placeholder data is shown."; }));
