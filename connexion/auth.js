(() => {
  const { countryInput, trigger } = window.setupCountryPicker();
  const form = document.querySelector("[data-auth-form]");
  const passwordToggle = document.querySelector("[data-password-toggle]");
  const passwordInput = form.elements.password;
  passwordToggle?.addEventListener("click", () => {
    const visible = passwordInput.type === "password";
    passwordInput.type = visible ? "text" : "password";
    passwordToggle.setAttribute("aria-pressed", String(visible));
    passwordToggle.setAttribute("aria-label", visible ? "Masquer le mot de passe" : "Afficher le mot de passe");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (form.getAttribute("aria-busy") === "true") return;
    const notice = document.querySelector(".demo-notice");
    if (!countryInput.value) {
      notice.textContent = "Sélectionnez votre pays pour continuer.";
      trigger.focus();
      return;
    }
    if (!form.reportValidity()) return;
    const digits = form.elements.phone.value.replace(/\D/g, "");
    // The server normalizes local and international numbers for each eligible country.
    const phone = digits;
    await window.submitAuthForm(form, "/api/auth/login", {
          country_code: countryInput.value,
          phone,
          password: form.elements.password.value,
          remember: form.elements.remember.checked,
    }, "Connexion en cours");
  });
})();
