/* E-BIKE Pro presentation adapter. Stored values, routes and API contracts stay intact. */
(() => {
  "use strict";
  const legacyBrand = /\b(?:NARKE(?:\s+Industries)?|IVECO|SHINERAY|SWM|Sprite|AERONOVA|Valhalla)\b/gi;
  const excluded = "script,style,noscript,textarea,input,code,pre,[contenteditable]";
  const attributes = ["title", "alt", "aria-label", "placeholder"];
  const replace = value => value.replace(/\b(?:iveco|narke)\s*pay\b/gi, "Paiement E-BIKE Pro")
    .replace(legacyBrand, "E-BIKE Pro")
    .replace(/E-BIKE Pro(?:\s*[—·|]\s*E-BIKE Pro)+/gi, "E-BIKE Pro")
    .replace(/\bsonara[\s-]*pay\b/gi, "service de paiement")
    .replace(/10 h à 00 h \(minuit\), heure de l’Algérie/g, "09 h à 18 h, heure du Maroc");
  function labels(element) {
    for (const name of attributes) {
      const value = element.getAttribute(name);
      if (value !== null && replace(value) !== value) element.setAttribute(name, replace(value));
    }
    if (element.tagName === "META") {
      const field = element.getAttribute("name") || element.getAttribute("property") || "";
      if (field === "theme-color") {
        if (element.content !== "#103b78") element.content = "#103b78";
      } else if (/^(?:description|application-name|apple-mobile-web-app-title|og:|twitter:)/.test(field)) {
        const next = replace(element.content);
        if (next !== element.content) element.content = next;
      }
    }
    if (element.tagName === "IMG") {
      const source = element.getAttribute("src") || "";
      let next = source;
      if (/\/pages\/assets\/(?:iveco-(?:auth-)?logo|narke-(?:home|project)-logo)\.png(?:\?|$)/.test(source)) {
        next = "/pages/assets/ebike-logo.png";
      } else if (/\/pages\/assets\/narke-(?:model-\d+|vip-(?:gold|blue)|mission-(?:blue|gold|red))\.(?:png|jpg|webp)(?:\?|$)/.test(source)) {
        next = /(?:gold|model-[13])/.test(source)
          ? "/pages/assets/e-bike-product-black.jpg" : "/pages/assets/e-bike-product-white.jpg";
      }
      if (next !== source) element.setAttribute("src", next);
      if (next === "/pages/assets/ebike-logo.png") element.alt = "E-BIKE Pro";
    }
  }
  const isAdmin = Boolean(document.querySelector("#admin-root,.admin-login-page,.admin-login-brand"));
  const isAuth = document.body.classList.contains("login-page");
  const isHome = Boolean(document.querySelector(".home-hero"));
  if (!isAuth && !isHome) {
    document.body.classList.add(isAdmin ? "ebike-admin" : "ebike-interface");
    document.body.dataset.ebikePage = location.pathname.replace(/^\/|\/$/g, "") || "accueil";
    const stylePath = isAdmin ? "/pages/narke-admin.css" : "/pages/narke-suite.css";
    if (![...document.querySelectorAll("link[rel=stylesheet]")].some(link => new URL(link.href).pathname === stylePath)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = stylePath;
      document.head.append(link);
    }
  }
  // The historical manifest endpoint remains untouched: the installed app uses
  // this presentation-only manifest and the rebranded, backwards-compatible icons.
  const manifest = {
    id: `${location.origin}/`, name: "E-BIKE Pro", short_name: "E-BIKE Pro", lang: "fr",
    start_url: `${location.origin}/`, scope: `${location.origin}/`, display: "standalone",
    background_color: "#f2f5fb", theme_color: "#103b78",
    icons: [192, 512].map(size => ({
      src: `${location.origin}/pages/assets/narke-icon-${size}.png?v=ebike-pro-1`,
      sizes: `${size}x${size}`, type: "image/png", purpose: "any",
    })),
  };
  document.querySelectorAll('link[rel="manifest"]').forEach(link => {
    link.href = "data:application/manifest+json," + encodeURIComponent(JSON.stringify(manifest));
  });
  document.querySelectorAll('link[rel="icon"],link[rel="apple-touch-icon"]').forEach(link => {
    const url = new URL(link.href);
    if (url.origin === location.origin) {
      url.searchParams.set("v", "ebike-pro-1");
      link.href = url.href;
    }
  });
  function rewrite(root) {
    if (root.nodeType === Node.TEXT_NODE) {
      if (root.parentElement && !root.parentElement.closest(excluded)) {
        const value = replace(root.data);
        if (value !== root.data) root.data = value;
      }
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE ||
        root.closest("script,style,noscript,textarea,code,pre,[contenteditable]")) return;
    labels(root);
    for (const element of root.querySelectorAll("[title],[alt],[aria-label],[placeholder],img")) {
      if (!element.closest("script,style,noscript,[contenteditable]")) labels(element);
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) rewrite(walker.currentNode);
  }
  rewrite(document.documentElement);
  const adminBrand = document.querySelector(".admin-login-brand");
  if (adminBrand) {
    const image = document.createElement("img");
    image.src = "/pages/assets/ebike-logo.png";
    image.alt = "E-BIKE Pro";
    image.width = 142;
    image.height = 58;
    adminBrand.replaceChildren(image);
  }
  new MutationObserver(records => {
    const changed = new Set();
    for (const record of records) {
      if (record.type === "attributes") labels(record.target);
      else if (record.type === "characterData") changed.add(record.target);
      else for (const node of record.addedNodes) changed.add(node);
    }
    for (const node of changed) rewrite(node);
  }).observe(document.documentElement, {
    subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: [...attributes, "src", "content"]
  });
})();
