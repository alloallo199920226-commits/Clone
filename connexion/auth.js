(() => {
  const { countryInput, trigger } = window.setupCountryPicker();
  const form = document.querySelector("[data-auth-form]");

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
    const countryDigits = countryInput.value.slice(1);
    const expectedLength = countryInput.value === "+225" ? 10 : 8;
    const phone = digits.length === expectedLength + countryDigits.length && digits.startsWith(countryDigits)
      ? digits.slice(countryDigits.length)
      : digits;
    await window.submitAuthForm(form, "/api/auth/login", {
          country_code: countryInput.value,
          phone,
          password: form.elements.password.value,
          remember: form.elements.remember.checked,
    }, "Connexion en cours");
  });
})();
