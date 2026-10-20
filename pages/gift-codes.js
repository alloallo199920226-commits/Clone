(() => {
  const toggle = document.querySelector(".gift-code-toggle");
  const form = document.querySelector("#gift-code-panel");
  if (!toggle || !form) return;
  const input = form.elements.code;
  const status = form.querySelector(".gift-code-status");
  const submit = form.querySelector("button[type=submit]");
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    form.hidden = !open;
    if (open) input.focus();
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (submit.disabled) return;
    input.value = input.value.trim().toUpperCase();
    if (!form.reportValidity()) return;
    submit.disabled = true;
    input.readOnly = true;
    status.dataset.success = "false";
    status.textContent = "Validation en cours…";
    try {
      const response = await fetch("/api/gift-codes/redeem", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: input.value }),
      });
      const result = await response.json();
      if (response.status === 401) {
        location.assign("/connexion");
        return;
      }
      if (!response.ok) throw new Error(result.error || "Code cadeau non validé.");
      status.dataset.success = "true";
      const money = value => new Intl.NumberFormat("fr-FR").format(value);
      status.textContent = result.alreadyRedeemed
        ? "Ce code a déjà été utilisé sur votre compte. Aucun nouveau crédit."
        : `Bonus de ${money(result.amount)} FCFA ajouté à votre solde.`;
      document.querySelectorAll("[data-demo-balance]").forEach(node => {
        node.textContent = money(result.balance_fcfa);
      });
    } catch (error) {
      status.textContent = error instanceof TypeError
        ? "Connexion interrompue. Réessayez le même code : aucun double crédit ne sera effectué."
        : error.message || "Validation impossible. Réessayez le même code.";
    } finally {
      submit.disabled = false;
      input.readOnly = false;
    }
  });
})();
