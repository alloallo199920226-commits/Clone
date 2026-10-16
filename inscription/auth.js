(() => {
  const overlay = document.querySelector("[data-country-overlay]");
  const trigger = document.querySelector(".country-trigger");
  const countryInput = document.querySelector('input[name="country"]');
  const label = document.querySelector("[data-country-label]");
  const prefix = document.querySelector("[data-phone-prefix]");
  const form = document.querySelector("[data-auth-form]");
  const password = document.querySelector("#signup-password");
  const confirmation = document.querySelector("#signup-confirm");

  function closeCountryPicker() {
    overlay.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    trigger.focus();
  }

  trigger.addEventListener("click", () => {
    overlay.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    overlay.querySelector(".country-option").focus();
  });

  overlay.addEventListener("click", (event) => {
    const option = event.target.closest("[data-country-code]");
    if (option) {
      countryInput.value = option.dataset.countryCode;
      label.textContent = `${option.dataset.countryName} (${option.dataset.countryCode})`;
      prefix.textContent = `${option.dataset.countryCode} `;
      closeCountryPicker();
      return;
    }
    if (event.target === overlay || event.target.closest("[data-country-close]")) closeCountryPicker();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) closeCountryPicker();
  });

  confirmation.addEventListener("input", () => {
    confirmation.setCustomValidity(
      confirmation.value && confirmation.value !== password.value
        ? "Les mots de passe ne correspondent pas."
        : "",
    );
  });
  password.addEventListener("input", () => {
    if (confirmation.value) confirmation.dispatchEvent(new Event("input"));
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!countryInput.value) {
      document.querySelector(".demo-notice").textContent = "Sélectionnez votre pays pour continuer.";
      trigger.focus();
      return;
    }
    if (!form.reportValidity()) return;
    document.querySelector(".demo-notice").textContent =
      "Formulaire validé pour la démonstration. La création de compte et l’envoi de SMS ne sont pas activés.";
  });
})();
