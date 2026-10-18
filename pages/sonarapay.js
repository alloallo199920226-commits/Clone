/* Same-origin API only. Private key and provider calls remain on the server. */
(() => {
  const { t, set } = window.depositI18n;
  const endpoint = "/api/sonarapay/payments";
  const api = async (path, body) => {
    const response = await fetch(endpoint + path, {
      method: body === undefined ? "GET" : "POST", credentials: "include", cache: "no-store",
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 401) location.replace("/connexion");
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || t("sonaraUnavailable"));
    return result;
  };
  window.sonaraPay = {
    async create(draft) {
      return (await api("", {
        amount: draft.amount_fcfa, operatorId: draft.operator,
        phone: draft.phone, requestId: draft.request_id,
      })).payment;
    },
    async mount(id, populateLogo, operatorBrand) {
      const content = document.querySelector("[data-deposit-content]");
      const panel = document.querySelector("[data-sonara-panel]");
      const message = panel.querySelector("[data-sonara-status]");
      const otpForm = panel.querySelector("form");
      const input = panel.querySelector("input");
      const check = panel.querySelector("[data-sonara-check]");
      const retry = panel.querySelector("[data-sonara-retry]");
      let payment, busy = false, timer;
      content.hidden = false;
      document.querySelector("[data-deposit-missing]").hidden = true;
      content.querySelectorAll(".deposit-details,.deposit-ussd-card,.deposit-validation,.deposit-notice,.deposit-modify")
        .forEach(node => { node.hidden = true; });
      panel.hidden = false;
      document.querySelectorAll(".deposit-timer").forEach(node => { node.hidden = true; });
      const stateKey = () => payment?.credited ? "sonaraSuccessful"
        : ["credentials", "credentials_changed"].includes(payment?.errorCode) ? "sonaraCredentials"
        : payment?.status === "failed" ? "sonaraFailed"
        : payment?.status === "review" ? "sonaraReview"
        : payment?.status === "otp_required" ? "sonaraOtp"
        : payment?.errorCode ? "sonaraUnknown" : "sonaraPending";
      const paint = () => {
        if (!payment) return;
        set(message, stateKey());
        panel.dataset.paymentStatus = payment.credited ? "successful" : payment.status;
        panel.querySelector("[data-sonara-reference]").textContent = payment.reference || payment.id;
        panel.querySelector("[data-sonara-amount]").textContent =
          `FCFA ${new Intl.NumberFormat("en-US").format(payment.amount_fcfa)}`;
        document.querySelector("[data-selected-operator]").textContent = payment.operator.operatorName;
        document.querySelector("[data-deposit-phone]").textContent = payment.phone;
        const logo = document.querySelector("[data-confirmation-logo]");
        logo.replaceChildren();
        populateLogo(logo, payment.operator, operatorBrand(payment.operator));
        otpForm.hidden = payment.status !== "otp_required" || payment.credited;
        panel.querySelector("[data-sonara-ussd]").textContent = payment.ussdCode || "";
        retry.hidden = payment.credited || payment.status === "failed" || !!payment.reference
          || !payment.errorCode || payment.status === "otp_required";
        if (payment.credited || payment.status === "failed") {
          clearInterval(timer);
          check.hidden = true;
        }
      };
      const refresh = async (path = "", body) => {
        if (busy) return;
        busy = true;
        panel.setAttribute("aria-busy", "true");
        panel.querySelectorAll("button").forEach(button => { button.disabled = true; });
        try {
          payment = (await api("/" + encodeURIComponent(id) + path, body)).payment;
          paint();
        } catch (error) { message.textContent = error.message || t("sonaraUnavailable"); }
        finally {
          busy = false;
          panel.setAttribute("aria-busy", "false");
          panel.querySelectorAll("button").forEach(button => { button.disabled = false; });
        }
      };
      set(message, "sonaraPending");
      check.addEventListener("click", () => refresh());
      retry.addEventListener("click", () => refresh("/retry", {}));
      otpForm.addEventListener("submit", event => {
        event.preventDefault();
        const otp = input.value.trim();
        input.value = ""; // Never retain an OTP in the draft or local storage.
        if (!/^\d{4,12}$/.test(otp)) { set(message, "sonaraOtpInvalid"); return; }
        refresh("/retry", { otp });
      });
      timer = setInterval(() => { if (!document.hidden) refresh(); }, 5000);
      document.addEventListener("deposit-language-change", paint);
      window.addEventListener("pagehide", () => clearInterval(timer), { once: true });
      await refresh();
    },
  };
})();
