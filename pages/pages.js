(() => {
  const status = document.querySelector("[data-status]");

  document.querySelectorAll("[data-payment-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const kind = button.dataset.paymentKind;
      const amount = Number(document.querySelector("#amount")?.value);
      if (!Number.isSafeInteger(amount) || amount <= 0) {
        if (status) status.textContent = "Saisissez un montant valide.";
        return;
      }
      button.disabled = true;
      if (status) status.textContent = "Vérification de la disponibilité…";
      try {
        const response = await fetch("/api/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            amount_fcfa: amount,
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Enregistrement impossible.");
        if (status) status.textContent = "Demande enregistrée.";
      } catch (error) {
        if (status) status.textContent = error.message || "Le service est indisponible. Réessayez.";
      } finally {
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll("[data-amount-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.querySelector("#amount");
      input.value = button.dataset.amountChoice;
      document.querySelectorAll("[data-amount-choice]").forEach((option) => option.setAttribute("aria-pressed", String(option === button)));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });

  document.querySelectorAll("[data-channel-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-channel-choice]").forEach((option) => option.setAttribute("aria-pressed", String(option === button)));
    });
  });

  async function api(url, options) {
    const response = await fetch(url, options);
    if (response.status === 401) location.replace("/connexion");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Service indisponible.");
    return data;
  }

  const walletForm = document.querySelector("[data-wallet-form]");
  walletForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!walletForm.reportValidity()) return;
    const button = walletForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await api("/api/wallets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: walletForm.elements.provider.value,
          phone: walletForm.elements.phone.value,
        }),
      });
      location.assign("/gestion-compte-bancaire");
    } catch (error) {
      status.textContent = error.message;
      button.disabled = false;
    }
  });

  const walletList = document.querySelector("[data-wallet-list]");
  if (walletList) {
    api("/api/wallets").then(({ wallets }) => {
      const empty = document.querySelector("[data-wallet-empty]");
      if (empty) empty.hidden = wallets.length > 0;
      wallets.forEach((wallet) => {
        const row = document.createElement("article");
        row.className = "finance-row";
        const text = document.createElement("span");
        text.textContent = `${wallet.provider} · ${wallet.phone}`;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "button-outline";
        remove.textContent = "Supprimer";
        remove.addEventListener("click", async () => {
          if (!confirm("Supprimer ce compte de retrait ?")) return;
          remove.disabled = true;
          try {
            await api(`/api/wallets/${wallet.id}`, { method: "DELETE" });
            row.remove();
            if (empty) empty.hidden = walletList.children.length > 0;
          } catch (error) {
            status.textContent = error.message;
            remove.disabled = false;
          }
        });
        row.append(text, remove);
        walletList.append(row);
      });
    }).catch((error) => { status.textContent = error.message; });
  }

  document.querySelectorAll("[data-account-balance]").forEach((element) => {
    api("/api/me").then((user) => {
      element.textContent = `FCFA ${new Intl.NumberFormat("fr-FR").format(user.balance_fcfa)}`;
    }).catch(() => { element.textContent = "Solde indisponible"; });
  });

  const activityList = document.querySelector("[data-activity-list]");
  if (activityList) {
    const kind = activityList.dataset.activityKind;
    const query = kind && kind !== "all" ? `?kind=${encodeURIComponent(kind)}` : "";
    fetch(`/api/activity${query}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Historique indisponible.");
        return response.json();
      })
      .then(({ activities }) => {
        const formatter = new Intl.NumberFormat("fr-FR");
        activities.forEach((activity) => {
          const row = document.createElement("article");
          row.className = "finance-row";
          const details = document.createElement("div");
          const title = document.createElement("span");
          const meta = document.createElement("small");
          const amountText = document.createElement("span");
          title.className = "finance-kind";
          title.textContent = activity.label;
          meta.textContent = new Date(activity.created_at).toLocaleString("fr-FR");
          amountText.textContent = `FCFA ${formatter.format(activity.amount_fcfa)}`;
          details.append(title, document.createElement("br"), meta);
          row.append(details, amountText);
          activityList.append(row);
        });
        const emptyState = document.querySelector("[data-activity-empty]");
        if (emptyState) emptyState.hidden = activities.length > 0;
        if (kind === "purchase") {
          const count = document.querySelector("[data-purchase-count]");
          const total = document.querySelector("[data-purchase-total]");
          if (count) count.textContent = String(activities.length);
          if (total) total.textContent = `FCFA ${formatter.format(
            activities.reduce((sum, activity) => sum + activity.amount_fcfa, 0),
          )}`;
        }
      })
      .catch(() => {
        const emptyState = document.querySelector("[data-activity-empty]");
        if (emptyState) emptyState.textContent = "Historique temporairement indisponible.";
      });
  }
})();
