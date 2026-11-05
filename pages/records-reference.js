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
    const activities = getJson(`/api/activity?kind=${encodeURIComponent(kind)}`);
    // Pending requests are shown separately from settled ledger entries.
    const requests = kind === "recharge" ? getJson("/api/sonarapay/payments") : Promise.resolve({ payments: [] });
    Promise.all([activities, requests]).then(([payload, pending]) => {
      if (!Array.isArray(payload.activities)) throw new Error("Les données sont indisponibles.");
      payload.activities.push(...pending.payments.filter(payment => !payment.credited).map(payment => ({
        id: payment.id, amount_fcfa: payment.amount_fcfa, reference: payment.reference || payment.id,
        channel: payment.operator.operatorName, created_at: payment.created_at,
        status: payment.status === "failed" ? "failed" : "pending", payment_id: payment.id,
      })));
      payload.activities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      activityRoot.replaceChildren();
      payload.activities.forEach((item) => {
        const card = document.createElement("article");
        card.className = "reference-activity-card";
        card.dataset.activityId = String(item.id);
        const title = document.createElement("div");
        title.className = "reference-activity-title";
        const heading = document.createElement("span");
        const ledgerIcon = document.createElement("span");
        ledgerIcon.className = "reference-activity-icon";
        ledgerIcon.setAttribute("aria-hidden", "true");
        ledgerIcon.innerHTML = '<svg viewBox="0 0 24 24" focusable="false"><rect x="3" y="5" width="18" height="15" rx="2"></rect><path d="M3 9h18m-6 5h3"></path></svg>';
        heading.append(ledgerIcon, document.createTextNode(kind === "recharge" ? "Ordre de dépôt" : "Ordre de retrait"));
        const amount = document.createElement("strong");
        amount.textContent = formatMoney(item.amount_fcfa);
        title.append(heading, amount);
        card.append(title);
        const display = row("N° d’affichage", window.paymentDisplayNumber(item.reference || item.id), "payment-display-number");
        display.title = "Numéro de présentation uniquement, pas une référence opérateur.";
        card.append(display);
        if (kind === "recharge") card.append(row("Canal", item.channel || "Non renseigné"));
        else card.append(row("Montant reçu", formatMoney(item.net_amount_fcfa)));
        const state = String(item.status || "unknown");
        const stateLabel = { succeeded: "Succès", pending: kind === "recharge" ? "Recharge en cours" : "Retrait en cours", failed: "Échec", cancelled: "Annulé", unknown: "Non renseigné" }[state] || "Non renseigné";
        card.append(row("État", stateLabel, `reference-status`));
        card.lastElementChild.querySelector(".reference-activity-value").dataset.status = state;
        card.append(row("Temps", displayDate(item.created_at)));
        if (item.payment_id) {
          const follow = document.createElement("a");
          follow.href = "/confirmation-depot?payment=" + encodeURIComponent(item.payment_id);
          follow.textContent = "Suivre ce paiement";
          follow.className = "wallet-link";
          card.append(follow);
        }
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
  const iconPaths = {
    daily: '<path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1"/><circle cx="12" cy="12" r="4"/>',
    total: '<path d="M4 19V9m5 10V5m5 14v-7m5 7V3"/>',
    validity: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    bought: '<path d="M3 4h2l2.2 11h10.9l2-8H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
    paid: '<path d="M5 7h14v13H5zM7 7V5a2 2 0 0 1 2-2h9"/><path d="M8 12h8m-8 4h5"/>',
    next: '<path d="M4 5h16v15H4zM8 3v4m8-4v4M4 10h16"/><path d="m9 15 2 2 4-4"/>'
  };
  const field = (label, value, iconKey) => {
    const line = document.createElement("div");
    line.className = "owned-product-row";
    const icon = document.createElement("span");
    icon.className = "owned-product-row-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = `<svg viewBox="0 0 24 24" focusable="false">${iconPaths[iconKey]}</svg>`;
    const name = document.createElement("span");
    name.className = "owned-product-row-label";
    name.textContent = label;
    const valueNode = document.createElement("strong");
    valueNode.className = "owned-product-row-value";
    valueNode.textContent = value;
    line.append(icon, name, valueNode);
    return line;
  };
  const setLoading = () => {
    productRoot.setAttribute("aria-busy", "true");
    productRoot.innerHTML = '<div class="project-skeleton" aria-hidden="true"></div><div class="project-skeleton" aria-hidden="true"></div>';
    if (empty) empty.hidden = true;
    if (error) error.hidden = true;
  };
  const loadProducts = () => {
    setLoading();
    getJson("/api/products").then((payload) => {
      if (!Array.isArray(payload.products) || !Number.isSafeInteger(payload.quantity)) throw new Error("Les données de vos produits sont indisponibles.");
      if (quantity) quantity.textContent = String(payload.quantity);
      if (income) income.textContent = formatMoney(payload.income_fcfa);
      productRoot.replaceChildren();
      payload.products.forEach((product, index) => {
        const isGrant = product.source === "admin_grant";
        const article = document.createElement("article");
        article.className = "owned-product";
        article.dataset.productId = String(product.id);
        article.style.setProperty("--card-order", String(index));

        const image = document.createElement("img");
        const vip = Number(product.vip);
        image.src = vip === 1 ? "/pages/assets/narke-vip-gold.jpg" : "/pages/assets/narke-vip-blue.jpg";
        image.alt = "";
        image.className = "owned-product-image";
        image.loading = "lazy";

        const details = document.createElement("details");
        details.className = "owned-product-details";
        details.open = true;
        const summary = document.createElement("summary");
        summary.className = "owned-product-summary";
        const heading = document.createElement("span");
        heading.className = "owned-product-heading";
        const title = document.createElement("h2");
        title.className = "owned-product-title";
        title.textContent = product.name || "Produit";
        const origin = document.createElement("span");
        origin.className = `owned-product-origin${isGrant ? " is-grant" : ""}`;
        origin.textContent = isGrant ? "VIP octroyé" : "VIP acheté";
        const amount = document.createElement("strong");
        amount.className = "owned-product-price";
        amount.textContent = formatMoney(product.amount_fcfa);
        const chevron = document.createElement("span");
        chevron.className = "owned-product-chevron";
        chevron.setAttribute("aria-hidden", "true");
        chevron.textContent = "›";
        heading.append(title, origin);
        summary.append(heading, amount, chevron);

        const copy = document.createElement("div");
        copy.className = "owned-product-copy";
        const paid = isGrant ? "Non applicable" : formatMoney(product.income_fcfa);
        const next = isGrant
          ? "Non applicable"
          : product.next_income_at
            ? displayDate(product.next_income_at)
            : product.automatic_income_enabled ? "Cycle terminé" : "Configuration en attente";
        copy.append(
          field("Revenu quotidien", formatMoney(product.daily_income_fcfa), "daily"),
          field("Revenu total", formatMoney(product.total_income_fcfa), "total"),
          field("Période de validité", Number.isSafeInteger(product.validity_days) ? `${product.validity_days} jours` : "—", "validity"),
          field("Heure d’achat", displayDate(product.created_at), "bought"),
          field("Revenus déjà versés", paid, "paid"),
          field("Prochain versement", next, "next")
        );
        details.append(summary, copy);
        article.append(image, details);
        productRoot.append(article);
      });
      if (empty) empty.hidden = payload.products.length !== 0;
      if (payload.has_more === true && payload.products.length) {
        const notice = document.createElement("p");
        notice.className = "records-more";
        notice.textContent = "Les 100 produits les plus récents sont affichés.";
        productRoot.append(notice);
      }
    }).catch((failure) => {
      productRoot.replaceChildren();
      if (empty) empty.hidden = true;
      if (quantity) quantity.textContent = "—";
      if (income) income.textContent = "—";
      if (error) {
        error.replaceChildren();
        const message = document.createElement("span");
        message.textContent = failure.message || "Chargement impossible.";
        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "project-retry";
        retry.textContent = "Réessayer";
        retry.addEventListener("click", loadProducts, { once: true });
        error.append(message, retry);
        error.hidden = false;
      }
    }).finally(() => productRoot.setAttribute("aria-busy", "false"));
  };
  loadProducts();
})();
