(() => {
  document.querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", () => { location.href = button.dataset.route; });
  });
  const dialog = document.querySelector(".purchase-dialog");
  const title = dialog.querySelector("#dialog-title");
  const image = dialog.querySelector(".purchase-details img");
  const error = dialog.querySelector(".purchase-error");
  const confirmButton = dialog.querySelector(".confirm-purchase");
  let selectedCard = null;
  const format = (value) => new Intl.NumberFormat("fr-FR").format(Number(value));
  document.querySelectorAll('[data-purpose="buy-btn"]').forEach((button) => {
    button.addEventListener("click", () => {
      selectedCard = button.closest(".product-card");
      title.textContent = selectedCard.dataset.vip;
      image.src = selectedCard.dataset.image;
      image.alt = `Véhicule ${selectedCard.dataset.vip}`;
      dialog.querySelector("[data-detail-price]").textContent = `Prix:FCFA ${format(selectedCard.dataset.price)}`;
      dialog.querySelector("[data-detail-daily]").textContent = `Revenu quotidien:FCFA ${format(selectedCard.dataset.daily)}`;
      dialog.querySelector("[data-detail-total]").textContent = `Revenu total:FCFA ${format(selectedCard.dataset.total)}`;
      dialog.querySelector("[data-detail-days]").textContent = `Période de validité:${selectedCard.dataset.days} jour`;
      error.textContent = "";
      confirmButton.disabled = false;
      dialog.showModal();
    });
  });
  dialog.querySelector(".cancel-purchase").addEventListener("click", () => dialog.close());
  confirmButton.addEventListener("click", async () => {
    if (!selectedCard) return;
    confirmButton.disabled = true;
    error.textContent = "Vérification de la disponibilité…";
    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "purchase", amount_fcfa: Number(selectedCard.dataset.price), label: selectedCard.dataset.vip }),
      });
      if (response.status === 401) { location.replace("/connexion"); return; }
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Paiement indisponible. Aucun débit n’a été effectué.");
      error.textContent = "La demande a été transmise.";
    } catch (reason) {
      error.textContent = reason.message || "Paiement indisponible. Aucun débit n’a été effectué.";
    } finally {
      confirmButton.disabled = false;
    }
  });
})();
