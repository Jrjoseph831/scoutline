const form = document.querySelector("#report-form");
const statusNode = document.querySelector("#report-status");
form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusNode.textContent = "Sending…";
  const config = await fetch("/config.json").then((response) => response.json());
  const body = Object.fromEntries(new FormData(form).entries());
  try {
    const response = await fetch(`${config.apiUrl}/reports`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The report could not be submitted.");
    form.reset();
    statusNode.textContent = `Report received. Moderation reference: ${result.reportId}`;
  } catch (error) {
    statusNode.textContent = error.message;
  }
});
