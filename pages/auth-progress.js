(() => {
  let pendingForm = null;
  const loader = document.createElement("div");
  loader.className = "auth-submit-loading";
  loader.hidden = true;
  loader.setAttribute("role", "status");
  loader.setAttribute("aria-live", "polite");
  const dots = document.createElement("span");
  dots.className = "auth-submit-dots";
  dots.setAttribute("aria-hidden", "true");
  for (let index = 0; index < 3; index++) dots.append(document.createElement("i"));
  const label = document.createElement("span");
  label.className = "auth-loading-label";
  loader.append(dots, label);
  document.body.append(loader);

  function reset() {
    loader.hidden = true;
    if (pendingForm) {
      pendingForm.setAttribute("aria-busy", "false");
      pendingForm.inert = false;
      pendingForm.querySelector('button[type="submit"]').disabled = false;
    }
    pendingForm = null;
  }

  window.submitAuthForm = async (form, url, payload, pendingText) => {
    if (pendingForm) return;
    pendingForm = form;
    const notice = document.querySelector(".demo-notice");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    const button = form.querySelector('button[type="submit"]');
    document.activeElement?.blur();
    button.disabled = true;
    form.setAttribute("aria-busy", "true");
    form.inert = true;
    label.textContent = pendingText;
    loader.setAttribute("aria-label", pendingText);
    loader.hidden = false;
    notice.textContent = "";
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => {
        throw new Error("Le serveur est temporairement indisponible. Réessayez.");
      });
      if (!response.ok) throw new Error(result.error || "Authentification impossible.");
      if (!Number.isSafeInteger(result.user?.id)) {
        throw new Error("La réponse du serveur est invalide. Réessayez.");
      }
      // Confirm the session cookie before opening the protected site.
      const session = await fetch("/api/me", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!session.ok || (await session.json()).id !== result.user.id) {
        throw new Error("Votre session n’a pas pu être confirmée. Reconnectez-vous.");
      }
      // Keep the dots visible until the browser actually opens the home page.
      window.location.replace("/accueil");
    } catch (error) {
      reset();
      if (error.name === "AbortError") {
        notice.textContent = "Le réseau met trop de temps à répondre. Réessayez."
          + (url.endsWith("/register") ? " Si votre compte a déjà été créé, connectez-vous." : "");
      } else if (error instanceof TypeError) {
        notice.textContent = "Connexion interrompue. Vérifiez votre connexion Internet et réessayez.";
      } else {
        notice.textContent = error.message || "Le service est indisponible. Réessayez.";
      }
    } finally {
      clearTimeout(timeout);
    }
  };

  window.addEventListener("pageshow", (event) => {
    if (event.persisted) reset();
  });
})();
