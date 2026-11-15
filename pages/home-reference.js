(() => {
  const menu = document.querySelector(".home-menu");
  const menuToggle = document.querySelector("[data-menu-toggle]");
  if (menu && menuToggle) {
    menuToggle.addEventListener("click", () => {
      menu.showModal();
      menuToggle.setAttribute("aria-expanded", "true");
    });
    menu.querySelector("[data-menu-close]")?.addEventListener("click", () => menu.close());
    menu.addEventListener("close", () => menuToggle.setAttribute("aria-expanded", "false"));
    menu.addEventListener("click", event => {
      const box = menu.getBoundingClientRect();
      if (event.target === menu && (event.clientX < box.left || event.clientX > box.right ||
          event.clientY < box.top || event.clientY > box.bottom)) menu.close();
    });
  }
  const hero = document.querySelector(".home-hero");
  const slides = [...document.querySelectorAll(".hero-slide")];
  const dots = [...document.querySelectorAll("[data-slide]")];
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let activeSlide = 0;
  let carouselTimer;
  const selectSlide = index => {
    if (!slides.length) return;
    activeSlide = (index + slides.length) % slides.length;
    slides.forEach((slide, position) => {
      slide.classList.toggle("is-active", position === activeSlide);
      slide.setAttribute("aria-hidden", String(position !== activeSlide));
    });
    dots.forEach((dot, position) => {
      dot.classList.toggle("is-active", position === activeSlide);
      dot.setAttribute("aria-pressed", String(position === activeSlide));
    });
  };
  const pauseCarousel = () => window.clearInterval(carouselTimer);
  const startCarousel = () => {
    pauseCarousel();
    if (slides.length > 1 && !motion.matches && !document.hidden &&
        !hero?.matches(":focus-within")) {
      carouselTimer = window.setInterval(() => selectSlide(activeSlide + 1), 6500);
    }
  };
  dots.forEach((dot, index) => {
    dot.addEventListener("click", () => { selectSlide(index); startCarousel(); });
    dot.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      selectSlide(activeSlide + (event.key === "ArrowRight" ? 1 : -1));
      dots[activeSlide]?.focus();
    });
  });
  let pointerStart;
  hero?.addEventListener("pointerdown", event => {
    pointerStart = {x: event.clientX, y: event.clientY};
    pauseCarousel();
  });
  hero?.addEventListener("pointercancel", () => { pointerStart = null; startCarousel(); });
  hero?.addEventListener("pointerup", event => {
    if (pointerStart && Math.abs(event.clientX - pointerStart.x) > 40 &&
        Math.abs(event.clientY - pointerStart.y) < 70) {
      selectSlide(activeSlide + (event.clientX < pointerStart.x ? 1 : -1));
    }
    pointerStart = null;
    startCarousel();
  });
  hero?.addEventListener("mouseenter", pauseCarousel);
  hero?.addEventListener("mouseleave", startCarousel);
  hero?.addEventListener("focusin", pauseCarousel);
  hero?.addEventListener("focusout", () => window.setTimeout(startCarousel, 0));
  window.addEventListener("pagehide", pauseCarousel);
  window.addEventListener("pageshow", startCarousel);
  document.addEventListener("visibilitychange", startCarousel);
  motion.addEventListener("change", startCarousel);
  selectSlide(0);
  startCarousel();
  const showAll = document.querySelector("[data-show-all]");
  const grid = document.querySelector(".product-grid");
  const cardTemplate = grid.querySelector(".product-card").cloneNode(true);
  document.querySelectorAll(".product-card").forEach(card => { card.hidden = false; });
  showAll?.setAttribute("aria-expanded", "true");
  showAll?.addEventListener("click", () => {
    grid.scrollIntoView({ behavior: motion.matches ? "auto" : "smooth", block: "start" });
  });
  const favoritesKey = "ebike-home-favorites";
  let favorites = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(favoritesKey) || "[]");
    if (Array.isArray(saved)) favorites = new Set(saved.filter(value => typeof value === "string"));
  } catch { /* Favorites are optional; catalog and purchasing stay available. */ }
  const updateFavorite = button => {
    const card = button.closest(".product-card");
    const favorite = favorites.has(card.dataset.vip);
    button.setAttribute("aria-pressed", String(favorite));
    button.setAttribute("aria-label", `${favorite ? "Retirer des" : "Ajouter aux"} favoris de cet appareil : ${card.dataset.model || card.dataset.vip}`);
  };
  grid.addEventListener("click", event => {
    const button = event.target.closest("[data-favorite]");
    if (!button) return;
    const code = button.closest(".product-card").dataset.vip;
    const next = new Set(favorites);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    try {
      localStorage.setItem(favoritesKey, JSON.stringify([...next]));
      favorites = next;
      updateFavorite(button);
    } catch {
      catalogStatus.textContent = "Le navigateur ne permet pas d’enregistrer vos favoris sur cet appareil.";
    }
  });
  const setBuyLabel = (button, text) => {
    const label = button.querySelector("[data-buy-label]") || button.querySelector("span:not([aria-hidden])");
    if (label) label.textContent = text;
    else button.textContent = text;
  };
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
  grid.addEventListener("click", event => {
      const button = event.target.closest('[data-purpose="buy-btn"]');
      if (!button) return;
      if (!catalogReady || button.disabled) return;
      selectedCard = button.closest(".product-card");
      title.textContent = selectedCard.dataset.model
        ? `${selectedCard.dataset.model} · ${selectedCard.dataset.name || selectedCard.dataset.vip}`
        : selectedCard.dataset.name || selectedCard.dataset.vip;
      image.src = selectedCard.dataset.image;
      image.alt = `Illustration vélo électrique — offre ${selectedCard.dataset.vip}`;
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
  const buyButtons = () => grid.querySelectorAll('[data-purpose="buy-btn"]');
  const catalogStatus = document.querySelector(".catalog-status");
  const catalogRetry = document.createElement("button");
  catalogRetry.type = "button";
  catalogRetry.textContent = "Réessayer";
  catalogRetry.dataset.catalogRetry = "";
  catalogRetry.hidden = true;
  catalogStatus.after(catalogRetry);
  let loadVersion = 0;
  const clearCatalog = () => {
    catalogReady = false;
    confirmButton.disabled = true;
    buyButtons().forEach(button => {
      button.disabled = true;
      setBuyLabel(button, "Acheter");
      const card = button.closest(".product-card");
      card.dataset.available = "false";
      ["price", "daily", "total", "days"].forEach(key => { delete card.dataset[key]; });
      card.querySelectorAll(".metrics strong").forEach(amount => { amount.textContent = "—"; });
      card.querySelector(".product-footer b").textContent = "—";
    });
  };
  const loadCatalog = async () => {
    const version = ++loadVersion;
    // AbortSignal.timeout is absent from older Android/Safari browsers.
    // Do not let an optional timeout prevent the request from being sent.
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeout = controller ? window.setTimeout(() => controller.abort(), 15000) : null;
    clearCatalog();
    catalogRetry.hidden = true;
    if (dialog.open) dialog.close();
    catalogStatus.textContent = "Chargement du catalogue…";
    try {
    const response = await fetch("/api/products/catalog", {
      credentials: "include", cache: "no-store",
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (version !== loadVersion) return;
    if (response.status === 401) { location.replace("/connexion"); return; }
    const result = await response.json();
    if (version !== loadVersion) return;
    if (!response.ok || !Array.isArray(result.products)) throw new Error("Catalogue indisponible.");
    if (result.products.some(product => !product || typeof product.code !== "string" || !product.code.trim())) {
      throw new Error("Catalogue invalide.");
    }
    if (new Set(result.products.map(product => product.code)).size !== result.products.length) {
      throw new Error("Catalogue invalide.");
    }
    const cards = result.products.map((product, index) => {
      const card = cardTemplate.cloneNode(true);
      card.hidden = false;
      card.classList.remove("extra-card");
      card.dataset.vip = product.code;
      card.dataset.purpose = `vip-card-${index + 1}`;
      card.dataset.model = /^VIP\s*\d+$/i.test(product.name || product.code)
        ? `E-Bike Pro X${index + 1}` : product.name || product.code;
      card.dataset.image = index % 2 === 0
        ? "/pages/assets/e-bike-product-black.jpg" : "/pages/assets/e-bike-product-white.jpg";
      card.querySelector(".vehicle-image img").src = card.dataset.image;
      card.querySelector(".vehicle-image img").alt = `Illustration vélo électrique — ${card.dataset.model}`;
      card.querySelector(".vehicle-image img").loading = index < 2 ? "eager" : "lazy";
      const category = card.querySelector(".product-category");
      if (category) category.textContent = `Offre ${product.code}`;
      const badge = card.querySelector(".product-badge");
      if (badge) badge.textContent = index === 0 ? "Découverte" : index === 1 ? "Premium" : product.code;
      const favorite = card.querySelector("[data-favorite]");
      if (favorite) updateFavorite(favorite);
      return card;
    });
    grid.replaceChildren(...cards);
    buyButtons().forEach(button => {
      const card = button.closest(".product-card");
      const product = result.products.find(value => value.code === card.dataset.vip);
      const valid = product && Number.isSafeInteger(product.price) && product.price > 0
        && Number.isSafeInteger(product.dailyIncome) && product.dailyIncome > 0
        && Number.isSafeInteger(product.totalIncome) && product.totalIncome >= product.dailyIncome
        && Number.isSafeInteger(product.durationDays) && product.durationDays > 0;
      const available = valid && product.active === true;
      card.dataset.available = String(Boolean(available));
      button.disabled = !available;
      button.setAttribute("aria-label", `${available ? "Acheter" : "Offre indisponible :"} ${card.dataset.model}`);
      if (valid) {
        card.dataset.name = product.name;
        card.querySelector(".product-title-row h3, h2").textContent = card.dataset.model || product.name;
        card.setAttribute("aria-label", `${card.dataset.model || product.name} — ${product.name}`);
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
      if (!available) setBuyLabel(button, "Indisponible");
    });
    catalogReady = true;
    catalogStatus.textContent = result.products.length ? "" : "Aucun produit disponible pour le moment.";
    } catch {
      if (version !== loadVersion) return;
      clearCatalog();
      catalogStatus.textContent = "Catalogue indisponible. Vérifiez votre connexion puis réessayez pour consulter les tarifs.";
      catalogRetry.hidden = false;
    } finally {
      if (timeout !== null) window.clearTimeout(timeout);
    }
  };
  catalogRetry.addEventListener("click", loadCatalog);
  window.addEventListener("online", () => {
    if (!catalogReady && !catalogRetry.hidden) loadCatalog();
  });
  loadCatalog();
  window.addEventListener("pageshow", event => {
    if (event.persisted) loadCatalog();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") loadCatalog();
  });
})();
