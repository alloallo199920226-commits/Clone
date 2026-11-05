(() => {
  const { countryInput, trigger } = window.setupCountryPicker();
  const form = document.querySelector("[data-auth-form]");
  const password = document.querySelector("#signup-password");
  const confirmation = document.querySelector("#signup-confirm");
  const referral = document.querySelector("#signup-referral");
  referral.value = new URLSearchParams(location.search).get("c") || "";
  document.querySelectorAll("[data-password-toggle]").forEach(toggle => {
    const input = document.getElementById(toggle.getAttribute("aria-controls"));
    if (!input || ![password, confirmation].includes(input)) return;
    toggle.addEventListener("click", () => {
      const visible = input.type === "password";
      input.type = visible ? "text" : "password";
      toggle.setAttribute("aria-pressed", String(visible));
      toggle.setAttribute("aria-label", visible ? "Masquer le mot de passe" : "Afficher le mot de passe");
    });
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
    await window.submitAuthForm(form, "/api/auth/register", {
          country_code: countryInput.value,
          phone,
          password: password.value,
          referral_code: referral.value.trim(),
    }, "Création du compte en cours");
  });
})();
