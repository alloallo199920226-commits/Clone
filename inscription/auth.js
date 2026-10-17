(() => {
  const { countryInput, trigger } = window.setupCountryPicker();
  const form = document.querySelector("[data-auth-form]");
  const password = document.querySelector("#signup-password");
  const confirmation = document.querySelector("#signup-confirm");
  const referral = document.querySelector("#signup-referral");
  referral.value = new URLSearchParams(location.search).get("c") || "";

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
    await window.submitAuthForm(form, "/api/auth/register", {
          country_code: countryInput.value,
          phone,
          password: password.value,
          referral_code: referral.value.trim(),
    }, "Création du compte en cours");
  });
})();
