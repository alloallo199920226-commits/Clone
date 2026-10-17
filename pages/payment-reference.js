(() => {
  const status = document.querySelector("[data-payment-status]");
  const formAmount = document.querySelector("#amount");
  const format = (value) => new Intl.NumberFormat("fr-FR").format(value);
  document.querySelectorAll("[data-amount-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      formAmount.value = button.dataset.amountChoice;
      document.querySelectorAll("[data-amount-choice]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    });
  });
  document.querySelectorAll("[data-channel-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-channel-choice]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    });
  });
  const action = document.querySelector("[data-payment-action]");
  if (action?.dataset.paymentKind === "recharge") {
    try {
      const draft = JSON.parse(sessionStorage.getItem("shineray-deposit-draft"));
      if (draft && Number.isSafeInteger(draft.amount_fcfa) && draft.amount_fcfa >= 500 &&
          Date.now() - draft.created_at >= 0 && Date.now() - draft.created_at < 20 * 60 * 1000) {
        formAmount.value = draft.amount_fcfa;
        document.querySelectorAll("[data-channel-choice]").forEach(button => {
          button.setAttribute("aria-pressed", String(Number(button.dataset.channelChoice) === draft.channel));
        });
      }
    } catch { /* No saved amount. */ }
  }
  action?.addEventListener("click", async () => {
    const amount = Number(formAmount.value);
    const minimum = Number(formAmount.min || 1);
    if (action.dataset.paymentKind === "withdrawal" && !action.dataset.walletId) {
      status.textContent = "Sélectionnez d’abord un compte portefeuille de retrait.";
      return;
    }
    if (!Number.isSafeInteger(amount) || amount < minimum) {
      status.textContent = `Saisissez un montant valide${minimum > 1 ? ` (minimum ${format(minimum)} FCFA)` : ""}.`;
      return;
    }
    const body = { kind: action.dataset.paymentKind, amount_fcfa: amount };
    if (action.dataset.walletId) body.wallet_id = Number(action.dataset.walletId);
    if (action.dataset.paymentKind === "recharge") {
      body.channel = Number(document.querySelector("[data-channel-choice][aria-pressed='true']")?.dataset.channelChoice || 2);
      try {
        sessionStorage.setItem("shineray-deposit-draft", JSON.stringify({
          amount_fcfa: amount, channel: body.channel, created_at: Date.now(),
        }));
      } catch {
        status.textContent = "Impossible de conserver votre choix. Autorisez le stockage du navigateur puis réessayez.";
        return;
      }
      const next = document.createElement("a");
      next.href = "/choisir-operateur";
      next.hidden = true;
      document.body.append(next);
      next.click();
      next.remove();
      return;
    }
    action.disabled = true;
    status.textContent = "Vérification de la disponibilité…";
    try {
      const response = await fetch("/api/payments", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (response.status === 401) { location.replace("/connexion"); return; }
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Service de paiement indisponible. Aucun mouvement n’a été effectué.");
      status.textContent = "Demande transmise.";
    } catch (error) {
      status.textContent = error.message || "Service de paiement indisponible. Aucun mouvement n’a été effectué.";
    } finally {
      action.disabled = false;
    }
  });
  if (document.querySelector("[data-account-balance]")) {
    fetch("/api/me", { credentials: "include" }).then(async (response) => {
      if (response.status === 401) { location.replace("/connexion"); throw new Error("Connexion requise"); }
      const user = await response.json();
      if (!response.ok) throw new Error("Solde indisponible");
      if (!Number.isSafeInteger(user.balance_fcfa)) throw new Error("Solde invalide");
      const value = document.createElement("span");
      value.className = "balance-value";
      value.textContent = format(user.balance_fcfa);
      document.querySelector("[data-account-balance]").replaceChildren(document.createTextNode("FCFA "), value);
    }).catch(() => { document.querySelector("[data-account-balance]").textContent = "Solde indisponible"; });
    const select = document.querySelector("[data-wallet-select]");
    const list = document.querySelector("[data-wallet-options]");
    const walletStatus = document.querySelector("[data-wallet-status]");
    fetch("/api/wallets", { credentials: "include" }).then(async (response) => {
      if (response.status === 401) { location.replace("/connexion"); throw new Error("Connexion requise"); }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Comptes indisponibles.");
      const wallets = Array.isArray(payload.wallets) ? payload.wallets : [];
      if (!wallets.length) {
        list.innerHTML = '<p class="wallet-empty">Aucun compte portefeuille enregistré. <a class="wallet-link" href="/ajouter-compte-retrait">Ajouter un compte de retrait</a></p>';
        return;
      }
      wallets.forEach((wallet) => {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "wallet-select";
        option.textContent = `${wallet.provider} · ${wallet.phone}`;
        option.addEventListener("click", () => {
          document.querySelectorAll("[data-wallet-options] .wallet-select").forEach((row) => row.removeAttribute("aria-pressed"));
          option.setAttribute("aria-pressed", "true");
          select.querySelector("[data-wallet-label]").textContent = `${wallet.provider} · ${wallet.phone}`;
          document.querySelector("[data-payment-action]").dataset.walletId = wallet.id;
          list.hidden = true;
        });
        list.append(option);
      });
    }).catch((error) => { walletStatus.textContent = error.message || "Comptes indisponibles."; });
    select.addEventListener("click", () => { list.hidden = !list.hidden; });
    formAmount.addEventListener("input", () => {
      const amount = Number(formAmount.value);
      document.querySelector("[data-amount-received]").textContent = `Montant reçu: FCFA ${(Number.isFinite(amount) && amount > 0 ? (amount * .78).toFixed(2) : "0.00")}`;
    });
  }
})();
