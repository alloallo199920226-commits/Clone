/* Read the same current catalogue as Home. Never use an illustration or
   yesterday's cached prices as financial data. No purchase is made here. */
(() => {
  const rows = document.querySelector("[data-investment-rows]");
  const status = document.querySelector("[data-investment-status]");
  const retry = document.querySelector("[data-investment-retry]");
  if (!rows || !status || !retry) return;
  const formatter = new Intl.NumberFormat("fr-FR");
  let loading = false;
  const valid = product => product && /^VIP\d+$/i.test(product.code)
    && ["price", "dailyIncome", "totalIncome", "durationDays"].every(key =>
      Number.isSafeInteger(product[key]) && product[key] > 0);
  async function load() {
    if (loading) return;
    loading = true;
    rows.replaceChildren();
    rows.closest("table").setAttribute("aria-busy", "true");
    retry.hidden = true;
    status.textContent = "Chargement des offres…";
    try {
      const response = await fetch("/api/products/catalog", {
        credentials: "include", cache: "no-store", signal: AbortSignal.timeout(15000),
      });
      if (response.status === 401) { location.replace("/connexion"); return; }
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.products) || !result.products.every(valid))
        throw new Error("Invalid catalogue");
      const fragment = document.createDocumentFragment();
      [...result.products].sort((a,b) => a.code.localeCompare(b.code, "fr", { numeric: true })).forEach(product => {
        const row = document.createElement("tr");
        const name = document.createElement("th");
        name.scope = "row";
        name.textContent = product.code.toUpperCase();
        row.append(name);
        [formatter.format(product.price), formatter.format(product.dailyIncome),
          formatter.format(product.totalIncome), `${formatter.format(product.durationDays)} jours`].forEach(value => {
          const cell = document.createElement("td");
          cell.textContent = value;
          row.append(cell);
        });
        fragment.append(row);
      });
      rows.append(fragment);
      status.textContent = result.products.length
        ? "Conditions actuelles du catalogue · Montants en FCFA."
        : "Aucune offre VIP n’est actuellement disponible.";
    } catch {
      status.textContent = "Impossible de charger les investissements. Aucun ancien tarif n’est affiché. Veuillez réessayer.";
      retry.hidden = false;
    } finally {
      loading = false;
      rows.closest("table").setAttribute("aria-busy", "false");
    }
  }
  retry.addEventListener("click", load);
  window.addEventListener("pageshow", event => { if (event.persisted) load(); });
  load();
})();
