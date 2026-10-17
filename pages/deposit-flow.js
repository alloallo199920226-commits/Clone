/* UI-only deposit draft. No payment request, financial credit or fake result. */
(() => {
  const key = "shineray-deposit-draft";
  const content = document.querySelector("[data-deposit-content]");
  const missing = document.querySelector("[data-deposit-missing]");
  const status = document.querySelector("[data-deposit-status]");
  const form = document.querySelector("#deposit-operator-form");
  const operators = { mtn: "MTN Mobile Money", moov: "MOOV Money" };
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
  if (!draft || !Number.isSafeInteger(draft.amount_fcfa) || draft.amount_fcfa < 4000 ||
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
    const prefix = String(account.phone || "").match(/^\+(228|225)/)?.[0];
    if (!prefix) throw new Error("countryError");
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
      set(document.querySelector("[data-ussd-heading]"), "ussdHeading", { operator: operators[draft.operator] });
      document.querySelector("[data-deposit-phone]").textContent = `${prefix} ${draft.phone}`;
      set(document.querySelector("[data-deposit-validation]"), "pending");
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
      if (expired()) return;
      let phone = input.value.replace(/\D/g, "");
      const length = prefix === "+225" ? 10 : 8;
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
    if (button.dataset.copy !== "amount") { button.disabled = true; return; }
    button.addEventListener("click", async () => {
      if (expired()) return;
      try {
        await navigator.clipboard.writeText(String(draft.amount_fcfa));
        if (!expired()) notify("copied");
      } catch { if (!expired()) notify("copyError"); }
    });
  });
  document.querySelector("[data-deposit-dial]")?.addEventListener("click", event => {
    event.preventDefault();
    if (!expired()) notify("dialError");
  });
})();
