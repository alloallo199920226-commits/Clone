/* Manual instructions elsewhere; enabled countries use authenticated server Payin. */
(() => {
  const key = "shineray-deposit-draft";
  const content = document.querySelector("[data-deposit-content]");
  const missing = document.querySelector("[data-deposit-missing]");
  const status = document.querySelector("[data-deposit-status]");
  const form = document.querySelector("#deposit-operator-form");
  const operators = {};
  const copyValues = {};
  const { t, set } = window.depositI18n;
  const notify = (key, params) => set(status, key, params);
  const money = value => `FCFA ${new Intl.NumberFormat("en-US").format(value)}`;
  const updateTitle = () => {
    document.title = document.documentElement.lang === "en"
      ? `IVECO Pay — ${form ? "Choose an operator" : "Deposit instructions"}`
      : `IVECO Pay — ${form ? "Choisir un opérateur" : "Instructions du dépôt"}`;
  };
  updateTitle();
  document.addEventListener("deposit-language-change", updateTitle);
  const operatorBrand = channel => {
    const name = `${channel.operatorName || ""} ${channel.logoText || ""}`.toLowerCase();
    if (name.includes("mtn")) return "mtn";
    if (name.includes("moov")) return "moov";
    return "other";
  };
  function fallbackLogo(node, channel, brand) {
    const label = document.createElement("span");
    label.className = "operator-logo-fallback";
    label.textContent = String(channel.logoText || channel.operatorName || "").trim().slice(0, 12);
    node.dataset.brand = brand;
    node.append(label);
  }
  function populateLogo(logo, channel, brand) {
    logo.dataset.brand = brand;
    const configured = String(channel.logoUrl || "").trim();
    const source = configured || (brand === "mtn" ? "/pages/assets/mtn-logo.png"
      : brand === "moov" ? "/pages/assets/moov-africa-logo.png" : "");
    if (!source) { fallbackLogo(logo, channel, brand); return; }
    try {
      const parsed = new URL(source, location.origin);
      if (!["http:", "https:"].includes(parsed.protocol) ||
          (parsed.origin !== location.origin && parsed.protocol !== "https:")) {
        fallbackLogo(logo, channel, brand);
        return;
      }
      const image = document.createElement("img");
      image.src = parsed.href;
      image.alt = "";
      image.addEventListener("error", () => {
        image.remove();
        fallbackLogo(logo, channel, brand);
      }, { once: true });
      logo.append(image);
    } catch { fallbackLogo(logo, channel, brand); }
  }
  const flagMarkup = prefix => {
    const flags = {
      "+229": '<svg viewBox="0 0 30 20" role="presentation"><path fill="#008751" d="M0 0h12v20H0z"/><path fill="#fcd116" d="M12 0h18v10H12z"/><path fill="#e8112d" d="M12 10h18v10H12z"/></svg>',
      "+227": '<svg viewBox="0 0 30 20" role="presentation"><path fill="#e05206" d="M0 0h30v6.67H0z"/><path fill="#fff" d="M0 6.67h30v6.66H0z"/><path fill="#0db02b" d="M0 13.33h30V20H0z"/><circle cx="15" cy="10" r="2.6" fill="#e05206"/></svg>',
      "+228": '<svg viewBox="0 0 30 20" role="presentation"><path fill="#006a4e" d="M0 0h30v20H0z"/><path fill="#ffce00" d="M0 0h30v4H0zM0 8h30v4H0zM0 16h30v4H0z"/><path fill="#d21034" d="M0 0h12v10H0z"/><path fill="#fff" d="m6 1.8 1.3 2.5 2.8.4-2 2 .5 2.8L6 8.2l-2.6 1.3.5-2.8-2-2 2.8-.4z"/></svg>',
      "+225": '<svg viewBox="0 0 30 20" role="presentation"><path fill="#f77f00" d="M0 0h10v20H0z"/><path fill="#fff" d="M10 0h10v20H10z"/><path fill="#009e60" d="M20 0h10v20H20z"/></svg>',
      "+226": '<svg viewBox="0 0 30 20" role="presentation"><path fill="#ef2b2d" d="M0 0h30v10H0z"/><path fill="#009e49" d="M0 10h30v10H0z"/><path fill="#fcd116" d="m15 5 1.2 3.6H20l-3.1 2.2 1.2 3.6-3.1-2.2-3.1 2.2 1.2-3.6L10 8.6h3.8z"/></svg>',
      "+221": '<svg viewBox="0 0 30 20" role="presentation"><path fill="#00853f" d="M0 0h10v20H0z"/><path fill="#fdef42" d="M10 0h10v20H10z"/><path fill="#e31b23" d="M20 0h10v20H20z"/><path fill="#00853f" d="m15 5 1.1 3.3h3.5l-2.8 2 1.1 3.3-2.9-2-2.9 2 1.1-3.3-2.8-2h3.5z"/></svg>',
      "+223": '<svg viewBox="0 0 30 20" role="presentation"><path fill="#14b53a" d="M0 0h10v20H0z"/><path fill="#fcd116" d="M10 0h10v20H10z"/><path fill="#ce1126" d="M20 0h10v20H20z"/></svg>',
      "+224": '<svg viewBox="0 0 30 20" role="presentation"><path fill="#ce1126" d="M0 0h10v20H0z"/><path fill="#fcd116" d="M10 0h10v20H10z"/><path fill="#009460" d="M20 0h10v20H20z"/></svg>',
      "+234": '<svg viewBox="0 0 30 20" role="presentation"><path fill="#008751" d="M0 0h10v20H0z"/><path fill="#fff" d="M10 0h10v20H10z"/><path fill="#008751" d="M20 0h10v20H20z"/></svg>',
      "+233": '<svg viewBox="0 0 30 20" role="presentation"><path fill="#ce1126" d="M0 0h30v7H0z"/><path fill="#fcd116" d="M0 7h30v6H0z"/><path fill="#006b3f" d="M0 13h30v7H0z"/><path fill="#111" d="m15 8 1 2.2h2.4l-1.9 1.4.7 2.3-2.2-1.4-2.2 1.4.7-2.3-1.9-1.4h2.4z"/></svg>',
      "+237": '<svg viewBox="0 0 30 20" role="presentation"><path fill="#007a5e" d="M0 0h10v20H0z"/><path fill="#ce1126" d="M10 0h10v20H10z"/><path fill="#fcd116" d="M20 0h10v20H20z"/><path fill="#fcd116" d="m15 6 1 2.5h2.6l-2.1 1.5.8 2.5-2.3-1.5-2.3 1.5.8-2.5-2.1-1.5H14z"/></svg>'
    };
    return flags[prefix] || '<svg viewBox="0 0 30 20" role="presentation"><rect width="30" height="20" fill="#e8edf1"/><path d="M0 0h30v6H0z" fill="#cbd4dc"/><path d="M0 14h30v6H0z" fill="#cbd4dc"/></svg>';
  };
  let draft;
  const requestedPayment = new URL(location.href).searchParams.get("payment");
  if (!form && requestedPayment) {
    if (/^[0-9a-f-]{36}$/i.test(requestedPayment)) {
      window.sonaraPay.mount(requestedPayment, populateLogo, operatorBrand);
    } else showMissing();
    return;
  }
  function save() {
    try { sessionStorage.setItem(key, JSON.stringify(draft)); return true; }
    catch { notify("storage"); return false; }
  }
  function go(path) {
    const link = document.createElement("a");
    link.href = path;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
  }
  function showMissing(reason = "missing") {
    content.hidden = true;
    missing.hidden = false;
    set(missing.querySelector("p"), reason);
  }
  try { draft = JSON.parse(sessionStorage.getItem(key)); } catch { draft = null; }
  // A reopened page or a new embedded-browser context may lose sessionStorage.
  // Recover only the selected amount/channel, never a phone, OTP or paid status.
  if (form && (!draft || !Number.isSafeInteger(draft.amount_fcfa) ||
      draft.amount_fcfa < 500 || ![1, 2].includes(draft.channel) ||
      !Number.isFinite(draft.created_at))) {
    const selection = new URL(location.href).searchParams;
    const amount = selection.get("amount") || "";
    const channel = selection.get("channel") || "";
    if (/^\d{3,9}$/.test(amount) && Number(amount) >= 500 &&
        Number(amount) <= 500000000 && /^[12]$/.test(channel)) {
      draft = { amount_fcfa: Number(amount), channel: Number(channel), created_at: Date.now() };
      if (!save()) return;
    }
  }
  if (!form && draft?.payment_id) {
    window.sonaraPay.mount(draft.payment_id, populateLogo, operatorBrand);
    return;
  }
  if (!draft || !Number.isSafeInteger(draft.amount_fcfa) || draft.amount_fcfa < 500 ||
      ![1, 2].includes(draft.channel) || !Number.isFinite(draft.created_at) ||
      Date.now() - draft.created_at < 0) {
    showMissing();
    return;
  }
  const confirmation = !form;
  content.setAttribute("aria-busy", "true");
  const submit = form?.querySelector('[type="submit"]');
  const deadline = draft.created_at + 20 * 60 * 1000;
  let timer;
  function expired() {
    if (Date.now() < deadline) return false;
    clearInterval(timer);
    content.querySelectorAll("button, input").forEach(node => { node.disabled = true; });
    showMissing("expired");
    return true;
  }
  function tick() {
    const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    document.querySelectorAll(".deposit-timer").forEach(node => {
      node.textContent = time;
      node.setAttribute("aria-label", t("remaining", { time }));
    });
    expired();
  }
  tick();
  if (expired()) return;
  timer = setInterval(tick, 1000);
  document.addEventListener("visibilitychange", tick);
  document.addEventListener("deposit-language-change", tick);
  window.addEventListener("pageshow", tick);
  if (submit) submit.disabled = true;
  document.querySelectorAll("[data-deposit-amount]").forEach(node => { node.textContent = money(draft.amount_fcfa); });
  fetch("/api/me", { credentials: "include", cache: "no-store" }).then(async response => {
    if (response.status === 401) { location.replace("/connexion"); throw new Error("signIn"); }
    if (!response.ok) throw new Error("accountError");
    const account = await response.json();
    if (expired()) return;
    if (draft.account_id && draft.account_id !== account.id) {
      sessionStorage.removeItem(key);
      showMissing();
      return;
    }
    const channelResponse = await fetch("/api/payment-channels/me", { credentials: "include", cache: "no-store" });
    if (!channelResponse.ok) throw new Error("accountError");
    const configuration = await channelResponse.json();
    if (expired()) return;
    const prefix = configuration.countryCode;
    if (!prefix) throw new Error("countryError");
    const length = configuration.phoneLength;
    const channels = configuration.channels;
    const isAutomatic = channel => (channel?.provider || configuration.provider) === "sonarapay";
    channels.forEach(channel => { operators[String(channel.id)] = channel.operatorName; });
    if (draft.country_code && draft.country_code !== prefix) {
      delete draft.phone;
      delete draft.operator;
    }
    draft.account_id = account.id;
    draft.country_code = prefix;
    if (!save()) return;
    document.querySelectorAll("[data-deposit-prefix]").forEach(node => { node.textContent = prefix; });
    document.querySelectorAll("[data-deposit-flag]").forEach(node => { node.innerHTML = flagMarkup(prefix); });
    if (!channels.length) {
      if (confirmation) showMissing("channelUnavailable");
      else notify("noChannels");
      return;
    }
    const displayValue = (selector, value) => {
      const node = document.querySelector(selector);
      if (!node || !value) return;
      node.removeAttribute("data-i18n");
      node.textContent = value;
    };
    document.querySelector(".deposit-notice strong")?.setAttribute("hidden", "");
    const notice = document.querySelector("[data-notice-body]");
    if (notice) set(notice, "manualDetails");
    if (confirmation) {
      const channel = channels.find(item => String(item.id) === String(draft.operator));
      if (!channel) { showMissing("channelUnavailable"); return; }
      if (isAutomatic(channel)) { showMissing("channelUnavailable"); return; }
      const confirmationLogo = document.querySelector("[data-confirmation-logo]");
      if (confirmationLogo) populateLogo(confirmationLogo, channel, operatorBrand(channel));
      if (!new RegExp(`^\\d{${length}}$`).test(draft.phone || "")) {
        showMissing();
        return;
      }
      displayValue("[data-merchant-name]", channel.receiverName);
      displayValue("[data-merchant-account]", channel.receiverNumber);
      copyValues.merchant_name = channel.receiverName;
      copyValues.merchant_account = channel.receiverNumber;
      const ussd = String(channel.ussdTemplate || "")
        .replaceAll("{amount}", String(draft.amount_fcfa))
        .replaceAll("{account}", channel.receiverNumber)
        .replaceAll("{number}", channel.receiverNumber)
        .replaceAll("{receiverNumber}", channel.receiverNumber)
        .replaceAll("{phone}", draft.phone);
      if (/^[*#\d+]{3,100}$/.test(ussd)) {
        displayValue("[data-ussd-code]", ussd);
        copyValues.ussd = ussd;
        const dial = document.querySelector("[data-deposit-dial]");
        dial.href = `tel:${encodeURIComponent(ussd)}`;
        dial.removeAttribute("aria-disabled");
      } else {
        const card = document.querySelector(".deposit-ussd-card");
        card.classList.add("manual-transfer-highlight");
        card.querySelectorAll(".signature-code-wrap,.deposit-ussd-actions,.deposit-ussd-instructions:not([data-manual-transfer])").forEach(node => {
          node.hidden = true;
          node.style.display = "none";
        });
        const instructions = card.querySelector("[data-manual-transfer]");
        instructions.hidden = false;
        set(instructions, "manualTransferInstructions");
      }
      for (const name of ["merchant_name", "merchant_account", "ussd"]) {
        document.querySelectorAll(`[data-copy="${name}"]`).forEach(button => {
          button.disabled = !copyValues[name];
        });
      }
      document.querySelector("[data-selected-operator]").textContent = operators[draft.operator];
      set(document.querySelector("[data-ussd-heading]"), "ussdHeading", { operator: operators[draft.operator] });
      if (!copyValues.ussd) set(document.querySelector("[data-ussd-heading]"), "manualTransferHeading");
      document.querySelector("[data-deposit-phone]").textContent = `${prefix} ${draft.phone}`;
      set(document.querySelector("[data-deposit-validation]"), "manualDetails");
      document.querySelector('[data-copy="amount"]').disabled = false;
      document.querySelector("[data-deposit-result]").disabled = false;
      const resultButton = document.querySelector("[data-deposit-result]");
      let recording = false;
      resultButton.addEventListener("click", async () => {
        if (recording || expired()) return;
        if (!draft.manual_request_id) draft.manual_request_id = crypto.randomUUID();
        if (!save()) return;
        recording = true;
        resultButton.disabled = true;
        resultButton.classList.add("manual-deposit-busy");
        resultButton.setAttribute("aria-busy", "true");
        set(resultButton, "manualSending");
        notify("manualSending");
        try {
          const response = await fetch("/api/manual-deposits", {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ request_id: draft.manual_request_id,
              channel_id: Number(channel.id), amount_fcfa: draft.amount_fcfa, phone: draft.phone }),
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || t("manualError"));
          if (!payload.deposit?.reference) throw new Error(t("manualError"));
          clearInterval(timer);
          displayValue("[data-manual-display-number]", window.paymentDisplayNumber(payload.deposit.reference));
          document.querySelector("[data-manual-display-row]").hidden = false;
          document.removeEventListener("visibilitychange", tick);
          document.removeEventListener("deposit-language-change", tick);
          window.removeEventListener("pageshow", tick);
          set(document.querySelector("[data-deposit-validation]"), "manualRecorded");
          set(notice, "manualRecorded");
          set(resultButton, "manualRecordedShort");
          let seconds = 10;
          notify("manualRedirect", { seconds });
          const redirectTimer = setInterval(() => {
            seconds -= 1;
            notify("manualRedirect", { seconds });
            if (seconds <= 0) {
              clearInterval(redirectTimer);
              // Remove only this completed draft, never a newer request from another page.
              try {
                const current = JSON.parse(sessionStorage.getItem(key));
                if (current?.manual_request_id === draft.manual_request_id) sessionStorage.removeItem(key);
              } catch {}
              location.replace("/accueil");
            }
          }, 1000);
        } catch (error) {
          status.removeAttribute("data-i18n");
          status.textContent = error.message === "Failed to fetch" || error instanceof TypeError
            ? t("manualError") : error.message;
          resultButton.classList.remove("manual-deposit-busy");
          resultButton.removeAttribute("aria-busy");
          set(resultButton, "result");
          resultButton.disabled = false;
          recording = false;
        }
      });
      return;
    }
    const input = document.querySelector("#deposit-phone");
    input.value = draft.phone || "";
    input.maxLength = 24;
    const options = document.querySelector(".deposit-operator-options");
    channels.forEach(channel => {
      const id = String(channel.id);
      const brand = operatorBrand(channel);
      const logo = document.createElement("span");
      logo.className = `operator-logo${brand === "other" ? "" : ` operator-logo--${brand}`}`;
      populateLogo(logo, channel, brand);
      if (/^#[0-9a-f]{6}$/i.test(channel.logoColor)) logo.style.backgroundColor = channel.logoColor;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "deposit-operator";
      button.dataset.operator = id;
      button.dataset.brand = brand;
      const name = document.createElement("span");
      name.className = "deposit-operator-name";
      name.textContent = channel.operatorName;
      const check = document.createElement("span");
      check.className = "deposit-check";
      check.setAttribute("aria-hidden", "true");
      check.textContent = "✓";
      button.append(name, check);
      const choice = document.createElement("div");
      choice.className = "deposit-operator-choice";
      choice.append(logo, button);
      options.append(choice);
    });
    const choose = operator => {
      draft.operator = operator;
      const automatic = isAutomatic(channels.find(channel => String(channel.id) === operator));
      const otpArea = document.querySelector("[data-orange-otp]");
      const otpInput = document.querySelector("#deposit-orange-otp");
      otpArea.hidden = !automatic || operator !== "orange_bf";
      otpInput.disabled = otpArea.hidden;
      otpInput.value = "";
      set(otpArea.querySelector("[data-i18n='orangeOtpHelp']"), "orangeOtpHelp",
        { ussd: `*144*4*6*${draft.amount_fcfa}#` });
      if (notice) set(notice, automatic ? "sonaraConsent" : "manualDetails");
      set(submit.querySelector("[data-submit-label]"), automatic ? "sonaraStart" : "submit");
      document.querySelectorAll("[data-operator]").forEach(button => {
        button.setAttribute("aria-pressed", String(button.dataset.operator === operator));
      });
    };
    choose(operators[draft.operator] ? String(draft.operator) : String(channels[0].id));
    document.querySelectorAll("[data-operator]").forEach(button => {
      button.addEventListener("click", () => choose(button.dataset.operator));
    });
    submit.disabled = false;
    const trackPayment = async (recoverOnly, otp) => {
      if (!draft.request_id) draft.request_id = crypto.randomUUID();
      draft.request_uncertain = true;
      if (!save()) return;
      submit.disabled = true;
      notify("sonaraCreating");
      try {
        const payment = await (recoverOnly
          ? window.sonaraPay.recover(draft) : window.sonaraPay.create(draft, otp));
        draft.payment_id = payment.id;
        delete draft.request_uncertain;
        save();
        go("/confirmation-depot?payment=" + encodeURIComponent(payment.id));
      } catch (error) {
        if (!recoverOnly && !error.uncertain) {
          delete draft.request_uncertain;
          save();
        }
        status.removeAttribute("data-i18n");
        status.textContent = error.message || t("sonaraUnavailable");
        if (draft.request_uncertain) {
          set(submit, "sonaraRecover");
          status.textContent += ` ${t("sonaraRecoverNotice")}`;
        }
      } finally { submit.disabled = false; }
    };
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const automatic = isAutomatic(channels.find(channel => String(channel.id) === String(draft.operator)));
      if (automatic && draft.request_uncertain) {
        await trackPayment(true);
        return;
      }
      if (expired()) return;
      let phone = input.value.replace(/\D/g, "");
      if (phone.startsWith(prefix.slice(1)) && phone.length === length + 3) phone = phone.slice(3);
      if (!new RegExp(`^\\d{${length}}$`).test(phone)) {
        notify("phoneError", { length, prefix });
        input.focus();
        return;
      }
      draft.phone = phone;
      if (automatic) {
        const otpInput = document.querySelector("#deposit-orange-otp");
        const otp = draft.operator === "orange_bf" ? otpInput.value.trim() : "";
        otpInput.value = "";
        if (otp && !/^\d{4,12}$/.test(otp)) {
          notify("sonaraOtpInvalid");
          otpInput.focus();
          return;
        }
        await trackPayment(false, otp || undefined);
        return;
      }
      if (save()) go("/confirmation-depot");
    });
    if (draft.request_uncertain && isAutomatic(channels.find(channel => String(channel.id) === String(draft.operator)))) await trackPayment(true);
  }).catch(error => {
    if (!expired()) notify(["signIn", "accountError", "countryError"].includes(error.message) ? error.message : "accountError");
  }).finally(() => { content.setAttribute("aria-busy", "false"); });

  document.querySelectorAll("[data-copy]").forEach(button => {
    if (button.dataset.copy !== "amount") button.disabled = true;
    button.addEventListener("click", async () => {
      if (expired()) return;
      try {
        const value = button.dataset.copy === "amount" ? String(draft.amount_fcfa) : copyValues[button.dataset.copy];
        if (!value) return;
        await navigator.clipboard.writeText(value);
        if (!expired()) notify("copied");
      } catch { if (!expired()) notify("copyError"); }
    });
  });
  document.querySelector("[data-deposit-dial]")?.addEventListener("click", event => {
    if (copyValues.ussd && !expired()) return;
    event.preventDefault();
    if (!expired()) notify("dialError");
  });
})();
