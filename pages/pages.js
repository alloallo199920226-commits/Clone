(() => {
  const status = document.querySelector("[data-status]");

  document.querySelectorAll("[data-demo-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const kind = button.dataset.demoKind;
      if (!kind) {
        if (status) status.textContent = "Cette action n’est pas reliée à un service externe.";
        return;
      }
      const amount = Number(document.querySelector("#amount")?.value);
      if (!Number.isSafeInteger(amount) || amount <= 0) {
        if (status) status.textContent = "Saisissez un montant valide pour enregistrer la simulation.";
        return;
      }
      button.disabled = true;
      if (status) status.textContent = "Enregistrement de la simulation…";
      try {
        const response = await fetch("/api/demo-activity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            amount_fcfa: amount,
            label: kind === "recharge" ? "Recharge simulée" : "Retrait simulé",
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Enregistrement impossible.");
        if (status) status.textContent = "Demande enregistrée en mode démonstration. Aucun argent n’a été envoyé ni crédité.";
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

  const amount = document.querySelector("#amount");
  if (amount && document.querySelector("[data-net-amount]")) {
    amount.addEventListener("input", () => {
      const value = Number(amount.value);
      const net = Number.isFinite(value) && value >= 0 ? (value * 0.78).toFixed(0) : "0";
      document.querySelector("[data-net-amount]").textContent = `FCFA ${net}`;
    });
  }

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
          meta.textContent = `Simulation · ${new Date(activity.created_at).toLocaleString("fr-FR")}`;
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
