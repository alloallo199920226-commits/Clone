/* Shared country sheet for sign-in and sign-up. Countries are already local;
   the brief spinner/dots sequence is an opening animation, not a network call. */
window.setupCountryPicker = () => {
  const overlay = document.querySelector("[data-country-overlay]");
  const sheet = overlay.querySelector(".country-sheet");
  const trigger = document.querySelector(".country-trigger");
  const countryInput = document.querySelector('input[name="country"]');
  const label = document.querySelector("[data-country-label]");
  const prefix = document.querySelector("[data-phone-prefix]");
  const options = overlay.querySelector(".country-options");
  const closeButton = overlay.querySelector("[data-country-close]");
  const page = document.querySelector(".auth-page");
  const timers = [];
  let previousOverflow = "";

  function stage(value) {
    overlay.dataset.stage = value;
    const ready = value === "ready";
    options.hidden = !ready;
    sheet.setAttribute("aria-busy", String(!ready));
    if (ready) options.querySelector(".country-option").focus();
  }

  function closeCountryPicker() {
    timers.splice(0).forEach(clearTimeout);
    overlay.hidden = true;
    sheet.setAttribute("aria-busy", "false");
    trigger.setAttribute("aria-expanded", "false");
    page.inert = false;
    document.body.style.overflow = previousOverflow;
    trigger.focus();
  }

  trigger.addEventListener("click", () => {
    if (!overlay.hidden) return;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    page.inert = true;
    overlay.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    stage("spinner");
    sheet.focus();
    timers.push(setTimeout(() => {
      stage("dots");
      closeButton.focus();
    }, 160));
    timers.push(setTimeout(() => stage("ready"), 460));
  });

  overlay.addEventListener("click", (event) => {
    const option = event.target.closest("[data-country-code]");
    if (option && overlay.dataset.stage === "ready") {
      countryInput.value = option.dataset.countryCode;
      label.textContent = `${option.dataset.countryName} (${option.dataset.countryCode})`;
      prefix.textContent = `${option.dataset.countryCode} `;
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
    const focusable = overlay.dataset.stage === "spinner"
      ? [sheet]
      : overlay.dataset.stage === "ready"
        ? [closeButton, ...options.querySelectorAll(".country-option")]
        : [closeButton];
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
