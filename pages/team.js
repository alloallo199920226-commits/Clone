(() => {
  const status = document.querySelector("[data-team-status]");
  const codeNode = document.querySelector("[data-referral-code]");
  const linkNode = document.querySelector("[data-referral-link]");
  const number = new Intl.NumberFormat("fr-FR");
  let referralUrl = "";
  let ready = false;

  async function getJson(url) {
    const response = await fetch(url);
    if (response.status === 401) location.replace("/connexion");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Impossible de charger votre équipe.");
    return payload;
  }

  function formatAmount(value) {
    return `FCFA ${number.format(Number(value) || 0)}`;
  }

  const copyControls = document.querySelectorAll("[data-copy-value]");
  copyControls.forEach((button) => {
    button.addEventListener("click", async () => {
      const value = button.dataset.copyValue === "link"
        ? referralUrl
        : codeNode?.textContent || "";
      if (!ready || !value) {
        if (status) status.textContent = "Attendez le chargement de votre code.";
        return;
      }
      try {
        await navigator.clipboard.writeText(value);
        if (status) status.textContent = "Copié dans le presse-papiers.";
      } catch {
        if (status) status.textContent = `Copie impossible. Sélectionnez et copiez : ${value}`;
      }
    });
  });

  const teamRoot = document.querySelector("[data-team-page]");
  if (!teamRoot) return;
  teamRoot.setAttribute("aria-busy", "true");
  Promise.all([getJson("/api/me"), getJson("/api/team")]).then(([user, team]) => {
    if (!/^[A-Z0-9]{6,10}$/.test(user.referral_code || "") ||
        !Array.isArray(team.levels) || team.levels.length !== 3 ||
        !team.levels.every(count => Number.isSafeInteger(count) && count >= 0) ||
        !Number.isSafeInteger(team.total) || !Number.isSafeInteger(team.revenue_fcfa)) {
      throw new Error("Les données de votre équipe sont indisponibles.");
    }
    const code = String(user.referral_code || "");
    referralUrl = `${location.origin}/inscription?c=${encodeURIComponent(code)}`;
    if (codeNode) codeNode.textContent = code || "Indisponible";
    if (linkNode) linkNode.textContent = referralUrl || "Indisponible";

    const members = Array.isArray(team.members) ? team.members : [];
    const counts = Array.isArray(team.levels) ? team.levels : [0, 0, 0];
    const totalCount = Number(team.total) || 0;
    const revenue = Number(team.revenue_fcfa) || 0;

    document.querySelectorAll('[data-purpose="statistics-overview"] .font-mono').forEach((node, index) => {
      node.textContent = index === 0 ? String(totalCount) : formatAmount(revenue);
    });

    const levelRows = document.querySelector("[data-team-levels]");
    if (levelRows) {
      levelRows.replaceChildren();
      counts.slice(0, 3).forEach((count, index) => {
        const row = document.createElement("tr");
        const revenueCell = revenue === 0 ? "0" : "—";
        [`Équipe de niveau ${index + 1} ${[37, 3, 1][index]}%`, String(count), revenueCell].forEach((value) => {
          const cell = document.createElement("td");
          cell.textContent = value;
          row.append(cell);
        });
        levelRows.append(row);
      });
    }
    const unallocatedNote = document.querySelector("[data-revenue-note]");
    if (unallocatedNote) unallocatedNote.hidden = revenue === 0;
    document.querySelectorAll("[data-team-level-count]").forEach((node) => {
      const level = Number(node.dataset.teamLevelCount);
      node.textContent = String(counts[level - 1] || 0);
    });
    document.querySelectorAll("[data-team-level-revenue]").forEach((node) => {
      node.textContent = revenue === 0 ? "0.00" : "—";
    });

    const tabs = [...document.querySelectorAll("[data-team-level-tab]")];
    const list = document.querySelector("[data-team-members]");
    const empty = document.querySelector("[data-team-detail-empty]");
    const loadError = document.querySelector("[data-team-detail-error]");
    if (tabs.length && list) {
      const renderLevel = (level) => {
        const levelMembers = members.filter((member) => Number(member.level) === level);
        list.replaceChildren();
        levelMembers.forEach((member) => {
          const row = document.createElement("article");
          row.className = "team-member-row";
          const phone = document.createElement("span");
          phone.className = "team-member-phone";
          phone.textContent = member.phone_masked || "—";
          const date = document.createElement("time");
          date.className = "team-member-date";
          const parsed = member.created_at ? new Date(member.created_at) : null;
          date.textContent = parsed && !Number.isNaN(parsed.valueOf())
            ? parsed.toLocaleDateString("fr-FR")
            : "—";
          row.append(phone, date);
          list.append(row);
        });
        if (empty) empty.hidden = levelMembers.length > 0;
      };
      tabs.forEach((tab) => tab.addEventListener("click", () => {
        const level = Number(tab.dataset.teamLevelTab);
        tabs.forEach((item) => item.setAttribute("aria-selected", String(item === tab)));
        renderLevel(level);
      }));
      const initial = Number(new URLSearchParams(location.search).get("level")) || 1;
      const active = tabs.find((tab) => Number(tab.dataset.teamLevelTab) === initial) || tabs[0];
      active.setAttribute("aria-selected", "true");
      renderLevel(Number(active.dataset.teamLevelTab));
    }
    ready = true;
    if (status) status.textContent = "";
  }).catch((error) => {
    if (codeNode) codeNode.textContent = "Indisponible";
    if (linkNode) linkNode.textContent = "Indisponible";
    if (status) status.textContent = error.message || "Équipe temporairement indisponible.";
    const detailError = document.querySelector("[data-team-detail-error]");
    if (detailError) {
      detailError.hidden = false;
      detailError.textContent = error.message || "Équipe temporairement indisponible.";
      const empty = document.querySelector("[data-team-detail-empty]");
      if (empty) empty.hidden = true;
    }
  }).finally(() => teamRoot.setAttribute("aria-busy", "false"));
})();
