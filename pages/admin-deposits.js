(() => {
  const form = document.querySelector("[data-admin-deposit-form]");
  const status = document.querySelector("[data-admin-status]");
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    status.textContent = "Vérification et enregistrement…";
    try {
      const values = new FormData(form);
      const response = await fetch("/api/admin/deposits", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: values.get("phone").trim(), amount_fcfa: Number(values.get("amount_fcfa")),
          provider_reference: values.get("provider_reference").trim(),
          receipt_verified: values.get("receipt_verified") === "on",
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Approbation non confirmée.");
      status.textContent = result.already_approved
        ? "Ce dépôt était déjà approuvé. Aucun crédit ni commission supplémentaire."
        : `Dépôt approuvé et crédité. ${result.first_deposit ? "Commissions du premier dépôt versées aux parrains éligibles." : "Dépôt suivant : aucune commission supplémentaire."}`;
      // Keep the reference visible for auditing or an idempotent retry.
    } catch (error) { status.textContent = error.message || "Approbation non confirmée."; }
    finally { button.disabled = false; }
  });
})();
