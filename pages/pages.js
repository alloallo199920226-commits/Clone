(() => {
  const status = document.querySelector("[data-status]");

  document.querySelectorAll("[data-demo-action]").forEach((button) => {
    button.addEventListener("click", () => {
      if (status) status.textContent = "Action simulée uniquement : aucun paiement, dépôt ou retrait n’a été effectué.";
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
})();
