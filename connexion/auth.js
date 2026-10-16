(() => {
  const { countryInput, trigger } = window.setupCountryPicker();
  const form = document.querySelector("[data-auth-form]");

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
