(() => {
  document.querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", () => { location.href = button.dataset.route; });
  });
  const dialog = document.querySelector(".purchase-dialog");
  const title = dialog.querySelector("#dialog-title");
  const image = dialog.querySelector(".purchase-details img");
  const error = dialog.querySelector(".purchase-error");
  const confirmButton = dialog.querySelector(".confirm-purchase");
  const requestKey = "shineray-vip-purchase-request";
  let catalogReady = false;
  const pending = () => {
    try { return JSON.parse(sessionStorage.getItem(requestKey)); }
    catch { throw new Error("Le stockage du navigateur est indisponible. L’achat n’a pas été lancé."); }
  };
  let selectedCard = null;
  const format = (value) => new Intl.NumberFormat("fr-FR").format(Number(value));
  document.querySelectorAll('[data-purpose="buy-btn"]').forEach((button) => {
    button.addEventListener("click", () => {
      if (!catalogReady || button.disabled) return;
      selectedCard = button.closest(".product-card");
      title.textContent = selectedCard.dataset.name || selectedCard.dataset.vip;
      image.src = selectedCard.dataset.image;
      image.alt = `Camion IVECO — offre ${selectedCard.dataset.vip}`;
      dialog.querySelector("[data-detail-price]").textContent = `Prix:FCFA ${format(selectedCard.dataset.price)}`;
      dialog.querySelector("[data-detail-daily]").textContent = `Revenu quotidien:FCFA ${format(selectedCard.dataset.daily)}`;
      dialog.querySelector("[data-detail-total]").textContent = `Revenu total:FCFA ${format(selectedCard.dataset.total)}`;
      dialog.querySelector("[data-detail-days]").textContent = `Période de validité:${selectedCard.dataset.days} jour`;
      error.textContent = "";
      confirmButton.disabled = !catalogReady || selectedCard.dataset.available !== "true";
      try {
        const request = pending();
        if (request && request.productCode !== selectedCard.dataset.vip) {
          confirmButton.disabled = true;
          error.textContent = "Une autre demande d’achat doit être vérifiée dans vos produits avant de continuer.";
        } else if (request) {
          error.textContent = "Une demande existe déjà. Confirmer vérifie la même demande, sans second débit.";
        }
      } catch (reason) { error.textContent = reason.message; confirmButton.disabled = true; }
      dialog.showModal();
    });
  });
  dialog.querySelector(".cancel-purchase").addEventListener("click", () => dialog.close());
  confirmButton.addEventListener("click", async () => {
    if (!selectedCard || confirmButton.disabled) return;
    confirmButton.disabled = true;
    error.textContent = "Vérification de la disponibilité…";
    try {
      let request = pending();
      if (!request) {
        request = { productCode: selectedCard.dataset.vip, expectedPrice: Number(selectedCard.dataset.price),
          requestId: crypto.randomUUID() };
        sessionStorage.setItem(requestKey, JSON.stringify(request));
      }
      const response = await fetch("/api/products/purchase", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (response.status === 401) { location.replace("/connexion"); return; }
      const result = await response.json();
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) sessionStorage.removeItem(requestKey);
        throw new Error(result.error || "Achat indisponible.");
      }
      if (result.ok !== true || !result.purchaseId) throw new Error("Réponse d’achat invalide.");
      sessionStorage.removeItem(requestKey);
      error.textContent = `Achat confirmé. Solde restant : FCFA ${format(result.balance_fcfa)}.`;
      location.assign("/projet");
    } catch (reason) {
      error.textContent = reason instanceof TypeError || reason instanceof SyntaxError
        ? "Réponse interrompue. Vérifiez vos produits ou confirmez à nouveau la même demande : aucun second débit ne sera effectué."
        : reason.message || "Vérification de l’achat indisponible.";
    } finally {
      confirmButton.disabled = false;
    }
  });
  const buyButtons = document.querySelectorAll('[data-purpose="buy-btn"]');
  const catalogStatus = document.querySelector(".catalog-status");
  let loadVersion = 0;
  const clearCatalog = () => {
    catalogReady = false;
    confirmButton.disabled = true;
    buyButtons.forEach(button => {
      button.disabled = true;
      button.textContent = "ACHETER";
      const card = button.closest(".product-card");
      card.dataset.available = "false";
      ["price", "daily", "total", "days"].forEach(key => { delete card.dataset[key]; });
      card.querySelectorAll(".metrics strong").forEach(amount => { amount.textContent = "—"; });
      card.querySelector(".product-footer b").textContent = "—";
    });
  };
  const loadCatalog = async () => {
    const version = ++loadVersion;
    clearCatalog();
    if (dialog.open) dialog.close();
    catalogStatus.textContent = "Chargement du catalogue…";
    try {
    const response = await fetch("/api/products/catalog", {
      credentials: "include", cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    if (version !== loadVersion) return;
    if (response.status === 401) { location.replace("/connexion"); return; }
    const result = await response.json();
    if (version !== loadVersion) return;
    if (!response.ok || !Array.isArray(result.products)) throw new Error("Catalogue indisponible.");
    buyButtons.forEach(button => {
      const card = button.closest(".product-card");
      const product = result.products.find(value => value.code === card.dataset.vip);
      const valid = product && Number.isSafeInteger(product.price) && product.price > 0
        && Number.isSafeInteger(product.dailyIncome) && product.dailyIncome > 0
        && Number.isSafeInteger(product.totalIncome) && product.totalIncome >= product.dailyIncome
        && Number.isSafeInteger(product.durationDays) && product.durationDays > 0;
      const available = valid && product.active === true;
      card.dataset.available = String(Boolean(available));
      button.disabled = !available;
      if (valid) {
        card.dataset.name = product.name;
        card.querySelector("h2").textContent = product.name;
        card.dataset.price = String(product.price);
        card.dataset.daily = String(product.dailyIncome);
        card.dataset.total = String(product.totalIncome);
        card.dataset.days = String(product.durationDays);
        // Product cards and the purchase dialog must use the same server-side terms.
        const amounts = card.querySelectorAll(".metrics strong");
        if (amounts[0]) amounts[0].textContent = `FCFA ${format(product.dailyIncome)}`;
        if (amounts[1]) amounts[1].textContent = `FCFA ${format(product.totalIncome)}`;
        card.querySelector(".product-footer b").textContent = `FCFA ${format(product.price)}`;
      }
      if (!available) button.textContent = "INDISPONIBLE";
    });
    catalogReady = true;
    catalogStatus.textContent = "";
    } catch {
      if (version !== loadVersion) return;
      clearCatalog();
      catalogStatus.textContent = "Catalogue indisponible. Rechargez la page pour consulter les tarifs.";
    }
  };
  loadCatalog();
  window.addEventListener("pageshow", event => {
    if (event.persisted) loadCatalog();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") loadCatalog();
  });
})();
