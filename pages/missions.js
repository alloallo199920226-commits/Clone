(() => {
  "use strict";

  const root = document.querySelector("[data-mission-kind]");
  if (!root) return;

  const kind = root.dataset.missionKind;
  const list = root.querySelector("[data-mission-list]");
  const total = root.querySelector("[data-claimed-total]");
  const errorPanel = root.querySelector("[data-mission-error]");
  const errorCopy = root.querySelector("[data-error-copy]");
  const feedback = root.querySelector("[data-feedback]");
  const retry = root.querySelector("[data-retry]");
  const money = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  let missions = [];
  let isLoading = false;

  const safeNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  };
  const formatMoney = (value) => money.format(safeNumber(value));
  const setFeedback = (message, state) => {
    feedback.textContent = message || "";
    if (state) feedback.dataset.state = state;
    else delete feedback.dataset.state;
  };
  const isForPage = (mission) => {
    const type = String(mission.type || "").toLowerCase();
    if (kind === "vip") return /vip|purchase|achat/.test(type);
    return /inv|referr|parrain/.test(type);
  };
  const setError = (message) => {
    errorCopy.textContent = message;
    errorPanel.hidden = false;
  };
  const showLoading = () => {
    list.setAttribute("aria-busy", "true");
    list.replaceChildren();
    for (let index = 0; index < 3; index += 1) {
      const skeleton = document.createElement("div");
      skeleton.className = "mission-skeleton";
      skeleton.setAttribute("aria-hidden", "true");
      list.append(skeleton);
    }
  };
  const makeText = (tag, className, text) => {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    return element;
  };
  const buildCard = (mission, index) => {
    const target = safeNumber(mission.target);
    const current = safeNumber(mission.current);
    const reward = safeNumber(mission.reward_fcfa);
    const ratio = target > 0 ? Math.min(1, Math.max(0, current / target)) : 0;
    const claimed = mission.claimed === true;
    const eligible = mission.eligible === true;
    const card = document.createElement("article");
    card.className = `mission-card${claimed ? " is-claimed" : ""}`;
    card.style.animationDelay = `${Math.min(index * 55, 220)}ms`;
    card.append(makeText("h3", "mission-title", mission.title || "Mission"));
    const rewardLabel = document.createElement("div");
    rewardLabel.className = "mission-reward";
    rewardLabel.append(document.createTextNode(formatMoney(reward)));
    rewardLabel.append(makeText("small", "", "FCFA"));
    card.append(rewardLabel);
    const details = document.createElement("p");
    details.className = "mission-detail";
    details.textContent = kind === "vip" ? "Achats VIP validés" : "Invitations validées";
    card.append(details);

    const progress = document.createElement("div");
    progress.className = "progress-block";
    const progressCopy = document.createElement("div");
    progressCopy.className = "progress-copy";
    const now = document.createElement("span");
    now.append(document.createTextNode("Actuel "));
    now.append(makeText("strong", "", formatMoney(current)));
    const goal = document.createElement("span");
    goal.append(document.createTextNode("Objectif "));
    goal.append(makeText("strong", "", formatMoney(target)));
    progressCopy.append(now, goal);
    const track = document.createElement("div");
    track.className = "progress-track";
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", `Progression : ${formatMoney(current)} sur ${formatMoney(target)}`);
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", String(Math.max(target, 0)));
    track.setAttribute("aria-valuenow", String(Math.max(0, Math.min(current, target))));
    const fill = document.createElement("div");
    fill.className = "progress-fill";
    fill.style.transform = `scaleX(${ratio})`;
    track.append(fill);
    progress.append(progressCopy, track);
    card.append(progress);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "mission-action";
    button.textContent = claimed ? "Réclamé" : eligible ? "Réclamer" : "En cours";
    button.disabled = claimed || !eligible;
    if (eligible && !claimed) button.addEventListener("click", () => claimMission(mission, button));
    card.append(button);
    return card;
  };
  const render = () => {
    list.replaceChildren();
    list.setAttribute("aria-busy", "false");
    const visible = missions.filter(isForPage);
    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "mission-empty";
      empty.textContent = "Aucune mission n’est disponible dans cette catégorie pour le moment.";
      list.append(empty);
      return;
    }
    visible.forEach((mission, index) => list.append(buildCard(mission, index)));
  };
  const loadMissions = async () => {
    if (isLoading) return;
    isLoading = true;
    errorPanel.hidden = true;
    setFeedback("");
    showLoading();
    try {
      const response = await fetch("/api/missions", {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" }
      });
      if (response.status === 401) {
        window.location.assign("/connexion");
        return;
      }
      if (!response.ok) throw new Error("Impossible de charger vos missions. Vérifiez votre connexion puis réessayez.");
      const payload = await response.json();
      if (!payload || !Array.isArray(payload.missions) || !Number.isFinite(Number(payload.claimed_total_fcfa))) {
        throw new Error("Les données des missions sont momentanément indisponibles. Réessayez dans un instant.");
      }
      missions = payload.missions;
      total.textContent = formatMoney(payload.claimed_total_fcfa);
      render();
    } catch (error) {
      list.replaceChildren();
      list.setAttribute("aria-busy", "false");
      setError(error instanceof Error ? error.message : "Une erreur est survenue. Réessayez.");
    } finally {
      isLoading = false;
    }
  };
  async function claimMission(mission, button) {
    if (button.disabled || !mission.eligible || mission.claimed) return;
    button.disabled = true;
    button.textContent = "Réclamation…";
    setFeedback("");
    try {
      const response = await fetch("/api/missions/claim", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ mission_id: String(mission.id) })
      });
      if (response.status === 401) {
        window.location.assign("/connexion");
        return;
      }
      if (!response.ok) {
        let message = "La récompense n’a pas pu être réclamée. Réessayez.";
        try {
          const errorPayload = await response.json();
          if (typeof errorPayload.error === "string") message = errorPayload.error;
        } catch (_) { /* Keep the safe fallback message. */ }
        throw new Error(message);
      }
      const result = await response.json();
      if (!result || result.ok !== true) throw new Error("La réclamation n’a pas été confirmée. Actualisez puis réessayez.");
      await loadMissions();
      setFeedback(result.already_claimed ? "Cette récompense avait déjà été réclamée." : `Récompense créditée : ${formatMoney(result.amount_fcfa)} FCFA.`, "success");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Une erreur est survenue pendant la réclamation.", "error");
      button.disabled = false;
      button.textContent = "Réclamer";
    }
  }
  retry.addEventListener("click", loadMissions);
  loadMissions();
})();
