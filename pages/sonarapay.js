/* Same-origin API only. Private key and provider calls remain on the server. */
(() => {
  const { t, set } = window.depositI18n;
  const endpoint = "/api/sonarapay/payments";
  const api = async (path, body) => {
    let response, result;
    try {
      response = await fetch(endpoint + path, {
        method: body === undefined ? "GET" : "POST", credentials: "include", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      result = await response.json();
    } catch {
      throw Object.assign(new Error(t("sonaraConnectionLost")), { uncertain: true });
    }
    if (response.status === 401) location.replace("/connexion");
    if (!response.ok) throw Object.assign(new Error(result.error || t("sonaraUnavailable")), {
      uncertain: response.status >= 500,
    });
    return result;
  };
  window.sonaraPay = {
    async recover(draft) {
      // Read only: recovering a lost browser response must never initiate a payment.
      const result = await api("");
      const payment = result.payments.find(order => order.requestId === draft.request_id);
      if (!payment) throw Object.assign(new Error(t("sonaraConnectionLost")), { uncertain: true });
      return payment;
    },
    async create(draft, otp) {
      try {
        return (await api("", {
          amount: draft.amount_fcfa, operatorId: draft.operator,
          phone: draft.phone, requestId: draft.request_id,
          ...(otp ? { otp } : {}),
        })).payment;
      } catch (error) {
        if (!error.uncertain) throw error;
        try { return await this.recover(draft); }
        catch { throw Object.assign(new Error(t("sonaraConnectionLost")), { uncertain: true }); }
      }
    },
    async mount(id, populateLogo, operatorBrand) {
      document.body.classList.add("narke-automatic");
      const content = document.querySelector("[data-deposit-content]");
      const panel = document.querySelector("[data-sonara-panel]");
      const message = panel.querySelector("[data-sonara-status]");
      const otpForm = panel.querySelector("form");
      const input = panel.querySelector("input");
      const check = panel.querySelector("[data-sonara-check]");
      const retry = panel.querySelector("[data-sonara-retry]");
      const success = panel.querySelector("[data-sonara-success]");
      const nonsuccess = panel.querySelector("[data-sonara-nonsuccess]");
      const clock = document.querySelector("[data-deposit-clock]");
      const redirectNotice = panel.querySelector("[data-sonara-redirect]");
      const resultTitle = panel.querySelector("[data-sonara-result-title]");
      let payment, busy = false, pollTimer, clockTimer, lastState;
      let redirectTimer, redirectTick, redirectDeadline;
      const updateRedirect = () => {
        if (!redirectDeadline) return;
        const seconds = Math.max(0, Math.ceil((redirectDeadline - Date.now()) / 1000));
        set(redirectNotice, "sonaraRedirect", { seconds });
        if (seconds === 0) location.replace("/accueil");
      };
      const startRedirect = () => {
        if (redirectDeadline) return; // Polling and language changes must not reset the delay.
        redirectDeadline = Date.now() + 10000;
        redirectNotice.hidden = false;
        updateRedirect();
        redirectTick = setInterval(updateRedirect, 1000);
        redirectTimer = setTimeout(() => location.replace("/accueil"), 10000);
      };
      content.hidden = false;
      document.querySelector("[data-deposit-missing]").hidden = true;
      content.querySelectorAll(".deposit-details,.deposit-ussd-card,.deposit-validation,.deposit-notice")
        .forEach(node => { node.hidden = true; });
      panel.hidden = false;
      document.querySelectorAll(".deposit-timer").forEach(node => { node.hidden = false; });
      const stateKey = () => payment?.credited === true ? "sonaraSuccessful"
        : payment?.status === "failed" ? "sonaraFailed"
        : ["credentials", "credentials_changed"].includes(payment?.errorCode) ? "sonaraCredentials"
        : payment?.status === "review" ? "sonaraReview"
        : payment?.status === "otp_required" ? "sonaraOtp"
        : payment?.errorCode ? "sonaraUnknown" : "sonaraPending";
      const updateClock = () => {
        if (!clock) return;
        const now = new Date();
        const locale = document.documentElement.lang === "en" ? "en-GB" : "fr-FR";
        clock.textContent = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(now);
        clock.dateTime = now.toISOString();
        clock.setAttribute("aria-label", t("clockLabel", { time: clock.textContent }));
      };
      const paint = () => {
        if (!payment) return;
        const credited = payment.credited === true;
        const validAmount = Number.isSafeInteger(payment.amount_fcfa) && payment.amount_fcfa >= 0;
        const amount = validAmount ? `FCFA ${new Intl.NumberFormat("en-US").format(payment.amount_fcfa)}` : "—";
        const currentState = stateKey();
        set(resultTitle, payment.status === "failed" ? "sonaraFailedTitle" : "sonaraTitle");
        message.setAttribute("role", payment.status === "failed" && !credited ? "alert" : "status");
        if (lastState !== currentState || !message.dataset.i18n) {
          set(message, currentState);
          lastState = currentState;
        }
        panel.dataset.paymentStatus = credited ? "successful" : String(payment.status || "pending");
        // Presentation only: only the server's credited flag can show success.
        const visualState = credited ? "successful" : payment.status === "failed" ? "failed" : "pending";
        document.body.dataset.paymentState = visualState;
        document.body.classList.toggle("narke-otp-state", !credited && payment.status === "otp_required");
        const visualKey = credited ? "Success" : visualState === "failed" ? "Failure" : "Pending";
        set(document.querySelector("[data-narke-title]"), `narke${visualKey}Hero`);
        set(document.querySelector("[data-narke-lede]"), `narke${visualKey}Lede`);
        const symbol = document.querySelector("[data-narke-symbol]");
        if (symbol) symbol.textContent = credited ? "✓" : visualState === "failed" ? "×" : "↻";
        const failureNotice = document.querySelector("[data-narke-failure]");
        if (failureNotice) failureNotice.hidden = visualState !== "failed";
        panel.querySelector("[data-payment-display-number]").textContent =
          window.paymentDisplayNumber(payment.reference || payment.id);
        panel.querySelectorAll("[data-sonara-amount]").forEach(node => { node.textContent = amount; });
        const operator = payment.operator || {};
        document.querySelector("[data-selected-operator]").textContent = operator.operatorName || "—";
        document.querySelector("[data-deposit-phone]").textContent = payment.phone || "—";
        const logo = document.querySelector("[data-confirmation-logo]");
        logo.replaceChildren();
        populateLogo(logo, operator, operatorBrand(operator));
        success.hidden = !credited;
        nonsuccess.hidden = credited;
        otpForm.hidden = payment.status !== "otp_required" || credited;
        panel.querySelector("[data-sonara-ussd]").textContent = payment.ussdCode || "";
        retry.hidden = credited || payment.status === "failed" || !!payment.reference
          || !payment.errorCode || payment.status === "otp_required";
        if (credited || payment.status === "failed") {
          clearInterval(pollTimer);
          check.hidden = true;
          startRedirect();
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
        } catch (error) {
          message.removeAttribute("data-i18n");
          message.textContent = error.message || t("sonaraUnavailable");
        }
        finally {
          busy = false;
          panel.setAttribute("aria-busy", "false");
          panel.querySelectorAll("button").forEach(button => { if (!button.hidden) button.disabled = false; });
        }
      };
      updateClock();
      clockTimer = setInterval(updateClock, 30000);
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
      pollTimer = setInterval(() => { if (!document.hidden) refresh(); }, 5000);
      document.addEventListener("deposit-language-change", () => { updateClock(); paint(); updateRedirect(); });
      document.addEventListener("visibilitychange", updateRedirect);
      window.addEventListener("pagehide", () => {
        clearInterval(pollTimer);
        clearInterval(clockTimer);
        clearInterval(redirectTick);
        clearTimeout(redirectTimer);
        document.removeEventListener("visibilitychange", updateRedirect);
      }, { once: true });
      await refresh();
    },
  };
})();
