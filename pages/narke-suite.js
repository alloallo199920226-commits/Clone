/* Shared presentation/navigation only. No account, financial or API operations. */
(() => {
  "use strict";
  if (window.ebikeShellInitialized || document.querySelector(".home-hero,.login-page,#admin-root")) return;
  window.ebikeShellInitialized = true;
  const icon = name => `<img class="ebike-icon" src="/pages/assets/ebike-icon-${name}.png" alt="" aria-hidden="true">`;
  const routes = [
    ["/accueil", "Accueil", "house"], ["/projet", "Mes produits", "bike"],
    ["/equipe", "Équipe", "users-round"], ["/compte", "Moi", "user-round"],
  ];
  const current = path => path === "/compte"
    ? !["/accueil","/projet","/equipe","/mon-equipe","/missions","/missions-vip"].includes(location.pathname)
    : path === "/equipe" ? ["/equipe","/mon-equipe","/missions","/missions-vip"].includes(location.pathname) : location.pathname === path;
  const link = ([path,label,name]) => `<a href="${path}"${current(path) ? ' aria-current="page"' : ""}>${icon(name)}<span>${label}</span></a>`;
  const header = document.createElement("header");
  header.dataset.ebikeShell = "";
  header.innerHTML = `<a class="ebike-shell-brand" href="/accueil" aria-label="E-BIKE Pro, accueil"><img src="/pages/assets/ebike-logo.png" alt="E-BIKE Pro"></a>
    <nav class="ebike-shell-links" aria-label="Navigation principale">${routes.map(([path,label]) => `<a href="${path}"${current(path)?' aria-current="page"':""}>${label}</a>`).join("")}</nav>
    <div class="ebike-shell-controls"><a class="ebike-shell-control" href="/notifications" aria-label="Notifications">${icon("bell")}</a>
    <button class="ebike-shell-control" type="button" data-suite-menu-button aria-controls="narke-suite-menu" aria-expanded="false" aria-label="Ouvrir le menu">${icon("menu")}</button></div>`;
  document.body.prepend(header);
  const drawer = document.createElement("dialog");
  drawer.id = "narke-suite-menu";
  drawer.className = "ebike-navigation-drawer";
  drawer.setAttribute("aria-label", "Menu E-BIKE Pro");
  drawer.innerHTML = `<div class="ebike-drawer-heading"><img src="/pages/assets/ebike-logo.png" alt="E-BIKE Pro"><button class="ebike-shell-control" type="button" data-menu-close aria-label="Fermer le menu">${icon("x")}</button></div>
    <p class="ebike-drawer-label">Votre espace</p><nav class="ebike-drawer-grid">${routes.map(link).join("")}
    ${link(["/recharger","Recharger","wallet-cards"])}${link(["/retrait","Retirer","arrow-up-right"])}
    ${link(["/financement","Opérations","receipt-text"])}${link(["/missions","Récompenses","trophy"])}</nav>
    <a class="ebike-drawer-help" href="/service-client">${icon("headset")}Besoin d’aide ? Contactez notre équipe</a>`;
  document.body.append(drawer);
  const trigger = header.querySelector("[data-suite-menu-button]");
  trigger.addEventListener("click", () => { drawer.showModal(); trigger.setAttribute("aria-expanded","true"); });
  drawer.querySelector("[data-menu-close]").addEventListener("click", () => drawer.close());
  drawer.addEventListener("click", event => { if (event.target === drawer) drawer.close(); });
  drawer.addEventListener("close", () => { trigger.setAttribute("aria-expanded","false"); trigger.focus(); });
  let dock = document.querySelector(".bottom-navigation,.owned-bottom-nav,.team-bottom-nav,.narke-suite-bottom");
  if (!dock) {
    dock = document.createElement("nav");
    document.body.append(dock);
  }
  dock.dataset.ebikeDock = "";
  dock.setAttribute("aria-label","Navigation principale");
  dock.replaceChildren();
  dock.insertAdjacentHTML("beforeend", routes.map(link).join(""));
})();
