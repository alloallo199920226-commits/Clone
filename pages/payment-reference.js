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
  let accountId = null;
  let withdrawalRecorded = false;
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
    if (action.disabled || withdrawalRecorded) return;
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
      // Amount/channel are not credentials. Carry them across browser/tab contexts
      // that do not retain sessionStorage; the server still validates every payment.
      next.href = `/choisir-operateur?amount=${amount}&channel=${body.channel}`;
      next.hidden = true;
      document.body.append(next);
      next.click();
      next.remove();
      return;
    }
    action.disabled = true;
    status.textContent = "Enregistrement de votre demande…";
    try {
      if (!accountId) throw new Error("Attendez le chargement de votre compte.");
      const storageKey = `iveco-withdrawal-${accountId}`;
      let request = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      if (request && (request.wallet_id !== body.wallet_id || request.amount_fcfa !== amount)) {
        throw new Error("Une demande reste à vérifier. Consultez l’historique ou réessayez avec le même compte et le même montant.");
      }
      if (!request) {
        request = { request_id: crypto.randomUUID(), wallet_id: body.wallet_id, amount_fcfa: amount };
        sessionStorage.setItem(storageKey, JSON.stringify(request));
      }
      const response = await fetch("/api/withdrawals", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
      if (response.status === 401) { location.replace("/connexion"); return; }
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if ([400, 403, 409].includes(response.status)) sessionStorage.removeItem(storageKey);
        throw new Error(result.error || "Enregistrement non confirmé. Réessayez la même demande ou consultez l’historique.");
      }
      if (!result.withdrawal?.reference) throw new Error("Réponse interrompue. Réessayez la même demande.");
      sessionStorage.removeItem(storageKey);
      withdrawalRecorded = true;
      action.textContent = "Demande enregistrée";
      status.textContent = "";
      if (Number.isSafeInteger(result.withdrawal.balance_fcfa)) {
        document.querySelector("[data-account-balance]").textContent = `FCFA ${format(result.withdrawal.balance_fcfa)}`;
      }
    } catch (error) {
      status.textContent = error instanceof TypeError ? "Connexion interrompue. Réessayez la même demande ou vérifiez votre historique, sans créer un nouveau retrait." : error.message;
    } finally {
      action.disabled = withdrawalRecorded;
    }
  });
  if (document.querySelector("[data-account-balance]")) {
    fetch("/api/me", { credentials: "include" }).then(async (response) => {
      if (response.status === 401) { location.replace("/connexion"); throw new Error("Connexion requise"); }
      const user = await response.json();
      if (!response.ok) throw new Error("Solde indisponible");
      if (!Number.isSafeInteger(user.balance_fcfa)) throw new Error("Solde invalide");
      accountId = user.id;
      document.querySelector("[data-account-balance]").dataset.available = user.balance_fcfa;
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
      document.querySelector("[data-amount-received]").textContent = `Montant reçu: FCFA ${Number.isSafeInteger(amount) && amount > 0 ? format(amount - Math.floor(amount * 20 / 100)) : "0"}`;
    });
  }
})();
