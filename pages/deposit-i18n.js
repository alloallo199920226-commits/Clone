/* Local translations: no external service or network dependency. */
(() => {
  const messages = {
    displayNumber: ["N° d’affichage", "Display number"],
    manualTransferHeading: ["Comment effectuer le paiement", "How to make the payment"],
    manualTransferInstructions: ["Veuillez copier le numéro de réception, puis ouvrir votre répertoire téléphonique ou votre application Mobile Money pour effectuer le paiement sur ce numéro. Revenez ensuite cliquer sur « Obtenir le résultat ». Votre demande sera enregistrée et votre compte crédité après vérification du transfert par l’administration. Délai indicatif : moins de 5 minutes après vérification, non garanti.", "Copy the recipient number, then open your phone contacts or Mobile Money application to pay that number. Return here and select “Get the result”. Your request will be recorded and your account credited after the administrator verifies the transfer. Indicative time: less than 5 minutes after verification, not guaranteed."],
    sonaraTitle: ["Suivi du paiement", "Payment status"],
    sonaraPanel: ["Suivi du paiement", "Payment status"],
    sonaraConsent: ["Ce bouton déclenche une demande de paiement réelle. Validez-la auprès de votre opérateur, jamais avec votre PIN sur ce site.", "This button starts a real payment request. Approve it with your operator; never enter your PIN on this site."],
    sonaraStart: ["Lancer le paiement", "Start payment"],
    sonaraCreating: ["Transmission de votre demande… Ne lancez pas un autre paiement.", "Sending your request… Do not start another payment."],
    sonaraConnectionLost: ["Réponse interrompue. Votre paiement peut avoir été effectué. Ne payez pas une seconde fois. Cliquez sur « Vérifier mon paiement » ou consultez l’historique de vos dépôts.", "Connection interrupted. Your payment may have been processed. Do not pay again. Select “Check my payment” or check your deposit history."],
    sonaraRecover: ["Vérifier mon paiement", "Check my payment"],
    sonaraRecoverNotice: ["Ce bouton vérifie uniquement votre demande existante, sans lancer de nouveau paiement. Si vous avez été débité, ne payez pas une seconde fois.", "This button only checks your existing request; it does not start another payment. If you were charged, do not pay again."],
    sonaraPending: ["Paiement en attente. Validez la demande auprès de votre opérateur. Le solde sera crédité uniquement après confirmation du paiement.", "Payment pending. Approve the request with your operator. Your balance will only be credited after payment confirmation."],
    sonaraUnknown: ["Vérification différée. Reprenez le suivi depuis votre historique, sans lancer un autre paiement.", "Verification delayed. Resume tracking from your history; do not start another payment."],
    sonaraSuccessful: ["Paiement confirmé. Votre compte a été crédité.", "Payment confirmed. Your account has been credited."],
    sonaraFailed: ["Paiement refusé. Aucun crédit n’a été ajouté pour cette demande.", "Payment declined. No credit was added for this request."],
    sonaraFailedTitle: ["Échec du paiement", "Payment failed"],
    sonaraRedirect: ["Retour automatique à l’accueil dans {seconds} s.", "Returning to the home page in {seconds} s."],
    sonaraReview: ["La confirmation reçue ne correspond pas à votre demande. Contactez l’assistance en indiquant la date et le montant du dépôt, sans payer à nouveau.", "The confirmation does not match your request. Contact support with the deposit date and amount; do not pay again."],
    sonaraCredentials: ["Le suivi du paiement est temporairement indisponible. Contactez l’assistance en indiquant la date et le montant du dépôt ; ne relancez pas un autre paiement.", "Payment tracking is temporarily unavailable. Contact support with the deposit date and amount; do not start another payment."],
    sonaraUnavailable: ["Paiement indisponible. Conservez votre demande et réessayez son suivi.", "Payment unavailable. Keep your request and try tracking it again."],
    sonaraOtp: ["Votre opérateur demande un code temporaire. Obtenez ce code auprès de lui, puis saisissez-le ici. Ce n’est pas votre PIN Mobile Money.", "Your operator requires a temporary code. Obtain it from your operator and enter it here. This is not your Mobile Money PIN."],
    sonaraOtpInvalid: ["Le code temporaire doit contenir de 4 à 12 chiffres.", "The temporary code must contain 4 to 12 digits."],
    orangeOtpHelp: ["Si vous avez déjà obtenu votre code temporaire Orange Money, saisissez-le ici. Sinon, lancez le paiement pour obtenir les instructions.", "If you already obtained your Orange Money temporary code, enter it here. Otherwise, start payment to get the instructions."],
    sonaraOtpLabel: ["Code temporaire de l’opérateur (pas votre PIN)", "Temporary operator code (not your PIN)"],
    sonaraOtpSubmit: ["Envoyer le code temporaire", "Send temporary code"],
    sonaraReference: ["Référence de suivi", "Tracking reference"],
    successTitle: ["Paiement effectué avec succès", "Payment completed successfully"],
    successLineOne: ["Votre paiement a été traité avec succès.", "Your payment was processed successfully."],
    successLineTwo: ["Votre compte a été crédité.", "Your account has been credited."],
    transactionReference: ["Référence de transaction", "Transaction reference"],
    statusLabel: ["Statut", "Status"],
    paymentValidated: ["Paiement validé", "Payment validated"],
    transactionConfirmed: ["La transaction a été confirmée.", "The transaction has been confirmed."],
    safetyTitle: ["Validez uniquement auprès de votre opérateur.", "Approve only with your operator."],
    safetyBody: ["Ne saisissez jamais votre code PIN Mobile Money sur ce site.", "Never enter your Mobile Money PIN on this site."],
    clockLabel: ["Heure locale : {time}", "Local time: {time}"],
    sonaraSafety: ["Validez uniquement auprès de votre opérateur. Ne saisissez jamais votre code PIN Mobile Money sur ce site.", "Approve only with your operator. Never enter your Mobile Money PIN on this site."],
    sonaraCheck: ["Vérifier le paiement", "Check payment"],
    sonaraRetry: ["Reprendre la même demande", "Resume the same request"],
    sonaraHistory: ["Voir mes dépôts", "View my deposits"],
    securePayment: ["Paiement sécurisé", "Secure payment"],
    reliable: ["100% fiable", "100% reliable"],
    fastValidation: ["Validation rapide", "Fast processing"],
    processingWindow: ["1 à 10 minutes", "1 to 10 minutes"],
    alwaysAvailable: ["Toujours disponible", "Always available"],
    operatorTitle: ["Choisir un opérateur — Valhalla Pay", "Choose an operator — Valhalla Pay"],
    confirmationTitle: ["Confirmation du dépôt — IVECO Pay", "Deposit confirmation — IVECO Pay"],
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
    manualSending: ["Enregistrement de la demande…", "Recording your request…"],
    manualRecordedShort: ["Demande de dépôt enregistrée", "Deposit request recorded"],
    manualRecorded: ["Votre demande a été transmise à l’administration. Le dépôt reste en attente de vérification et de validation avant tout crédit.", "Your request was sent to the administrator. The deposit awaits verification and approval before any credit."],
    manualRedirect: ["Demande enregistrée. Retour à l’accueil dans {seconds} s.", "Request recorded. Returning home in {seconds} s."],
    manualError: ["Enregistrement non confirmé. Réessayez ce bouton sans refaire le transfert.", "Recording is unconfirmed. Retry this button without making another transfer."],
    phone: ["Numéro utilisé", "Phone number used"],
    modify: ["Modifier", "Edit"],
    storage: ["Le stockage du navigateur est indisponible. Revenez à la page Recharger.", "Browser storage is unavailable. Return to the Top up page."],
    signIn: ["Connexion requise.", "Sign-in required."],
    accountError: ["Impossible de charger votre compte. Réessayez en rechargeant la page.", "Unable to load your account. Reload the page to try again."],
    countryError: ["Le pays de votre compte n’est pas pris en charge.", "Your account’s country is not supported."],
    noChannels: ["Aucun moyen de paiement actif n’est configuré pour votre pays.", "No active payment method is configured for your country."],
    channelUnavailable: ["Ce moyen de paiement n’est plus disponible. Revenez au choix de l’opérateur.", "This payment method is no longer available. Return to the payment method selection."],
    manualDetails: ["Coordonnées fournies par l’administration. Aucun paiement n’a été initié ou confirmé par cette page.", "Details provided by the administrator. No payment has been initiated or confirmed by this page."],
    noPayment: ["Aucun paiement n’a été lancé. Les coordonnées et la validation seront disponibles après configuration par l’administrateur.", "No payment has been initiated. Recipient details and verification will be available after administrator configuration."],
    phoneError: ["Saisissez un numéro de paiement de {length} chiffres pour {prefix}.", "Enter a {length}-digit payment phone number for {prefix}."],
    copied: ["Copié.", "Copied."],
    copyError: ["La copie est indisponible. Vous pouvez recopier la valeur affichée.", "Copying is unavailable. You can manually copy the displayed value."],
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
    "[data-deposit-dial]": "dial", ".deposit-action[data-copy='ussd']": "copyCode",
    ".deposit-inline-copy": "copy",
    ".deposit-reference > span": "reference", ".deposit-ussd-note": "pin",
    ".deposit-validation-title": "validation", "[data-deposit-validation]": "pending",
    "[data-deposit-result]": "result", ".deposit-payer-label": "phone", "[data-deposit-modify]": "modify"
  };
  Object.entries(selectors).forEach(([selector, key]) => mark(selector, key));
  Object.entries({
    ".deposit-close": "close", ".deposit-heading-tools": "tools", ".deposit-amount-bar": "selectedAmount",
    ".deposit-operator-options": "operator", ".deposit-details": "details", ".deposit-validation": "validation",
    "[data-copy='merchant_name']": "copyName", "[data-copy='merchant_account']": "copyAccount",
    "[data-copy='amount']": "copyAmount", "[data-deposit-language]": "switchLanguage",
    ".sonara-panel": "sonaraPanel", "[data-deposit-clock]": "clockLabel"
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
      button.textContent = document.querySelector(".iveco-payment-page, .deposit-page--confirmation")
        ? (language === "fr" ? "Français" : "English")
        : (language === "fr" ? "English" : "Français");
      button.dataset.language = language;
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
