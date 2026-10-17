(() => {
  const money = new Intl.NumberFormat("en-US");
  const formatMoney = (value) => Number.isSafeInteger(value) ? `FCFA ${money.format(value)}` : "—";
  const displayDate = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? "—" : date.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  };
  const getJson = async (url) => {
    const response = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
    if (response.status === 401) location.replace("/connexion");
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Chargement impossible. Réessayez plus tard.");
    return payload;
  };
  const row = (label, value, className = "") => {
    const line = document.createElement("div");
    line.className = "reference-activity-row";
    const name = document.createElement("span");
    name.className = "reference-activity-label";
    name.textContent = label;
    const content = document.createElement("span");
    content.className = `reference-activity-value ${className}`.trim();
    content.textContent = value;
    line.append(name, content);
    return line;
  };
  const activityRoot = document.querySelector("[data-activity-list][data-activity-kind]");
  if (activityRoot) {
    const kind = activityRoot.dataset.activityKind;
    const empty = document.querySelector("[data-activity-empty]");
    const error = document.querySelector("[data-activity-error]");
    activityRoot.setAttribute("aria-busy", "true");
    activityRoot.innerHTML = '<div class="records-skeleton" aria-hidden="true"></div><div class="records-skeleton" aria-hidden="true"></div>';
    getJson(`/api/activity?kind=${encodeURIComponent(kind)}`).then((payload) => {
      if (!Array.isArray(payload.activities)) throw new Error("Les données sont indisponibles.");
      activityRoot.replaceChildren();
      payload.activities.forEach((item) => {
        const card = document.createElement("article");
        card.className = "reference-activity-card";
        card.dataset.activityId = String(item.id);
        const title = document.createElement("div");
        title.className = "reference-activity-title";
        const heading = document.createElement("span");
        heading.textContent = kind === "recharge" ? "Ordre de dépôt" : "Ordre de retrait";
        const amount = document.createElement("strong");
        amount.textContent = formatMoney(item.amount_fcfa);
        title.append(heading, amount);
        card.append(title, row("Réf. commande", item.reference || "—"));
        if (kind === "recharge") card.append(row("Canal", item.channel || "Non renseigné"));
        else card.append(row("Montant reçu", formatMoney(item.net_amount_fcfa)));
        const state = String(item.status || "unknown");
        const stateLabel = { succeeded: "Succès", pending: kind === "recharge" ? "Recharge en cours" : "Retrait en cours", failed: "Échec", cancelled: "Annulé", unknown: "Non renseigné" }[state] || "Non renseigné";
        card.append(row("État", stateLabel, `reference-status`));
        card.lastElementChild.querySelector(".reference-activity-value").dataset.status = state;
        card.append(row("Temps", displayDate(item.created_at)));
        activityRoot.append(card);
      });
      if (empty) empty.hidden = payload.activities.length !== 0;
      if (payload.activities.length && payload.has_more === false) {
        const end = document.createElement("p");
        end.className = "records-end";
        end.textContent = "Plus aucune donnée";
        activityRoot.append(end);
      } else if (payload.activities.length && payload.has_more === true) {
        const notice = document.createElement("p");
        notice.className = "records-more";
        notice.textContent = "Les 100 opérations les plus récentes sont affichées.";
        activityRoot.append(notice);
      }
    }).catch((failure) => {
      activityRoot.replaceChildren();
      if (empty) empty.hidden = true;
      if (error) { error.hidden = false; error.textContent = failure.message || "Chargement impossible."; }
    }).finally(() => activityRoot.setAttribute("aria-busy", "false"));
  }

  const productRoot = document.querySelector("[data-products-list]");
  if (!productRoot) return;
  const empty = document.querySelector("[data-products-empty]");
  const error = document.querySelector("[data-products-error]");
  const quantity = document.querySelector("[data-purchase-count]");
  const income = document.querySelector("[data-purchase-total]");
  productRoot.setAttribute("aria-busy", "true");
  productRoot.innerHTML = '<div class="records-skeleton" aria-hidden="true"></div>';
  const field = (label, value) => {
    const p = document.createElement("p");
    p.textContent = `${label} : ${value}`;
    return p;
  };
  getJson("/api/products").then((payload) => {
    if (!Array.isArray(payload.products) || !Number.isSafeInteger(payload.quantity)) throw new Error("Les données de vos achats sont indisponibles.");
    if (quantity) quantity.textContent = String(payload.quantity);
    if (income) income.textContent = formatMoney(payload.income_fcfa);
    productRoot.replaceChildren();
    payload.products.forEach((product) => {
      const article = document.createElement("article");
      article.className = "owned-product";
      article.dataset.productId = String(product.id);
      const image = document.createElement("img");
      const vip = Number(product.vip);
      image.src = `/pages/assets/vip-${Number.isInteger(vip) && vip >= 1 && vip <= 6 ? vip : 1}.jpg`;
      image.alt = "";
      image.className = "owned-product-image";
      const copy = document.createElement("div");
      copy.className = "owned-product-copy";
      const heading = document.createElement("h2");
      heading.className = "owned-product-heading";
      const name = document.createElement("span");
      name.textContent = product.name || "Produit";
      const amount = document.createElement("strong");
      amount.textContent = formatMoney(product.amount_fcfa);
      heading.append(name, amount);
      copy.append(heading,
        field("Revenu quotidien", formatMoney(product.daily_income_fcfa)),
        field("Revenu total", formatMoney(product.total_income_fcfa)),
        field("Période de validité", Number.isSafeInteger(product.validity_days) ? `${product.validity_days} jours` : "—"),
        field("Heure d'achat", displayDate(product.created_at)));
      article.append(image, copy);
      productRoot.append(article);
    });
    if (empty) empty.hidden = payload.products.length !== 0;
    if (payload.has_more === true && payload.products.length) {
      const notice = document.createElement("p");
      notice.className = "records-more";
      notice.textContent = "Les 100 achats les plus récents sont affichés.";
      productRoot.append(notice);
    }
  }).catch((failure) => {
    productRoot.replaceChildren();
    if (empty) empty.hidden = true;
    if (quantity) quantity.textContent = "—";
    if (income) income.textContent = "—";
    if (error) { error.hidden = false; error.textContent = failure.message || "Chargement impossible."; }
  }).finally(() => productRoot.setAttribute("aria-busy", "false"));
})();
