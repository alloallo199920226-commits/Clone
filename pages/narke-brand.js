/* NARKE presentation only. Never rewrite URLs, values, IDs or persisted data. */
(() => {
  "use strict";
  const legacyBrand = /\b(?:IVECO|SHINERAY|SWM|Sprite|AERONOVA|Valhalla)\b/gi;
  const excluded = "script,style,noscript,textarea,input,code,pre,[contenteditable]";
  const attributes = ["title", "alt", "aria-label", "placeholder"];
  const replace = value => value.replace(/\biveco\s*pay\b/gi, "NARKE Pay")
    .replace(legacyBrand, "NARKE")
    .replace(/\bsonara[\s-]*pay\b/gi, "service de paiement")
    .replace(/10 h à 00 h \(minuit\), heure de l’Algérie/g, "09 h à 18 h, heure du Maroc");
  function labels(element) {
    for (const name of attributes) {
      const value = element.getAttribute(name);
      if (value !== null && replace(value) !== value) element.setAttribute(name, replace(value));
    }
    if (element.tagName === "IMG" &&
        /\/pages\/assets\/iveco-(?:auth-)?logo\.png(?:\?|$)/.test(element.getAttribute("src") || "")) {
      element.src = "/pages/assets/narke-home-logo.png";
      element.alt = "NARKE Industries";
    }
  }
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
    image.src = "/pages/assets/narke-home-logo.png";
    image.alt = "NARKE Industries";
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
    attributeFilter: [...attributes, "src"]
  });
})();
