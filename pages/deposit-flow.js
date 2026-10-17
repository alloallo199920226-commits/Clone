/* UI-only deposit draft. No payment request, financial credit or fake result. */
(() => {
  const key = "shineray-deposit-draft";
  const content = document.querySelector("[data-deposit-content]");
  const missing = document.querySelector("[data-deposit-missing]");
  const status = document.querySelector("[data-deposit-status]");
  const form = document.querySelector("#deposit-operator-form");
  const operators = { mtn: "MTN Mobile Money", moov: "MOOV Money" };
  const money = value => `FCFA ${new Intl.NumberFormat("en-US").format(value)}`;
  let draft;
  function save() {
    try { sessionStorage.setItem(key, JSON.stringify(draft)); return true; }
    catch { status.textContent = "Le stockage du navigateur est indisponible. Revenez à la page Recharger."; return false; }
  }
  function go(path) {
    const link = document.createElement("a");
    link.href = path;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
  }
  function showMissing() {
    content.hidden = true;
    missing.hidden = false;
  }
  try { draft = JSON.parse(sessionStorage.getItem(key)); } catch { draft = null; }
  if (!draft || !Number.isSafeInteger(draft.amount_fcfa) || draft.amount_fcfa < 4000 ||
      ![1, 2].includes(draft.channel) || !Number.isFinite(draft.created_at) ||
      Date.now() - draft.created_at < 0 || Date.now() - draft.created_at > 30 * 60 * 1000) {
    showMissing();
    return;
  }
  const confirmation = !form;
  content.setAttribute("aria-busy", "true");
  const submit = form?.querySelector('[type="submit"]');
  if (submit) submit.disabled = true;
  document.querySelectorAll("[data-deposit-amount]").forEach(node => { node.textContent = money(draft.amount_fcfa); });
  fetch("/api/me", { credentials: "include", cache: "no-store" }).then(async response => {
    if (response.status === 401) { location.replace("/connexion"); throw new Error("Connexion requise."); }
    if (!response.ok) throw new Error("Impossible de charger votre compte. Réessayez en rechargeant la page.");
    const account = await response.json();
    if (draft.account_id && draft.account_id !== account.id) {
      sessionStorage.removeItem(key);
      showMissing();
      return;
    }
    const prefix = String(account.phone || "").match(/^\+(228|225)/)?.[0];
    if (!prefix) throw new Error("Le pays de votre compte n’est pas pris en charge.");
    if (draft.country_code && draft.country_code !== prefix) {
      delete draft.phone;
      delete draft.operator;
    }
    draft.account_id = account.id;
    draft.country_code = prefix;
    if (!save()) return;
    document.querySelectorAll("[data-deposit-prefix]").forEach(node => { node.textContent = prefix; });
    if (confirmation) {
      const length = prefix === "+225" ? 10 : 8;
      if (!operators[draft.operator] || !new RegExp(`^\\d{${length}}$`).test(draft.phone || "")) {
        showMissing();
        return;
      }
      document.querySelector("[data-selected-operator]").textContent = operators[draft.operator];
      document.querySelector("[data-ussd-heading]").textContent = `Comment transférer vers ${operators[draft.operator]} via USSD :`;
      document.querySelector("[data-deposit-phone]").textContent = `${prefix} ${draft.phone}`;
      document.querySelector("[data-deposit-validation]").textContent = "En attente de configuration";
      document.querySelector('[data-copy="amount"]').disabled = false;
      document.querySelector("[data-deposit-result]").disabled = false;
      document.querySelector("[data-deposit-result]").addEventListener("click", () => {
        status.textContent = "Aucun paiement n’a été lancé. Les coordonnées et la validation seront disponibles après configuration par l’administrateur.";
      });
      return;
    }
    const input = document.querySelector("#deposit-phone");
    input.value = draft.phone || "";
    input.maxLength = 24;
    const choose = operator => {
      draft.operator = operator;
      document.querySelectorAll("[data-operator]").forEach(button => {
        button.setAttribute("aria-pressed", String(button.dataset.operator === operator));
      });
    };
    choose(operators[draft.operator] ? draft.operator : "mtn");
    document.querySelectorAll("[data-operator]").forEach(button => {
      button.addEventListener("click", () => choose(button.dataset.operator));
    });
    submit.disabled = false;
    form.addEventListener("submit", event => {
      event.preventDefault();
      let phone = input.value.replace(/\D/g, "");
      const length = prefix === "+225" ? 10 : 8;
      if (phone.startsWith(prefix.slice(1)) && phone.length === length + 3) phone = phone.slice(3);
      if (!new RegExp(`^\\d{${length}}$`).test(phone)) {
        status.textContent = `Saisissez un numéro de paiement de ${length} chiffres pour ${prefix}.`;
        input.focus();
        return;
      }
      draft.phone = phone;
      if (save()) go("/confirmation-depot");
    });
  }).catch(error => {
    status.textContent = error.message || "Chargement impossible. Réessayez.";
  }).finally(() => { content.setAttribute("aria-busy", "false"); });

  document.querySelectorAll("[data-copy]").forEach(button => {
    if (button.dataset.copy !== "amount") { button.disabled = true; return; }
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(String(draft.amount_fcfa));
        status.textContent = "Montant copié.";
      } catch { status.textContent = "La copie est indisponible. Vous pouvez recopier le montant affiché."; }
    });
  });
  document.querySelector("[data-deposit-dial]")?.addEventListener("click", event => {
    event.preventDefault();
    status.textContent = "Le code de transfert doit être configuré par l’administrateur.";
  });
})();
