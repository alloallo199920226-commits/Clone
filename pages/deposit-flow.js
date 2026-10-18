/* UI-only deposit draft. No payment request, financial credit or fake result. */
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
  let draft;
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
    channels.forEach(channel => { operators[String(channel.id)] = channel.operatorName; });
    if (draft.country_code && draft.country_code !== prefix) {
      delete draft.phone;
      delete draft.operator;
    }
    draft.account_id = account.id;
    draft.country_code = prefix;
    if (!save()) return;
    document.querySelectorAll("[data-deposit-prefix]").forEach(node => { node.textContent = prefix; });
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
      }
      for (const name of ["merchant_name", "merchant_account", "ussd"]) {
        const button = document.querySelector(`[data-copy="${name}"]`);
        if (button) button.disabled = !copyValues[name];
      }
      document.querySelector("[data-selected-operator]").textContent = operators[draft.operator];
      set(document.querySelector("[data-ussd-heading]"), "ussdHeading", { operator: operators[draft.operator] });
      document.querySelector("[data-deposit-phone]").textContent = `${prefix} ${draft.phone}`;
      set(document.querySelector("[data-deposit-validation]"), "manualDetails");
      document.querySelector('[data-copy="amount"]').disabled = false;
      document.querySelector("[data-deposit-result]").disabled = false;
      document.querySelector("[data-deposit-result]").addEventListener("click", () => {
        if (!expired()) notify("noPayment");
      });
      return;
    }
    const input = document.querySelector("#deposit-phone");
    input.value = draft.phone || "";
    input.maxLength = 24;
    const options = document.querySelector(".deposit-operator-options");
    const logos = document.querySelector(".deposit-operator-logos");
    channels.forEach(channel => {
      const id = String(channel.id);
      const logo = document.createElement("span");
      logo.className = "operator-logo";
      logo.textContent = channel.logoText || channel.operatorName;
      if (/^#[0-9a-f]{6}$/i.test(channel.logoColor)) logo.style.backgroundColor = channel.logoColor;
      logos.append(logo);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "deposit-operator";
      button.dataset.operator = id;
      button.textContent = channel.operatorName;
      options.append(button);
    });
    const choose = operator => {
      draft.operator = operator;
      document.querySelectorAll("[data-operator]").forEach(button => {
        button.setAttribute("aria-pressed", String(button.dataset.operator === operator));
      });
    };
    choose(operators[draft.operator] ? String(draft.operator) : String(channels[0].id));
    document.querySelectorAll("[data-operator]").forEach(button => {
      button.addEventListener("click", () => choose(button.dataset.operator));
    });
    submit.disabled = false;
    form.addEventListener("submit", event => {
      event.preventDefault();
      if (expired()) return;
      let phone = input.value.replace(/\D/g, "");
      if (phone.startsWith(prefix.slice(1)) && phone.length === length + 3) phone = phone.slice(3);
      if (!new RegExp(`^\\d{${length}}$`).test(phone)) {
        notify("phoneError", { length, prefix });
        input.focus();
        return;
      }
      draft.phone = phone;
      if (save()) go("/confirmation-depot");
    });
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
