(() => {
  const overlay = document.querySelector("[data-country-overlay]");
  const trigger = document.querySelector(".country-trigger");
  const countryInput = document.querySelector('input[name="country"]');
  const label = document.querySelector("[data-country-label]");
  const prefix = document.querySelector("[data-phone-prefix]");
  const form = document.querySelector("[data-auth-form]");

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

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const notice = document.querySelector(".demo-notice");
    if (!countryInput.value) {
      notice.textContent = "Sélectionnez votre pays pour continuer.";
      trigger.focus();
      return;
    }
    if (!form.reportValidity()) return;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    notice.textContent = "Connexion en cours…";
    const digits = form.elements.phone.value.replace(/\D/g, "");
    const countryDigits = countryInput.value.slice(1);
    const expectedLength = countryInput.value === "+225" ? 10 : 8;
    const phone = digits.length === expectedLength + countryDigits.length && digits.startsWith(countryDigits)
      ? digits.slice(countryDigits.length)
      : digits;
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country_code: countryInput.value,
          phone,
          password: form.elements.password.value,
          remember: form.elements.remember.checked,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Connexion impossible.");
      window.location.replace("/accueil");
    } catch (error) {
      notice.textContent = error.message || "Le service est indisponible. Réessayez.";
      button.disabled = false;
    }
  });
})();
