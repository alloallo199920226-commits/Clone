/* Local translations: no external service or network dependency. */
(() => {
  const messages = {
    operatorTitle: ["Choisir un opérateur — Valhalla Pay", "Choose an operator — Valhalla Pay"],
    confirmationTitle: ["Confirmation du dépôt — Valhalla Pay", "Deposit confirmation — Valhalla Pay"],
    close: ["Fermer et revenir à Recharger", "Close and return to Top up"],
    missing: ["Les informations de ce dépôt ne sont pas disponibles. Sélectionnez un montant de recharge.", "Deposit details are unavailable. Select a top-up amount."],
    expired: ["Le délai de 20 minutes est écoulé. Revenez à Recharger pour recommencer. Aucun paiement n’a été validé automatiquement.", "The 20-minute session has expired. Return to Top up to start again. No payment was automatically approved."],
    back: ["Retourner à Recharger", "Return to Top up"],
    tools: ["Outils de paiement", "Payment tools"],
    remaining: ["Temps restant pour terminer ce parcours : {time}", "Time remaining to complete this flow: {time}"],
    switchLanguage: ["Passer en anglais", "Switch to French"],
    amount: ["Montant du paiement", "Payment amount"],
    selectedAmount: ["Montant sélectionné", "Selected amount"],
    choose: ["Veuillez sélectionner un mode de paiement", "Please select a payment method"],
    operator: ["Opérateur de paiement", "Payment operator"],
    wallet: ["Portefeuille électronique de paiement", "Payment mobile wallet"],
    phonePlaceholder: ["Votre numéro de téléphone", "Your phone number"],
    warning: ["Veuillez vérifier le numéro de téléphone avant de soumettre.", "Please check the phone number before submitting."],
    submit: ["Soumettre", "Submit"],
    noticeHeading: ["Configuration en attente.", "Configuration pending."],
    notice: ["Aucun paiement n’a été initié. Les informations de paiement seront fournies par l’administrateur.", "No payment has been initiated. Payment details will be provided by the administrator."],
    details: ["Détails du paiement", "Payment details"],
    merchantName: ["Nom du marchand", "Merchant name"],
    merchantAccount: ["Compte marchand", "Merchant account"],
    unconfigured: ["À configurer par l’administrateur", "To be configured by the administrator"],
    copy: ["Copier", "Copy"],
    copyName: ["Copier le nom du marchand", "Copy merchant name"],
    copyAccount: ["Copier le compte marchand", "Copy merchant account"],
    amountLabel: ["Montant", "Amount"],
    copyAmount: ["Copier le montant du dépôt", "Copy deposit amount"],
    ussdHeading: ["Comment transférer vers {operator} via USSD :", "How to transfer to {operator} via USSD:"],
    ussd: ["Code USSD", "USSD code"],
    ussdInstructions: ["Composez le code de votre opérateur et suivez les instructions à l’écran.", "Dial your operator’s code and follow the instructions on screen."],
    noCode: ["Code non configuré", "Code not configured"],
    dial: ["Composer le code", "Dial the code"],
    copyCode: ["Copier le code", "Copy the code"],
    reference: ["Référence", "Reference"],
    pin: ["Aucun code PIN ne vous sera demandé sur cette page. Ne le communiquez à personne.", "You will never be asked for your PIN on this page. Do not share it with anyone."],
    validation: ["Validation du dépôt", "Deposit verification"],
    pending: ["En attente de configuration", "Awaiting configuration"],
    result: ["Obtenir le résultat", "Get the result"],
    phone: ["Numéro utilisé", "Phone number used"],
    modify: ["Modifier", "Edit"],
    storage: ["Le stockage du navigateur est indisponible. Revenez à la page Recharger.", "Browser storage is unavailable. Return to the Top up page."],
    signIn: ["Connexion requise.", "Sign-in required."],
    accountError: ["Impossible de charger votre compte. Réessayez en rechargeant la page.", "Unable to load your account. Reload the page to try again."],
    countryError: ["Le pays de votre compte n’est pas pris en charge.", "Your account’s country is not supported."],
    noPayment: ["Aucun paiement n’a été lancé. Les coordonnées et la validation seront disponibles après configuration par l’administrateur.", "No payment has been initiated. Recipient details and verification will be available after administrator configuration."],
    phoneError: ["Saisissez un numéro de paiement de {length} chiffres pour {prefix}.", "Enter a {length}-digit payment phone number for {prefix}."],
    copied: ["Montant copié.", "Amount copied."],
    copyError: ["La copie est indisponible. Vous pouvez recopier le montant affiché.", "Copying is unavailable. You can manually copy the displayed amount."],
    dialError: ["Le code de transfert doit être configuré par l’administrateur.", "The transfer code must be configured by the administrator."]
  };
  let language = "fr";
  try { if (localStorage.getItem("shineray-deposit-language") === "en") language = "en"; } catch {}
  const t = (key, params = {}) => (messages[key]?.[language === "en" ? 1 : 0] || key)
    .replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ""));
  function set(node, key, params = {}) {
    if (!node) return;
    node.dataset.i18n = key;
    node.i18nParams = params;
    node.textContent = t(key, params);
  }
  function mark(selector, key, attribute) {
    document.querySelectorAll(selector).forEach(node => {
      node.dataset[attribute ? `i18n${attribute}` : "i18n"] = key;
    });
  }
  const selectors = {
    "[data-deposit-missing] p": "missing", "[data-deposit-missing] a": "back",
    ".deposit-amount-label": "amount", ".deposit-section-title": "choose",
    ".deposit-phone-label": "wallet", ".deposit-form-warning": "warning",
    "[data-submit-label]": "submit", ".deposit-notice strong": "noticeHeading",
    "[data-notice-body]": "notice", "[data-merchant-name], [data-merchant-account]": "unconfigured",
    ".deposit-detail-card:nth-child(1) .deposit-detail-label": "merchantName",
    ".deposit-detail-card:nth-child(2) .deposit-detail-label": "merchantAccount",
    ".deposit-detail-card:nth-child(3) .deposit-detail-label": "amountLabel",
    "[data-copy='merchant_name'], [data-copy='merchant_account'], [data-copy='amount']": "copy",
    "[data-ussd-heading]": "ussd", ".deposit-ussd-instructions": "ussdInstructions", "[data-ussd-code]": "noCode",
    "[data-deposit-dial]": "dial", "[data-copy='ussd']": "copyCode",
    ".deposit-reference > span": "reference", ".deposit-ussd-note": "pin",
    ".deposit-validation-title": "validation", "[data-deposit-validation]": "pending",
    "[data-deposit-result]": "result", ".deposit-payer-label": "phone", "[data-deposit-modify]": "modify"
  };
  Object.entries(selectors).forEach(([selector, key]) => mark(selector, key));
  Object.entries({
    ".deposit-close": "close", ".deposit-heading-tools": "tools", ".deposit-amount-bar": "selectedAmount",
    ".deposit-operator-options": "operator", ".deposit-details": "details", ".deposit-validation": "validation",
    "[data-copy='merchant_name']": "copyName", "[data-copy='merchant_account']": "copyAccount",
    "[data-copy='amount']": "copyAmount", "[data-deposit-language]": "switchLanguage"
  }).forEach(([selector, key]) => mark(selector, key, "Aria"));
  mark("#deposit-phone", "phonePlaceholder", "Placeholder");
  function apply() {
    document.documentElement.lang = language;
    document.title = t(document.querySelector("#deposit-operator-form") ? "operatorTitle" : "confirmationTitle");
    document.querySelectorAll("[data-i18n]").forEach(node => { node.textContent = t(node.dataset.i18n, node.i18nParams); });
    for (const [data, attr] of [["i18nAria", "aria-label"], ["i18nPlaceholder", "placeholder"]]) {
      document.querySelectorAll(`[data-${data.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}]`)
        .forEach(node => node.setAttribute(attr, t(node.dataset[data])));
    }
    document.querySelectorAll("[data-deposit-language]").forEach(button => {
      button.disabled = false;
      button.textContent = language === "fr" ? "English" : "Français";
      button.title = t("switchLanguage");
    });
    document.dispatchEvent(new Event("deposit-language-change"));
  }
  window.depositI18n = { t, set };
  document.querySelectorAll("[data-deposit-language]").forEach(button => button.addEventListener("click", () => {
    language = language === "fr" ? "en" : "fr";
    try { localStorage.setItem("shineray-deposit-language", language); } catch {}
    apply();
  }));
  apply();
})();
