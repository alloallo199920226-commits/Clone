/* Both opening stages await real requests. Minimum display times make each
   stage legible on fast connections; slow/offline requests never reveal a
   local fallback list or advance before the server response arrives. */
window.setupCountryPicker = () => {
  const overlay = document.querySelector("[data-country-overlay]");
  const sheet = overlay.querySelector(".country-sheet");
  const trigger = document.querySelector(".country-trigger");
  const countryInput = document.querySelector('input[name="country"]');
  const label = document.querySelector("[data-country-label]");
  const countryCodeLabel = document.querySelector("[data-country-code-label]");
  const countryFlag = document.querySelector("[data-country-flag]");
  const prefix = document.querySelector("[data-phone-prefix]");
  const options = overlay.querySelector(".country-options");
  const closeButton = overlay.querySelector("[data-country-close]");
  const errorBox = overlay.querySelector("[data-country-error]");
  const errorMessage = overlay.querySelector("[data-country-message]");
  const retry = overlay.querySelector("[data-country-retry]");
  const page = document.querySelector(".auth-page");
  const loadingText = overlay.querySelector("[data-country-loading] .sr-only");
  let previousOverflow = "";
  let request;
  let generation = 0;

  function stage(value) {
    overlay.dataset.stage = value;
    options.hidden = value !== "ready";
    errorBox.hidden = value !== "error";
    sheet.setAttribute("aria-busy", String(value === "spinner" || value === "dots"));
    loadingText.textContent = value === "spinner"
      ? "Connexion au service des pays…"
      : "Chargement des pays disponibles…";
    if (value === "ready") options.querySelector(".country-option").focus();
    else if (value === "error") retry.focus();
    else if (value === "dots") closeButton.focus();
  }

  function closeCountryPicker() {
    generation++;
    request?.abort();
    overlay.hidden = true;
    sheet.setAttribute("aria-busy", "false");
    trigger.setAttribute("aria-expanded", "false");
    page.inert = false;
    document.body.style.overflow = previousOverflow;
    trigger.focus();
  }

  function minimumDisplay(ms, signal) {
    return new Promise((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(new DOMException("Cancelled", "AbortError"));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, ms);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  }

  async function loadJSON(url, signal) {
    const response = await fetch(url, { signal, cache: "no-store", headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Le service des pays est indisponible.");
    return response.json();
  }

  async function loadCountries() {
    request?.abort();
    request = new AbortController();
    const controller = request;
    const current = ++generation;
    const timeout = setTimeout(() => controller.abort(), 20000);
    stage("spinner");
    sheet.focus();
    try {
      const [config] = await Promise.all([
        loadJSON("/api/country-picker/config", controller.signal),
        minimumDisplay(600, controller.signal),
      ]);
      if (current !== generation || overlay.hidden) return;
      if (config.countries_url !== "/api/countries") throw new Error("Configuration des pays invalide.");
      stage("dots");
      const [data] = await Promise.all([
        loadJSON(config.countries_url, controller.signal),
        minimumDisplay(800, controller.signal),
      ]);
      if (current !== generation || overlay.hidden) return;
      if (!Array.isArray(data.countries) || !data.countries.length ||
          data.countries.some(country => !/^\+\d{1,3}$/.test(country.code) ||
            typeof country.name !== "string" || !country.name.trim())) {
        throw new Error("La liste des pays est indisponible.");
      }
      const buttons = data.countries.map(country => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "country-option";
        button.dataset.countryCode = country.code;
        button.dataset.countryName = country.name;
        const code = document.createElement("span");
        const name = document.createElement("span");
        code.textContent = country.code;
        name.textContent = country.name;
        button.append(code, name);
        return button;
      });
      options.replaceChildren(...buttons);
      stage("ready");
    } catch (error) {
      if (current !== generation || overlay.hidden) return;
      errorMessage.textContent = controller.signal.aborted
        ? "La connexion prend trop de temps. Vérifiez votre connexion Internet et réessayez."
        : "Impossible de charger les pays. Vérifiez votre connexion Internet et réessayez.";
      stage("error");
    } finally {
      clearTimeout(timeout);
    }
  }

  trigger.addEventListener("click", () => {
    if (!overlay.hidden) return;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    page.inert = true;
    overlay.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    loadCountries();
  });
  retry.addEventListener("click", loadCountries);

  overlay.addEventListener("click", (event) => {
    const option = event.target.closest("[data-country-code]");
    if (option && overlay.dataset.stage === "ready") {
      countryInput.value = option.dataset.countryCode;
      label.textContent = `${option.dataset.countryName} (${option.dataset.countryCode})`;
      if (countryCodeLabel) countryCodeLabel.textContent = option.dataset.countryCode;
      if (countryFlag) {
        countryFlag.textContent = ({
          "+225": "🇨🇮", "+226": "🇧🇫", "+227": "🇳🇪",
          "+228": "🇹🇬", "+229": "🇧🇯", "+237": "🇨🇲",
        })[option.dataset.countryCode] || "🌍";
      }
      if (prefix) prefix.textContent = `${option.dataset.countryCode} `;
      countryInput.dispatchEvent(new Event("change", { bubbles: true }));
      closeCountryPicker();
      return;
    }
    if (event.target === overlay || event.target.closest("[data-country-close]")) closeCountryPicker();
  });

  document.addEventListener("keydown", (event) => {
    if (overlay.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeCountryPicker();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = overlay.dataset.stage === "spinner" ? [sheet]
      : overlay.dataset.stage === "ready" ? [closeButton, ...options.querySelectorAll(".country-option")]
        : overlay.dataset.stage === "error" ? [closeButton, retry] : [closeButton];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !focusable.includes(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  });
  return { countryInput, trigger };
};
