(() => {
  "use strict";
  const root = document.querySelector("body.narke-suite-page");
  if (!root) return;
  const host = root.querySelector(".finance-page,.reference-page,.reference-history,.account-shell,.team-portal,.team-detail-page,.missions-app") || root.querySelector("main");
  if (!host) return;
  const existingBrandbar = host.querySelector(".team-brandbar,.missions-header");
  const header = existingBrandbar || document.createElement("header");
  header.classList.add("narke-suite-header");
  header.dataset.narkeHeader = "";
  if (!existingBrandbar) {
    header.innerHTML = '<button type="button" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="narke-suite-menu" data-suite-menu-button><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg></button><img class="narke-suite-logo" src="/pages/assets/narke-home-logo.png" alt="NARKE Industries"><a href="/notifications" aria-label="Notifications" data-suite-bell><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg></a><nav class="narke-suite-menu" id="narke-suite-menu" aria-label="Menu principal" hidden><a href="/accueil">Maison</a><a href="/projet">Projet</a><a href="/equipe">Équipe</a><a href="/missions">Missions</a><a href="/historique-recharges">Historique de recharge</a><a href="/compte">Mon compte</a></nav></header>';
    host.prepend(header);
  } else {
    header.classList.add("narke-embedded-header");
    const controls = document.createElement("div");
    controls.innerHTML = '<button type="button" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="narke-suite-menu" data-suite-menu-button><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg></button><a href="/notifications" aria-label="Notifications" data-suite-bell><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg></a>';
    header.prepend(controls.firstElementChild);
    header.append(controls.lastElementChild);
    const menuMarkup = document.createElement("nav");
    menuMarkup.className = "narke-suite-menu";
    menuMarkup.id = "narke-suite-menu";
    menuMarkup.setAttribute("aria-label", "Menu principal");
    menuMarkup.hidden = true;
    menuMarkup.innerHTML = '<a href="/accueil">Maison</a><a href="/projet">Projet</a><a href="/equipe">Équipe</a><a href="/missions">Missions</a><a href="/historique-recharges">Historique de recharge</a><a href="/compte">Mon compte</a>';
    header.append(menuMarkup);
  }
  const button = header.querySelector("[data-suite-menu-button]");
  const menu = header.querySelector(".narke-suite-menu");
  const toggle = (open) => {
    menu.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
  };
  button.addEventListener("click", () => toggle(menu.hidden));
  document.addEventListener("click", (event) => {
    if (!header.contains(event.target)) toggle(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) {
      toggle(false);
      button.focus();
    }
  });
  if (root.classList.contains("narke-history-page")) {
    const nav = document.createElement("nav");
    nav.className = "narke-suite-bottom";
    nav.setAttribute("aria-label", "Navigation principale");
    nav.innerHTML = '<a href="/accueil"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-8 9 8M5 10v10h5v-6h4v6h5V10"/></svg><span>Maison</span></a><a href="/projet"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16l-2 10H7L4 5ZM4 5 3 2H1"/></svg><span>Projet</span></a><a href="/equipe"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9"/></svg><span>Équipe</span></a><a href="/compte" aria-current="page"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"/></svg><span>Mon compte</span></a></nav>';
    host.append(nav);
  }
})();
