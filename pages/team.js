(() => {
  const status = document.querySelector("[data-team-status]");
  const codeNode = document.querySelector("[data-referral-code]");
  const linkNode = document.querySelector("[data-referral-link]");
  const number = new Intl.NumberFormat("en-US");
  const decimalNumber = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let referralUrl = "";
  let ready = false;
  const copyTimers = new WeakMap();

  async function copyText(value) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Older Safari or blocked clipboard permission: attempt a selected text copy.
      const previousFocus = document.activeElement;
      const field = document.createElement("textarea");
      field.value = value;
      field.readOnly = true;
      field.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px;";
      document.body.append(field);
      try {
        field.focus({ preventScroll: true });
        field.select();
        field.setSelectionRange(0, value.length);
        if (!document.execCommand("copy")) throw new Error("Copy refused");
      } finally {
        field.remove();
        previousFocus?.focus({ preventScroll: true });
      }
    }
  }

  async function getJson(url) {
    const response = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
    if (response.status === 401) location.replace("/connexion");
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Impossible de charger votre équipe.");
    return payload;
  }
  const formatAmount = (value) => Number.isSafeInteger(value) ? `FCFA ${number.format(value)}` : "—";

  document.querySelectorAll("[data-copy-value]").forEach((button) => {
    button.addEventListener("click", async () => {
      const value = button.dataset.copyValue === "link" ? referralUrl : codeNode?.textContent || "";
      if (!ready || !value) {
        if (status) status.textContent = "Attendez le chargement de votre code.";
        return;
      }
      const originalLabel = button.dataset.copyValue === "link" ? "Copier le lien" : "Copier le code";
      clearTimeout(copyTimers.get(button));
      button.disabled = true;
      button.textContent = originalLabel;
      delete button.dataset.copied;
      try {
        await copyText(value);
        button.textContent = "Copié !";
        button.dataset.copied = "true";
        if (status) {
          status.dataset.state = "success";
          status.textContent = button.dataset.copyValue === "link"
            ? "Lien d’invitation copié !" : "Code d’invitation copié !";
        }
        copyTimers.set(button, setTimeout(() => {
          button.textContent = originalLabel;
          delete button.dataset.copied;
        }, 3000));
      } catch {
        if (status) {
          status.dataset.state = "error";
          status.textContent = `Copie impossible. Sélectionnez et copiez : ${value}`;
        }
      } finally {
        button.disabled = false;
      }
    });
  });

  const teamRoot = document.querySelector("[data-team-page]");
  if (!teamRoot) return;
  teamRoot.setAttribute("aria-busy", "true");
  const memberList = document.querySelector("[data-team-members]");
  const empty = document.querySelector("[data-team-detail-empty]");
  const loadError = document.querySelector("[data-team-detail-error]");
  if (empty) empty.hidden = true;
  if (memberList) {
    memberList.replaceChildren();
    for (let index = 0; index < 5; index += 1) {
      const placeholder = document.createElement("div");
      placeholder.className = "team-loading-row";
      placeholder.setAttribute("aria-hidden", "true");
      memberList.append(placeholder);
    }
  }
  Promise.all([getJson("/api/me"), getJson("/api/team")]).then(([user, team]) => {
    if (!/^[A-Z0-9]{6,10}$/.test(user.referral_code || "") ||
        !Array.isArray(team.levels) || team.levels.length !== 3 ||
        !team.levels.every((count) => Number.isSafeInteger(count) && count >= 0) ||
        !Number.isSafeInteger(team.total) || !Number.isSafeInteger(team.revenue_fcfa)) {
      throw new Error("Les données de votre équipe sont indisponibles.");
    }
    const code = String(user.referral_code || "");
    referralUrl = `${location.origin}/inscription?c=${encodeURIComponent(code)}`;
    if (codeNode) codeNode.textContent = code || "Indisponible";
    if (linkNode) linkNode.textContent = referralUrl || "Indisponible";

    const members = Array.isArray(team.members) ? team.members : [];
    const counts = team.levels;
    document.querySelectorAll('[data-purpose="statistics-overview"] .font-mono').forEach((node, index) => {
      node.textContent = index === 0 ? String(team.total) : formatAmount(team.revenue_fcfa);
    });
    const levelRows = document.querySelector("[data-team-levels]");
    const commissions = Array.isArray(team.level_revenue_fcfa) ? team.level_revenue_fcfa : [null, null, null];
    if (levelRows) {
      levelRows.replaceChildren();
      counts.forEach((count, index) => {
        const row = document.createElement("tr");
        [`Équipe de niveau ${index + 1}`, String(count), formatAmount(commissions[index])].forEach((value, column) => {
          const cell = document.createElement("td");
          if (column === 0) {
            const art = document.createElement("img");
            art.className = "ebike-level-icon";
            art.src = "/pages/assets/ebike-icon-users-round.png";
            art.alt = "";
            art.setAttribute("aria-hidden", "true");
            const label = document.createElement("span");
            label.className = "team-level-name";
            label.textContent = value;
            const rate = document.createElement("b");
            rate.className = "team-level-rate";
            rate.textContent = `${team.referral_percentages[index]}%`;
            cell.append(art, label, rate);
          } else {
            cell.textContent = value;
          }
          row.append(cell);
        });
        levelRows.append(row);
      });
    }
    const unallocatedNote = document.querySelector("[data-revenue-note]");
    if (unallocatedNote) unallocatedNote.hidden = true;
    document.querySelectorAll("[data-team-level-count]").forEach((node) => {
      const level = Number(node.dataset.teamLevelCount);
      node.textContent = String(counts[level - 1] ?? "—");
    });
    document.querySelectorAll("[data-team-level-revenue]").forEach((node) => {
      const level = Number(node.closest("[data-team-level-tab]")?.dataset.teamLevelTab || "1");
      const commission = commissions[level - 1];
      node.textContent = Number.isSafeInteger(commission) ? decimalNumber.format(commission) : "—";
    });

    const tabs = [...document.querySelectorAll("[data-team-level-tab]")];
    const more = document.querySelector("[data-team-detail-more]");
    const renderLevel = (level) => {
      const levelMembers = members.filter((member) => Number(member.level) === level);
      if (memberList) memberList.replaceChildren();
      levelMembers.forEach((member) => {
        const row = document.createElement("article");
        row.className = "team-member-row";
        row.dataset.memberLevel = String(level);
        const avatar = document.createElement("img");
        avatar.className = "ebike-referral-avatar";
        avatar.src = "/pages/assets/ebike-icon-user-round.png";
        avatar.alt = "";
        avatar.setAttribute("aria-hidden", "true");
        const details = document.createElement("div");
        details.className = "team-member-details";
        const phone = document.createElement("strong");
        phone.className = "team-member-phone";
        phone.textContent = member.phone_masked || "—";
        const date = document.createElement("time");
        date.className = "team-member-date";
        const parsed = member.created_at ? new Date(member.created_at) : null;
        if (parsed && !Number.isNaN(parsed.valueOf())) {
          date.dateTime = parsed.toISOString();
          date.textContent = parsed.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
        } else date.textContent = "—";
        details.append(phone, date);
        const investment = document.createElement("strong");
        investment.className = "team-member-investment";
        investment.textContent = Number.isSafeInteger(member.deposits_fcfa) ? number.format(member.deposits_fcfa) : "—";
        investment.title = "Total des dépôts validés (FCFA)";
        investment.setAttribute("aria-label", `Dépôts validés : ${formatAmount(member.deposits_fcfa)}`);
        row.append(avatar, details, investment);
        memberList?.append(row);
      });
      if (empty) empty.hidden = levelMembers.length > 0;
      if (more) more.hidden = !(members.length >= 100 && team.members_has_more === true);
    };
    if (tabs.length) {
      const requested = Number(new URLSearchParams(location.search).get("level"));
      const validRequested = requested >= 1 && requested <= 3 ? requested : 1;
      const active = tabs.find((tab) => Number(tab.dataset.teamLevelTab) === validRequested) || tabs[0];
      tabs.forEach((tab) => tab.setAttribute("aria-selected", String(tab === active)));
      tabs.forEach((tab) => tab.addEventListener("click", () => {
        tabs.forEach((item) => item.setAttribute("aria-selected", String(item === tab)));
        renderLevel(Number(tab.dataset.teamLevelTab));
      }));
      renderLevel(Number(active.dataset.teamLevelTab));
    }
    ready = true;
    if (status) status.textContent = "";
  }).catch((error) => {
    if (codeNode) codeNode.textContent = "Indisponible";
    if (linkNode) linkNode.textContent = "Indisponible";
    if (status) status.textContent = error.message || "Équipe temporairement indisponible.";
    if (loadError) {
      loadError.hidden = false;
      loadError.textContent = error.message || "Équipe temporairement indisponible.";
      if (empty) empty.hidden = true;
    }
    memberList?.replaceChildren();
    document.querySelectorAll("[data-team-level-revenue]").forEach((node) => { node.textContent = "—"; });
    document.querySelectorAll("[data-team-level-count]").forEach((node) => { node.textContent = "—"; });
  }).finally(() => teamRoot.setAttribute("aria-busy", "false"));
})();
