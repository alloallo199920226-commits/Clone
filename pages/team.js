(() => {
  const status = document.querySelector("[data-team-status]");
  const code = document.querySelector("[data-referral-code]");
  const link = document.querySelector("[data-referral-link]");
  let ready = false;
  Promise.all(["/api/me", "/api/team"].map(async (url) => {
    const response = await fetch(url);
    if (response.status === 401) location.replace("/connexion");
    if (!response.ok) throw new Error("Impossible de charger votre équipe.");
    return response.json();
  })).then(([user, team]) => {
    code.textContent = user.referral_code;
    link.textContent = `${location.origin}/inscription?c=${encodeURIComponent(user.referral_code)}`;
    const rows = document.querySelector("[data-team-levels]");
    rows.replaceChildren();
    team.levels.forEach((count, index) => {
      const row = document.createElement("tr");
      [`Niveau ${index + 1} · Non activé`, String(count), "0"].forEach((value) => {
        const cell = document.createElement("td");
        cell.style.cssText = "padding:10px 12px;text-align:center";
        cell.textContent = value;
        row.append(cell);
      });
      rows.append(row);
    });
    const stats = document.querySelectorAll('[data-purpose="statistics-overview"] .font-mono');
    stats[0].textContent = String(team.total);
    stats[1].textContent = `FCFA ${new Intl.NumberFormat("fr-FR").format(team.revenue_fcfa)}`;
    ready = true;
  }).catch((error) => {
    code.textContent = "Indisponible";
    link.textContent = "Indisponible";
    status.textContent = error.message;
  });
  document.querySelectorAll('[data-purpose^="copy-"]').forEach((button) => {
    button.addEventListener("click", async () => {
      if (!ready) { status.textContent = "Attendez le chargement de votre code."; return; }
      const value = button.dataset.purpose === "copy-code-btn" ? code.textContent : link.textContent;
      try {
        await navigator.clipboard.writeText(value);
        status.textContent = "Copié !";
      } catch {
        status.textContent = `Copiez manuellement : ${value}`;
      }
    });
  });
  document.querySelector('[data-purpose="team-link-button"]').addEventListener("click", (event) => {
    event.preventDefault();
    document.querySelector("[data-team-levels]").scrollIntoView({ behavior: "smooth", block: "center" });
  });
})();
